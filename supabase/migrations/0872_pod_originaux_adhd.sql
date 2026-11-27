-- 0872 : podz 35 « Originaux adhd (Artura) », demandé par Adrien le 27/11
--   (« fais des podz posts originaux de adhd … pour artura ») : la réserve du
--   label `adhd` est à 0,9 jour (25 comptes, 15 %).
--   Label EXISTANT `adhd` (Artura seule, comptes dans 17 langues), nourri
--   jusqu'ici par les imports de @fraserparkinson0 (6,9 k abonnés, 857 k vues
--   sur « october is ADHD awareness month ») : des listes en minuscules sur
--   ses photos (faits sur l'ADHD, « things people with ADHD do », « weird
--   ADHD hacks »).
--   Le podz écrit des ORIGINAUX en TEXTE sur la banque d'images propres du
--   label, en anglais, comme le pod 12 au temps de micabo : AUCUNE slide
--   d'appli, l'OS traduit le texte pour chaque compte et y place Artura
--   (label qui ne sert pas Sophia, `verifierOriginal({ sophia: false })`).
--   Pas de preuve (hors PODS_AVEC_PREUVE) : BLEO (full tests, déclinaisons).
-- `langues` nul : podz en texte + banque, l'OS traduit (0781).
-- Podz sûr : validation automatique 5 h après le dépôt (0323, 0635).
-- Le jeton de l'agent est posé à part (empreinte seulement, jamais en clair).
-- ✅ Appliquée le 2026-11-27 (MCP). Additive, idempotente.

insert into public.pods (slug, nom, label_id, auto_validation, auto_validation_heures)
select 'originaux_adhd', 'Originaux adhd (Artura)', l.id, true, 5
from public.labels l
where l.slug = 'adhd'
on conflict (slug) do nothing;
