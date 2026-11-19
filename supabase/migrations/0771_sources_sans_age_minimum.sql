-- 0771 : plus d'âge minimum pour importer un post d'une source (décision
-- d'Adrien du 19/11 : « non, enlève ça »).
--
-- Depuis 0667 (10/11), une mise à jour de source laissait de côté les
-- slideshows publiés depuis moins de `age_min_jours` (7) jours : leurs vues ne
-- sont pas encore faites, la note d'import (70 % de vues) risquait de les
-- refuser, et un post refusé n'est jamais repris. Ils restaient « manquants » et
-- partaient à la mise à jour suivante.
--
-- `reglages.bleo.sources.age_min_jours` passe à 0 : la règle est éteinte, les
-- posts récents s'importent comme les autres (lu à chaque passage par
-- `lireReglagesMaj`, rien à redéployer). Le code de la règle reste, endormi.
--
-- Ce que ça change : un post récent est jugé sur ses vues du jour. Sous 40 000
-- vues et sous le seuil de note, il est refusé pour de bon, même s'il perce
-- ensuite.
--
-- ✅ Appliquée le 2026-11-19 (MCP).
--
-- Retour arrière : remettre `age_min_jours` à 7.

update public.reglages
   set valeur = jsonb_set(valeur, '{sources,age_min_jours}', '0'::jsonb, true), updated_at = now()
 where cle = 'bleo';
