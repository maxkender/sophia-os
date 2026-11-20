-- 0784 : podz 24 « Originaux @thebiomechanic (Atala) » et son label
--   `biomechanic_run`, lancé par Adrien le 20/11.
--   Modèle : @thebiomechanic (4,3 k abonnés, anglais), des tier lists santé
--   « … Tierlist For Optimal Health (Science based) » sur fond blanc : une
--   couverture (tête au cerveau, titre en Playfair, croquis à l'encre, jauge
--   « CORTISOL »), puis un élément par slide du pire au meilleur (« F TIER »
--   … « S TIER »), son nom, deux paragraphes et une photo (« Morning
--   Tierlist » 718 k, « Sports Tierlist » 398 k).
--   Le podz écrit des ORIGINAUX à son style exact, en images finies, en
--   anglais. Atala y est le tier « courir » (A ou S) : une photo de course
--   prise dans la banque de l'OS (labels male_run, clean_girl_run,
--   classic_girl_run) et le logo d'Atala à côté. Toutes les photos viennent
--   de la banque (demande d'Adrien).
-- Label dédié, 100 % podz, qui sert Atala SEULE (label_applications et
-- labels.application_id). Le nom finit par `_run` : ses comptes prennent
-- l'identité du running (docs/applications.md § 5). Genre nul (son public
-- est mixte, ses photos aussi). Aucun compte : la règle « démarrage d'un
-- podz » ou Pilotage. Atala est encore inactive : rien n'est publié avant son
-- activation. Voie 2 dès le premier original validé (images finies).
-- Langues : l'anglais, ouvert et prêt (0781).
-- BLEO : même écart « même famille » que les autres labels 100 % podz (6 jours).
-- Podz sûr : validation automatique 5 h après le dépôt (0323, 0635).
-- Le jeton de l'agent est posé à part (empreinte seulement, jamais en clair).
-- ✅ Appliquée le 2026-11-20 (MCP). Additive, idempotente.

insert into public.labels (slug, nom, couleur, genre, application_id)
select 'biomechanic-run', 'biomechanic_run', '#00c060', null, a.id
from public.applications a
where a.slug = 'atala'
on conflict (slug) do nothing;

insert into public.label_applications (label_id, application_id)
select l.id, a.id
from public.labels l
join public.applications a on a.slug = 'atala'
where l.slug = 'biomechanic-run'
on conflict (label_id, application_id) do nothing;

insert into public.pods (slug, nom, label_id, auto_validation, auto_validation_heures, langues, langues_pretes)
select 'originaux_atala_biomechanic', 'Originaux @thebiomechanic (Atala)', l.id, true, 5, array['en'], array['en']
from public.labels l
where l.slug = 'biomechanic-run'
on conflict (slug) do nothing;

update public.reglages
   set valeur = jsonb_set(valeur, '{garde_fous,meme_famille_jours_labels,biomechanic-run}', '6'::jsonb)
 where cle = 'bleo'
   and valeur->'garde_fous' ? 'meme_famille_jours_labels'
   and not (valeur->'garde_fous'->'meme_famille_jours_labels' ? 'biomechanic-run');
