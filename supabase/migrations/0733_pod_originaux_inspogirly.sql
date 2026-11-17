-- 0733 : podz 18 « Originaux @iinspogiirly (Sophia) » et son label
--   `inspogirly`, lancé par Adrien le 16/11.
--   @iinspogiirly (16 k abonnés, en anglais) poste de l'inspo « it-girl » en
--   diaporamas : wishlists, glow up, sacs, et ses « 4 apps every girl
--   needs » (1,3 M vues le 18/10, 6,5 % d'enregistrements) : une couverture
--   en trois photos l'une sous l'autre (des produits de beauté, une fille,
--   des fleurs) avec le titre en blanc au centre, puis une slide par appli
--   sur fond blanc (son nom, son icône, une phrase qui dit ce qu'elle fait).
--   Le podz écrit des ORIGINAUX à son style exact, en images finies, en
--   anglais : de vraies applis de l'App Store pour les filles, douces (jamais
--   de cycle ni de santé intime, demande d'Adrien), dont Sophia, jamais la
--   première ni la dernière.
-- Label 100 % podz, qui sert Sophia SEUL (label_applications). Sa voie se
-- calcule (`voie(labels)`, vue `labels_100_podz`) : 2 dès le premier original
-- validé, puisque tout est livré en images finies.
-- Genre `femme` : son public et son accroche (« every girl needs »). Aucun
-- compte : la règle « démarrage d'un podz » ou Pilotage.
-- BLEO : même écart « même famille » que les autres labels 100 % podz (6 jours).
-- Podz sûr : validation automatique 5 h après le dépôt (0323, 0635).
-- Le jeton de l'agent est posé à part (empreinte seulement, jamais en clair).
-- ✅ Appliquée le 2026-11-16 (MCP). Additive, idempotente.

insert into public.labels (slug, nom, couleur, genre, application_id)
select 'inspogirly', 'Inspo girly', '#f2b8c6', 'femme', a.id
from public.applications a
where a.slug = 'sophia'
on conflict (slug) do nothing;

insert into public.label_applications (label_id, application_id)
select l.id, a.id
from public.labels l
join public.applications a on a.slug = 'sophia'
where l.slug = 'inspogirly'
on conflict (label_id, application_id) do nothing;

insert into public.pods (slug, nom, label_id, auto_validation, auto_validation_heures, langues)
select 'originaux_inspogirly', 'Originaux @iinspogiirly (Sophia)', l.id, true, 5, array['en']
from public.labels l
where l.slug = 'inspogirly'
on conflict (slug) do nothing;

update public.reglages
   set valeur = jsonb_set(valeur, '{garde_fous,meme_famille_jours_labels,inspogirly}', '6'::jsonb)
 where cle = 'bleo'
   and valeur->'garde_fous' ? 'meme_famille_jours_labels'
   and not (valeur->'garde_fous'->'meme_famille_jours_labels' ? 'inspogirly');
