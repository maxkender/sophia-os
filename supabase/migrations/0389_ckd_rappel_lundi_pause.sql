-- 0389 — Prompt 15, point 3 : plus de consignes de financement aux HMs.
--
-- Le cron `ckd-rappel-lundi` (lundi 9 h, « Before funding this week's
-- milestones » dans le fil du samedi de #managers-hq) est mis en pause : les
-- HMs ne financent plus, la paie se fait depuis la liste de paie (0380, 0388).
-- Rien n'est supprimé : la tâche reste, inactive.
-- Retour arrière : select cron.alter_job(jobid, active := true) from cron.job
-- where jobname = 'ckd-rappel-lundi';

do $$
declare
  j bigint;
begin
  select jobid into j from cron.job where jobname = 'ckd-rappel-lundi';
  if j is null then
    raise notice 'ckd-rappel-lundi : pas de cron à mettre en pause';
    return;
  end if;
  perform cron.alter_job(j, active := false);
end
$$;
