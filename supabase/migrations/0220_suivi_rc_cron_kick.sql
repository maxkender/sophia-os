-- ⚠ NE PAS APPLIQUER sur le projet Sophia OS (mbikecieskoobeizixig).
-- Ce fichier vient de micabo-os : `kick_edge_micabo` n'existe pas ici, et
-- l'appliquer remplacerait le cron `suivi-rc` qui fonctionne par un cron cassé
-- (plus aucun rafraîchissement RevenueCat). Conservé pour l'historique.
--
-- micabo-os : les crons passent par kick_edge_micabo (secret vault),
-- pas par un net.http_post avec x-cron-secret dans la commande.
-- 0219 créait la table ; ce job aligne le rafraîchissement 4 h.

select cron.unschedule(jobid)
from cron.job
where jobname = 'suivi-rc';

select cron.schedule(
  'suivi-rc',
  '0 */4 * * *',
  $job$select public.kick_edge_micabo('suivi-rc', '{"cron":true}'::jsonb)$job$
);
