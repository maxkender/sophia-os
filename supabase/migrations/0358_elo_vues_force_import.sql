-- 0358 : un slideshow à 40 000 vues ou plus sur TikTok entre toujours.
--
-- Décision d'Adrien du 25/10 (« pour TOUS, si >40k vues, force l'import ;
-- fais-en une règle permanente »). La note d'import pèse les vues à 70 %
-- mais aussi la pertinence pour Sophia et la piste de la source : ce matin,
-- un slideshow de rockyjune11 à 333 700 vues était refusé à 58,5 (seuil 63).
--
-- Réglage `scoring.elo_vues_force_import` (0 coupe la règle, modifiable dans
-- Réglages) : au-delà, l'étape 4 de l'import plancher la note au seuil,
-- comme le bouton « Forcer », et mémorise le forçage
-- (`contenus.import_elo_force_seuil`). Code : `_shared/import_contenu.ts`
-- (`motifForceImport`, `plancherRapportElo`), défaut 40 000 aussi dans le
-- code. On l'écrit en base pour qu'il soit visible et réglable.
--
-- Retour arrière : update public.reglages set valeur = valeur || '{"elo_vues_force_import": 0}'::jsonb where cle = 'scoring';

update public.reglages
   set valeur = coalesce(valeur, '{}'::jsonb) || '{"elo_vues_force_import": 40000}'::jsonb
 where cle = 'scoring';
