-- 0381 — v3 point 2 : l'ID Slack de chaque posteur.
--
-- `profiles.slack_user_id` : le compte du posteur dans le workspace
-- sophia-system. Rempli automatiquement par `slack-relier` (users.list :
-- email perso, puis email de connexion, puis nom complet sans accents ni
-- casse, seulement si l'appariement est unique), à l'arrivée d'un membre
-- (événement `team_join` reçu par `slack-faq`), ou à la main depuis la page
-- « Slack à relier » (admin, Head of Ops, et la HM pour ses posteurs).
-- Une valeur déjà posée n'est jamais réécrite par l'automatique.
--
-- Additive : une colonne et deux tables nouvelles, des fonctions nouvelles,
-- une tâche planifiée. La cohorte RUUL (`hub_posteurs`) est exclue.

alter table public.profiles
  add column if not exists slack_user_id text
    check (slack_user_id is null or slack_user_id ~ '^[UW][A-Z0-9]{6,}$'),
  add column if not exists slack_lie_par text
    check (slack_lie_par is null or slack_lie_par in ('email', 'nom', 'team_join', 'manuel')),
  add column if not exists slack_lie_at timestamptz,
  add column if not exists slack_lie_auteur uuid references auth.users (id) on delete set null;

create unique index if not exists profiles_slack_user_id_unique
  on public.profiles (slack_user_id) where slack_user_id is not null;

comment on column public.profiles.slack_user_id is
  'ID Slack du posteur dans sophia-system (0381). Posé par slack-relier, team_join ou la page Slack à relier.';

-- Les membres du workspace, relus par `slack-relier` : la page « Slack à
-- relier » y choisit le compte d'un posteur. Lecture par les fonctions.
create table if not exists public.slack_membres (
  slack_user_id text primary key,
  nom_reel      text,
  nom_affiche   text,
  email         text,
  bot           boolean not null default false,
  supprime      boolean not null default false,
  vu_at         timestamptz not null default now()
);

alter table public.slack_membres enable row level security;

-- Les synchros (combien de liens posés) : la page montre la dernière.
create table if not exists public.slack_synchros (
  id         uuid primary key default gen_random_uuid(),
  at         timestamptz not null default now(),
  source     text not null,
  simulation boolean not null default false,
  resultat   jsonb not null
);

alter table public.slack_synchros enable row level security;

-- ---------------------------------------------------------------------------
-- Les posteurs concernés : rôle poster, hors RUUL.
-- ---------------------------------------------------------------------------
create or replace function public.slack_posteurs()
returns table (
  id             uuid,
  prenom         text,
  nom            text,
  email_perso    text,
  email          text,
  is_active      boolean,
  manager_id     uuid,
  slack_user_id  text
)
language sql
stable
security definer
set search_path = public
as $$
  select pr.id, pr.prenom, pr.nom, pr.email_perso, pr.email, pr.is_active, pr.manager_id, pr.slack_user_id
    from public.profiles pr
   where exists (select 1 from public.user_roles r where r.user_id = pr.id and r.role = 'poster')
     and not exists (select 1 from public.hub_posteurs h where h.profile_id = pr.id);
$$;

revoke execute on function public.slack_posteurs() from public, anon, authenticated;
grant execute on function public.slack_posteurs() to service_role;

-- Les liens trouvés par l'automatique : posés seulement là où rien n'est
-- posé, et jamais sur un compte Slack déjà pris. Rend le nombre posé.
create or replace function public.slack_appliquer_liens(p_liens jsonb)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  l jsonb;
  n integer := 0;
  k integer;
begin
  for l in select * from jsonb_array_elements(coalesce(p_liens, '[]'::jsonb)) loop
    begin
      update public.profiles p
         set slack_user_id = l->>'slack_user_id',
             slack_lie_par = coalesce(l->>'par', 'email'),
             slack_lie_at = now()
       where p.id = (l->>'profile_id')::uuid
         and p.slack_user_id is null
         and not exists (select 1 from public.profiles q where q.slack_user_id = l->>'slack_user_id');
      get diagnostics k = row_count;
      n := n + k;
    exception when unique_violation then
      null;
    end;
  end loop;
  return n;
end;
$$;

revoke execute on function public.slack_appliquer_liens(jsonb) from public, anon, authenticated;
grant execute on function public.slack_appliquer_liens(jsonb) to service_role;

-- ---------------------------------------------------------------------------
-- La page « Slack à relier »
-- ---------------------------------------------------------------------------

-- Les posteurs actifs sans compte Slack : tous pour l'admin et le Head of
-- Ops, les siens pour une HM.
create or replace function public.slack_a_relier()
returns table (
  id          uuid,
  nom         text,
  email_perso text,
  email       text,
  hm_id       uuid,
  hm_prenom   text,
  created_at  timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  tous boolean := public.is_admin();
begin
  if not tous and not public.is_hiring_manager() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return query
  -- Les emails ne sont rendus qu'à l'admin et au Head of Ops (comme 0297).
  select p.id, nullif(btrim(concat_ws(' ', p.prenom, p.nom)), ''),
         case when tous then p.email_perso end, case when tous then p.email end,
         p.manager_id, hm.prenom, pr.created_at
    from public.slack_posteurs() p
    join public.profiles pr on pr.id = p.id
    left join public.profiles hm on hm.id = p.manager_id
   where p.is_active and p.slack_user_id is null
     and (tous or p.manager_id = auth.uid())
   order by hm.prenom nulls last, 2;
end;
$$;

revoke execute on function public.slack_a_relier() from public, anon;
grant execute on function public.slack_a_relier() to authenticated, service_role;

-- Les membres du workspace encore libres (ni bot, ni supprimé, ni déjà relié
-- à un posteur ou à une HM).
create or replace function public.slack_membres_libres()
returns table (slack_user_id text, nom_reel text, nom_affiche text, email text)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin() and not public.is_hiring_manager() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return query
  select m.slack_user_id, m.nom_reel, m.nom_affiche,
         -- L'email n'est montré qu'à l'admin et au Head of Ops.
         case when public.is_admin() then m.email end
    from public.slack_membres m
   where not m.bot and not m.supprime and m.slack_user_id <> 'USLACKBOT'
     and not exists (select 1 from public.profiles p where p.slack_user_id = m.slack_user_id)
     and not exists (select 1 from public.hm_slack h where h.slack_user_id = m.slack_user_id)
   order by coalesce(nullif(m.nom_reel, ''), m.nom_affiche);
end;
$$;

revoke execute on function public.slack_membres_libres() from public, anon;
grant execute on function public.slack_membres_libres() to authenticated, service_role;

-- Relier (ou délier, p_slack null) un posteur à la main.
create or replace function public.slack_relier(p_profile uuid, p_slack text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  manager uuid;
begin
  select p.manager_id into manager from public.slack_posteurs() p where p.id = p_profile;
  if not found then
    raise exception 'posteur introuvable' using errcode = 'P0002';
  end if;
  if not public.is_admin() and not (public.is_hiring_manager() and manager = auth.uid()) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_slack is not null and p_slack !~ '^[UW][A-Z0-9]{6,}$' then
    raise exception 'ID Slack invalide' using errcode = '22023';
  end if;
  if p_slack is not null
     and exists (select 1 from public.profiles q where q.slack_user_id = p_slack and q.id <> p_profile) then
    raise exception 'Ce compte Slack est déjà relié à un autre posteur' using errcode = '23505';
  end if;
  update public.profiles
     set slack_user_id = p_slack,
         slack_lie_par = case when p_slack is null then null else 'manuel' end,
         slack_lie_at = case when p_slack is null then null else now() end,
         slack_lie_auteur = case when p_slack is null then null else auth.uid() end
   where id = p_profile;
end;
$$;

revoke execute on function public.slack_relier(uuid, text) from public, anon;
grant execute on function public.slack_relier(uuid, text) to authenticated, service_role;

-- Le compteur de la page : reliés, à relier, dernière synchro.
create or replace function public.slack_etat()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  tous boolean := public.is_admin();
begin
  if not tous and not public.is_hiring_manager() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'relies', (select count(*) from public.slack_posteurs() p
                where p.is_active and p.slack_user_id is not null and (tous or p.manager_id = auth.uid())),
    'a_relier', (select count(*) from public.slack_posteurs() p
                  where p.is_active and p.slack_user_id is null and (tous or p.manager_id = auth.uid())),
    'derniere_synchro', (select to_jsonb(s) - 'id' from public.slack_synchros s
                          where not s.simulation order by s.at desc limit 1)
  );
end;
$$;

revoke execute on function public.slack_etat() from public, anon;
grant execute on function public.slack_etat() to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Tâche planifiée : une synchro par jour (les arrivées passent aussi par
-- team_join). Même modèle que 0373 : le secret n'est jamais écrit ici.
-- ---------------------------------------------------------------------------
do $sl$
declare
  template text;
  cmd text;
begin
  if exists (select 1 from cron.job where jobname = 'slack-relier') then
    perform cron.unschedule('slack-relier');
  end if;
  select c.command into template
    from cron.job c
   where position('x-cron-secret' in c.command) > 0
     and position('functions/v1/' in c.command) > 0
   order by case when c.jobname = 'comment-masters-synchro' then 0 when c.jobname = 'comment-masters' then 1 else 2 end
   limit 1;
  if template is null then
    raise notice 'slack-relier : aucun cron modèle avec secret, synchro à planifier à la main';
    return;
  end if;
  cmd := regexp_replace(template, 'functions/v1/[a-z0-9-]+', 'functions/v1/slack-relier', 'i');
  if position('body' in cmd) > 0 then
    cmd := regexp_replace(cmd, 'body\s*:=\s*''[^'']*''::jsonb',
                          'body := ''{"action":"synchro_planifiee"}''::jsonb', 'i');
  end if;
  if position('synchro_planifiee' in cmd) = 0 then
    raise notice 'slack-relier : réécriture de la commande échouée';
    return;
  end if;
  -- 4 h 20 UTC : 5 h 20 ou 6 h 20 à Paris, avant les messages du matin.
  perform cron.schedule('slack-relier', '20 4 * * *', cmd);
end
$sl$;

notify pgrst, 'reload schema';
