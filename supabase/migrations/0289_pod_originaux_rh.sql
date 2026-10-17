-- 0289 : pod 5 « Originaux RH ».
--   Originaux en FRANÇAIS pour le label RH (conseils d'embauche et de carrière,
--   source @careerswemma), écrits seulement sur des schémas d'accroche qui
--   font des vues aujourd'hui : même règle de preuve que le pod 4, contrôlée par
--   la fonction `pods` (PODS_AVEC_PREUVE). Livraison « original » : rang B à
--   la validation, traduction et placement de Sophia par l'OS à l'assignation.
-- Le jeton de l'agent est posé à part (empreinte seulement, jamais en clair).
-- ✅ Appliquée le 2026-10-15 (MCP). Additive, idempotente.

insert into public.pods (slug, nom, label_id)
select 'originaux_rh', 'Originaux RH', l.id
from public.labels l
where l.slug = 'rh'
on conflict (slug) do nothing;
