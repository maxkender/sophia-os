-- 0521 — Page Problèmes : relire Upwork (milestones des contrats des cartes
-- ouvertes, lecture seule) toutes les 30 min, à :02 et :32, juste avant le
-- recalcul de :07 et :37 (problemes_actualiser, 0520). Commande clonée de
-- upwork-verifier (même appel, autre action), sans jamais lire ni écrire le
-- secret. Additif : un cron.

do $c$
declare
  v_cmd text;
begin
  if exists (select 1 from cron.job where jobname = 'jalons-problemes') then
    return;
  end if;
  select regexp_replace(command, '"action"\s*:\s*"verifier"', '"action":"jalons_problemes"') into v_cmd
    from cron.job where jobname = 'upwork-verifier';
  if v_cmd is null or v_cmd not like '%"action":"jalons_problemes"%' then
    raise exception '0521 : cron upwork-verifier introuvable';
  end if;
  perform cron.schedule('jalons-problemes', '2,32 * * * *', v_cmd);
end
$c$;
