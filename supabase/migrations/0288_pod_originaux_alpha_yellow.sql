-- 0288 : pod 4 « Originaux alpha_male_yellow ».
--   Originaux en anglais pour le label alpha_male_yellow, écrits UNIQUEMENT sur
--   des schémas d'accroche qui font des vues aujourd'hui : chaque dépôt porte
--   sa preuve (post de la niche à 200 k vues ou plus publié dans les 30 derniers
--   jours, ou contenu du label à r ≥ 2), contrôlée par la fonction `pods`
--   (PODS_AVEC_PREUVE). Livraison « original » du pod 2 : rang B à la
--   validation, traduction et placement de Sophia par l'OS à l'assignation.
-- Le jeton de l'agent est posé à part (empreinte seulement, jamais en clair).
-- ✅ Appliquée le 2026-10-15 (MCP). Additive, idempotente.

insert into public.pods (slug, nom, label_id)
select 'originaux_alpha_yellow', 'Originaux alpha_male_yellow', l.id
from public.labels l
where l.slug = 'alpha-male-yellow'
on conflict (slug) do nothing;
