-- 0782 : podz 23 « Remakes @studyingsmiski (micabo) » et son label
--   `cozy_study`, lancé par Adrien le 20/11.
--   Modèle : @studyingsmiski, des listes d'applis et de conseils d'étude
--   très « cozy » : fond de ciel en papier plié, une carte en timbre par
--   slide, des stickers (grenouille en peluche, matcha, dango), des bulles
--   écrites à la main (« 4 apps you need as a student! » 678 k).
--   Le podz refait ses posts qui ont marché, en images finies, en anglais.
--   Partout où elle met Turbo AI (sa concurrente), on met micabo, avec son
--   nouveau logo (demande d'Adrien).
-- Label dédié, 100 % podz, qui sert micabo SEUL (label_applications et
-- labels.application_id). Le nom finit par `_study` comme les autres labels
-- de micabo. Genre `femme` (le modèle et son public). Aucun compte : la
-- règle « démarrage d'un podz » ou Pilotage. Voie 2 dès le premier remake
-- validé (images finies).
-- BLEO : même écart « même famille » que les autres labels 100 % podz (6 jours).
-- Podz sûr : validation automatique 5 h après le dépôt (0323, 0635).
-- Langues : l'anglais, ouvert et prêt (0781 : `langues` et `langues_pretes`).
-- Le jeton de l'agent est posé à part (empreinte seulement, jamais en clair).
-- ✅ Appliquée le 2026-11-20 (MCP). Additive, idempotente.

insert into public.labels (slug, nom, couleur, genre, application_id)
select 'cozy-study', 'cozy_study', '#9cc9e6', 'femme', a.id
from public.applications a
where a.slug = 'micabo'
on conflict (slug) do nothing;

insert into public.label_applications (label_id, application_id)
select l.id, a.id
from public.labels l
join public.applications a on a.slug = 'micabo'
where l.slug = 'cozy-study'
on conflict (label_id, application_id) do nothing;

insert into public.pods (slug, nom, label_id, auto_validation, auto_validation_heures, langues, langues_pretes)
select 'remakes_studyingsmiski', 'Remakes @studyingsmiski (micabo)', l.id, true, 5, array['en'], array['en']
from public.labels l
where l.slug = 'cozy-study'
on conflict (slug) do nothing;

update public.reglages
   set valeur = jsonb_set(valeur, '{garde_fous,meme_famille_jours_labels,cozy-study}', '6'::jsonb)
 where cle = 'bleo'
   and valeur->'garde_fous' ? 'meme_famille_jours_labels'
   and not (valeur->'garde_fous'->'meme_famille_jours_labels' ? 'cozy-study');
