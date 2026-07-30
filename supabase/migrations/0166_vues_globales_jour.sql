-- Snapshot quotidien des vues globales (écrit à l'update ELO / rattrapage).
-- vues_delta = vues_totales(jour) − vues_totales(jour précédent).
create table if not exists public.vues_globales_jour (
  jour date primary key,
  vues_totales bigint not null default 0,
  vues_delta bigint,
  nb_comptes integer not null default 0,
  created_at timestamptz not null default now()
);

comment on table public.vues_globales_jour is
  'Total des vues de tous les comptes actifs, figé à chaque update ELO (minuit / rattrapage).';

alter table public.vues_globales_jour enable row level security;

drop policy if exists vues_globales_jour_admin_select on public.vues_globales_jour;
create policy vues_globales_jour_admin_select
  on public.vues_globales_jour
  for select
  to authenticated
  using (public.is_admin());

grant select on public.vues_globales_jour to authenticated;
