-- File d'import serveur : survit à la navigation / fermeture du site.
-- Les URLs sont enqueued par le client ; des workers cron (et la chaîne Edge)
-- scrapent puis drainent le pipeline contenus.import_*.

create table if not exists public.import_file (
  id uuid primary key default gen_random_uuid(),
  post_url text not null,
  compte_reference_id uuid references public.comptes_reference (id) on delete set null,
  label_ids uuid[] not null default '{}',
  batch_id uuid,
  statut text not null default 'pending'
    check (statut in ('pending', 'running', 'done', 'failed', 'skipped')),
  contenu_id uuid references public.contenus (id) on delete set null,
  erreur text,
  lease_until timestamptz,
  tentatives integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists import_file_statut_created_idx
  on public.import_file (statut, created_at)
  where statut in ('pending', 'running', 'failed');

create index if not exists import_file_batch_idx
  on public.import_file (batch_id, statut);

create unique index if not exists import_file_pending_url_uidx
  on public.import_file (post_url)
  where statut in ('pending', 'running');

alter table public.contenus
  add column if not exists import_lease_until timestamptz;

create index if not exists contenus_import_queue_idx
  on public.contenus (import_statut, created_at)
  where import_statut in ('pending', 'running', 'failed');

alter table public.import_file enable row level security;

drop policy if exists import_file_admin on public.import_file;
create policy import_file_admin on public.import_file
  for all using (public.is_admin()) with check (public.is_admin());

grant select, insert, update, delete on public.import_file to authenticated;
grant all on public.import_file to service_role;

-- Active les drains : clone le command de preparation-nuit (évite d’injecter
-- le secret en clair dans le SQL — WAF Cloudflare bloque souvent ça).
do $$
declare
  template text;
  cmd text;
  i int;
  jobname text;
begin
  select c.command into template
  from cron.job c
  where c.jobname = 'preparation-nuit'
  limit 1;

  if template is null or position('x-cron-secret' in template) = 0 then
    raise notice 'import_file: cron template preparation-nuit introuvable — schedule manuelle requise';
    return;
  end if;

  for jobname in
    select j.jobname from cron.job j where j.jobname like 'import-contenu-drain%'
  loop
    begin
      perform cron.unschedule(jobname);
    exception when others then
      null;
    end;
  end loop;

  -- 12 workers / minute = parallélisation agressive (scrape + pipeline).
  for i in 1..12 loop
    jobname := format('import-contenu-drain-%s', i);
    cmd := replace(template, 'preparation-nuit', 'import-contenu');
    cmd := regexp_replace(
      cmd,
      $$body\s*:=\s*'[^']*'::jsonb$$,
      $$body := '{"worker":true}'::jsonb$$,
      'i'
    );
    if position('import-contenu' in cmd) = 0 then
      raise notice 'import_file: remplacement URL échoué pour %', jobname;
      continue;
    end if;
    perform cron.schedule(jobname, '* * * * *', cmd);
  end loop;
end $$;
