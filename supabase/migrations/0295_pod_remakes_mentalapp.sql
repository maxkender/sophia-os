-- 0295 : pod 6 « Remakes @mentalapp » et son label `mentalmaxxing`.
--   Le label sert UnSwipe SEUL (label_applications) : ses contenus ne passent
--   jamais sur un créneau Sophia. Le pod refait à l'identique les posts
--   « mentalmaxxing » de @mentalapp (depuis le 16/09), avec UnSwipe à la place
--   de leur appli, dans les langues d'UnSwipe, et les livre en images finies
--   (fonction `pods`, chemin « label hors Sophia » : la variante UnSwipe est
--   tirée du deck déposé, rang Sophia D / 0, rang UnSwipe tiré de la note).
-- Aucun compte n'est rattaché au label pour l'instant.
-- Le jeton de l'agent est posé à part (empreinte seulement, jamais en clair).
-- ✅ Appliquée le 2026-10-17 (MCP). Additive, idempotente.

insert into public.labels (slug, nom, couleur, application_id)
select 'mentalmaxxing', 'mentalmaxxing', '#6b8f71', a.id
from public.applications a
where a.slug = 'unswipe'
on conflict (slug) do nothing;

insert into public.label_applications (label_id, application_id)
select l.id, a.id
from public.labels l
join public.applications a on a.slug = 'unswipe'
where l.slug = 'mentalmaxxing'
on conflict (label_id, application_id) do nothing;

insert into public.pods (slug, nom, label_id)
select 'remakes_mentalapp', 'Remakes @mentalapp', l.id
from public.labels l
where l.slug = 'mentalmaxxing'
on conflict (slug) do nothing;
