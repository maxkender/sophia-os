-- 0519 — Relevé des vues par post (post_metrics) relancé, à la demande de Max (03/11).
--
-- La tâche `metriques-soir` (17:00 UTC, appel Apify) avait été coupée le 26/10
-- par 0326 (« coupée, pas supprimée (réactivable) ») : elle s'arrêtait après 9
-- à 20 comptes. Elle est réactivée telle quelle ; rien d'autre ne change.
-- Retour arrière : cron.alter_job(<id de metriques-soir>, active := false).

do $c$
declare
  v_id bigint;
begin
  select jobid into v_id from cron.job where jobname = 'metriques-soir';
  if v_id is null then
    raise exception '0519 : cron metriques-soir introuvable';
  end if;
  perform cron.alter_job(v_id, active := true);
end
$c$;
