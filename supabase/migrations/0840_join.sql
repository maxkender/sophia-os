-- 0840 : l'app « Join » (parcours posteur, 22/11, Max). MODE TEST : rien ne part à de vrais posteurs.
-- Uniquement des ajouts : tables préfixées join_, un réglage join_mode, la fonction qg_join(p_test) pour le QG.
-- RLS activé sans aucune policy : tout passe par la fonction Edge `join` (service_role).
-- Aucun lien avec profiles / auth.users : le parcours ne crée jamais de compte OS ni de fiche posteur.
--
-- join_mode.testeurs_emails est laissé vide ici : l'adresse du testeur est ajoutée à la main par Max
-- (update public.reglages set valeur = jsonb_set(valeur, '{testeurs_emails}', '["<email>"]') where cle = 'join_mode').
-- Hors de cette liste, aucun email réel n'est envoyé (les codes s'affichent à l'écran).

insert into public.reglages (cle, valeur)
values ('join_mode', '{"mode":"test","testeurs_emails":[],"testeurs_whatsapp":["+33664273264"]}'::jsonb)
on conflict (cle) do nothing;

create table if not exists public.join_candidatures (
  id uuid primary key default gen_random_uuid(),
  test boolean not null default true,
  prenom text not null,
  nom text not null,
  email text not null,
  whatsapp_e164 text not null,
  pays text not null,
  age int,
  deux_telephones boolean,
  reponses jsonb not null default '{}'::jsonb,   -- pays_actuel, heures, tiktok, contenu (mêmes clés que l'OS)
  consentement_at timestamptz not null,
  langue text not null default 'en',
  email_verifie_at timestamptz,
  whatsapp_verifie_at timestamptz,
  decision text check (decision in ('auto', 'a_traiter')),
  decision_at timestamptz,
  manques text[] not null default '{}',
  cohorte date,
  handle_tiktok text,
  ruul_visible boolean not null default false,  -- drapeau : l'écran « Set up Ruul » (jamais réel en test)
  cree_at timestamptz not null default now(),
  maj_at timestamptz not null default now()
);
create index if not exists join_candidatures_email_idx on public.join_candidatures (lower(email));

create table if not exists public.join_verifications (
  id uuid primary key default gen_random_uuid(),
  candidature_id uuid not null references public.join_candidatures(id) on delete cascade,
  canal text not null check (canal in ('email', 'whatsapp', 'connexion')),
  code_hash text not null,
  essais int not null default 0,
  expire_at timestamptz not null,
  verifie_at timestamptz,
  cree_at timestamptz not null default now()
);
create index if not exists join_verifications_cand_idx on public.join_verifications (candidature_id, canal, cree_at desc);

create table if not exists public.join_signatures (
  id uuid primary key default gen_random_uuid(),
  candidature_id uuid not null references public.join_candidatures(id) on delete cascade,
  version text not null,
  signe_at timestamptz not null default now(),
  ip text,
  user_agent text,
  texte text not null,
  sha256 text not null
);
create index if not exists join_signatures_cand_idx on public.join_signatures (candidature_id);

create table if not exists public.join_sessions (
  jeton_hash text primary key,
  candidature_id uuid not null references public.join_candidatures(id) on delete cascade,
  cree_at timestamptz not null default now(),
  expire_at timestamptz not null
);

create table if not exists public.join_etapes (
  candidature_id uuid not null references public.join_candidatures(id) on delete cascade,
  etape text not null check (etape in ('tiktok', 'profil', 'warmup', 'slack', 'ruul')),
  statut text not null default 'a_faire',
  valeur jsonb,
  maj_at timestamptz not null default now(),
  unique (candidature_id, etape)
);

create table if not exists public.join_evenements (
  id bigint generated always as identity primary key,
  candidature_id uuid references public.join_candidatures(id) on delete cascade,
  type text not null check (type in ('visite', 'candidature', 'verifiee', 'acceptee', 'a_traiter', 'signee', 'connectee',
                                     'tiktok_ok', 'warmup', 'slack', 'premier_post', 'ruul_ready', 'simule')),
  at timestamptz not null default now(),
  detail jsonb not null default '{}'::jsonb,
  test boolean not null default true
);
create index if not exists join_evenements_type_at_idx on public.join_evenements (type, at);

create table if not exists public.join_relances (
  id bigint generated always as identity primary key,
  candidature_id uuid not null references public.join_candidatures(id) on delete cascade,
  etape text not null,
  canal text not null,
  statut text not null check (statut in ('simule', 'envoye', 'bloque')),
  at timestamptz not null default now()
);

alter table public.join_candidatures enable row level security;
alter table public.join_verifications enable row level security;
alter table public.join_signatures enable row level security;
alter table public.join_sessions enable row level security;
alter table public.join_etapes enable row level security;
alter table public.join_evenements enable row level security;
alter table public.join_relances enable row level security;

-- ---------------------------------------------------------------------------------------------------------------
-- QG : GET /api/qg/control/join[?test=1] → qg_join(p_test). Entonnoir + par jour (Paris). Test exclus par défaut.
-- Visites = nombre d'événements « visite » ; les autres étapes = candidatures distinctes ayant l'événement.
-- ---------------------------------------------------------------------------------------------------------------
create or replace function public.qg_join(p_test boolean default false)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v jsonb;
begin
  with ev as (
    select e.type, e.candidature_id, (e.at at time zone 'Europe/Paris')::date as jour
      from public.join_evenements e
     where (p_test or not e.test) and e.type <> 'simule'
  ),
  etapes(ordre, type) as (values
    (1, 'visite'), (2, 'candidature'), (3, 'verifiee'), (4, 'acceptee'), (5, 'a_traiter'), (6, 'signee'),
    (7, 'connectee'), (8, 'tiktok_ok'), (9, 'warmup'), (10, 'slack'), (11, 'premier_post'), (12, 'ruul_ready')
  ),
  entonnoir as (
    select s.ordre, s.type,
           case when s.type = 'visite' then (select count(*) from ev where ev.type = 'visite')
                else (select count(distinct ev.candidature_id) from ev where ev.type = s.type) end as n
      from etapes s
  ),
  jours as (
    select jour, jsonb_object_agg(type, n) as compte
      from (select jour, type,
                   case when type = 'visite' then count(*) else count(distinct candidature_id) end as n
              from ev group by jour, type) x
     group by jour
  )
  select jsonb_build_object(
    'test_inclus', p_test,
    'entonnoir', (select jsonb_agg(jsonb_build_object('etape', type, 'n', n) order by ordre) from entonnoir),
    'candidatures', jsonb_build_object(
      'total', (select count(*) from public.join_candidatures c where p_test or not c.test),
      'auto', (select count(*) from public.join_candidatures c where (p_test or not c.test) and c.decision = 'auto'),
      'a_traiter', (select count(*) from public.join_candidatures c where (p_test or not c.test) and c.decision = 'a_traiter')
    ),
    'par_jour', coalesce((select jsonb_agg(jsonb_build_object('jour', jour) || compte order by jour) from jours), '[]'::jsonb),
    'genere_at', now()
  ) into v;
  return v;
end;
$$;

revoke execute on function public.qg_join(boolean) from public, anon, authenticated;
grant execute on function public.qg_join(boolean) to service_role;
