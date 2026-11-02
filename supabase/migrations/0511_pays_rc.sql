-- 0511 — Page « Pays » (2/11), partie 1 : les données.
--
-- 1. rc_proceeds_pays_semaine : les proceeds RevenueCat (projet Sophia) par
--    pays et par semaine (lundi), avec proceeds_new (nouvelles transactions),
--    le nombre de transactions et la devise (EUR). Remplie par la fonction
--    rc-pays : chaque nuit (5 dernières semaines), historique depuis le 1er août.
--    Le segment « Total » est gardé pour contrôle (pays vide).
-- 2. rc_pays_lectures : le journal de chaque lecture (bilan ou erreur).
-- 3. pays_objectifs : l'objectif de comptes par pays, réglé à la main (vide :
--    la suggestion automatique de la page s'applique).
-- 4. rc_pays_appeler() + cron « rc-pays-nuit » (03:25 UTC) : l'appel de nuit
--    (le secret du cron est lu dans la base, jamais affiché).
--
-- Additif : trois tables, une fonction, un cron. Aucune autre table touchée.

create table if not exists public.rc_proceeds_pays_semaine (
  pays_nom         text not null,
  semaine          date not null,
  pays             text,
  proceeds         numeric not null default 0,
  proceeds_new     numeric,
  transactions     integer not null default 0,
  transactions_new integer,
  devise           text not null default 'EUR',
  incomplet        boolean not null default false,
  lu_at            timestamptz not null default now(),
  primary key (pays_nom, semaine)
);
create index if not exists rc_proceeds_pays_semaine_pays on public.rc_proceeds_pays_semaine (pays, semaine);
alter table public.rc_proceeds_pays_semaine enable row level security;

create table if not exists public.rc_pays_lectures (
  id     bigserial primary key,
  at     timestamptz not null default now(),
  ok     boolean not null,
  detail jsonb
);
alter table public.rc_pays_lectures enable row level security;

create table if not exists public.pays_objectifs (
  pays     text primary key,
  objectif integer check (objectif is null or (objectif >= 0 and objectif <= 500)),
  note     text,
  maj_par  uuid,
  maj_at   timestamptz not null default now()
);
alter table public.pays_objectifs enable row level security;

do $p$
begin
  if not exists (select 1 from pg_policies where tablename = 'rc_proceeds_pays_semaine' and policyname = 'rc_proceeds_pays_semaine_admin') then
    create policy rc_proceeds_pays_semaine_admin on public.rc_proceeds_pays_semaine for select to authenticated using (public.is_admin());
  end if;
  if not exists (select 1 from pg_policies where tablename = 'rc_pays_lectures' and policyname = 'rc_pays_lectures_admin') then
    create policy rc_pays_lectures_admin on public.rc_pays_lectures for select to authenticated using (public.is_admin());
  end if;
  if not exists (select 1 from pg_policies where tablename = 'pays_objectifs' and policyname = 'pays_objectifs_admin') then
    create policy pays_objectifs_admin on public.pays_objectifs for all to authenticated using (public.is_admin()) with check (public.is_admin());
  end if;
end
$p$;

create or replace function public.rc_pays_appeler(p_depuis date default null)
returns bigint
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_id bigint;
begin
  select net.http_post(
           url := 'https://mbikecieskoobeizixig.supabase.co/functions/v1/rc-pays',
           body := case when p_depuis is null then '{}'::jsonb else jsonb_build_object('depuis', p_depuis::text) end,
           headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', public.cron_secret_lire()),
           timeout_milliseconds := 120000)
    into v_id;
  return v_id;
end;
$$;
revoke all on function public.rc_pays_appeler(date) from public, anon, authenticated;

do $c$
begin
  if not exists (select 1 from cron.job where jobname = 'rc-pays-nuit') then
    perform cron.schedule('rc-pays-nuit', '25 3 * * *', 'select public.rc_pays_appeler()');
  end if;
end
$c$;

notify pgrst, 'reload schema';
