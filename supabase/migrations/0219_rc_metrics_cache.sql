-- Cache des charts RevenueCat (suivi metrics RC).
-- Écrit uniquement par l'Edge Function `suivi-rc` (service_role).
-- Lu par les admins via RLS. Rafraîchi toutes les 4 h par pg_cron.

create table if not exists public.rc_metrics_cache (
  id text primary key default 'sophia',
  project_id text not null,
  fetched_at timestamptz,
  payload jsonb,
  erreur text,
  updated_at timestamptz not null default now()
);

insert into public.rc_metrics_cache (id, project_id)
values ('sophia', 'proj3f496a80')
on conflict (id) do nothing;

alter table public.rc_metrics_cache enable row level security;

drop policy if exists rc_metrics_cache_admin_select on public.rc_metrics_cache;
create policy rc_metrics_cache_admin_select
  on public.rc_metrics_cache
  for select
  to authenticated
  using (public.is_admin());

grant select on public.rc_metrics_cache to authenticated;
grant all on public.rc_metrics_cache to service_role;

-- Cron 4 h : clone un job existant pour récupérer l'URL + le secret
-- sans les écrire dans le dépôt.
do $suivi_rc$
declare
  template text;
  cmd text;
  re_body text := 'body\s*:=\s*''[^'']*''::jsonb';
  body_cron text := 'body := ''{"cron":true}''::jsonb';
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
    raise notice 'suivi-rc: aucun cron template avec secret — schedule manuelle requise';
    return;
  end if;

  begin
    perform cron.unschedule('suivi-rc');
  exception when others then
    null;
  end;

  cmd := regexp_replace(
    template,
    'functions/v1/[a-z0-9-]+',
    'functions/v1/suivi-rc',
    'i'
  );
  cmd := regexp_replace(cmd, re_body, body_cron, 'i');

  if position('suivi-rc' in cmd) = 0 then
    raise notice 'suivi-rc: remplacement URL échoué';
    return;
  end if;

  -- Toutes les 4 heures UTC.
  perform cron.schedule('suivi-rc', '0 */4 * * *', cmd);
end
$suivi_rc$;
