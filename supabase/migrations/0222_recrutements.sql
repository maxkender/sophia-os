-- Recrutements admin Sophia : pipeline HM (phase 0) + créateurs (phase 1)
-- + file de suggestions pour l'autom Cursor. Stats phase 2 = lectures OS.

create table if not exists public.recrutement_hms (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid unique references public.profiles (id) on delete set null,
  upwork_freelancer_id text unique,
  upwork_profile_url text,
  avatar_url text,
  prenom text,
  nom text,
  nom_affiche text not null,
  pays text[] not null default '{}',
  email_os text,
  email_perso text,
  slack_user_id text,
  talks_at timestamptz,
  contrat_envoye_at timestamptz,
  contrat_signe_at timestamptz,
  codes_envoyes_at timestamptz,
  slack_invite_envoyee_at timestamptz,
  email_perso_demandee_at timestamptz,
  rejoint_slack_at timestamptz,
  rejoint_os_at timestamptz,
  ajoute_upwork_at timestamptz,
  job_post_at timestamptz,
  job_post_id text,
  job_post_titre text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint recrutement_hms_nom_chk check (length(btrim(nom_affiche)) > 0)
);

create index if not exists recrutement_hms_pays_idx
  on public.recrutement_hms using gin (pays);

create table if not exists public.recrutement_createurs (
  id uuid primary key default gen_random_uuid(),
  hm_id uuid not null references public.recrutement_hms (id) on delete cascade,
  profile_id uuid references public.profiles (id) on delete set null,
  pays text not null,
  upwork_freelancer_id text,
  upwork_profile_url text,
  avatar_url text,
  prenom text,
  nom text,
  nom_affiche text not null,
  email_os text,
  email_perso text,
  slack_user_id text,
  talks_at timestamptz,
  contrat_envoye_at timestamptz,
  contrat_signe_at timestamptz,
  codes_envoyes_at timestamptz,
  slack_invite_envoyee_at timestamptz,
  rejoint_os_at timestamptz,
  rejoint_slack_at timestamptz,
  warmup_at timestamptz,
  premier_post_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint recrutement_createurs_nom_chk check (length(btrim(nom_affiche)) > 0)
);

create unique index if not exists recrutement_createurs_hm_profile_pays_idx
  on public.recrutement_createurs (hm_id, profile_id, pays)
  where profile_id is not null;

create index if not exists recrutement_createurs_hm_pays_idx
  on public.recrutement_createurs (hm_id, pays);

create table if not exists public.recrutement_suggestions (
  id uuid primary key default gen_random_uuid(),
  hm_id uuid references public.recrutement_hms (id) on delete cascade,
  createur_id uuid references public.recrutement_createurs (id) on delete cascade,
  pays text,
  phase smallint not null check (phase in (0, 1, 2)),
  kind text not null check (kind in ('reponse', 'action', 'relance', 'pression')),
  canal text not null default 'upwork'
    check (canal in ('upwork', 'slack', 'os', 'interne')),
  titre text not null,
  corps text not null,
  prompt_autom jsonb not null default '{}'::jsonb,
  empreinte text not null,
  statut text not null default 'en_attente'
    check (statut in ('en_attente', 'validee', 'ignoree', 'executee', 'a_reproposer')),
  validee_par uuid references public.profiles (id) on delete set null,
  validee_at timestamptz,
  ignoree_at timestamptz,
  executee_at timestamptz,
  execution_log text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists recrutement_suggestions_statut_idx
  on public.recrutement_suggestions (statut, created_at desc);

create index if not exists recrutement_suggestions_hm_idx
  on public.recrutement_suggestions (hm_id, statut);

-- Une empreinte ignorée (ou déjà posée) ne doit pas être recréée par l'autom.
create unique index if not exists recrutement_suggestions_empreinte_uidx
  on public.recrutement_suggestions (empreinte);

create table if not exists public.recrutement_runs (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  resume text,
  details jsonb not null default '{}'::jsonb
);

alter table public.recrutement_hms enable row level security;
alter table public.recrutement_createurs enable row level security;
alter table public.recrutement_suggestions enable row level security;
alter table public.recrutement_runs enable row level security;

drop policy if exists recrutement_hms_admin on public.recrutement_hms;
create policy recrutement_hms_admin on public.recrutement_hms
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists recrutement_createurs_admin on public.recrutement_createurs;
create policy recrutement_createurs_admin on public.recrutement_createurs
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists recrutement_suggestions_admin on public.recrutement_suggestions;
create policy recrutement_suggestions_admin on public.recrutement_suggestions
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists recrutement_runs_admin on public.recrutement_runs;
create policy recrutement_runs_admin on public.recrutement_runs
  for all using (public.is_admin()) with check (public.is_admin());

grant select, insert, update, delete on public.recrutement_hms to authenticated;
grant select, insert, update, delete on public.recrutement_createurs to authenticated;
grant select, insert, update, delete on public.recrutement_suggestions to authenticated;
grant select, insert, update, delete on public.recrutement_runs to authenticated;

-- Seed HM déjà dans l'OS (hors testt, hors DM).
insert into public.recrutement_hms (
  profile_id, prenom, nom, nom_affiche, email_os, pays,
  rejoint_os_at, talks_at, codes_envoyes_at
)
select
  p.id,
  p.prenom,
  p.nom,
  coalesce(
    nullif(btrim(concat_ws(' ', p.prenom, p.nom)), ''),
    p.email,
    p.id::text
  ),
  p.email,
  case
    when p.langues is not null and cardinality(p.langues) > 0 then p.langues
    when p.nationalite is not null then array[p.nationalite]
    else '{}'::text[]
  end,
  p.created_at,
  p.created_at,
  p.created_at
from public.profiles p
join public.user_roles ur on ur.user_id = p.id and ur.role = 'hiring_manager'
where lower(coalesce(p.email, '')) not like 'testt%'
  and lower(coalesce(p.prenom, '')) <> 'testt'
on conflict (profile_id) do nothing;

-- Seed créateurs rattachés : une ligne par (HM, poster, langue du compte).
insert into public.recrutement_createurs (
  hm_id, profile_id, pays, prenom, nom, nom_affiche, email_os,
  avatar_url, rejoint_os_at, talks_at, codes_envoyes_at,
  warmup_at, premier_post_at
)
select distinct on (hm.id, poster.id, coalesce(c.langue, hm.pays[1], 'fr'))
  hm.id,
  poster.id,
  coalesce(c.langue, hm.pays[1], 'fr'),
  poster.prenom,
  poster.nom,
  coalesce(
    nullif(btrim(concat_ws(' ', poster.prenom, poster.nom)), ''),
    poster.email,
    poster.id::text
  ),
  poster.email,
  c.avatar_url,
  poster.created_at,
  poster.created_at,
  poster.created_at,
  c.warmup_started_at,
  (
    select min(po.publie_at)
    from public.posts po
    join public.comptes cx on cx.id = po.compte_id
    where cx.poster_id = poster.id
      and cx.langue = coalesce(c.langue, hm.pays[1], 'fr')
      and po.est_test is not true
      and po.publie_at is not null
  )
from public.recrutement_hms hm
join public.profiles poster on poster.manager_id = hm.profile_id
join public.user_roles ur on ur.user_id = poster.id and ur.role = 'poster'
left join public.comptes c
  on c.poster_id = poster.id and c.is_active
where not exists (
  select 1
  from public.recrutement_createurs x
  where x.hm_id = hm.id
    and x.profile_id = poster.id
    and x.pays = coalesce(c.langue, hm.pays[1], 'fr')
)
order by hm.id, poster.id, coalesce(c.langue, hm.pays[1], 'fr'), c.created_at;
