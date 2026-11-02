-- 0464 — Samedi : la masterlist exhaustive, les contrats sans posteur, le Validate
-- en Test et la relecture des contrats tués.
--
-- 1. samedi_couverture(lundi) : chaque posteur actif (rôle poster) avec ses comptes
--    actifs, et la raison s'il n'est pas dans la masterlist (cohorte RUUL, pas de
--    compte perso actif, pas de compte actif). La page compte « n sur N ».
-- 2. samedi_forces(lundi) : toujours dans la liste, quelle que soit la cohorte, Kill &
--    pay proposé : demande d'arrêt ouverte, recrue reportée 2 fois, « Kill Saturday »
--    du jeudi, « No channel » (ni Slack ni contrat). Jamais la cohorte RUUL ni les
--    profils hors Upwork (pas de contrat, comptes en France).
-- 3. contrats_sans_posteur() : les contrats actifs de VIk Studios sans profil OS, avec
--    leur dernier message, leurs milestones financées et une proposition (contrat HM,
--    à relier, ancien posteur à fermer). Lus par la fonction upwork (lecture seule).
-- 4. samedi_simulation(lundi, kills) : ce que ferait Validate, ligne par ligne, sans
--    rien écrire (Full stop sur Test).
-- 5. arrets_verifs + needs_you « arret_a_verifier » : le lundi 20 h et le mardi 12 h
--    (Paris), chaque contrat tué relu sur Upwork ; pas fermé, ou une milestone encore
--    financée sans raison : une carte Needs you.
--
-- Additive : 1 table, 6 fonctions, 1 fonction modifiée (needs_you), 3 crons
-- (commandes reprises de crons existants, seule l'action change). Aucune donnée
-- existante modifiée.

-- Hors Upwork : pas de contrat Upwork, tous ses comptes en France (les profils de l'équipe).
create or replace function public.hors_upwork(p_poster uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select pr.upwork_contract_id is null
     and exists (select 1 from public.comptes c where c.poster_id = pr.id)
     and not exists (select 1 from public.comptes c where c.poster_id = pr.id and upper(coalesce(c.pays, '')) <> 'FR')
    from public.profiles pr where pr.id = p_poster;
$$;
revoke all on function public.hors_upwork(uuid) from public, anon;
grant execute on function public.hors_upwork(uuid) to authenticated, service_role;

-- 1. La couverture ------------------------------------------------------------------
create or replace function public.samedi_couverture(p_lundi date)
returns table (poster_id uuid, nom text, comptes integer, raison text)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return query
  select pr.id, nullif(btrim(concat_ws(' ', pr.prenom, pr.nom)), ''),
         (select count(*) from public.comptes c where c.poster_id = pr.id and c.is_active)::int,
         case when exists (select 1 from public.hub_posteurs h where h.profile_id = pr.id) then 'ruul'
              when not exists (select 1 from public.comptes c where c.poster_id = pr.id and c.is_active) then 'sans_compte'
              when not exists (select 1 from public.comptes c where c.poster_id = pr.id and c.is_active and c.type_compte = 'perso') then 'pas_perso'
         end
    from public.profiles pr
   where pr.is_active
     and exists (select 1 from public.user_roles ur where ur.user_id = pr.id and ur.role = 'poster');
end;
$$;
revoke all on function public.samedi_couverture(date) from public, anon;
grant execute on function public.samedi_couverture(date) to authenticated;

-- 2. Toujours dans la liste --------------------------------------------------------
create or replace function public.samedi_forces(p_lundi date)
returns table (poster_id uuid, raison text, detail text, depuis timestamptz)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return query
  with f as (
    select d.poster_id, 'demande_arret'::text as raison,
           concat_ws(' · ', d.source, left(d.raison, 300)) as detail, d.demande_at as depuis
      from public.demandes_arret d
     where d.decision is null
    union all
    select e.poster_id, 'reporte_2', format('%s postponements', count(*)), max(e.at)
      from public.recrue_evenements e
     where e.type = 'reporte'
     group by e.poster_id
    having count(*) >= 2
    union all
    select k.poster_id, 'kill_jeudi', k.phrase, k.marque_at
      from public.jeudi_kills k
     where k.lundi = p_lundi and k.annule_at is null
    union all
    select p.id, 'sans_canal', 'No Slack, no Upwork contract', p.created_at
      from public.profiles p
     where p.slack_user_id is null and p.upwork_contract_id is null
       and concat_ws(' ', p.prenom, p.nom) !~* 'test'
       and not public.hors_upwork(p.id)
  )
  select f.poster_id, f.raison, f.detail, f.depuis
    from f
    join public.profiles pr on pr.id = f.poster_id and pr.is_active
   where exists (select 1 from public.user_roles ur where ur.user_id = f.poster_id and ur.role = 'poster')
     and not exists (select 1 from public.hub_posteurs h where h.profile_id = f.poster_id);
end;
$$;
revoke all on function public.samedi_forces(date) from public, anon;
grant execute on function public.samedi_forces(date) to authenticated;

-- 3. Les contrats sans posteur ------------------------------------------------------
create or replace function public.contrats_sans_posteur()
returns table (contrat_id text, organisation_id text, nom text, titre text, type text, debut_at timestamptz,
               dernier_message jsonb, salon_lu_at timestamptz, finances jsonb, jalons_lus_at timestamptz,
               proposition text, raison text)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
begin
  if coalesce(auth.role(), '') <> 'service_role' and not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return query
  with c as (
    select uc.contrat_id, uc.organisation_id, uc.freelancer_nom, uc.titre, uc.type, uc.debut_at
      from public.upwork_contrats uc
     where uc.actif and uc.contrat_id is not null and uc.organisation_nom = 'VIk Studios'
       and not exists (select 1 from public.profiles p where p.upwork_contract_id = uc.contrat_id)
  ),
  x as (
    select c.*,
           s.messages -> 0 as dernier, s.lu_at as salon_lu_at,
           coalesce((select jsonb_agg(jsonb_build_object('nom', m ->> 'nom', 'depot', m -> 'depot', 'etat', m ->> 'etat'))
                       from jsonb_array_elements(case when jsonb_typeof(j.jalons) = 'array' then j.jalons else '[]'::jsonb end) m
                      where m ->> 'etat' in ('Active', 'Submitted', 'Rejected')), '[]'::jsonb) as finances,
           j.lu_at as jalons_lus_at,
           exists (select 1 from public.profiles p join public.user_roles r on r.user_id = p.id
                    where r.role in ('hiring_manager', 'directing_manager', 'head_of_ops', 'admin')
                      and public.noms_proches(p.prenom, p.nom, c.freelancer_nom)) as est_hm,
           (select concat_ws(' ', p.prenom, p.nom) from public.profiles p
             where not p.is_active and public.noms_proches(p.prenom, p.nom, c.freelancer_nom)
               and exists (select 1 from public.user_roles r where r.user_id = p.id and r.role = 'poster')
             limit 1) as ancien,
           (select a.statut from public.accueils a where a.contrat_id = c.contrat_id) as accueil
      from c
      left join public.upwork_salons s on s.contrat_id = c.contrat_id
      left join public.upwork_jalons j on j.contrat_id = c.contrat_id
  )
  select x.contrat_id, x.organisation_id, x.freelancer_nom, x.titre, x.type, x.debut_at,
         x.dernier, x.salon_lu_at, x.finances, x.jalons_lus_at,
         case when x.type = 'Hourly' or x.est_hm or x.titre ~* '(hiring|manager|recruit)' then 'hm'
              when x.ancien is not null then 'ancien'
              when x.debut_at < now() - interval '21 days' and jsonb_array_length(x.finances) = 0 and x.jalons_lus_at is not null then 'ancien'
              else 'relier' end,
         case when x.type = 'Hourly' then 'hourly contract'
              when x.est_hm then 'same name as an HM / admin profile'
              when x.titre ~* '(hiring|manager|recruit)' then 'job title: ' || x.titre
              when x.ancien is not null then 'same name as a stopped poster: ' || x.ancien
              when x.debut_at < now() - interval '21 days' and jsonb_array_length(x.finances) = 0 and x.jalons_lus_at is not null
                then 'started more than 3 weeks ago, nothing funded'
              when x.accueil is not null then 'welcome: ' || x.accueil
              else 'recent contract, no profile yet' end
    from x
   order by x.debut_at desc;
end;
$$;
revoke all on function public.contrats_sans_posteur() from public, anon;
grant execute on function public.contrats_sans_posteur() to authenticated, service_role;

-- 4. Validate en Test : la simulation ---------------------------------------------
-- p_kills : [{poster_id, compte_id (null : recrue sans compte), choix: kill | kill_np}]
create or replace function public.samedi_simulation(p_lundi date, p_kills jsonb)
returns table (poster_id uuid, nom text, choix text, desactivation text, slack text, fermeture text, remboursement text)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_mode text := coalesce((select valeur #>> '{}' from public.reglages where cle = 'arret_auto'), 'off');
  v_test_ok boolean := coalesce((select a.erreur is null and (a.reponse #>> '{bilan,contrat_ferme}') = 'true'
                                   from public.upwork_appels a where a.action = 'test_fermeture_bilan'
                                  order by a.at desc limit 1), false);
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return query
  with k as (
    select (e ->> 'poster_id')::uuid as poster_id, nullif(e ->> 'compte_id', '')::uuid as compte_id, coalesce(e ->> 'choix', 'kill') as choix
      from jsonb_array_elements(coalesce(p_kills, '[]'::jsonb)) e
  ),
  p as (
    select k.poster_id, max(k.choix) filter (where k.choix = 'kill_np') as np,
           array_agg(k.compte_id) filter (where k.compte_id is not null) as comptes
      from k group by k.poster_id
  ),
  d as (
    select p.poster_id, pr.prenom, pr.nom, pr.slack_user_id, pr.upwork_contract_id as contrat, p.np, p.comptes,
           (select string_agg('@' || coalesce(c.handle_tiktok, '?'), ', ') from public.comptes c where c.id = any (coalesce(p.comptes, '{}'))) as tues,
           (select string_agg('@' || coalesce(c.handle_tiktok, '?'), ', ') from public.comptes c
             where c.poster_id = p.poster_id and c.is_active and c.type_compte = 'perso'
               and not (c.id = any (coalesce(p.comptes, '{}')))) as restants,
           exists (select 1 from public.passages pa join public.comptes c on c.id = pa.compte_id
                    where c.poster_id = p.poster_id and (pa.publie_at is not null or pa.publie_url is not null)) as a_poste,
           exists (select 1 from public.profiles o where o.id <> p.poster_id and o.is_active
                    and o.upwork_contract_id = pr.upwork_contract_id) as partage,
           (select string_agg(format('%s (%s $)', m ->> 'nom', m ->> 'depot'), ', ')
              from public.upwork_jalons j,
                   jsonb_array_elements(case when jsonb_typeof(j.jalons) = 'array' then j.jalons else '[]'::jsonb end) m
             where j.contrat_id = pr.upwork_contract_id and m ->> 'etat' in ('Active', 'Submitted', 'Rejected')) as finances
      from p join public.profiles pr on pr.id = p.poster_id
  )
  select d.poster_id, nullif(btrim(concat_ws(' ', d.prenom, d.nom)), ''),
         case when d.np is not null then 'kill_np' else 'kill' end,
         case when d.restants is not null then format('%s deactivated; poster stays active (%s still active)', coalesce(d.tues, 'account'), d.restants)
              else format('%s deactivated; poster deactivated in the OS', coalesce(d.tues, 'no account')) end,
         case when d.restants is not null then 'no change (poster stays active)'
              when d.slack_user_id is not null then 'added to "To remove from Slack" (Logs & to do), right away'
              else 'no Slack account linked' end,
         case when d.restants is not null then 'no closure (another account stays active)'
              when d.contrat is null then 'no Upwork contract linked: nothing to close'
              when d.partage then 'contract shared with another active profile: not closed'
              when v_mode <> 'on' then format('Monday after payroll: contract %s would be closed through the API (Full stop is %s: simulated only)', d.contrat, v_mode)
              when not v_test_ok then format('Monday: contract %s NOT closed — the contract-closing test has not passed yet', d.contrat)
              else format('Monday after payroll: contract %s closed through the API, no message', d.contrat) end,
         case when d.restants is not null or d.contrat is null then '—'
              when d.finances is null then 'nothing funded'
              when d.np is not null then format('Kill & don''t pay: refund to ask in the payroll list (%s)', d.finances)
              when not d.a_poste then format('never posted: refund to ask in the payroll list (%s)', d.finances)
              else format('Kill & pay: this week paid Monday from %s; anything else funded: refund', d.finances) end
    from d
   order by 2;
end;
$$;
revoke all on function public.samedi_simulation(date, jsonb) from public, anon;
grant execute on function public.samedi_simulation(date, jsonb) to authenticated;

-- 5. La relecture des contrats tués ------------------------------------------------
create table if not exists public.arrets_verifs (
  id uuid primary key default gen_random_uuid(),
  arret_id uuid not null references public.arrets(id) on delete cascade,
  poster_id uuid references public.profiles(id) on delete set null,
  contrat_id text,
  passage text not null,
  verifie_at timestamptz not null default now(),
  statut_contrat text,
  ferme boolean,
  finances jsonb not null default '[]'::jsonb,
  probleme text
);
create index if not exists arrets_verifs_arret on public.arrets_verifs (arret_id, verifie_at desc);
alter table public.arrets_verifs enable row level security;
create policy "arrets_verifs lecture" on public.arrets_verifs for select using ((select public.is_admin()));

do $p$
declare
  v_def text := pg_get_functiondef('public.needs_you()'::regprocedure);
  v_ancre text := $a$    union all
    select 'samedi:' || cp.id$a$;
  v_ajout text := $a$    union all
    select 'arret_verif:' || v.arret_id, 'bloque', 'arret_a_verifier', v.poster_id, null,
           format('Contract %s after the Kill: %s', coalesce(v.contrat_id, '?'), v.probleme),
           'Read on Upwork ' || to_char(v.verifie_at at time zone 'Europe/Paris', 'Dy DD/MM HH24:MI')
             || '. Close it, or pay / ask for a refund, then dismiss.',
           null, 'paie', v.verifie_at, array['ouvrir', 'ignorer'], v.arret_id::text,
           case when v.contrat_id is not null then 'https://www.upwork.com/nx/wm/workroom/' || v.contrat_id || '/overview' end, null, 1
      from (select distinct on (x.arret_id) x.* from public.arrets_verifs x order by x.arret_id, x.verifie_at desc) v
      join public.arrets a on a.id = v.arret_id and a.annule_at is null
     where v.probleme is not null and v.verifie_at > now() - interval '8 days'
$a$;
begin
  if position(v_ancre in v_def) = 0 then
    raise exception '0464 : needs_you : l''ancre samedi est introuvable';
  end if;
  if (length(v_def) - length(replace(v_def, v_ancre, ''))) / length(v_ancre) <> 1 then
    raise exception '0464 : needs_you : l''ancre samedi apparaît plusieurs fois';
  end if;
  execute replace(v_def, v_ancre, v_ajout || v_ancre);
end;
$p$;

-- Les crons : la commande de « arrets », seule l'action change.
--   arrets-verifier : lundi 19 h UTC (20 h Paris) et mardi 11 h UTC (12 h Paris).
--   contrats-sans-posteur : chaque jour 5 h 15 UTC (lecture seule).
do $c$
declare
  v_verif text;
  v_sans text;
begin
  select regexp_replace(j.command, '"action"\s*:\s*"arrets"', '"action":"arrets_verifier"'),
         regexp_replace(j.command, '"action"\s*:\s*"arrets"', '"action":"contrats_sans_posteur_lire"')
    into v_verif, v_sans
    from cron.job j where j.jobname = 'arrets';
  if v_verif is null or v_verif !~ '"action":"arrets_verifier"' or v_sans !~ '"action":"contrats_sans_posteur_lire"' then
    raise exception '0464 : commande du cron arrets introuvable';
  end if;
  if not exists (select 1 from cron.job where jobname = 'arrets-verifier-lundi') then
    perform cron.schedule('arrets-verifier-lundi', '0 19 * * 1', v_verif);
  end if;
  if not exists (select 1 from cron.job where jobname = 'arrets-verifier-mardi') then
    perform cron.schedule('arrets-verifier-mardi', '0 11 * * 2', v_verif);
  end if;
  if not exists (select 1 from cron.job where jobname = 'contrats-sans-posteur') then
    perform cron.schedule('contrats-sans-posteur', '15 5 * * *', v_sans);
  end if;
end;
$c$;

notify pgrst, 'reload schema';
