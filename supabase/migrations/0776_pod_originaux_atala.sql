-- 0776 : podz 19 « Originaux running (Atala) » et son label `dos_donts_run`,
--   lancé par Adrien le 19/11.
--   Modèles : @hannah.run5 (en français) et @katrina.run (en anglais), deux
--   comptes UGC de l'appli Pacewell sur le même gabarit Canva : les « do &
--   don'ts » de la course à pied (« courir l'hiver : les do & don'ts » 279 k,
--   « first 5k / do and don'ts » 191 k) : une couverture avec une coureuse
--   détourée, puis une slide par moment (« Do ✓ », trois vignettes légendées ;
--   « Don't ✕ », deux), et chez elles une page de l'appli à la fin.
--   Le podz écrit des ORIGINAUX à leur style exact, en images finies, en
--   anglais et en français. Atala n'a jamais de page à elle : son logo est une
--   vignette parmi les « Do » (« un plan atala »), demande d'Adrien.
-- Label dédié, 100 % podz, qui sert Atala SEUL (label_applications et
-- labels.application_id). Le nom finit par `_run` : ses comptes prennent
-- l'identité du running (docs/applications.md § 5). Genre `femme` (les
-- modèles et leur public). Aucun compte : la règle « démarrage d'un podz » ou
-- Pilotage. Atala est encore inactive : rien n'est publié avant son activation.
-- Sa voie se calcule (`voie(labels)`, vue `labels_100_podz`) : 2 dès le premier
-- original validé, puisque tout est livré en images finies.
-- BLEO : même écart « même famille » que les autres labels 100 % podz (6 jours).
-- Podz sûr : validation automatique 5 h après le dépôt (0323, 0635).
-- Le jeton de l'agent est posé à part (empreinte seulement, jamais en clair).
-- ✅ Appliquée le 2026-11-19 (MCP). Additive, idempotente.

insert into public.labels (slug, nom, couleur, genre, application_id)
select 'dos-donts-run', 'dos_donts_run', '#2d473e', 'femme', a.id
from public.applications a
where a.slug = 'atala'
on conflict (slug) do nothing;

insert into public.label_applications (label_id, application_id)
select l.id, a.id
from public.labels l
join public.applications a on a.slug = 'atala'
where l.slug = 'dos-donts-run'
on conflict (label_id, application_id) do nothing;

insert into public.pods (slug, nom, label_id, auto_validation, auto_validation_heures, langues)
select 'originaux_atala', 'Originaux running (Atala)', l.id, true, 5, array['en', 'fr']
from public.labels l
where l.slug = 'dos-donts-run'
on conflict (slug) do nothing;

update public.reglages
   set valeur = jsonb_set(valeur, '{garde_fous,meme_famille_jours_labels,dos-donts-run}', '6'::jsonb)
 where cle = 'bleo'
   and valeur->'garde_fous' ? 'meme_famille_jours_labels'
   and not (valeur->'garde_fous'->'meme_famille_jours_labels' ? 'dos-donts-run');
