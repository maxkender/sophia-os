-- 0302 : le cron `minuit-vnext` tourne à minuit Paris, été comme hiver.
--
-- Il était planifié à 22:00 UTC, soit minuit Paris l'été seulement. À l'heure
-- d'hiver (dès le 25/10), 22:00 UTC = 23:00 Paris : `aujourdhuiParis()` y lit
-- encore la veille, et les posts du jour n'étaient créés qu'au rattrapage de
-- 04:00 UTC (05:00 Paris), avec moins de temps de fabrication.
--
-- pg_cron raisonne en UTC : on le planifie à 22:00 ET 23:00 UTC, et la commande
-- n'appelle la fonction que si l'heure de Paris est 0. Une seule des deux
-- passe, quelle que soit la saison, sans retouche au printemps.
--
-- La commande garde son secret : elle est réécrite à partir de celle en place
-- (même procédé que 0163), sans jamais l'écrire ici.
--
-- Retour arrière : `select cron.alter_job(jobid, schedule := '0 22 * * *',
-- command := regexp_replace(command, '\s+where extract\(hour from now\(\) at time zone ''Europe/Paris''\) = 0;$', ';'))
-- from cron.job where jobname = 'minuit-vnext';`

do $$
declare
  j record;
  garde constant text := ' where extract(hour from now() at time zone ''Europe/Paris'') = 0;';
begin
  select jobid, command into j from cron.job where jobname = 'minuit-vnext';
  if j.jobid is null then
    raise notice '0302 : job minuit-vnext absent, rien à faire';
    return;
  end if;
  if position('Europe/Paris' in j.command) > 0 then
    perform cron.alter_job(j.jobid, schedule := '0 22,23 * * *');
    return;
  end if;
  perform cron.alter_job(
    j.jobid,
    schedule := '0 22,23 * * *',
    command := regexp_replace(j.command, ';\s*$', '') || garde
  );
end
$$;
