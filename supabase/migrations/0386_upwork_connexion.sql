-- 0386 — Upwork, point 1 : la connexion (prompt 14).
--
-- 1. `upwork_connexion` : une ligne par connexion OAuth2 (celle de Max pour
--    commencer) : qui l'a faite, quand, organisations vues, droits constatés,
--    dernier appel, dernière erreur. Les jetons ne sont jamais dans cette
--    table : ils sont chiffrés dans le coffre de Supabase (vault), lus et
--    écrits seulement par la fonction `upwork` (service_role).
-- 2. `upwork_etats` : le « state » OAuth2 d'une demande de connexion (une
--    seule utilisation, 15 minutes), pour que seul un admin connecté puisse
--    lancer la connexion.
-- 3. `upwork_appels` : le journal de chaque appel à l'API (qui, quoi, contrat,
--    montant, requête, réponse, erreur, date).
-- 4. `upwork_schema` : le schéma GraphQL lu à l'API (introspection), pour
--    vérifier chaque nom de champ avant de l'utiliser.
--
-- Additive : quatre tables, des fonctions nouvelles. Aucune donnée existante
-- touchée, aucune écriture sur Upwork.

create table if not exists public.upwork_connexion (
  id                uuid primary key default gen_random_uuid(),
  compte            text not null unique,
  connecte_par      uuid references auth.users (id) on delete set null,
  connecte_at       timestamptz,
  utilisateur       jsonb,
  organisations     jsonb,
  droits            jsonb,
  access_expire_at  timestamptz,
  refresh_at        timestamptz,
  dernier_appel_at  timestamptz,
  derniere_erreur   text,
  statut            text not null default 'deconnecte'
                    check (statut in ('connecte', 'deconnecte', 'erreur')),
  alerte_at         timestamptz,
  -- Les jetons, dans le coffre : seulement leurs identifiants ici.
  access_secret_id  uuid,
  refresh_secret_id uuid
);

alter table public.upwork_connexion enable row level security;

create table if not exists public.upwork_etats (
  state      text primary key,
  compte     text not null,
  cree_par   uuid references auth.users (id) on delete set null,
  cree_at    timestamptz not null default now(),
  utilise_at timestamptz
);

alter table public.upwork_etats enable row level security;

create table if not exists public.upwork_appels (
  id          bigint generated always as identity primary key,
  at          timestamptz not null default now(),
  par         uuid,
  compte      text,
  action      text not null,
  contrat     text,
  montant     numeric,
  requete     jsonb,
  reponse     jsonb,
  erreur      text,
  statut_http integer,
  duree_ms    integer
);

create index if not exists upwork_appels_at on public.upwork_appels (at desc);

alter table public.upwork_appels enable row level security;

create table if not exists public.upwork_schema (
  id      bigint generated always as identity primary key,
  lu_at   timestamptz not null default now(),
  schema  jsonb not null
);

alter table public.upwork_schema enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'upwork_appels'
                  and policyname = 'upwork_appels_lecture_admin') then
    create policy upwork_appels_lecture_admin on public.upwork_appels for select to authenticated
      using (public.is_admin_strict());
  end if;
end
$$;

comment on table public.upwork_connexion is
  'Upwork (0386) : l''état de chaque connexion OAuth2. Les jetons sont dans vault.secrets (upwork_<compte>_access / _refresh).';
comment on table public.upwork_appels is
  'Upwork (0386) : chaque appel à l''API (qui, quoi, contrat, montant, requête, réponse, erreur, date).';

-- ---------------------------------------------------------------------------
-- Les jetons (coffre), pour la fonction `upwork` seulement
-- ---------------------------------------------------------------------------
create or replace function public.upwork_jetons_ecrire(
  p_compte text, p_access text, p_refresh text, p_access_expire timestamptz, p_par uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  c public.upwork_connexion%rowtype;
  v_access uuid;
  v_refresh uuid;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'upwork_jetons_ecrire : réservé à la fonction upwork';
  end if;
  insert into public.upwork_connexion (compte) values (p_compte) on conflict (compte) do nothing;
  select * into c from public.upwork_connexion where compte = p_compte for update;

  if c.access_secret_id is null then
    v_access := vault.create_secret(p_access, 'upwork_' || p_compte || '_access', 'Upwork access token');
  else
    perform vault.update_secret(c.access_secret_id, p_access);
    v_access := c.access_secret_id;
  end if;
  if p_refresh is not null then
    if c.refresh_secret_id is null then
      v_refresh := vault.create_secret(p_refresh, 'upwork_' || p_compte || '_refresh', 'Upwork refresh token');
    else
      perform vault.update_secret(c.refresh_secret_id, p_refresh);
      v_refresh := c.refresh_secret_id;
    end if;
  else
    v_refresh := c.refresh_secret_id;
  end if;

  update public.upwork_connexion
     set access_secret_id = v_access, refresh_secret_id = v_refresh,
         access_expire_at = p_access_expire, refresh_at = now(),
         statut = 'connecte', derniere_erreur = null, alerte_at = null,
         connecte_par = coalesce(p_par, connecte_par),
         connecte_at = case when p_par is not null then now() else connecte_at end
   where compte = p_compte;
end;
$$;

revoke execute on function public.upwork_jetons_ecrire(text, text, text, timestamptz, uuid) from public, anon, authenticated;
grant execute on function public.upwork_jetons_ecrire(text, text, text, timestamptz, uuid) to service_role;

create or replace function public.upwork_jetons_lire(p_compte text)
returns table (access_token text, refresh_token text, access_expire_at timestamptz)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'upwork_jetons_lire : réservé à la fonction upwork';
  end if;
  return query
  select (select s.decrypted_secret from vault.decrypted_secrets s where s.id = c.access_secret_id),
         (select s.decrypted_secret from vault.decrypted_secrets s where s.id = c.refresh_secret_id),
         c.access_expire_at
    from public.upwork_connexion c
   where c.compte = p_compte;
end;
$$;

revoke execute on function public.upwork_jetons_lire(text) from public, anon, authenticated;
grant execute on function public.upwork_jetons_lire(text) to service_role;

-- ---------------------------------------------------------------------------
-- La page Réglages → Upwork (admin seulement)
-- ---------------------------------------------------------------------------
create or replace function public.upwork_etat()
returns table (
  compte           text,
  statut           text,
  connecte_at      timestamptz,
  connecte_par_nom text,
  utilisateur      jsonb,
  organisations    jsonb,
  droits           jsonb,
  access_expire_at timestamptz,
  refresh_at       timestamptz,
  dernier_appel_at timestamptz,
  derniere_erreur  text,
  appels_24h       integer,
  erreurs_24h      integer
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin_strict() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return query
  select c.compte, c.statut, c.connecte_at, nullif(btrim(concat_ws(' ', p.prenom, p.nom)), ''),
         c.utilisateur, c.organisations, c.droits, c.access_expire_at, c.refresh_at,
         c.dernier_appel_at, c.derniere_erreur,
         (select count(*)::int from public.upwork_appels a where a.compte = c.compte and a.at > now() - interval '24 hours'),
         (select count(*)::int from public.upwork_appels a
           where a.compte = c.compte and a.at > now() - interval '24 hours' and a.erreur is not null)
    from public.upwork_connexion c
    left join public.profiles p on p.id = c.connecte_par
   order by c.compte;
end;
$$;

revoke execute on function public.upwork_etat() from public, anon;
grant execute on function public.upwork_etat() to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Tâche planifiée : vérifier et renouveler la connexion chaque jour (le
-- renouvellement reste valable 2 semaines après le dernier usage).
-- ---------------------------------------------------------------------------
do $up$
declare
  template text;
  cmd text;
begin
  if exists (select 1 from cron.job where jobname = 'upwork-verifier') then
    perform cron.unschedule('upwork-verifier');
  end if;
  select c.command into template
    from cron.job c
   where position('x-cron-secret' in c.command) > 0
     and position('functions/v1/' in c.command) > 0
   order by case when c.jobname = 'slack-relier' then 0 when c.jobname = 'agent-inactifs' then 1 else 2 end
   limit 1;
  if template is null then
    raise notice 'upwork-verifier : aucun cron modèle avec secret, à planifier à la main';
    return;
  end if;
  cmd := regexp_replace(template, 'functions/v1/[a-z0-9-]+', 'functions/v1/upwork', 'i');
  if position('body' in cmd) > 0 then
    cmd := regexp_replace(cmd, 'body\s*:=\s*''[^'']*''::jsonb',
                          'body := ''{"action":"verifier"}''::jsonb', 'i');
  end if;
  if position('"verifier"' in cmd) = 0 then
    raise notice 'upwork-verifier : réécriture de la commande échouée';
    return;
  end if;
  -- 3 h 40 UTC : avant les lectures du matin.
  perform cron.schedule('upwork-verifier', '40 3 * * *', cmd);
end
$up$;

notify pgrst, 'reload schema';
