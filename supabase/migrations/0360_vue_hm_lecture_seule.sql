-- 0360 : « Voir la vue HM » (Admin → Tests), en lecture seule garantie par la base.
--
-- L'aperçu « Voir comme Head of Ops » ne change que les menus : l'admin garde
-- ses droits et voit tout, alors que les données d'une HM sont filtrées par la
-- RLS sur auth.uid(). Pour voir l'OS exactement comme une HM, l'Edge function
-- `vue-hm` ouvre une VRAIE session de la HM (lien magique, sans mot de passe ni
-- email envoyé) et l'enregistre ici. Cette session est ensuite en lecture
-- seule partout :
--
--   - PostgREST : `garde_vue_hm()` tourne avant chaque requête (db_pre_request)
--     et passe la transaction en lecture seule. Tout INSERT/UPDATE/DELETE, toute
--     RPC qui écrit, tout envoi via pg_net (Slack, email : il écrit dans sa
--     file) échoue en base. Après 1 h ou après « Quitter », TOUTE requête est
--     refusée, lecture comprise.
--
--   - Edge functions : elles vérifient toutes le JWT de l'appelant en lisant
--     `user_roles` via PostgREST avec ce jeton (_shared/supabase.ts,
--     rolesDuJeton — y compris les bundles figés de manage-users et papier-cm).
--     L'onglet de la vue ajoute l'en-tête `x-vue-hm: 1` à ses seules requêtes
--     PostgREST ; une requête de vue SANS cet en-tête est refusée. Une Edge
--     function appelée avec le jeton de la vue ne peut donc pas l'authentifier
--     (401), et n'écrit rien avec son service_role. Les 5 fonctions sans ce
--     contrôle (hub-posteurs, pod-labo, rc-revenu-pays, slack-faq,
--     slack-interactions) n'acceptent aucun JWT : secret partagé, jeton de pod
--     ou signature Slack.
--
--   - Storage : politiques restrictives, aucun dépôt/remplacement/suppression.
--
-- Additive : une table, trois fonctions, quatre politiques, un réglage PostgREST.
-- Retour arrière : `alter role authenticator reset pgrst.db_pre_request;
-- notify pgrst, 'reload config';` puis supprimer les politiques, les fonctions
-- et la table.

create table if not exists public.vues_hm (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid not null references auth.users (id),
  hm_id uuid not null references auth.users (id),
  -- `session_id` du JWT de la session ouverte pour la vue (auth.sessions.id).
  session_id uuid not null unique,
  ouverte_at timestamptz not null default now(),
  expire_at timestamptz not null default now() + interval '1 hour',
  fermee_at timestamptz
);

alter table public.vues_hm enable row level security;

-- Lecture : l'admin. Écriture : service_role seulement (Edge function `vue-hm`).
drop policy if exists vues_hm_admin_lecture on public.vues_hm;
create policy vues_hm_admin_lecture on public.vues_hm
  for select to authenticated using (public.is_admin());

-- `session_id` du JWT de la requête en cours (null sans JWT, sans claim ou
-- claim mal formée). Elle tourne avant CHAQUE requête : elle ne doit jamais
-- lever d'erreur, sinon toute l'API tombe.
create or replace function public.session_jwt()
returns uuid
language sql
stable
as $$
  select case when s ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then s::uuid end
  from (
    select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb ->> 'session_id' as s
  ) c;
$$;

-- La requête en cours vient-elle d'une session de vue HM (ouverte ou non) ?
create or replace function public.est_vue_hm()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.vues_hm v where v.session_id = public.session_jwt());
$$;

grant execute on function public.session_jwt() to anon, authenticated, service_role;
grant execute on function public.est_vue_hm() to anon, authenticated, service_role;

-- Pré-requête PostgREST. Coût : rien sans session_id (anon, service_role,
-- cron) ; sinon une lecture sur un index unique.
create or replace function public.garde_vue_hm()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  sid uuid := public.session_jwt();
  vue record;
begin
  if sid is null then
    return;
  end if;

  select fermee_at, expire_at into vue from public.vues_hm where session_id = sid;
  if not found then
    return;
  end if;

  if vue.fermee_at is not null or vue.expire_at <= now() then
    raise exception 'Vue HM fermée ou expirée'
      using errcode = '42501', hint = 'Rouvre la vue depuis Admin → Tests.';
  end if;

  if coalesce(
    nullif(current_setting('request.headers', true), '')::jsonb ->> 'x-vue-hm',
    ''
  ) <> '1' then
    raise exception 'Vue HM : requête refusée hors de l''onglet de la vue'
      using errcode = '42501';
  end if;

  -- Passer en lecture seule est permis à tout moment de la transaction (seul
  -- le retour en lecture-écriture est interdit après la première requête).
  perform set_config('transaction_read_only', 'on', true);
end;
$$;

grant execute on function public.garde_vue_hm() to anon, authenticated, service_role;

alter role authenticator set pgrst.db_pre_request = 'public.garde_vue_hm';
notify pgrst, 'reload config';

-- Storage : rien ne s'écrit depuis une vue HM, quel que soit le bucket.
drop policy if exists vue_hm_pas_de_depot on storage.objects;
create policy vue_hm_pas_de_depot on storage.objects
  as restrictive for insert to authenticated
  with check (not public.est_vue_hm());

drop policy if exists vue_hm_pas_de_modif on storage.objects;
create policy vue_hm_pas_de_modif on storage.objects
  as restrictive for update to authenticated
  using (not public.est_vue_hm());

drop policy if exists vue_hm_pas_de_suppression on storage.objects;
create policy vue_hm_pas_de_suppression on storage.objects
  as restrictive for delete to authenticated
  using (not public.est_vue_hm());
