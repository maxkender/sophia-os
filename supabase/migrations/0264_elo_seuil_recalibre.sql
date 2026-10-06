-- Recalibrage du seuil d'import, à appliquer APRÈS 0263 ET APRÈS le
-- redéploiement des fonctions `import-contenu` et `pods`.
--
-- SÉPARÉE DE 0263 À CAUSE DU SÉQUENCEMENT, PAS PAR PROPRETÉ. Le bundle d'une
-- fonction Edge fige `_shared/` au moment du déploiement. Entre l'application
-- de 0263 et le déploiement, la production lit donc encore l'ancienne formule
-- (sans terme source) mais obéirait déjà au nouveau seuil. Baisser le seuil
-- dans cette fenêtre rendrait l'import plus permissif sans la compensation,
-- c'est-à-dire exactement l'inverse de l'intention.
--
-- POURQUOI 54 ET PAS 55. Ajouter un terme à `base` déplace sa distribution :
-- moyenne de 60,1 à 58,0, écart-type de 9,6 à 8,2. À seuil constant on aurait
-- changé le DÉBIT d'imports en même temps que le tri, sans le voir.
-- Mesuré sur les 3811 contenus notés des 60 derniers jours :
--
--   seuil 55 aujourd'hui ......... 67,6 % admis
--   seuil 54 avec le terme ....... 68,1 % admis   <- retenu
--   seuil 54,5 ................... 66,4 %
--   seuil 55 avec le terme ....... 64,5 %
--
-- Le débit est donc conservé, et c'est bien le tri qui change : 462 contenus
-- sortent, 480 entrent.
update public.reglages
   set valeur = valeur || jsonb_build_object('elo_seuil_import', 54)
 where cle = 'scoring';
