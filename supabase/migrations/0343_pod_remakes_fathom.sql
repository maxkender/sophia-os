-- 0343 : pod 11 « Remakes @fathom0g (Sophia) » et son label `Fathomly`.
--   Le label sert Sophia SEUL (label_applications). @fathom0g, c'est Fathomly,
--   une appli concurrente de Sophia (« Like Duolingo, but for everything you
--   learn ») : ses listes « 5 ways » et « 10/10 skills » sur fond blanc (titres
--   géants, une vraie vidéo YouTube par étape) font 32 k vues médianes, avec
--   des tubes à 3,6 M, 2,9 M et 818 k, et 5 à 9 % d'enregistrements. Le pod les
--   refait avec la slide Sophia à la place de leur slide Fathomly (la slide
--   `position_sophia` du deck), et UnSwipe en carte d'appli sur l'étape qui
--   s'y prête (double intégration, dans le même deck Sophia).
--   Le texte est dans l'image : un deck par langue, en anglais d'abord
--   (décision du 23/10).
-- Aucun compte n'est rattaché au label : Adrien et Max choisissent les comptes
-- Sophia anglais qui le portent (Pilotage).
-- Podz sûr (décision du 20/10) : validation automatique 12 h après le dépôt
-- (0323).
-- Le jeton de l'agent est posé à part (empreinte seulement, jamais en clair).
-- ✅ Appliquée le 2026-10-23 (API Supabase), après 0342. Additive, idempotente.

insert into public.labels (slug, nom, couleur, genre, application_id)
select 'fathomly', 'Fathomly', '#c4823c', null, a.id
from public.applications a
where a.slug = 'sophia'
on conflict (slug) do nothing;

insert into public.label_applications (label_id, application_id)
select l.id, a.id
from public.labels l
join public.applications a on a.slug = 'sophia'
where l.slug = 'fathomly'
on conflict (label_id, application_id) do nothing;

insert into public.pods (slug, nom, label_id, auto_validation)
select 'remakes_fathom', 'Remakes @fathom0g (Sophia)', l.id, true
from public.labels l
where l.slug = 'fathomly'
on conflict (slug) do nothing;
