-- 0789 : le tirage de 14 h a 20 minutes au lieu de 2.
--
-- Le 19/11, `bleo_tirage` a été coupé par le statement_timeout de la base
-- (2 min) : il s'allonge avec la flotte (47 s le 8/11, 84 s le 18/11). Tout est
-- annulé d'un bloc, donc aucun run en base et aucun plan pour le 20/11 : la
-- nuit est retombée sur la tierlist, la chaîne du drain a cassé, et 320 comptes
-- sur 480 n'avaient rien au matin. Rattrapé le 20/11 à 9 h 41 (tirage relancé
-- à la main avec cette même limite, 88 s, puis assignation).
--
-- Ici, la tâche pg_cron lève la limite pour elle seule avant d'appeler le
-- tirage. Pansement : la requête qui ralentit reste à accélérer, et un tirage
-- en échec doit alerter.
--
-- Appliquée le 20/11 (cron.alter_job). Retour arrière : remettre la commande
-- 'select public.bleo_tirage_cron()'.

select cron.alter_job(
  (select jobid from cron.job where jobname = 'bleo-tirage'),
  command := $$set statement_timeout = '20min'; select public.bleo_tirage_cron();$$
);
