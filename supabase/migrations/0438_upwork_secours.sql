-- 0438 — Prompt 25 v4 : le compte Upwork de secours (Adrien).
--
-- Une 2e connexion, « secours » (upwork_connexion.compte, déjà prévue en
-- 0386), pour les messages seulement : Max d'abord, jusqu'à 45 personnes
-- différentes par jour ou sa 1re erreur de limite ; puis Adrien, jusqu'à 45.
-- La paie, les milestones et la fin de contrat restent sur le compte de Max.
--
-- - upwork_budget_jour(contrat) : par compte (connecté, conversations du
--   jour, limite atteinte, ce contrat déjà écrit par ce compte) dans
--   « comptes » ; « restant » et « restant_prioritaire » additionnent les
--   comptes qui peuvent encore écrire (la réserve une seule fois) ;
--   « limite_atteinte » : plus aucun compte ne peut écrire aujourd'hui ;
--   « compte_du_jour » : le compte qui a déjà écrit à ce contrat aujourd'hui.
-- - auto_sante() : « upwork » est toujours le compte de Max (avant : la
--   dernière connexion), « upwork_comptes » donne les deux (statut, jeton,
--   compteur du jour / 45, alerte s'il se déconnecte).
--
-- Additive : 2 fonctions remplacées. Aucune donnée modifiée.

create or replace function public.upwork_budget_jour(p_contrat text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_debut timestamptz := ((now() at time zone 'UTC')::date)::timestamp at time zone 'UTC';
  v_max integer := coalesce((select (r.valeur #>> '{}')::int from public.reglages r where r.cle = 'upwork_conversations_jour_max'), 45);
  v_reserve integer := coalesce((select (r.valeur #>> '{}')::int from public.reglages r where r.cle = 'upwork_reserve_prioritaire'), 5);
  v jsonb;
begin
  if not (public.is_admin() or coalesce(auth.jwt() ->> 'role', '') = 'service_role') then
    raise exception 'upwork_budget_jour : réservé à l''admin' using errcode = '42501';
  end if;
  with m as (
    select coalesce(a.compte, 'principal') as compte, a.contrat, a.erreur, a.at
      from public.upwork_appels a
     where a.action = 'message' and a.at >= v_debut
  ),
  c as (
    select x.compte, x.ordre,
           coalesce(u.statut = 'connecte' and u.access_secret_id is not null, false) as connecte,
           coalesce(u.statut, 'deconnecte') as statut,
           (select count(distinct m.contrat) from m where m.compte = x.compte and m.erreur is null)::int as conv,
           exists (select 1 from m where m.compte = x.compte and m.erreur ilike '%maximum number of rooms%') as limite,
           (p_contrat is not null and exists (select 1 from m where m.compte = x.compte and m.erreur is null and m.contrat = p_contrat)) as deja
      from (values ('principal', 1), ('secours', 2)) as x(compte, ordre)
      left join public.upwork_connexion u on u.compte = x.compte
  ),
  libre as (
    select coalesce(sum(greatest(0, v_max - c.conv)) filter (where c.connecte and not c.limite), 0)::int as n from c
  )
  select jsonb_build_object(
    'jour', (now() at time zone 'UTC')::date,
    'conversations', (select coalesce(sum(c.conv), 0)::int from c),
    'max', v_max,
    'reserve', v_reserve,
    'restant', greatest(0, (select n from libre) - v_reserve),
    'restant_prioritaire', (select n from libre),
    'limite_atteinte', not exists (select 1 from c where c.connecte and not c.limite),
    'limite_at', (select min(m.at) from m where m.erreur ilike '%maximum number of rooms%'),
    'deja', exists (select 1 from c where c.deja),
    'compte_du_jour', (select c.compte from c where c.deja order by c.ordre limit 1),
    'dernier_ms', (select floor(extract(epoch from now() - max(m.at)) * 1000)::bigint from m),
    'comptes', (select jsonb_agg(jsonb_build_object('compte', c.compte, 'connecte', c.connecte, 'statut', c.statut,
                                                    'conversations', c.conv, 'limite', c.limite, 'deja', c.deja) order by c.ordre)
                  from c)
  ) into v;
  return v;
end;
$$;
revoke all on function public.upwork_budget_jour(text) from public, anon;
grant execute on function public.upwork_budget_jour(text) to authenticated, service_role;

create or replace function public.auto_sante()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_taches jsonb;
  v_upwork jsonb;
  v_comptes jsonb;
begin
  if not public.is_admin() then
    raise exception 'auto_sante : réservé à l''admin et au Head of Ops' using errcode = '42501';
  end if;
  with m as (select coalesce(max(runid), 0) as r from cron.job_run_details),
  t (tache, job, retard, passage, ordre) as (
    values ('recrues', 'recrues-check', interval '45 minutes', 'etapes', 1),
           ('accueil', 'accueil-auto', interval '45 minutes', 'accueil', 2),
           ('arrets', 'arrets', interval '150 minutes', null, 3),
           ('upwork', 'reponses-upwork', interval '45 minutes', 'reponses', 4),
           ('paie', 'paie-lundi', interval '8 days', null, 5),
           ('tiktok', 'ckd-warmup-releve', interval '13 hours', null, 6),
           ('minuit', 'minuit-vnext', interval '26 hours', null, 7)
  )
  select jsonb_agg(jsonb_build_object(
           'tache', t.tache,
           'job', t.job,
           'existe', j.jobid is not null,
           'actif', coalesce(j.active, false),
           'dernier_at', d.start_time,
           'statut', d.status,
           'message', left(d.return_message, 200),
           'passage_at', pa.dernier_at,
           'en_erreur', d.status = 'failed',
           'en_retard', j.jobid is null or not j.active or d.start_time is null
                        or d.start_time < now() - t.retard) order by t.ordre)
    into v_taches
    from t
    cross join m
    left join cron.job j on j.jobname = t.job
    left join lateral (select x.start_time, x.status, x.return_message
                         from cron.job_run_details x
                        where x.jobid = j.jobid and x.runid > m.r - 80000
                        order by x.runid desc limit 1) d on true
    left join public.passages_auto pa on pa.tache = t.passage;

  -- Prompt 25 v4 : chaque compte (Max, Adrien), son jeton et son compteur du jour.
  select jsonb_agg(jsonb_build_object(
           'compte', x.compte,
           'connecte_une_fois', u.compte is not null,
           'statut', coalesce(u.statut, 'deconnecte'),
           'utilisateur', u.utilisateur ->> 'name',
           'organisations', (select string_agg(o ->> 'title', ' · ') from jsonb_array_elements(coalesce(u.organisations, '[]'::jsonb)) o),
           'access_expire_at', u.access_expire_at,
           'derniere_erreur', u.derniere_erreur,
           'dernier_appel_at', u.dernier_appel_at,
           'renouvellement_at', r.at,
           'renouvellement_erreur', r.erreur,
           'expire_bientot', u.access_expire_at is not null and u.access_expire_at < now() + interval '6 hours',
           'alerte', u.compte is not null and (u.statut = 'erreur'
                     or (u.access_expire_at is not null and u.access_expire_at < now() + interval '6 hours'
                         and (r.erreur is not null or u.access_expire_at < now()))),
           'utilises', b.conv,
           'limite', b.limite) order by x.ordre)
    into v_comptes
    from (values ('principal', 1), ('secours', 2)) as x(compte, ordre)
    left join public.upwork_connexion u on u.compte = x.compte
    left join lateral (select a.at, left(a.erreur, 300) as erreur from public.upwork_appels a
                        where a.action = 'renouvellement' and coalesce(a.compte, 'principal') = x.compte
                          and a.at > now() - interval '7 days'
                        order by a.at desc limit 1) r on true
    left join lateral (select count(distinct a.contrat) filter (where a.erreur is null)::int as conv,
                              coalesce(bool_or(a.erreur ilike '%maximum number of rooms%'), false) as limite
                         from public.upwork_appels a
                        where a.action = 'message' and coalesce(a.compte, 'principal') = x.compte
                          and a.at >= ((now() at time zone 'UTC')::date)::timestamp at time zone 'UTC') b on true;

  select jsonb_build_object(
           'statut', u.statut,
           'access_expire_at', u.access_expire_at,
           'derniere_erreur', u.derniere_erreur,
           'dernier_appel_at', u.dernier_appel_at,
           'renouvellement_at', r.at,
           'renouvellement_erreur', r.erreur,
           'expire_bientot', u.access_expire_at is not null and u.access_expire_at < now() + interval '6 hours',
           'alerte', u.access_expire_at is not null and u.access_expire_at < now() + interval '6 hours'
                     and (r.erreur is not null or u.statut = 'erreur' or u.access_expire_at < now()))
    into v_upwork
    from (select * from public.upwork_connexion where compte = 'principal') u
    left join lateral (select a.at, left(a.erreur, 300) as erreur from public.upwork_appels a
                        where a.action = 'renouvellement' and coalesce(a.compte, 'principal') = 'principal'
                          and a.at > now() - interval '7 days'
                        order by a.at desc limit 1) r on true;

  return jsonb_build_object('taches', coalesce(v_taches, '[]'::jsonb), 'upwork', v_upwork,
                            'upwork_comptes', coalesce(v_comptes, '[]'::jsonb),
                            'upwork_max', coalesce((select (r.valeur #>> '{}')::int from public.reglages r
                                                     where r.cle = 'upwork_conversations_jour_max'), 45));
end;
$$;

notify pgrst, 'reload schema';
