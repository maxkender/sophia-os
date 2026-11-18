-- 0744 : suivi des demandes du support (Max, 17/11, point 8) — toutes les heures (minute 23) :
-- sans retour du posteur 48 h après une réponse qui règle le problème, la demande passe « résolu » (verdict rempli) ;
-- un arrêt demandé est confirmé au posteur seulement une fois fait dans l'OS. Additif : un cron.
do $c$
begin
  if not exists (select 1 from cron.job where jobname = 'support-suivi') then
    perform cron.schedule('support-suivi', '23 * * * *', $j$
      select net.http_post(url := 'https://mbikecieskoobeizixig.supabase.co/functions/v1/support',
        headers := jsonb_build_object('content-type', 'application/json', 'x-cron-secret', public.cron_secret_lire()),
        body := '{"action":"suivi"}'::jsonb, timeout_milliseconds := 60000)
    $j$);
  end if;
end
$c$;
