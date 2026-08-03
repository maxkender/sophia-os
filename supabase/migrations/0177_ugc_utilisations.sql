-- Vidéos AI — utilisations (upload direct admin)

create table if not exists public.ugc_utilisations (
  id uuid primary key default gen_random_uuid(),
  titre text not null default '',
  video_path text not null,
  video_url text not null,
  nom_fichier text null,
  duree_ms integer null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ugc_utilisations_created_idx
  on public.ugc_utilisations (created_at desc);

alter table public.ugc_utilisations enable row level security;

drop policy if exists ugc_utilisations_admin on public.ugc_utilisations;
create policy ugc_utilisations_admin on public.ugc_utilisations
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

grant select, insert, update, delete on public.ugc_utilisations to authenticated;
grant all on public.ugc_utilisations to service_role;
