-- 0788 : le label clean_study passe de micabo à Sophia (demande de l'admin du
-- 20/11, dans la refonte des labels micabo).
--
-- Depuis le 4/11 (arrêt d'UnSwipe), clean_study ne servait que micabo : ses
-- comptes étaient réglés « micabo 100 % » et l'OS plaçait micabo sur chaque
-- deck (`contenu_langue_decks`). Le label garde ses sources, ses contenus, ses
-- comptes et son podz 12 ; seule l'application change.
--
-- Ce que fait la migration :
--   1. le label sert Sophia SEUL (`label_applications`) ; son application
--      principale (`labels.application_id`) était déjà Sophia ;
--   2. ses comptes actifs réglés « micabo 100 % » passent à « Sophia 100 % »
--      (`comptes.parts_applications`). Sans ça ils ne publieraient plus rien :
--      une répartition explicite ne sert jamais une application à 0 %.
--      18 comptes le 20/11 : malak.tabiiya621 (ar), jakob.studium264 et
--      sophia.wagner13 (de), daphne.pure919 et despoina.soft262 (el),
--      zoe.clean279 (en), alma.simple4051 et valeria.calma490 (es),
--      camila.gentle154 (es-419), hugo.notes813 et manon.light627 (fr),
--      lea.svjeza312 (hr), viola.pura998 (it), pola.delikatna935 (pl),
--      ana.naturala186 (ro), saga.frisk338 (sv), barannotlar412 et
--      eylul.calisma136 (tr).
--
-- Ce qu'elle ne fait pas, et pourquoi ça marche quand même :
--   * LES DECKS. Les 262 contenus validés du label (150 originaux du podz 12,
--     112 importés) n'ont pas de slide Sophia : leur `contenu_langues.slides`
--     est la base sans appli. À l'assignation, `assurerDeckPourLangue` voit un
--     deck sans placement (`estDeckPret`) et y pose Sophia, comme pour un
--     contenu neuf. Les decks micabo restent dans `contenu_langue_decks`, plus
--     lus.
--   * LA PERTINENCE. Aucun de ces contenus n'a de note Sophia. Pour Sophia, un
--     contenu sans ligne `contenu_pertinences` est servi (`bleo_tirage`,
--     `bleo_remplacants`) : tout le label est servi, sans tri.
--   * LE PLAN DU 21/11. Tiré à 14 h le 20/11, avant la bascule : 32 créneaux
--     micabo sur 16 de ces comptes. À minuit, l'assignation voit que micabo
--     n'est plus servie par le compte et prend un remplaçant BLEO dans
--     l'application du créneau (D49, D52). Vérifié avant d'appliquer :
--     `bleo_remplacants(compte, '2026-11-21', Sophia)` rend 5 candidats pour
--     chacun des 18 comptes.
--   * LES COMPTES INACTIFS du label (10 réglés micabo, 5 UnSwipe) ne sont pas
--     touchés, comme lors du passage d'UnSwipe à micabo.
--   * LES CONCURRENTS. Côté Sophia, seuls Vent Now et Readup sont retirés des
--     decks : un contenu importé qui cite une appli d'étude (Quizlet, Anki…)
--     la garde. Une vingtaine de contenus importés au plus.
--
-- À faire le même jour, hors base : les consignes du podz 12
-- (`pods/clean-study/AGENT.md`). Dès que le label sert Sophia, le guichet exige
-- UNE slide Sophia par original (`verifierOriginal`) et refuse un dépôt sans.
--
-- ✅ Appliquée le 2026-11-20 (MCP, vers 14 h 40). Vérifié après : le label sert
-- Sophia seul ; ses 18 comptes actifs sont à `{"sophia": 100}` ; ses 15 comptes
-- inactifs n'ont pas bougé ; `bleo_remplacants` rend toujours 5 candidats
-- Sophia par compte pour le 21/11. La vue `label_application_reserve` affiche
-- 19 contenus prêts et 6,4 jours pour Sophia : elle lit le rang Sophia de la
-- tierlist, que ces contenus n'ont pas (D / 0) ; BLEO ne le lit pas.
-- Idempotente.
--
-- Retour arrière : remettre micabo dans `label_applications` et en retirer
-- Sophia ; repasser les 18 comptes ci-dessus à `{"micabo": 100}`. Les decks
-- micabo en cache sont toujours là. Une slide Sophia posée entre-temps dans
-- `contenu_langues.slides` ne gêne pas micabo, cuit depuis `slides_base`.

set lock_timeout = '5s';

-- 1. Sophia seul.
update public.labels l
   set application_id = a.id
  from public.applications a
 where l.slug = 'clean-study'
   and a.slug = 'sophia'
   and l.application_id is distinct from a.id;

insert into public.label_applications (label_id, application_id)
select l.id, a.id
from public.labels l
join public.applications a on a.slug = 'sophia'
where l.slug = 'clean-study'
on conflict (label_id, application_id) do nothing;

delete from public.label_applications la
 using public.labels l, public.applications a
 where la.label_id = l.id
   and la.application_id = a.id
   and l.slug = 'clean-study'
   and a.slug <> 'sophia';

-- 2. Les comptes actifs du label réglés « micabo 100 % » passent à Sophia.
update public.comptes c
   set parts_applications = '{"sophia": 100}'::jsonb
  from public.compte_labels cl
  join public.labels l on l.id = cl.label_id and l.slug = 'clean-study'
 where cl.compte_id = c.id
   and c.is_active
   and c.parts_applications = '{"micabo": 100}'::jsonb;
