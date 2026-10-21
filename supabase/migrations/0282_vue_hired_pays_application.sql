-- 0282 : la vue qui définit « Hired », au singulier.
--
-- La colonne Hired de la table Notion « Recruitment Targets » compte les
-- comptes TikTok par (pays × application). Plutôt que d'enfouir la règle dans
-- l'edge function, elle vit ici : relisible à la main par un humain qui doute
-- d'un chiffre, et impossible à faire diverger entre deux appelants.
--
-- CE QUI EST COMPTÉ, et pourquoi, d'après la demande d'Aram du 13/10/2026.
--
-- • LES WARM-UPS SONT INCLUS. « Warming up must be counted in Hired. » Le
--   moteur, lui, les exclut partout (CTE `comptes_ok` de 0256 et 0270), et
--   c'est précisément pour ça qu'Aram refuse la page Schedule comme source :
--   « I grabbed this from Posters not from Schedule, because Schedule doesn't
--   include Warming Up. » On lit donc `comptes` brut, jamais `comptes_ok`.
--
-- • LES DORMANTS SONT INCLUS, donc AUCUN filtre `is_active`. Ce n'est pas une
--   interprétation : la page Posters appelle `listerComptesAvecDormants()`
--   (src/features/moteur/api.ts:463), qui ne filtre pas, là où `listerComptes()`
--   filtre. Les chiffres qu'Aram a saisis à la main viennent de cette page.
--   Vérifié empiriquement le 13/10 : en comptant les dormants, 54 lignes sur 56
--   tombaient déjà juste ; en les excluant, 49 seulement, et cinq lignes
--   correctes devenaient fausses. Sa consigne va dans le même sens : « any
--   account that should be deleted should simply be deleted, so the algo just
--   counts all. »
--
-- • LE COMPTE MARQUE EST EXCLU (`type_compte = 'cm'`). Une seule ligne en base,
--   sophia.app.de, rattachée à Martin Befeld : c'est le « sophia social account
--   for Martin B » qu'Aram signale. Le moteur l'exclut déjà partout ailleurs
--   avec la même formule.
--
-- • LES COMPTES SANS PAYS SONT EXCLUS, faute de ligne Notion où les écrire.
--   Ce n'est pas un choix métier mais une mécanique, et le trigger de 0281 fait
--   que le cas ne devrait plus se produire. L'edge function les recompte à part
--   et les signale plutôt que de les laisser disparaître.
--
-- L'APPLICATION NE SE LIT QUE DANS `parts_applications`. Piège vérifié :
-- `comptes.application_id` vaut 'sophia' pour les 194 comptes, y compris les 35
-- Unswipe et Micabo — c'est une colonne morte, s'en servir donnerait 193 Sophia
-- et 0 ailleurs. NULL vaut 100 % Sophia.
--
-- `application` tombe à NULL quand un compte sert PLUSIEURS applications. Ça
-- n'arrive pas aujourd'hui (161 NULL, 18 unswipe, 17 micabo, aucune autre
-- forme) et le référent le tient pour impossible. Mais rien ne l'impose en
-- base : la seule contrainte est que `parts_applications` soit un objet, et
-- `partsDepuisCurseurs` (src/features/moteur/repartition/logique.ts:381) sait
-- déjà écrire {"sophia":30,"unswipe":70} dès qu'un curseur bouge. Le jour où ça
-- arrive, le NULL fait s'arrêter le job au lieu de lui faire inventer un
-- chiffre. Un « jamais » sans contrainte mérite un garde-fou, pas une
-- supposition.
--
-- Retour arrière : `drop view public.hired_pays_application;` — rien ne la lit
-- à part l'edge function notion-hired.

create or replace view public.hired_pays_application
with (security_invoker = true) as
select
  c.pays,
  case
    when c.parts_applications is null then 'sophia'
    when (
      select count(*) from jsonb_each(c.parts_applications) e
      where (e.value)::numeric > 0
    ) = 1 then (
      select e.key from jsonb_each(c.parts_applications) e
      where (e.value)::numeric > 0 limit 1
    )
    else null  -- compte partagé entre applications : le job doit s'arrêter
  end as application,
  count(*)::int as hired
from public.comptes c
where coalesce(c.type_compte, '') <> 'cm'
  and c.pays is not null
group by 1, 2;

comment on view public.hired_pays_application is
  'Comptes TikTok par (pays × application) pour la colonne Hired de Notion. Warm-ups et dormants INCLUS, compte marque (cm) et comptes sans pays exclus. application NULL = compte partagé entre apps : anomalie, le job s''arrête.';

grant select on public.hired_pays_application to authenticated, service_role;
