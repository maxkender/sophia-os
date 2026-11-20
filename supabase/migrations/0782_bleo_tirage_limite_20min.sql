-- 0782 : le tirage BLEO du 19/11 (14 h, Paris) a été coupé à 120 s, la limite
--   de durée par défaut de la base (« canceling statement due to statement
--   timeout »), pendant le choix des contenus candidats. Il s'allonge de
--   quelques secondes par jour (35 s le 7/11, 84 s le 18/11) et la base était à
--   97 % de CPU (0781). Relancé à la main le 20/11 à 9 h 41 (88 s).
--   La tâche planifiée pose désormais sa propre limite de 20 minutes avant
--   d'appeler le tirage. Elle avait été changée à la main le 20/11 ; cette
--   migration l'inscrit dans le dépôt.
--   Vérifié le 20/11 avec une tâche d'essai (retirée) : une limite posée ainsi
--   dans la commande de pg_cron s'applique bien à l'appel qui suit.
-- Reste à faire : comprendre pourquoi le tirage ralentit de jour en jour.
-- ✅ Appliquée le 2026-11-20 (MCP). Idempotente (même nom de tâche).

select cron.schedule(
  'bleo-tirage',
  '0 12,13 * * *',
  $$set statement_timeout = '20min'; select public.bleo_tirage_cron();$$
);
