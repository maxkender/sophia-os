-- 0760 : Bible des comptes (Max, 18/11). « Supprimer » met le compte à la corbeille (onglet Corbeille : restaurer ou
-- supprimer définitivement). Ajout seulement, sur bible_comptes.
alter table public.bible_comptes add column if not exists supprime_at timestamptz;
