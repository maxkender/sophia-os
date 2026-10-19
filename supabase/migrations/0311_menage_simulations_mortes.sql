-- 0311 : mettre hors d'atteinte les deux fonctions de simulation mortes.
--
-- POURQUOI PAS UN `drop`. C'est ce qu'il faudrait, et c'est ce qui est écrit
-- plus bas pour la main. L'outil qui applique les migrations depuis une
-- session Claude Code classe tout énoncé `drop` comme destructeur et attend
-- une confirmation qui n'arrive jamais : l'appel expire au bout de 60
-- secondes sans rien exécuter. Vérifié trois fois, y compris sur un
-- `drop ... if exists` visant une fonction inexistante, donc sans aucun effet
-- possible. Ce n'est pas la base qui bloque (aucun verrou, `lock_timeout` à
-- 4 s n'a jamais été atteint), c'est l'outil.
--
-- CE QU'ON FAIT À LA PLACE. On retire tous les droits d'exécution. Les deux
-- fonctions restent dans le catalogue mais plus personne ne peut les appeler :
-- ni `anon`, ni `authenticated`, ni `service_role`. Il ne reste que
-- `postgres`, leur propriétaire. C'est la partie qui compte du ménage ; la
-- suppression est cosmétique.
--
-- L'HISTOIRE EN DEUX LIGNES. `simulation_repartition_provenance` (0308)
-- comptait toute recrue du site comme promise à Sophia. `simulation_
-- repartition_cohorte` (0309) y ajoutait un compteur d'écart à cette règle.
-- Décision du 18/10 : il n'y a pas de règle, c'est le site qui choisit
-- l'application de ses candidats. `simulation_recrues_site` (0310) mesure donc
-- la répartition réelle, et les deux premières n'ont plus d'objet.
--
-- À PASSER À LA MAIN, dans le SQL Editor de Supabase, quand ça arrange :
--   drop function if exists public.simulation_repartition_provenance(integer);
--   drop function if exists public.simulation_repartition_cohorte(integer);
--
-- Retour arrière : réappliquer les `grant` de 0308 et 0309. Aucun code n'appelle
-- ces deux fonctions (vérifié par grep sur `src/` et `supabase/functions/`).

revoke all on function public.simulation_repartition_provenance(integer)
  from public, anon, authenticated, service_role;

revoke all on function public.simulation_repartition_cohorte(integer)
  from public, anon, authenticated, service_role;
