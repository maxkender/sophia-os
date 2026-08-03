-- Drain upscale auto post-assignation (SeedVR Fal + C2PA en fin).
-- 1 worker / minute en file de secours si l’auto-kick waitUntil s’interrompt.
-- Minuit kick déjà le drain juste après assignation.

do $upscale_drain$
declare
  template text;
  cmd text;
  re_body text := 'body\s*:=\s*''[^'']*''::jsonb';
  body_empty text := 'body := ''{}''::jsonb';
begin
  select c.command into template
  from cron.job c
  where position('x-cron-secret' in c.command) > 0
    and position('functions/v1/' in c.command) > 0
  order by case when c.jobname = 'minuit-vnext' then 0 else 1 end
  limit 1;

  if template is null or position('x-cron-secret' in template) = 0 then
    raise notice 'upscale_assignes: aucun cron template avec secret — schedule manuelle requise';
    return;
  end if;

  begin
    perform cron.unschedule('upscale-assignes-drain');
  exception when others then
    null;
  end;

  cmd := regexp_replace(
    template,
    'functions/v1/[a-z0-9-]+',
    'functions/v1/upscale-assignes',
    'i'
  );
  cmd := regexp_replace(cmd, re_body, body_empty, 'i');

  if position('upscale-assignes' in cmd) = 0 then
    raise notice 'upscale_assignes: remplacement URL échoué';
    return;
  end if;

  perform cron.schedule('upscale-assignes-drain', '* * * * *', cmd);
end
$upscale_drain$;
