-- 0516 — Zones des HMs, objectifs de la cohorte, contrôle des offres (bloc B, 02/11).
--
-- B1. hm_pays (pays → HM, zone) : la HM qui recrute les NOUVELLES recrues de
--     chaque pays (les posteurs actuels gardent leur HM). Erla Menaj n'a pas de
--     compte OS : son nom seul (hm_id vide). profiles.zone_recrutement de Rana
--     (+ New Zealand) et de Kris (Romania + Kazakhstan) suit la répartition.
-- B2. pays_objectifs.recrues_lundi / recrues_nombre : combien de recrues par
--     pays pour la cohorte de ce lundi (9/11 : 50 au total, envoyé aux HMs par
--     Slack). Un pays sans ligne pour ce lundi : 0.
-- B3. recrutement_cohorte(lundi) : objectifs, HM par pays, recrues acceptées
--     (accueils de la cohorte, VIk Studios) et offres en attente (VIk), pour la
--     page Recrutement. Une offre acceptée après samedi minuit (Paris) compte
--     pour la cohorte suivante (cohorte_lundi_de, déjà la règle de l'accueil).
-- B4. offres_alertes + offres_controler(lundi) : une alerte « Problème » par
--     contrat et par motif quand une offre d'une HM n'est pas sur VIk Studios,
--     n'a pas 4 milestones « Week NN » au tarif de la zone, a un 1er milestone
--     au mauvais nom ou à la mauvaise échéance (Week 46 / 15/11 pour la cohorte
--     du 9/11), ou plus d'un milestone financé. Une alerte se ferme seule quand
--     le contrat est corrigé. Les milestones sont relus chaque jour (07:40 UTC,
--     cron cloné de upwork-verifier, lecture seule) ; le contrôle tourne à 08:10.
--
-- Additif : deux tables, deux colonnes, trois fonctions, deux crons. Seules
-- données existantes changées : la zone de recrutement de Rana et de Kris.

create table if not exists public.hm_pays (
  pays     text primary key check (pays ~ '^[A-Z]{2}$'),
  hm_id    uuid references public.profiles(id) on delete set null,
  hm_nom   text not null,
  zone     text not null check (zone in ('A', 'B', 'C')),
  depuis   date not null default current_date,
  maj_at   timestamptz not null default now()
);
alter table public.hm_pays enable row level security;
do $p$
begin
  if not exists (select 1 from pg_policies where tablename = 'hm_pays' and policyname = 'hm_pays_admin') then
    create policy hm_pays_admin on public.hm_pays for select to authenticated using (public.is_admin());
  end if;
end
$p$;

insert into public.hm_pays (pays, hm_id, hm_nom, zone, depuis)
select v.pays, p.id, v.hm_nom, v.zone, '2026-11-02'
  from (values
    ('US', 'Rana Barakli', 'A'), ('GB', 'Rana Barakli', 'A'), ('NL', 'Rana Barakli', 'A'), ('NZ', 'Rana Barakli', 'A'),
    ('DE', 'Regina N', 'A'), ('NO', 'Regina N', 'A'), ('SE', 'Regina N', 'A'), ('FI', 'Regina N', 'A'), ('DK', 'Regina N', 'A'),
    ('FR', 'Sara B', 'A'), ('BE', 'Sara B', 'A'), ('JP', 'Sara B', 'A'),
    ('IL', 'Amanda C', 'A'),
    ('CZ', 'Olizhia Mairuhu', 'B'), ('SK', 'Olizhia Mairuhu', 'B'), ('EE', 'Olizhia Mairuhu', 'B'), ('LT', 'Olizhia Mairuhu', 'B'), ('LV', 'Olizhia Mairuhu', 'B'),
    ('GR', 'Margherita Pilia', 'B'), ('IT', 'Margherita Pilia', 'B'), ('HR', 'Margherita Pilia', 'B'), ('SI', 'Margherita Pilia', 'B'), ('ES', 'Margherita Pilia', 'B'),
    ('HU', 'Nana Baghirova', 'B'), ('PL', 'Nana Baghirova', 'B'), ('AE', 'Nana Baghirova', 'B'),
    ('RO', 'kris a', 'C'), ('KZ', 'kris a', 'C'),
    ('RS', 'Erla Menaj', 'C'), ('BG', 'Erla Menaj', 'C'), ('TR', 'Erla Menaj', 'C')
  ) as v(pays, hm_nom, zone)
  left join lateral (
    select pr.id from public.profiles pr
     where pr.is_active and pr.zone_recrutement is not null
       and lower(btrim(concat_ws(' ', pr.prenom, pr.nom))) = lower(v.hm_nom)
     limit 1
  ) p on true
on conflict (pays) do nothing;

update public.profiles set zone_recrutement = 'US + UK + Netherlands + New Zealand'
 where id = '9b05fd3b-1124-4c09-ad39-d96fcc9e63ba' and zone_recrutement = 'US + UK + Netherlands';
update public.profiles set zone_recrutement = 'Romania + Kazakhstan'
 where id = 'bcde6389-cfdb-4c23-a37e-d7f4f7b71343' and zone_recrutement = 'Romania + Kazakhstan + Bulgaria + Turkey + Serbia';

alter table public.pays_objectifs add column if not exists recrues_lundi date;
alter table public.pays_objectifs add column if not exists recrues_nombre integer check (recrues_nombre is null or recrues_nombre >= 0);

insert into public.pays_objectifs (pays, objectif, note, maj_at, recrues_lundi, recrues_nombre)
select v.pays, null, null, now(), '2026-11-09', v.n
  from (values ('DE', 5), ('DK', 4), ('US', 7), ('NL', 5), ('NZ', 2), ('FR', 4), ('BE', 2), ('JP', 3), ('IT', 3), ('CZ', 4),
               ('SK', 3), ('LV', 2), ('LT', 2), ('EE', 2), ('RO', 2), ('RS', 2)) as v(pays, n)
on conflict (pays) do update set recrues_lundi = excluded.recrues_lundi, recrues_nombre = excluded.recrues_nombre, maj_at = now();

-- B4 : les alertes d'offres (lues aussi par la page Problèmes).
create table if not exists public.offres_alertes (
  id            bigint generated always as identity primary key,
  cle           text not null unique,
  contrat_id    text,
  offre_id      text,
  poster_id     uuid,
  hm_id         uuid,
  hm_nom        text,
  pays          text,
  cohorte_lundi date,
  motif         text not null check (motif in ('hors_vik', 'nb_milestones', 'montant', 'nom_1er', 'echeance_1er', 'plusieurs_finances')),
  detail        text,
  created_at    timestamptz not null default now(),
  vu_at         timestamptz,
  ferme_at      timestamptz,
  ferme_raison  text
);
alter table public.offres_alertes enable row level security;
do $p$
begin
  if not exists (select 1 from pg_policies where tablename = 'offres_alertes' and policyname = 'offres_alertes_admin') then
    create policy offres_alertes_admin on public.offres_alertes for select to authenticated using (public.is_admin());
  end if;
end
$p$;

/** Les contrôles d'une cohorte, sans rien écrire : une ligne par contrat et par motif. */
create or replace function public.offres_ecarts(p_lundi date)
returns table (cle text, contrat_id text, offre_id text, poster_id uuid, hm_id uuid, hm_nom text, pays text, motif text, detail text)
language sql
stable
security definer
set search_path = public
as $$
  with vik as (select '2074065383597823773'::text as org),
  rec as (
    select a.contrat_id, a.offre_id, a.poster_id, a.hm_id, coalesce(h.prenom || ' ' || h.nom, a.hm_upwork_nom) as hm_nom,
           upper(a.pays) as pays, a.organisation_id, zp.tarif,
           coalesce(j.jalons, '[]'::jsonb) as jalons, j.contrat_id is not null as lus
      from public.accueils a
      left join public.profiles h on h.id = a.hm_id
      left join public.zones_paie_pays z on z.pays = upper(a.pays) and z.retire_at is null
      left join public.zones_paie zp on zp.zone = z.zone
      left join public.upwork_jalons j on j.contrat_id = a.contrat_id
     where a.cohorte_lundi = p_lundi
       and coalesce(a.classement, '') not in ('autre_activite', 'hm')
       and coalesce(a.statut, '') <> 'doublon'
  ),
  semaines as (
    select r.contrat_id, x
      from rec r, jsonb_array_elements(r.jalons) x
     where (x->>'nom') ~* '^\s*week\s*\d{1,2}(\D|$)'
  ),
  premier as (
    select distinct on (r.contrat_id) r.contrat_id, x
      from rec r, jsonb_array_elements(r.jalons) x
     order by r.contrat_id, (x->>'sequence')::int
  ),
  ecarts as (
    select r.*, 'hors_vik'::text as motif, 'offre sur l''organisation ' || coalesce(r.organisation_id, '?') || ', pas VIk Studios' as detail
      from rec r, vik where coalesce(r.organisation_id, '') <> vik.org
    union all
    select r.*, 'nb_milestones', (select count(*) from semaines s where s.contrat_id = r.contrat_id) || ' milestones « Week NN », attendu 4'
      from rec r where r.lus and (select count(*) from semaines s where s.contrat_id = r.contrat_id) <> 4
    union all
    select r.*, 'montant', 'milestones à ' || (select string_agg(distinct (s.x->>'depot'), ', ') from semaines s where s.contrat_id = r.contrat_id)
                 || ' $, attendu ' || r.tarif || ' $ (zone)'
      from rec r
     where r.lus and r.tarif is not null
       and exists (select 1 from semaines s where s.contrat_id = r.contrat_id and (s.x->>'depot')::numeric is distinct from r.tarif)
    union all
    select r.*, 'nom_1er', '1er milestone « ' || coalesce(p.x->>'nom', '?') || ' », attendu « Week ' || extract(week from p_lundi)::int || ' »'
      from rec r join premier p on p.contrat_id = r.contrat_id
     where coalesce(substring(p.x->>'nom' from '(?i)week\s*(\d{1,2})')::int, -1) <> extract(week from p_lundi)::int
    union all
    select r.*, 'echeance_1er', '1er milestone à échéance ' || coalesce(left(p.x->>'echeance', 10), 'aucune') || ', attendu ' || (p_lundi + 6)
      from rec r join premier p on p.contrat_id = r.contrat_id
     where coalesce(left(p.x->>'echeance', 10), '') <> (p_lundi + 6)::text
    union all
    select r.*, 'plusieurs_finances', (select count(*) from jsonb_array_elements(r.jalons) x where x->>'etat' in ('Active', 'Submitted', 'Rejected')) || ' milestones financés, 1 au plus'
      from rec r
     where (select count(*) from jsonb_array_elements(r.jalons) x where x->>'etat' in ('Active', 'Submitted', 'Rejected')) > 1
  )
  select e.contrat_id || '|' || e.motif, e.contrat_id, e.offre_id, e.poster_id, e.hm_id, e.hm_nom, e.pays, e.motif, e.detail
    from ecarts e
  union all
  -- Offres envoyées pas encore acceptées : seulement l'organisation (les milestones se lisent à l'acceptation).
  select 'offre:' || o.offre_id || '|hors_vik', o.contrat_id, o.offre_id, null, null, null, null, 'hors_vik',
         'offre « ' || coalesce(o.titre, '?') || ' » envoyée sur l''organisation ' || coalesce(o.organisation_id, '?') || ', pas VIk Studios'
    from public.upwork_offres o, vik
   where o.etat = 'Pending' and coalesce(o.organisation_id, '') <> vik.org
     and o.titre ~* '(tiktok|slideshow)'
     and coalesce(o.debut_at, now()) >= p_lundi - 14;
$$;
revoke all on function public.offres_ecarts(date) from public, anon, authenticated;

/** Écrit les alertes de la cohorte (une par contrat et par motif) et ferme celles qui sont corrigées. */
create or replace function public.offres_controler(p_lundi date default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lundi date := coalesce(p_lundi, public.cohorte_lundi_de((now() at time zone 'Europe/Paris')::date));
  n_ouvertes integer;
  n_fermees integer;
begin
  insert into public.offres_alertes (cle, contrat_id, offre_id, poster_id, hm_id, hm_nom, pays, cohorte_lundi, motif, detail)
  select e.cle, e.contrat_id, e.offre_id, e.poster_id, e.hm_id, e.hm_nom, e.pays, v_lundi, e.motif, e.detail
    from public.offres_ecarts(v_lundi) e
  on conflict (cle) do update set detail = excluded.detail, ferme_at = null, ferme_raison = null
   where offres_alertes.ferme_at is not null or offres_alertes.detail is distinct from excluded.detail;
  get diagnostics n_ouvertes = row_count;
  update public.offres_alertes a set ferme_at = now(), ferme_raison = 'corrigé (relu le ' || to_char(now() at time zone 'Europe/Paris', 'DD/MM HH24:MI') || ')'
   where a.ferme_at is null and a.cohorte_lundi = v_lundi
     and not exists (select 1 from public.offres_ecarts(v_lundi) e where e.cle = a.cle);
  get diagnostics n_fermees = row_count;
  return jsonb_build_object('lundi', v_lundi, 'ouvertes_ou_maj', n_ouvertes, 'fermees', n_fermees,
    'ouvertes', (select count(*) from public.offres_alertes where ferme_at is null and cohorte_lundi = v_lundi));
end;
$$;
revoke all on function public.offres_controler(date) from public, anon, authenticated;

/** B3 : la page Recrutement (admin) : objectifs, HM par pays, acceptées, offres en attente, alertes. */
create or replace function public.recrutement_cohorte(p_lundi date)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'recrutement_cohorte : réservé à l''admin' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'lundi', p_lundi,
    'objectifs', (select coalesce(jsonb_agg(jsonb_build_object('pays', o.pays, 'nombre', o.recrues_nombre) order by o.pays), '[]'::jsonb)
                    from public.pays_objectifs o where o.recrues_lundi = p_lundi),
    'hm_pays', (select coalesce(jsonb_agg(jsonb_build_object('pays', h.pays, 'hm_id', h.hm_id, 'hm_nom', h.hm_nom, 'zone', h.zone) order by h.pays), '[]'::jsonb)
                  from public.hm_pays h),
    'acceptees', (select coalesce(jsonb_agg(jsonb_build_object('contrat_id', a.contrat_id, 'pays', upper(a.pays), 'hm_id', a.hm_id,
                                                                'hm_nom', coalesce(h.prenom || ' ' || h.nom, a.hm_upwork_nom), 'debut_at', a.debut_at)
                                            order by a.debut_at), '[]'::jsonb)
                    from public.accueils a left join public.profiles h on h.id = a.hm_id
                   where a.cohorte_lundi = p_lundi and a.organisation_id = '2074065383597823773'
                     and coalesce(a.classement, '') not in ('autre_activite', 'hm') and coalesce(a.statut, '') <> 'doublon'),
    'en_attente', (select coalesce(jsonb_agg(jsonb_build_object('offre_id', o.offre_id, 'titre', o.titre, 'debut_at', o.debut_at) order by o.debut_at), '[]'::jsonb)
                     from public.upwork_offres o where o.etat = 'Pending' and o.organisation_id = '2074065383597823773'),
    'offres_lues_at', (select max(lu_at) from public.upwork_offres),
    'alertes', (select coalesce(jsonb_agg(jsonb_build_object('contrat_id', a.contrat_id, 'offre_id', a.offre_id, 'hm_nom', a.hm_nom, 'pays', a.pays,
                                                              'motif', a.motif, 'detail', a.detail, 'created_at', a.created_at) order by a.created_at), '[]'::jsonb)
                  from public.offres_alertes a where a.ferme_at is null and (a.cohorte_lundi = p_lundi or a.contrat_id is null))
  );
end;
$$;
revoke all on function public.recrutement_cohorte(date) from public, anon;
grant execute on function public.recrutement_cohorte(date) to authenticated;

-- Les milestones relus chaque jour (lecture seule, cloné de upwork-verifier), puis le contrôle.
do $c$
declare
  v_cmd text;
begin
  if not exists (select 1 from cron.job where jobname = 'jalons-jour') then
    select regexp_replace(command, '"action"\s*:\s*"verifier"', '"action":"jalons"') into v_cmd
      from cron.job where jobname = 'upwork-verifier';
    if v_cmd is not null and v_cmd like '%"action":"jalons"%' then
      perform cron.schedule('jalons-jour', '40 7 * * *', v_cmd);
    else
      raise notice '0516 : cron upwork-verifier introuvable, jalons-jour non créé';
    end if;
  end if;
  if not exists (select 1 from cron.job where jobname = 'offres-controle') then
    perform cron.schedule('offres-controle', '10 8 * * *', 'select public.offres_controler()');
  end if;
end
$c$;

notify pgrst, 'reload schema';
