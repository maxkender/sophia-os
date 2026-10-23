-- 0335 : pod 9 « Originaux alpha_male ».
--   Originaux en ANGLAIS pour le label alpha_male (discipline, règles
--   d'homme, habitudes, psychologie sociale ; sources @selfsculpt_,
--   @millyjhino, @motiondreambig), écrits seulement à partir de ce qui a
--   marché chez nous : même règle de preuve que les pods 4, 5, 7 et 8,
--   contrôlée par la fonction `pods` (PODS_AVEC_PREUVE). Livraison
--   « original » : rang B à la validation, traduction et placement de Sophia
--   par l'OS à l'assignation.
--   Podz sûr dès le départ (décision d'Adrien du 20/10 : tous les podz sauf
--   la vidéo) : validation automatique 12 h après le dépôt (0323).
-- Le jeton de l'agent est posé à part (empreinte seulement, jamais en clair).
-- ✅ Appliquée le 2026-10-21 (API Supabase), après 0323. Additive, idempotente.

insert into public.pods (slug, nom, label_id, auto_validation)
select 'originaux_alpha_male', 'Originaux alpha_male', l.id, true
from public.labels l
where l.slug = 'alpha-male'
on conflict (slug) do nothing;
