-- 0518 — Page Problèmes (bloc C, C11) : le résumé Slack à Max, 12 h et 19 h (Paris).
--
-- Cron `problemes-resume` : appelle ckd (action problemes_resume) aux heures
-- UTC qui couvrent 12 h et 19 h à Paris (été comme hiver) ; la fonction
-- vérifie l'heure de Paris et le réglage `problemes_resume_slack` (« off »
-- par défaut, posé par 0517) : rien ne part tant qu'il n'est pas « on ».
-- La commande est copiée de `needs-you-alerte` (même appel, autre action),
-- sans jamais lire ni écrire le secret.
--
-- Additif : un cron.

do $$
declare
  v_base text;
begin
  if exists (select 1 from cron.job where jobname = 'problemes-resume') then
    return;
  end if;
  select command into v_base from cron.job where jobname = 'needs-you-alerte';
  if v_base is null then
    raise exception 'cron needs-you-alerte introuvable';
  end if;
  perform cron.schedule('problemes-resume', '0 10,11,17,18 * * *',
    regexp_replace(v_base, '"action"\s*:\s*"needs_you_alerte"', '"action":"problemes_resume"'));
end $$;
