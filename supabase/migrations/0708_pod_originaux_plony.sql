-- 0708 : podz 14 « Originaux Plony » (Sophia), lancé par Adrien le 13/11.
--   Le podz écrit en anglais des originaux de 4 slides dans le style de
--   @_plony_ : une phrase (vraie citation vérifiée ou phrase à nous) coupée sur
--   3 slides, puis la source et Sophia (« I read this this morning on Sophia »).
--   Ses images viennent de la banque du label Plony (celles de @_plony_
--   nettoyées par l'import de l'OS, 0706) et de Seedream (action ajouter_image).
-- Label de voie 1 (pas 100 % podz) : l'OS traduit et place Sophia au
--   placement, d'où `langues` vide comme les autres podz d'originaux.
-- Podz sûr : validation automatique 5 h après le dépôt, comme les autres.
-- Le rattachement du label à Sophia (label_applications) n'est PAS ici : il
--   vient après le nettoyage de l'import (contenus de @_plony_ rejetés, source
--   désactivée), sinon ses posts déjà validés entreraient dans le pool Sophia
--   (procédure validée par la session de coordination BLEO, en tête de 0706).
-- Le jeton de l'agent est posé à part (empreinte seulement, jamais en clair).
-- 0707 est prise sur main (entrainer_bot) : ce pod prend 0708.
-- ✅ Appliquée le 2026-11-13 (MCP). Additive, idempotente.

insert into public.pods (slug, nom, label_id, auto_validation, auto_validation_heures)
select 'originaux_plony', 'Originaux Plony (Sophia)', l.id, true, 5
from public.labels l
where l.slug = 'plony'
on conflict (slug) do nothing;
