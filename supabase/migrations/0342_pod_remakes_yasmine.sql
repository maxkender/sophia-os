-- 0342 : pod 10 « Remakes @yasminespixels (micabo) » et son label `that_girl_study`.
--   Le label sert micabo SEUL (label_applications) : ses contenus ne passent
--   jamais sur un créneau Sophia ni UnSwipe. Le pod refait les posts « that
--   girl / studytok » de @yasminespixels qui ont marché (1,5 M, 835 k, 185 k
--   vues), avec micabo à la place de ses outils, et les livre en images finies
--   (fonction `pods`, chemin « label hors Sophia » du pod 6 : la variante
--   micabo est tirée du deck déposé, rang micabo tiré de la note).
--   Le texte est dans l'image (titre jaune, notes, écrans) : un deck par
--   langue, en français seulement pour l'instant (décision du 23/10).
-- Aucun compte n'est rattaché au label : Adrien et Max choisissent les comptes
-- micabo qui le portent (Pilotage).
-- Podz sûr (décision du 20/10 : tous les podz sauf la vidéo) : validation
-- automatique 12 h après le dépôt (0323).
-- Le jeton de l'agent est posé à part (empreinte seulement, jamais en clair).
-- ✅ Appliquée le 2026-10-23 (API Supabase), après 0323. Additive, idempotente.

insert into public.labels (slug, nom, couleur, genre, application_id)
select 'that-girl-study', 'that_girl_study', '#f2c94c', 'femme', a.id
from public.applications a
where a.slug = 'micabo'
on conflict (slug) do nothing;

insert into public.label_applications (label_id, application_id)
select l.id, a.id
from public.labels l
join public.applications a on a.slug = 'micabo'
where l.slug = 'that-girl-study'
on conflict (label_id, application_id) do nothing;

insert into public.pods (slug, nom, label_id, auto_validation)
select 'remakes_yasmine', 'Remakes @yasminespixels (micabo)', l.id, true
from public.labels l
where l.slug = 'that-girl-study'
on conflict (slug) do nothing;
