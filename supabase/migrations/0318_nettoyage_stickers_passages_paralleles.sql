-- 0318 : nettoyage stickers, 8 passages indépendants par minute.
--
-- POURQUOI. Un passage unique du drain qui analysait tout était coupé au bout
-- de ~25 s (« CPU Time exceeded » : ~2 s de processeur par appel, et préparer
-- une image pour Gemini en coûte ~15 ms) ; un appel par slideshow lancé depuis
-- le drain butait sur la limite d'appels entre fonctions d'une même chaîne
-- (« Rate limit exceeded for trace »). Mesuré le 19/10 : ~14 slideshows / min.
--
-- CE QUI CHANGE. Chaque passage analyse au plus 8 slideshows (< 1 s de
-- processeur) ; le cron en lance 8 en parallèle chaque minute, chacun étant un
-- appel indépendant (corps `{"slot": 1..8}`), seulement quand une tâche tourne.
-- Le retrait et le remplacement des posts du jour restent au passage 1.
-- `cron.alter_job` plutôt que unschedule / schedule : le job garde son id.

do $$
declare
  job bigint;
  cmd text;
begin
  select jobid, command into job, cmd from cron.job where jobname = 'nettoyage-stickers-drain';
  if job is null then
    raise exception 'job nettoyage-stickers-drain introuvable — migration 0317 d''abord';
  end if;
  if cmd like '%generate_series%' then
    return; -- déjà passé
  end if;
  cmd := replace(cmd, 'body := ''{}''::jsonb', 'body := jsonb_build_object(''slot'', g)');
  cmd := replace(cmd, ' where exists (', ' from generate_series(1, 8) g where exists (');
  if cmd not like '%generate_series(1, 8) g where exists%' or cmd not like '%jsonb_build_object(''slot'', g)%' then
    raise exception 'commande du job inattendue — rien changé';
  end if;
  perform cron.alter_job(job, command := cmd);
end;
$$;
