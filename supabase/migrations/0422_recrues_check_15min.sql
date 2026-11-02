-- Prompt 21, ajout : recrues-check passe toutes les 15 minutes (après le
-- déploiement de sa version qui regarde « Step checks », 0421). Les Kills sont
-- vérifiés à chaque passage ; le lundi, le jeudi et le lundi soir restent une
-- fois par heure (le passage de :00). Commande inchangée : aucun secret ici.
do $$
begin
  if not exists (select 1 from cron.job where jobname = 'recrues-check') then
    raise exception 'cron recrues-check introuvable';
  end if;
  perform cron.schedule('recrues-check', '*/15 * * * *', (select command from cron.job where jobname = 'recrues-check'));
end $$;
