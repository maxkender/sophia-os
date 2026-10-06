-- La piste d'un compte source entre dans la note d'import.
--
-- POURQUOI. Mesuré sur 1316 contenus et 6766 passages mûrs : le score de
-- pertinence corrèle à 0,079 avec la performance, les vues source à 0,066, et
-- la piste du compte source à 0,19. Sélectionner le top 30 % par le score de
-- pertinence fait aussi bien que ne rien sélectionner (18,8 % de doublements
-- contre 19,4 %, p = 0,81) ; par la piste du compte source, +40 % relatif
-- (27,2 %, p = 0,003), en walk-forward sur trois fenêtres disjointes.
-- Détail complet dans docs/analyse_pertinence_selection.md.
--
-- La note d'import mélangeait deux ingrédients faibles et ignorait le seul
-- prédicteur solide. Cette migration l'ajoute.

-- 1. La piste, en vue plutôt qu'en table ----------------------------------
--
-- Une vue et non une table rafraîchie : rien à resynchroniser, rien à mettre
-- en panne, et la vue ne voit par construction que des passages déjà mûrs,
-- donc déjà passés. Aucune fuite du futur vers la note d'un nouvel import.
--
-- `n >= 10` : en dessous, la moyenne d'une source est du bruit. Les sources
-- sous ce plancher sont absentes de la vue, et l'appelant traite l'absence
-- comme « pas de preuve » (terme source inactif), jamais comme « mauvaise ».
create or replace view public.piste_comptes_reference as
with passages_murs as (
  select pa.contenu_id, pa.compte_id, pa.vues::numeric as vues
    from public.passages pa
   where pa.statut = 'publie'
     and pa.vues is not null
     and pa.publie_at is not null
     and pa.publie_at < now() - interval '3 days'
),
-- Normalisation par compte de publication : un post vaut ce qu'il fait
-- RAPPORTÉ au compte qui l'a publié, sinon on classerait les gros comptes.
mediane_compte as (
  select compte_id, percentile_cont(0.5) within group (order by vues) as med
    from passages_murs
   group by compte_id
  having count(*) >= 5
),
perf_passage as (
  select pm.contenu_id, pm.vues / mc.med as perf
    from passages_murs pm
    join mediane_compte mc using (compte_id)
   where mc.med > 0
),
-- Un contenu republié plusieurs fois compte une fois, par sa médiane.
perf_contenu as (
  select contenu_id, percentile_cont(0.5) within group (order by perf) as perf
    from perf_passage
   group by contenu_id
),
par_source as (
  select c.compte_reference_id,
         avg(pc.perf) as perf_moyenne,
         count(*)     as nb_contenus
    from perf_contenu pc
    join public.contenus c on c.id = pc.contenu_id
   where c.compte_reference_id is not null
   group by c.compte_reference_id
  having count(*) >= 10
)
select compte_reference_id,
       nb_contenus,
       perf_moyenne,
       -- Rang centile sur 0-100 pour parler la même langue que les deux autres
       -- termes, puis régularisation vers 50 : une source à 11 contenus ne
       -- doit pas peser autant qu'une source à 150.
       50 + (percent_rank() over (order by perf_moyenne) * 100 - 50)
          * (nb_contenus::numeric / (nb_contenus + 20)) as piste
  from par_source;

comment on view public.piste_comptes_reference is
  'Piste d''un compte source : rang centile 0-100 de sa performance moyenne, '
  'régularisé par son volume. Entre dans la note d''import (elo_poids_source). '
  'Ne voit que des passages mûrs, donc jamais le futur d''un import en cours.';

-- Lecture réservée au rôle de service, comme les tables qu'elle agrège.
-- Les fonctions edge y accèdent par ce rôle ; le front n'en a pas besoin.
--
-- `sophia_hm_lecture` est dans la liste parce que les droits par défaut du
-- schéma `public` lui avaient accordé un SELECT que personne n'avait demandé.
-- Vérifié après coup sur la base : c'est un rôle de connexion directe en
-- lecture seule, hors application web, mais la vue n'a pas à lui être ouverte
-- par accident.
revoke all on public.piste_comptes_reference from anon, authenticated, sophia_hm_lecture;

-- 2. Le réglage, posé mais INERTE -----------------------------------------
--
-- `elo_poids_source` est la part de la note qui vient de la piste. Le reste se
-- partage comme avant entre vues et pertinence selon `elo_poids_vues`, qui
-- garde exactement son sens. Remettre `elo_poids_source` à 0 rétablit à
-- l'identique le comportement d'avant cette migration.
--
-- 0,45 : l'optimum mesuré est PLAT entre 0,40 et 0,50 (34,2 % de doublements
-- dans les deux cas), on prend le milieu. La source pure (1,0) fait moins bien
-- (28,4 %) : les vues source gardent de la valeur.
--
-- CETTE MIGRATION EST SANS EFFET TANT QUE LES FONCTIONS NE SONT PAS
-- REDÉPLOYÉES, et c'est voulu : le `lireScoring` actuellement en production ne
-- lit pas cette clé, donc la poser ne change rien. Elle peut donc être
-- appliquée avant le déploiement sans risque.
--
-- LE SEUIL EST DANS 0265, PAS ICI. Le baisser maintenant rendrait la prod plus
-- permissive sans la compensation du terme source, puisque l'ancien bundle
-- ignore `elo_poids_source` mais obéit au seuil. 0265 s'applique APRÈS le
-- déploiement des fonctions.
update public.reglages
   set valeur = valeur || jsonb_build_object('elo_poids_source', 0.45)
 where cle = 'scoring';
