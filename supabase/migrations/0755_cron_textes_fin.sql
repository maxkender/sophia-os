-- 0755 : kills, parties 1 et 2 (Max, 18/11) : toutes les 10 minutes, la fonction support écrit les textes au posteur
-- (page « collaboration terminée », bandeau « un de vos comptes… ») dans sa langue et envoie le message de fin une
-- seule fois (arrêts à partir du 19/11). Additif : un cron.
do $p$
begin
  if not exists (select 1 from cron.job where jobname = 'textes-fin-collaboration') then
    perform cron.schedule('textes-fin-collaboration', '3,13,23,33,43,53 * * * *', $c$
      select net.http_post(url := 'https://mbikecieskoobeizixig.supabase.co/functions/v1/support',
        headers := jsonb_build_object('content-type', 'application/json', 'x-cron-secret', public.cron_secret_lire()),
        body := '{"action":"textes_fin"}'::jsonb, timeout_milliseconds := 150000)
    $c$);
  end if;
end
$p$;
