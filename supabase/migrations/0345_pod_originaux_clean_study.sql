-- 0345 : pod 12 « Originaux clean_study ».
--   Originaux en ANGLAIS pour le label clean_study (la fille qui étudie bien :
--   méthodes de travail, année scolaire, motivation ; sources @icedlattebrunette,
--   @renaraise, @sooftqs._, et la niche @studyy.hackz, @katy._.studies).
--   Le label ne sert PAS Sophia : micabo et UnSwipe (`label_applications`).
--   L'original part sans slide d'appli ; validé, il n'a pas de rang Sophia
--   (D / 0) et entre au rang B chez micabo et UnSwipe, qui le traduisent et y
--   placent leur appli à l'assignation (fonction `pods`, même PR).
--   Même règle de preuve que les pods 4, 5, 7, 8 et 9, contrôlée par la
--   fonction `pods` (PODS_AVEC_PREUVE).
--   Podz sûr dès le départ (décision d'Adrien du 20/10 : tous les podz sauf
--   la vidéo) : validation automatique 12 h après le dépôt (0323).
--   0344 est prise par une autre branche (mises en scène) : ce pod prend 0345.
-- Le jeton de l'agent est posé à part (empreinte seulement, jamais en clair).
-- ✅ Appliquée le 2026-10-24 (API Supabase), après 0343. Additive, idempotente.

insert into public.pods (slug, nom, label_id, auto_validation)
select 'originaux_clean_study', 'Originaux clean_study', l.id, true
from public.labels l
where l.slug = 'clean-study'
on conflict (slug) do nothing;
