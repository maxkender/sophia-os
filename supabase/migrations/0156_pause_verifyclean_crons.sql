-- Pause dépenses continues : verifyClean (Gemini) est no-op côté code.
-- Ici on coupe les crons qui tournaient sans action admin.
-- Note : UPDATE direct sur cron.job est refusé (owner supabase_admin).
-- Utiliser cron.alter_job(job_id, active := false).

do $$
declare
  r record;
begin
  for r in
    select jobid, jobname
    from cron.job
    where jobname like 'import-contenu-drain%'
       or jobname in ('composition-nuit', 'maintenance-auto', 'extraction-soir')
  loop
    perform cron.alter_job(r.jobid, active := false);
  end loop;
end $$;
