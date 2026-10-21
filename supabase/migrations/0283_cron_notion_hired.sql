-- 0283 : le cron qui met à jour la colonne Hired de Notion, à minuit Paris.
--
-- À APPLIQUER APRÈS le déploiement de l'edge function `notion-hired`, c'est-à-
-- dire après la fusion sur main (le workflow deploy-edge-functions.yml se
-- déclenche sur les pushes touchant supabase/functions/**). Appliquée avant,
-- le cron appellerait une fonction inexistante et logguerait un 404 par nuit.
-- Les migrations ne sont pas jouées par la CI : celle-ci se pose à la main.
--
-- POURQUOI DEUX HEURES DANS LE SCHEDULE. pg_cron 1.6.4 n'a pas de fuseau par
-- job : `cron.schedule(nom, schedule, commande)`, et rien d'autre. Le seul
-- réglage est le GUC `cron.timezone`, qui vaut 'GMT' et qui est GLOBAL au
-- cluster — le changer décalerait les 37 jobs du projet d'un coup.
--
-- « Minuit à Paris » vaut donc 22:00 UTC l'été et 23:00 UTC l'hiver. Deux
-- schedules figés obligeraient à les permuter à la main deux fois par an. Le
-- dépôt porte déjà cette dette et ne l'a jamais payée : `minuit-vnext` tourne
-- à '0 22 * * *' et basculera mécaniquement à 23 h Paris au changement d'heure
-- du dimanche 25 octobre 2026. On n'en ajoute pas une seconde.
--
-- Le job tire donc à 22:05 ET 23:05 UTC, et la fonction vérifie elle-même
-- qu'il est bien minuit à Paris (Intl, fuseau Europe/Paris) : l'autre passage
-- sort immédiatement en no-op. Un seul travail par nuit, à la bonne heure,
-- été comme hiver, sans intervention. Piège à connaître pour cette année : la
-- bascule a lieu à 3 h du matin le 25/10, donc le minuit DU 25 est encore en
-- heure d'été (2026-10-24T22:00Z) et le premier minuit d'hiver est celui du 26
-- (2026-10-25T23:00Z). Le double tir rend la question sans objet.
--
-- Minute 5 et non 0 : la plupart des jobs du projet partent à la minute 0 et
-- s'y bousculent, `minuit-vnext` le premier. Cinq minutes d'écart suffisent et
-- restent dans la même heure de Paris.
--
-- Le secret n'est écrit NULLE PART dans le dépôt : on clone la commande d'un
-- job existant pour en récupérer l'URL et l'en-tête x-cron-secret, puis on
-- réécrit la cible. Même motif que 0219 (suivi-rc) et 0242.
--
-- Retour arrière : `select cron.unschedule('notion-hired');`

do $notion_hired$
declare
  template text;
  cmd text;
  re_body text := 'body\s*:=\s*''[^'']*''::jsonb';
  body_cron text := 'body := ''{}''::jsonb';
begin
  select c.command into template
  from cron.job c
  where position('x-cron-secret' in c.command) > 0
    and position('functions/v1/' in c.command) > 0
  order by case
    when c.jobname = 'minuit-vnext' then 0
    when c.jobname = 'metriques-soir' then 1
    else 2
  end
  limit 1;

  if template is null or position('x-cron-secret' in template) = 0 then
    raise notice 'notion-hired: aucun cron template avec secret — schedule manuelle requise';
    return;
  end if;

  begin
    perform cron.unschedule('notion-hired');
  exception when others then
    null;
  end;

  cmd := regexp_replace(
    template,
    'functions/v1/[a-z0-9-]+',
    'functions/v1/notion-hired',
    'i'
  );
  cmd := regexp_replace(cmd, re_body, body_cron, 'i');

  if position('notion-hired' in cmd) = 0 then
    raise notice 'notion-hired: remplacement URL échoué';
    return;
  end if;

  -- 22:05 et 23:05 UTC : l'un des deux est minuit à Paris, l'autre est un
  -- no-op décidé dans la fonction.
  perform cron.schedule('notion-hired', '5 22,23 * * *', cmd);
end
$notion_hired$;
