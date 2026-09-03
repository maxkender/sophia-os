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
