-- 0318 : pod 7 « Originaux beau_smart_girl ».
--   Originaux en FRANÇAIS pour le label beau_smart_girl (culture, habitudes et
--   bien-être « smart girl » sur photos esthétiques ; modèle @studyavec_lea),
--   écrits seulement sur des schémas d'accroche qui font des vues aujourd'hui :
--   même règle de preuve que les pods 4 et 5, contrôlée par la fonction `pods`
--   (PODS_AVEC_PREUVE). Livraison « original » : rang B à la validation,
--   traduction et placement des applis du label par l'OS à l'assignation.
-- Le jeton de l'agent est posé à part (empreinte seulement, jamais en clair).
-- ✅ Appliquée le 2026-10-19 (MCP). Additive, idempotente.

insert into public.pods (slug, nom, label_id)
select 'originaux_beau_smart_girl', 'Originaux beau_smart_girl', l.id
from public.labels l
where l.slug = 'beau-smart-girl'
on conflict (slug) do nothing;
