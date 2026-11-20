-- 0795 : le recrutement des Comment Masters (0794) tourne toutes les 10 minutes : offres traduites puis visibles en
-- pop-up, offres acceptées installées (mandat, salon Slack, région). Additif.
do $cron$
begin
  if exists (select 1 from cron.job where jobname = 'comment-masters-recrutement') then
    perform cron.unschedule('comment-masters-recrutement');
  end if;
  perform cron.schedule('comment-masters-recrutement', '*/10 * * * *', $c$
    select net.http_post(
      url := 'https://mbikecieskoobeizixig.supabase.co/functions/v1/comment-masters',
      headers := jsonb_build_object('content-type', 'application/json', 'x-cron-secret', public.cron_secret_lire()),
      body := jsonb_build_object('action', 'recrutement'),
      timeout_milliseconds := 280000);
  $c$);
end
$cron$;
