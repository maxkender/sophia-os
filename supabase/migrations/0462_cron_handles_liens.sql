-- Le @ lu dans les liens postés, toutes les 30 minutes (ckd, action handles_depuis_liens) : corrigé s'il
-- est proche du @ du compte, sinon signalé. La commande est celle de ckd-warmup-releve, seule l'action change.
do $c$
declare
  v text;
begin
  select regexp_replace(j.command, '"action"\s*:\s*"releve_warmup_planifie"', '"action":"handles_depuis_liens"') into v
    from cron.job j where j.jobname = 'ckd-warmup-releve';
  if v is not null and v ~ '"action":"handles_depuis_liens"' and not exists (select 1 from cron.job where jobname = 'handles-depuis-liens') then
    perform cron.schedule('handles-depuis-liens', '7,37 * * * *', v);
  end if;
end;
$c$;
