-- 0320 : pod 8 « Originaux smart_girl ».
--   Originaux en ANGLAIS pour le label smart_girl (culture, lecture, éloquence
--   et habitudes « smart girl » ; sources @gilmoreobssesed, @richgirlacadmy_1),
--   écrits seulement sur des schémas d'accroche qui font des vues aujourd'hui :
--   même règle de preuve que les pods 4, 5 et 7, contrôlée par la fonction
--   `pods` (PODS_AVEC_PREUVE). Livraison « original » : rang B à la
--   validation, traduction et placement de Sophia par l'OS à l'assignation.
-- Le jeton de l'agent est posé à part (empreinte seulement, jamais en clair).
-- ✅ Appliquée le 2026-10-19 (MCP). Additive, idempotente.

insert into public.pods (slug, nom, label_id)
select 'originaux_smart_girl', 'Originaux smart_girl', l.id
from public.labels l
where l.slug = 'smart-girl'
on conflict (slug) do nothing;
