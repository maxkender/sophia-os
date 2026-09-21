-- Requalification : arrêter de lire 2521 lignes pour en traiter 143.
--
-- LA PANNE, mesurée en prod. `requalifierContenus` lisait `contenu_tier_etat`
-- filtré sur `passages_prevus > 0` : 2521 lignes. PostgREST plafonne toute
-- réponse à `max-rows` (1000 sur Supabase) et répond **200**. Il n'y avait donc
-- aucune erreur à relire, et ~1500 contenus n'étaient JAMAIS examinés.
--
-- La forme de la perte compte plus que la perte. Une troncature ne ressemble
-- pas à une panne, elle ressemble à un inventaire complet : le rapport affichait
-- « 1000 examinés » avec l'air d'avoir tout vu, ce qui referme l'enquête au lieu
-- de l'ouvrir. Preuve du jour : 143 contenus requalifiables, 14 seulement dans
-- la fenêtre lue ; le run de la veille en avait requalifié 31, dont 22 encore
-- dans cette fenêtre. La vue s'exécute en 17 ms — ce n'était pas un coût, c'était
-- un plafond.
--
-- Aggravant MVCC, et c'est lui qui rend la famine auto-entretenue : une ligne
-- mise à jour est réécrite en FIN de tas. Les contenus qu'on vient de requalifier
-- migrent donc hors des 1000 premières lignes, et les contenus actifs sont
-- précisément ceux qu'on cesse de voir. Plus le moteur tourne, moins il voit.
--
-- CE QUE FAIT CETTE VUE : du dégrossissage, rien d'autre. Elle ne garde que les
-- cycles TERMINÉS — `passages_prevus > 0 and publies >= passages_prevus`.
-- Aujourd'hui : 202 lignes au lieu de 2521.
--
-- POURQUOI LE FILTRE EST SÛR (vérifié ligne à ligne dans `deciderRequalif`,
-- supabase/functions/_shared/tierlist.ts). La fonction ouvre sur deux gardes,
-- dans cet ordre :
--     if (passagesPrevus <= 0) return { requalifier: false, motif: "passages" }
--     if (publies < passagesPrevus) return { requalifier: false, motif: "passages" }
-- Les TROIS portes de sortie qui requalifient (sur mesure quand `moyenne` n'est
-- pas nulle ; sans mesure motif « introuvable » ; sans mesure motif « delai »)
-- sont toutes situées APRÈS ces deux gardes. Aucune ne peut donc être atteinte
-- par une ligne que la vue écarte : la vue ne peut pas faire disparaître un
-- contenu que le TypeScript aurait requalifié. Le filtre est exactement la
-- conjonction des deux gardes, ni plus ni moins.
--
-- CE QU'ELLE NE FAIT PAS, ET C'EST VOULU. La décision et le barème RESTENT dans
-- `deciderRequalif`, en TypeScript. Les gardes « recul » et « délai plafond »
-- dépendent de `now()` ET des réglages `reglages.tierlist` lus au runtime
-- (`recul_jours`, `requalif_max_jours`, éditables dans Pilotage) : les descendre
-- en SQL ferait diverger minuit de ce que l'admin affiche, puisque
-- `src/features/moteur/tierlist.ts` duplique la décision pour la page
-- Slideshows. Une vue qui trancherait à la place du TS créerait deux vérités.
-- Le compromis retenu est donc explicite : SQL = volumétrie, TS = décision.
--
-- CE QU'ELLE NE DISPENSE PAS DE FAIRE : paginer. `max-rows` s'applique aussi à
-- elle, et 202 lignes aujourd'hui ne majorent rien pour demain. La lecture passe
-- par `lireTout()` de `_shared/lots.ts` (keyset sur `contenu_id`, pages sous le
-- plafond). La vue réduit le volume ; la pagination supprime l'hypothèse.
--
-- Construite SUR `contenu_tier_etat` et non par recopie de son left join
-- lateral : dupliquer l'agrégat, ce serait dupliquer la fenêtre `en_vol` de
-- 2 jours (0246) et la partition mesures / introuvables / en_attente_mesure
-- (0247), donc s'exposer à ce qu'elles divergent au prochain correctif.
--
-- Colonnes listées explicitement, jamais `select *` : la liste des colonnes
-- d'une vue est figée à sa création et `create or replace view` n'accepte
-- ensuite que des ajouts en fin (même contrainte qu'en 0247). Les 15 colonnes
-- sont reprises sous les mêmes noms, types et ordre que `contenu_tier_etat`,
-- pour que la chaîne de `select` de `requalifierContenus` reste littéralement
-- inchangée et que les deux sources soient interchangeables.
--
-- Pas de clause `security_invoker` : sémantique definer, comme
-- `contenu_tier_etat`, `stats_comptes` et `posts_poster`. En invoker, la policy
-- admin-only de `contenus` viderait la vue pour un `authenticated` non-admin —
-- une vue vide est précisément le mode de panne qu'on est en train de réparer.
--
-- Aucun index ne peut accélérer ceci : l'agrégat lateral de `contenu_tier_etat`
-- est recalculé par contenu. Cette migration ne promet donc aucune performance,
-- elle ne promet que de la complétude. Les 17 ms mesurés disent assez que le
-- temps n'a jamais été le sujet.

create or replace view public.contenu_a_requalifier as
select
  e.contenu_id,
  e.tier,
  e.passages_prevus,
  e.tier_cycle,
  e.tier_maj_at,
  e.publies,
  e.en_vol,
  e.restants,
  e.moyenne_vues,
  e.max_vues,
  e.nb_150k,
  e.dernier_publie_at,
  e.mesures,
  e.introuvables,
  e.en_attente_mesure
from public.contenu_tier_etat e
where e.passages_prevus > 0
  and e.publies >= e.passages_prevus;

comment on view public.contenu_a_requalifier is
  'Dégrossissage de contenu_tier_etat : cycles TERMINÉS seulement (passages_prevus > 0 et publies >= passages_prevus), soit les deux premières gardes de deciderRequalif. 202 lignes au lieu de 2521, pour que la requalification cesse de buter sur le plafond max-rows de PostgREST. La décision et le barème restent en TypeScript ; cette vue ne tranche rien. Ne PAS l''utiliser pour le pool d''assignation ni pour le bouton admin « requalifier ce contenu » : tous deux ont besoin des cycles NON terminés, que ce filtre écarte par construction.';

grant select on public.contenu_a_requalifier to authenticated;
grant select on public.contenu_a_requalifier to service_role;

-- `anon` est retiré EXPLICITEMENT, parce que les privilèges par défaut du schéma
-- l'accordent sinon d'office à tout nouvel objet. Sur une vue en sémantique
-- definer, ça ouvrirait le contenu de `contenus` (RLS admin-only) à la clé anon,
-- qui est publique par nature — elle est dans le bundle du front. Personne ne lit
-- cette vue avec la clé anon : minuit passe par `service_role`, l'admin par son
-- JWT. À NOTER, et ce n'est pas réparé ici : `contenu_tier_etat` et
-- `stats_comptes` portent la même exposition, héritée de la même façon. La
-- corriger demande de vérifier ce que le front lit vraiment, donc son propre
-- changement — on se contente de ne pas en ajouter une de plus.
revoke select on public.contenu_a_requalifier from anon;
