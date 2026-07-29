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

-- Active les drains (secret repris du cron preparation-nuit existant).
do $$
declare
  secret text;
  base_url text := 'https://mbikecieskoobeizixig.supabase.co/functions/v1/import-contenu';
  i int;
  jobname text;
  cmd text;
begin
  select (regexp_match(command, '''x-cron-secret'',''([^'']+)'''))[1]
    into secret
  from cron.job
  where jobname = 'preparation-nuit'
  limit 1;

  if secret is null then
    raise notice 'import_file: secret cron introuvable — schedule manuelle requise';
    return;
  end if;

  -- Nettoie d'éventuels anciens jobs
  for jobname in
    select j.jobname from cron.job j where j.jobname like 'import-contenu-drain%'
  loop
    perform cron.unschedule(jobname);
  end loop;

  -- 12 workers chaque minute = parallélisation agressive (scrape + pipeline).
  for i in 1..12 loop
    jobname := format('import-contenu-drain-%s', i);
    cmd := format(
      $job$
      select net.http_post(
        url := %L,
        headers := jsonb_build_object(
          'content-type', 'application/json',
          'x-cron-secret', %L
        ),
        body := '{"worker":true}'::jsonb,
        timeout_milliseconds := 140000
      );
      $job$,
      base_url,
      secret
    );
    perform cron.schedule(jobname, '* * * * *', cmd);
  end loop;
end $$;
