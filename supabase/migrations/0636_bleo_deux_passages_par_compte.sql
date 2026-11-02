-- 0636 : plusieurs passages BLEO par compte et par jour (première nuit actif, 2/11).
--
-- 0600 avait posé `passages_bleo_compte_jour_uidx` : unique (compte_id,
-- date_publication_prevue) where bras = 'bleo'. C'était D20, pensé pour l'A/B
-- (un créneau BLEO par compte et par jour). Sans A/B, D20 est sans objet, mais
-- l'index était resté. À la première nuit en mode actif (lundi 2/11), le 2e
-- passage BLEO de chaque compte a été refusé (614 « duplicate key ») : 333
-- passages au lieu de ~668 (309 comptes à 1 post, 63 à 0). Les tests à blanc ne
-- pouvaient pas le voir (aucune écriture en base).
--
-- Appliquée le 2/11 à 8 h 24 (API de gestion : execute_sql attendait une
-- confirmation qui n'arrivait pas), puis rattrapage relancé.
-- Retour arrière : aucun (l'index contredit le plan BLEO à 2 créneaux).

drop index if exists public.passages_bleo_compte_jour_uidx;
