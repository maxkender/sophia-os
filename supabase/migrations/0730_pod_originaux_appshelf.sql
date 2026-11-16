-- 0730 : podz 17 « Originaux @theappshelf (Sophia) » et son label
--   `appshelf`, lancé par Adrien le 15/11.
--   @theappshelf (« cool apps, daily », 4,9 k abonnés, en anglais) est le
--   compte de la créatrice de Swuvi : des listes de cinq applis (« five apps
--   every girl needs » 479 k, « my most used apps / as someone with ADHD »
--   21 k), une couverture en photo ou en collage, une slide par appli (son
--   nom, ses captures de l'App Store, une note façon iOS Notes), « save &
--   follow » à la fin ; son appli glissée parmi les cinq.
--   Le podz écrit des ORIGINAUX à son style exact, en images finies, en
--   anglais : cinq vraies applis de l'App Store, dont Sophia, jamais la
--   première ni la dernière.
-- Label 100 % podz, qui sert Sophia SEUL (label_applications). Sa voie se
-- calcule (`voie(labels)`, vue `labels_100_podz`) : 2 dès le premier original
-- validé, puisque tout est livré en images finies.
-- Genre `femme` : son public et ses accroches (« every girl needs », « cozy »,
-- « that girl »). Aucun compte : la règle « démarrage d'un podz » ou Pilotage.
-- BLEO : même écart « même famille » que les autres labels 100 % podz (6 jours).
-- Podz sûr : validation automatique 5 h après le dépôt (0323, 0635).
-- Le jeton de l'agent est posé à part (empreinte seulement, jamais en clair).
-- ✅ Appliquée le 2026-11-15 (MCP). Additive, idempotente.

insert into public.labels (slug, nom, couleur, genre, application_id)
select 'appshelf', 'Appshelf', '#f5c84c', 'femme', a.id
from public.applications a
where a.slug = 'sophia'
on conflict (slug) do nothing;

insert into public.label_applications (label_id, application_id)
select l.id, a.id
from public.labels l
join public.applications a on a.slug = 'sophia'
where l.slug = 'appshelf'
on conflict (label_id, application_id) do nothing;

insert into public.pods (slug, nom, label_id, auto_validation, auto_validation_heures, langues)
select 'originaux_appshelf', 'Originaux @theappshelf (Sophia)', l.id, true, 5, array['en']
from public.labels l
where l.slug = 'appshelf'
on conflict (slug) do nothing;

update public.reglages
   set valeur = jsonb_set(valeur, '{garde_fous,meme_famille_jours_labels,appshelf}', '6'::jsonb)
 where cle = 'bleo'
   and valeur->'garde_fous' ? 'meme_famille_jours_labels'
   and not (valeur->'garde_fous'->'meme_famille_jours_labels' ? 'appshelf');
