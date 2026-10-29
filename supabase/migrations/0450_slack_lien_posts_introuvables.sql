-- 0450 — Prompt 25 MAJ, point 7 a et d : relier Slack de façon sûre, et le lien
-- d'un post introuvable.
--
-- a. Slack
--    - slack_membres.premier_vu_at : quand l'OS a vu le membre la 1re fois
--      (vide pour ceux d'avant : ils ne remontent pas dans Needs you).
--    - slack_liens_jetons : le lien personnel envoyé par DM au team_join
--      (« Welcome! Click here to link your account: {lien} »), interrupteur
--      `slack_lien_dm_auto` (off).
--    - slack_lier_profil() : un seul chemin pour relier (lien du DM, Connect my
--      Slack) ; jamais un Slack déjà pris par un autre profil.
--    - Needs you « slack_non_lie: » : un membre arrivé depuis 24 h, relié à
--      aucun profil (ni posteur, ni HM).
-- d. Posts
--    - passages.lien_message_at : le message « We can't find this post on your
--      profile » est parti (une fois par lien), interrupteur
--      `lien_introuvable_auto` (off).
--    - liens_introuvables_a_prevenir() : par posteur, les liens introuvables
--      (ou pas résolus) 24 h après la publication, pas encore signalés.
-- Les étapes : l'étape 0 (Slack) n'est cochée que si le profil est relié
-- (profiles.slack_user_id), comme avant.

alter table public.slack_membres add column if not exists premier_vu_at timestamptz;
alter table public.slack_membres alter column premier_vu_at set default now();

create table if not exists public.slack_liens_jetons (
  jeton text primary key default (replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')),
  slack_user_id text not null,
  cree_at timestamptz not null default now(),
  dm_at timestamptz,
  dm_erreur text,
  utilise_at timestamptz,
  profile_id uuid
);
create index if not exists slack_liens_jetons_membre on public.slack_liens_jetons (slack_user_id);
alter table public.slack_liens_jetons enable row level security;
comment on table public.slack_liens_jetons is
  '0450 : le lien personnel envoyé par le bot à un nouveau membre Slack pour relier son compte.';

-- Le lien personnel d'un membre (le même tant qu'il n'a pas servi, 30 jours).
create or replace function public.slack_jeton_creer(p_slack text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v text;
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception 'slack_jeton_creer : réservé au service';
  end if;
  select j.jeton into v from public.slack_liens_jetons j
   where j.slack_user_id = p_slack and j.utilise_at is null and j.cree_at > now() - interval '30 days'
   order by j.cree_at desc limit 1;
  if v is null then
    insert into public.slack_liens_jetons (slack_user_id) values (p_slack) returning jeton into v;
  end if;
  return v;
end;
$$;
revoke all on function public.slack_jeton_creer(text) from public, anon, authenticated;
grant execute on function public.slack_jeton_creer(text) to service_role;

-- Relier un profil à un membre Slack : 'lie', 'deja', 'pris' (un autre profil l'a),
-- 'autre' (ce profil est déjà relié à un autre membre, par son email ou à la main).
create or replace function public.slack_lier_profil(p_profile uuid, p_slack text, p_par text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actuel text;
  v_par text;
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' and auth.uid() is distinct from p_profile then
    raise exception 'slack_lier_profil : réservé au service';
  end if;
  if coalesce(btrim(p_slack), '') = '' then raise exception 'slack_lier_profil : membre attendu'; end if;
  select slack_user_id, slack_lie_par into v_actuel, v_par from public.profiles where id = p_profile;
  if not found then raise exception 'slack_lier_profil : profil introuvable'; end if;
  if v_actuel = p_slack then return 'deja'; end if;
  if exists (select 1 from public.profiles q where q.slack_user_id = p_slack and q.id <> p_profile) then return 'pris'; end if;
  -- Un lien sûr (email, à la main) ne se remplace pas ; un lien deviné au nom, oui :
  -- la personne vient de prouver qui elle est sur Slack.
  if v_actuel is not null and coalesce(v_par, '') not in ('nom', 'team_join') then return 'autre'; end if;
  update public.profiles set slack_user_id = p_slack, slack_lie_par = 'manuel', slack_lie_at = now() where id = p_profile;
  return 'lie';
end;
$$;
revoke all on function public.slack_lier_profil(uuid, text, text) from public, anon, authenticated;
grant execute on function public.slack_lier_profil(uuid, text, text) to service_role;

-- Le posteur clique le lien du DM (connecté à son dashboard).
create or replace function public.slack_lier_jeton(p_jeton text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  j public.slack_liens_jetons%rowtype;
  v_r text;
begin
  if auth.uid() is null then return jsonb_build_object('ok', false, 'error', 'connexion'); end if;
  select * into j from public.slack_liens_jetons where jeton = p_jeton;
  if j.jeton is null then return jsonb_build_object('ok', false, 'error', 'jeton_invalide'); end if;
  if j.utilise_at is not null and j.profile_id is distinct from auth.uid() then
    return jsonb_build_object('ok', false, 'error', 'jeton_utilise');
  end if;
  if j.cree_at < now() - interval '30 days' then return jsonb_build_object('ok', false, 'error', 'jeton_expire'); end if;
  v_r := public.slack_lier_profil(auth.uid(), j.slack_user_id, 'lien');
  if v_r in ('lie', 'deja') then
    update public.slack_liens_jetons set utilise_at = coalesce(utilise_at, now()), profile_id = auth.uid() where jeton = p_jeton;
    return jsonb_build_object('ok', true, 'statut', v_r);
  end if;
  return jsonb_build_object('ok', false, 'error', v_r);
end;
$$;
revoke all on function public.slack_lier_jeton(text) from public, anon;
grant execute on function public.slack_lier_jeton(text) to authenticated;

-- Le dashboard : le posteur est-il relié à Slack ?
create or replace function public.mon_slack()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object('relie', p.slack_user_id is not null)
    from public.profiles p where p.id = auth.uid();
$$;
revoke all on function public.mon_slack() from public, anon;
grant execute on function public.mon_slack() to authenticated;

-- Les liens de posts.
alter table public.passages add column if not exists lien_message_at timestamptz;

create or replace function public.liens_introuvables_a_prevenir()
returns table (poster_id uuid, prenom text, fuseau text, passages uuid[], liens text[], depuis timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select c.poster_id, pr.prenom,
         public.fuseau_pays((select a.pays from public.accueils a where a.poster_id = c.poster_id limit 1)),
         array_agg(pa.id order by pa.date_publication_prevue, pa.id),
         array_agg(pa.publie_url order by pa.date_publication_prevue, pa.id),
         min(coalesce(pa.publie_at, pa.created_at))
    from public.passages pa
    join public.comptes c on c.id = pa.compte_id
    join public.profiles pr on pr.id = c.poster_id and pr.is_active
   where (public.is_admin() or coalesce(auth.jwt() ->> 'role', '') = 'service_role')
     and pa.publie_url is not null and pa.lien_confirme_at is null and pa.lien_message_at is null
     and pa.date_publication_prevue >= (now() at time zone 'Europe/Paris')::date - 7
     and pa.resolution_statut in ('introuvable', 'a_resoudre')
     and coalesce(pa.publie_at, pa.created_at) < now() - interval '24 hours'
     and not exists (select 1 from public.hub_posteurs h where h.profile_id = c.poster_id)
   group by c.poster_id, pr.prenom;
$$;
revoke all on function public.liens_introuvables_a_prevenir() from public, anon;
grant execute on function public.liens_introuvables_a_prevenir() to authenticated, service_role;

insert into public.reglages (cle, valeur) values
  ('slack_lien_dm_auto', to_jsonb('off'::text)),
  ('slack_lien_dm_texte', to_jsonb('Welcome! Click here to link your account: {lien}'::text)),
  ('lien_introuvable_auto', to_jsonb('off'::text)),
  ('lien_introuvable_texte', to_jsonb('Hi {prenom}, we can''t find this post on your profile: {lien}. Is it public and still online?'::text))
on conflict (cle) do nothing;

-- Needs you : un membre Slack arrivé depuis 24 h, relié à aucun profil.
do $ny$
declare
  v_def text := pg_get_functiondef('public.needs_you()'::regprocedure);
  v_avant text := $q$    union all
    select 'samedi:' || cp.id$q$;
  v_apres text := $q$    union all
    select 'slack_non_lie:' || m.slack_user_id, 'a_la_main', 'slack_non_lie', null::uuid,
           coalesce(nullif(m.nom_reel, ''), nullif(m.nom_affiche, ''), m.slack_user_id),
           concat_ws(' · ', coalesce(nullif(m.nom_reel, ''), m.nom_affiche), m.email, m.slack_user_id),
           'Membre Slack arrivé le ' || to_char(m.premier_vu_at at time zone 'Europe/Paris', 'DD/MM HH24:MI')
             || ', relié à aucun profil depuis 24 h'
             || coalesce(' (lien envoyé en DM le ' || to_char(j.dm_at at time zone 'Europe/Paris', 'DD/MM HH24:MI') || ')', ''),
           null, 'rien', m.premier_vu_at,
           array['ouvrir', 'ignorer'], m.slack_user_id, '/admin/slack', null, 1
      from public.slack_membres m
      left join lateral (select max(x.dm_at) as dm_at from public.slack_liens_jetons x where x.slack_user_id = m.slack_user_id) j on true
     where m.premier_vu_at < now() - interval '24 hours'
       and not coalesce(m.bot, false) and not coalesce(m.supprime, false)
       and not exists (select 1 from public.profiles p where p.slack_user_id = m.slack_user_id)
       and not exists (select 1 from public.hm_slack h where h.slack_user_id = m.slack_user_id)
    union all
    select 'samedi:' || cp.id$q$;
begin
  if position(v_avant in v_def) = 0 then raise exception '0450 : bloc « samedi » introuvable dans needs_you()'; end if;
  execute replace(v_def, v_avant, v_apres);
end;
$ny$;

notify pgrst, 'reload schema';
