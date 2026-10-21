-- 0304 : les posters de la cohorte Ruul entrent seuls dans leur salon Slack.
--
-- Le lien d'invitation des emails fait entrer dans le workspace Slack, pas
-- dans le salon privé de la cohorte (#ruul-questions). La fonction
-- `hub-slack-cohorte`, toutes les 15 minutes, retrouve chaque poster par son
-- email perso et l'y invite (bot Slack, secret `SLACK_BOT_TOKEN2`). Elle note
-- ici quand c'est fait, pour ne plus le chercher ensuite.
--
-- Additive : deux colonnes nullables et un cron.
-- Retour arrière : `select cron.unschedule('hub-slack-cohorte');
-- alter table public.hub_posteurs drop column slack_ajoute_le,
-- drop column slack_user_id;`

alter table public.hub_posteurs
  add column if not exists slack_ajoute_le timestamptz,
  add column if not exists slack_user_id text;

-- ⚠️ Comme 0284 : <CRON_SECRET> est remplacé par le vrai secret au moment de
-- l'appliquer, jamais écrit dans le dépôt.
select cron.schedule('hub-slack-cohorte', '*/15 * * * *', $$
  select net.http_post(
    url := 'https://mbikecieskoobeizixig.supabase.co/functions/v1/hub-slack-cohorte',
    headers := jsonb_build_object('content-type','application/json','x-cron-secret','<CRON_SECRET>'),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
$$);
