-- 0873 : podz 36 « Originaux art_histoire (Artura) », demandé par Adrien le
--   27/11 (« fais des podz posts originaux de adhd … art_histoire pour
--   artura ») : la réserve du label `art-histoire` est à 0 jour (62 comptes).
--   Label EXISTANT `art-histoire` (nom art_histoire, Artura seule, comptes
--   dans 24 langues), nourri jusqu'ici par les imports de @glacis1 (22 k
--   abonnés, 1,9 M vues sur l'exécution de Lady Jane Grey) : un tableau, une
--   histoire, un détail du tableau par slide sous une phrase courte, le titre
--   et l'année à la fin.
--   Le podz écrit des ORIGINAUX en TEXTE, en français comme @glacis1, sur des
--   tableaux du DOMAINE PUBLIC (Met, Open Access) qu'il recadre en détails
--   (9:16) et ajoute à la banque du label (`ajouter_image`), ou sur la banque
--   déjà là. AUCUNE slide d'appli : l'OS traduit pour chaque compte et y
--   place Artura (label qui ne sert pas Sophia).
--   Pas de preuve (hors PODS_AVEC_PREUVE) : BLEO (full tests, déclinaisons).
-- `langues` nul : podz en texte + banque, l'OS traduit (0781).
-- Podz sûr : validation automatique 5 h après le dépôt (0323, 0635).
-- Le jeton de l'agent est posé à part (empreinte seulement, jamais en clair).
-- ✅ Appliquée le 2026-11-27 (MCP). Additive, idempotente.

insert into public.pods (slug, nom, label_id, auto_validation, auto_validation_heures)
select 'originaux_art_histoire', 'Originaux art_histoire (Artura)', l.id, true, 5
from public.labels l
where l.slug = 'art-histoire'
on conflict (slug) do nothing;
