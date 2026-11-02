-- 0362 : Check, Kill or Double → « Shadowban », et un diagnostic clair partout.
--
-- A) Chaque matin (6 h 20, Paris), `ckd_shadowban` est recalculée :
--   - « Shadowban probable » : le posteur publie (au moins un lien sur 7 jours),
--     mais ses 4 derniers posts mesurés à 48 h ou plus sont tous sous
--     `seuil_mort` (réglage CKD, 50 par défaut). Ex. @jakub.vola672 : tout à 0
--     vue depuis le 20 oct. ;
--   - « Vues anormalement basses » : la médiane des 7 derniers jours (au moins
--     3 posts mesurés) est sous 20 % de la médiane de référence du pays,
--     calculée comme `mediane_ref` de `ckd_calculer` (0326 : 28 jours, pays,
--     sinon langue, sinon flotte, `comptes_min_mediane` comptes au moins).
--   Hors liste : comptes inactifs, RUUL, « ne pas renouveler », vidéo/UGC, et
--   ceux ignorés 7 jours (`comptes.surveillance_skip_jusqu`).
--   Actions : « Nouveau compte » (fonction `ckd`, action `recreer_shadowban`,
--   même création que la recréation d'une proposition : `ckd_recreations` et
--   arrêt de l'ancien compte dans `ckd_arrets`) et « Ignorer 7 jours ».
--
-- B) `ckd_diagnostic(donnees)` : les faits d'un compte en un seul endroit
--   (posts attendus / publiés / liens manquants, médiane et médiane du pays,
--   posts morts, shadowban), et un badge : ok, posts_manquants, vues_basses,
--   shadowban. Lu par la page (propositions, Shadowban), le dashboard HM
--   (colonne calculée `diagnostic` sur `ckd_propositions` et `ckd_shadowban`),
--   les messages Slack aux HMs et le nudge au posteur, qui commence maintenant
--   par la raison en une phrase (`ckd_raison_nudge`).
--
-- Réécrits à l'identique sauf la raison du nudge : `ckd_decider` et
-- `ckd_apercu_nudge` (0338, empreintes vérifiées en prod le 26/10).
--
-- Additive : une table, des fonctions, deux fonctions réécrites, un cron.
-- Retour arrière : `select cron.unschedule('ckd-shadowban')`, réappliquer
-- `ckd_decider` et `ckd_apercu_nudge` de 0338, supprimer les fonctions et la table.

-- ---------------------------------------------------------------------------
-- B) Le diagnostic
-- ---------------------------------------------------------------------------
create or replace function public.ckd_diagnostic_brut(p_donnees jsonb)
returns jsonb
language sql
immutable
set search_path = public
as $$
  with f as (
    select coalesce((p_donnees->'periode'->>'attendus')::int, 0) as attendus,
           coalesce((p_donnees->'periode'->>'publies')::int, 0) as publies,
           coalesce((p_donnees->'periode'->>'morts')::int, 0) as morts,
           (p_donnees->'periode'->>'mediane')::numeric as mediane,
           (p_donnees->'mediane_ref'->>'valeur')::numeric as mediane_ref,
           coalesce((p_donnees->>'seuil_mort')::numeric,
                    (p_donnees->'reglages'->'seuil_mort'->>'v')::numeric, 50) as seuil_mort,
           coalesce((select jsonb_agg(l->'jour' order by l->>'jour')
                       from jsonb_array_elements(coalesce(p_donnees->'periode'->'liens_manquants', '[]')) l),
                    '[]'::jsonb) as liens_manquants,
           -- Les 4 derniers posts mesurés à 48 h ou plus (posts de la période).
           (select array_agg((x->>'vues')::numeric order by x->>'jour' desc)
              from (select x from jsonb_array_elements(coalesce(p_donnees->'periode'->'posts', '[]')) x
                     where (x->>'mesure')::boolean and (x->>'age_h')::numeric >= 48
                     order by x->>'jour' desc limit 4) s) as derniers
  ),
  g as (
    select f.*,
           coalesce((p_donnees->>'shadowban')::boolean,
                    cardinality(f.derniers) = 4
                      and (select max(v) from unnest(f.derniers) v) < f.seuil_mort) as shadowban,
           f.mediane is not null and f.mediane_ref > 0 and f.mediane < 0.2 * f.mediane_ref as vues_basses
      from f
  )
  select jsonb_build_object(
    'badge', case when g.shadowban then 'shadowban'
                  when g.vues_basses then 'vues_basses'
                  when g.attendus > g.publies then 'posts_manquants'
                  else 'ok' end,
    'attendus', g.attendus,
    'publies', g.publies,
    'liens_manquants', g.liens_manquants,
    'mediane', g.mediane,
    'mediane_ref', g.mediane_ref,
    'morts', g.morts,
    'seuil_mort', g.seuil_mort,
    'shadowban', g.shadowban,
    'vues_basses', g.vues_basses,
    'derniers_morts', case when g.shadowban then coalesce(cardinality(g.derniers), 4) end,
    'derniers_max', case when g.shadowban then (select max(v) from unnest(g.derniers) v) end
  )
  from g;
$$;

-- La raison du nudge au posteur, en une phrase (anglais, comme les nudges).
create or replace function public.ckd_raison_nudge_brut(p_donnees jsonb)
returns text
language sql
immutable
set search_path = public
as $$
  select case d->>'badge'
    when 'shadowban' then
      case when coalesce((d->>'derniers_max')::numeric, 0) = 0
           then format('Your last %s posts got 0 views: your account may be blocked. Your HM will contact you.',
                       coalesce(d->>'derniers_morts', '4'))
           else format('Your last %s posts got almost no views (%s or less): your account may be blocked. Your HM will contact you.',
                       coalesce(d->>'derniers_morts', '4'), d->>'derniers_max') end
    when 'vues_basses' then
      format('Your views are far below the other accounts in your country (median %s vs %s). Your HM will help you fix it.',
             coalesce(d->>'mediane', '0'), d->>'mediane_ref')
    when 'posts_manquants' then
      format('%s of your %s planned posts have no link in the OS. Publish every planned post and paste each link.',
             (d->>'attendus')::int - (d->>'publies')::int, d->>'attendus')
  end
  from (select public.ckd_diagnostic_brut(p_donnees) as d) x;
$$;

-- Les versions sûres : une donnée inattendue ne bloque ni la page ni un nudge.
create or replace function public.ckd_diagnostic(p_donnees jsonb)
returns jsonb
language plpgsql
immutable
set search_path = public
as $$
begin
  return public.ckd_diagnostic_brut(p_donnees);
exception when others then
  return jsonb_build_object('badge', 'ok', 'erreur', sqlerrm);
end;
$$;

create or replace function public.ckd_raison_nudge(p_donnees jsonb)
returns text
language plpgsql
immutable
set search_path = public
as $$
begin
  return public.ckd_raison_nudge_brut(p_donnees);
exception when others then
  return null;
end;
$$;

grant execute on function public.ckd_diagnostic_brut(jsonb) to authenticated, service_role;
grant execute on function public.ckd_raison_nudge_brut(jsonb) to authenticated, service_role;
grant execute on function public.ckd_diagnostic(jsonb) to authenticated, service_role;
grant execute on function public.ckd_raison_nudge(jsonb) to authenticated, service_role;

-- Colonne calculée pour la page : `select=…,diagnostic`.
create or replace function public.diagnostic(public.ckd_propositions)
returns jsonb
language sql
stable
as $$
  select public.ckd_diagnostic($1.donnees);
$$;

grant execute on function public.diagnostic(public.ckd_propositions) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- A) Les comptes signalés
-- ---------------------------------------------------------------------------
create table if not exists public.ckd_shadowban (
  compte_id         uuid primary key references public.comptes (id) on delete cascade,
  type              text not null check (type in ('shadowban', 'vues_basses')),
  depuis            date not null,
  poster_id         uuid not null,
  hm_id             uuid,
  pays              text,
  handle            text,
  application       text,
  -- Même forme que `ckd_propositions.donnees` : periode (7 jours), mediane_ref,
  -- seuil_mort, shadowban, derniers (les 6 derniers posts publiés).
  donnees           jsonb not null default '{}'::jsonb,
  calcule_at        timestamptz not null default now(),
  recreation_at     timestamptz,
  recreation_par    uuid,
  nouveau_compte_id uuid,
  erreur            text
);

create index if not exists ckd_shadowban_hm on public.ckd_shadowban (hm_id);

alter table public.ckd_shadowban enable row level security;

drop policy if exists ckd_shadowban_lecture on public.ckd_shadowban;
create policy ckd_shadowban_lecture on public.ckd_shadowban
  for select to authenticated
  using (public.is_admin() or hm_id = (select auth.uid()));

grant select on public.ckd_shadowban to authenticated;
grant all on public.ckd_shadowban to service_role;

create or replace function public.diagnostic(public.ckd_shadowban)
returns jsonb
language sql
stable
as $$
  select public.ckd_diagnostic($1.donnees);
$$;

grant execute on function public.diagnostic(public.ckd_shadowban) to authenticated, service_role;

-- Le calcul du jour, sans rien écrire.
create or replace function public.ckd_shadowban_calculer(p_jour date default null)
returns table (
  compte_id   uuid,
  type        text,
  depuis      date,
  poster_id   uuid,
  hm_id       uuid,
  pays        text,
  handle      text,
  application text,
  donnees     jsonb
)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_jour date := coalesce(p_jour, (now() at time zone 'Europe/Paris')::date);
  v_min integer;
begin
  select coalesce((r.valeur #>> '{}')::integer, 5) into v_min
    from public.ckd_reglage('comptes_min_mediane', null, null) r;
  v_min := coalesce(v_min, 5);

  return query
  with
  base as (
    select c.id, c.poster_id, c.pays, c.langue, c.handle_tiktok, c.parts_applications, pr.manager_id as hm_id,
           (select cl.label_id from public.compte_labels cl where cl.compte_id = c.id
             order by cl.label_id limit 1) as label_id,
           coalesce(c.surveillance_skip_jusqu > now(), false) as ignore
      from public.comptes c
      join public.profiles pr on pr.id = c.poster_id
     where c.is_active
       and coalesce(pr.is_active, true)
       and c.type_compte = 'perso'
       and not coalesce(c.ugc_ai_video, false)
       and not coalesce(c.videos_uniquement, false)
       and not coalesce(c.non_renouveler, false)
       and not exists (select 1 from public.hub_posteurs h where h.profile_id = c.poster_id)
  ),
  cpt as (
    select b.*,
           coalesce((select (r.valeur #>> '{}')::numeric
                       from public.ckd_reglage('age_min_heures', b.pays, b.label_id) r), 10) as age_min,
           coalesce((select (r.valeur #>> '{}')::numeric
                       from public.ckd_reglage('seuil_mort', b.pays, b.label_id) r), 50) as seuil_mort,
           coalesce((select (r.valeur #>> '{}')::numeric
                       from public.ckd_reglage('seuil_bon_post', b.pays, b.label_id) r), 5000) as seuil_bon
      from base b
  ),
  pp as (
    select x.compte_id, x.date_publication_prevue as jour, x.created_at, x.vues, x.publie_url as url,
           (x.publie_url is not null and x.vues is not null and x.stats_maj_at is not null
             and x.stats_maj_at - coalesce(x.tiktok_publie_at, x.publie_at)
                 >= c.age_min::double precision * interval '1 hour') as mesure,
           (x.publie_url is not null and x.vues is not null and x.stats_maj_at is not null
             and x.stats_maj_at - coalesce(x.tiktok_publie_at, x.publie_at) >= interval '48 hours') as mesure48
      from public.passages x
      join cpt c on c.id = x.compte_id
     where not coalesce(x.est_rappel, false)
       and x.statut <> 'brouillon'
       and x.date_publication_prevue between v_jour - 60 and v_jour
  ),
  -- Médianes de référence, comme `ckd_calculer` : 28 jours qui finissent hier.
  m28 as (
    select pp.compte_id, pp.vues, c.pays, c.langue
      from pp join cpt c on c.id = pp.compte_id
     where pp.mesure and pp.jour between v_jour - 28 and v_jour - 1
  ),
  med_pays as (
    select m.pays, percentile_cont(0.5) within group (order by m.vues) as med, count(distinct m.compte_id) as n
      from m28 m group by m.pays
  ),
  med_langue as (
    select m.langue, percentile_cont(0.5) within group (order by m.vues) as med, count(distinct m.compte_id) as n
      from m28 m group by m.langue
  ),
  med_flotte as (
    select percentile_cont(0.5) within group (order by m.vues) as med, count(distinct m.compte_id) as n from m28 m
  ),
  ref as (
    select c.id as compte_id,
           case when mp.n >= v_min then jsonb_build_object('valeur', round(mp.med), 'source', 'pays', 'n_comptes', mp.n)
                when ml.n >= v_min then jsonb_build_object('valeur', round(ml.med), 'source', 'langue', 'n_comptes', ml.n)
                else jsonb_build_object('valeur', round(mf.med), 'source', 'flotte', 'n_comptes', mf.n) end as mediane_ref
      from cpt c
      left join med_pays mp on mp.pays = c.pays
      left join med_langue ml on ml.langue = c.langue
      cross join med_flotte mf
  ),
  -- Les 4 derniers posts mesurés à 48 h ou plus.
  der4 as (
    select d.compte_id, count(*) as n, max(d.vues) as max_vues
      from (select pp.*, row_number() over (partition by pp.compte_id order by pp.jour desc, pp.created_at desc) as rang
              from pp where pp.mesure48) d
     where d.rang <= 4
     group by d.compte_id
  ),
  -- Le début de la série de posts morts : le premier post mesuré après le
  -- dernier post au-dessus du seuil.
  serie as (
    select c.id as compte_id,
           (select min(p2.jour) from pp p2
             where p2.compte_id = c.id and p2.mesure48
               and p2.jour > coalesce((select max(p3.jour) from pp p3
                                        where p3.compte_id = c.id and p3.mesure48 and p3.vues >= c.seuil_mort),
                                      '-infinity'::date)) as depuis
      from cpt c
  ),
  publie7 as (
    select pp.compte_id from pp where pp.url is not null and pp.jour between v_jour - 7 and v_jour group by pp.compte_id
  ),
  med7 as (
    select pp.compte_id, count(*) as n,
           percentile_cont(0.5) within group (order by pp.vues) as med
      from pp where pp.mesure and pp.jour between v_jour - 7 and v_jour - 1
     group by pp.compte_id
  ),
  signal as (
    select c.*, r.mediane_ref, s.depuis as depuis_serie,
           (d4.n = 4 and d4.max_vues < c.seuil_mort) as shadowban,
           (m7.n >= 3 and (r.mediane_ref->>'valeur')::numeric > 0
             and m7.med < 0.2 * (r.mediane_ref->>'valeur')::numeric) as vues_basses
      from cpt c
      join publie7 p7 on p7.compte_id = c.id
      join ref r on r.compte_id = c.id
      left join der4 d4 on d4.compte_id = c.id
      left join med7 m7 on m7.compte_id = c.id
      left join serie s on s.compte_id = c.id
     where not c.ignore
  )
  select s.id,
         case when s.shadowban then 'shadowban' else 'vues_basses' end,
         case when s.shadowban then coalesce(s.depuis_serie, v_jour) else v_jour end,
         s.poster_id, s.hm_id, s.pays, s.handle_tiktok,
         public.application_principale(s.parts_applications),
         jsonb_build_object(
           'handle', s.handle_tiktok,
           'periode', public.ckd_detail(s.id, v_jour - 7, v_jour - 1, s.age_min, s.seuil_mort, s.seuil_bon),
           'mediane_ref', s.mediane_ref,
           'seuil_mort', s.seuil_mort,
           'shadowban', s.shadowban,
           'derniers', coalesce((
             select jsonb_agg(jsonb_build_object('jour', d.jour, 'vues', d.vues, 'mesure', d.mesure48) order by d.jour, d.created_at)
               from (select pp.* from pp where pp.compte_id = s.id and pp.url is not null
                      order by pp.jour desc, pp.created_at desc limit 6) d), '[]'::jsonb))
    from signal s
   where s.shadowban or coalesce(s.vues_basses, false);
end;
$$;

-- Recalcul : met à jour les comptes signalés, garde `depuis` d'un jour sur
-- l'autre et la recréation en cours, retire ceux qui ne le sont plus.
create or replace function public.ckd_shadowban_rafraichir()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer;
begin
  if coalesce(auth.role(), '') in ('anon', 'authenticated') and not public.is_admin() then
    raise exception 'ckd_shadowban_rafraichir : réservé à l''admin';
  end if;

  create temp table if not exists ckd_shadowban_calc on commit drop as
    select * from public.ckd_shadowban_calculer() limit 0;
  truncate ckd_shadowban_calc;
  insert into ckd_shadowban_calc select * from public.ckd_shadowban_calculer();

  delete from public.ckd_shadowban s
   where not exists (select 1 from ckd_shadowban_calc c where c.compte_id = s.compte_id)
     and not (s.recreation_at is not null and s.nouveau_compte_id is null and s.erreur is null);

  insert into public.ckd_shadowban as s
    (compte_id, type, depuis, poster_id, hm_id, pays, handle, application, donnees, calcule_at)
  select c.compte_id, c.type, c.depuis, c.poster_id, c.hm_id, c.pays, c.handle, c.application, c.donnees, now()
    from ckd_shadowban_calc c
  on conflict (compte_id) do update
     set depuis = case when excluded.type = 'vues_basses' and s.type = 'vues_basses' then s.depuis
                       else excluded.depuis end,
         type = excluded.type,
         poster_id = excluded.poster_id,
         hm_id = excluded.hm_id,
         pays = excluded.pays,
         handle = excluded.handle,
         application = excluded.application,
         donnees = excluded.donnees,
         calcule_at = excluded.calcule_at;
  get diagnostics n = row_count;
  return n;
end;
$$;

-- Le cron : chaque matin à 6 h de Paris.
create or replace function public.ckd_shadowban_matin()
returns integer
language plpgsql
security definer
set search_path = public
as $$
begin
  if extract(hour from timezone('Europe/Paris', now())) <> 6 then
    return 0;
  end if;
  return public.ckd_shadowban_rafraichir();
end;
$$;

-- « Ignorer 7 jours » (admin et Head of Ops).
create or replace function public.ckd_shadowban_ignorer(p_compte uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'ckd_shadowban_ignorer : réservé à l''admin';
  end if;
  update public.comptes set surveillance_skip_jusqu = now() + interval '7 days' where id = p_compte;
  delete from public.ckd_shadowban where compte_id = p_compte;
end;
$$;

-- « Nouveau compte » : réservé à la fonction `ckd` (comme ckd_decider / ckd_compte_cree).
create or replace function public.ckd_shadowban_reserver(p_compte uuid, p_par uuid)
returns public.ckd_shadowban
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.ckd_shadowban;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'ckd_shadowban_reserver : réservé à la fonction ckd';
  end if;
  update public.ckd_shadowban
     set recreation_at = now(), recreation_par = p_par, erreur = null
   -- Après un échec net, `ckd_shadowban_liberer` remet `recreation_at` à null ;
   -- après une création incertaine, il reste posé : pas de second compte.
   where compte_id = p_compte and recreation_at is null and nouveau_compte_id is null
  returning * into r;
  if not found then
    raise exception 'ckd_shadowban : compte absent de la liste, ou nouveau compte déjà en cours';
  end if;
  return r;
end;
$$;

create or replace function public.ckd_shadowban_compte_cree(p_compte uuid, p_nouveau uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.ckd_shadowban;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'ckd_shadowban_compte_cree : réservé à la fonction ckd';
  end if;
  select * into r from public.ckd_shadowban where compte_id = p_compte for update;
  if not found then
    raise exception 'ckd_shadowban_compte_cree : compte introuvable';
  end if;
  update public.ckd_shadowban set nouveau_compte_id = p_nouveau, erreur = null where compte_id = p_compte;
  insert into public.ckd_recreations (poster_id, ancien_compte_id, nouveau_compte_id, regle, proposition_id, decide_par)
  values (r.poster_id, p_compte, p_nouveau, r.type, null, r.recreation_par);
  insert into public.ckd_arrets as a (compte_id, proposition_id, raison, prevu_at, decide_par)
  values (p_compte, null, 'recreer', public.ckd_prochain_arret(now(), false), r.recreation_par)
  on conflict (compte_id) do update
    set proposition_id = excluded.proposition_id, raison = excluded.raison, prevu_at = excluded.prevu_at,
        decide_par = excluded.decide_par, annule_at = null
    where a.fait_at is null;
end;
$$;

create or replace function public.ckd_shadowban_liberer(p_compte uuid, p_erreur text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'ckd_shadowban_liberer : réservé à la fonction ckd';
  end if;
  update public.ckd_shadowban
     set recreation_at = null, recreation_par = null, erreur = left(p_erreur, 500)
   where compte_id = p_compte and nouveau_compte_id is null;
end;
$$;

revoke execute on function public.ckd_shadowban_calculer(date) from public, anon, authenticated;
revoke execute on function public.ckd_shadowban_rafraichir() from public, anon;
revoke execute on function public.ckd_shadowban_matin() from public, anon, authenticated;
revoke execute on function public.ckd_shadowban_ignorer(uuid) from public, anon;
revoke execute on function public.ckd_shadowban_reserver(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.ckd_shadowban_compte_cree(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.ckd_shadowban_liberer(uuid, text) from public, anon, authenticated;
grant execute on function public.ckd_shadowban_calculer(date) to service_role;
grant execute on function public.ckd_shadowban_rafraichir() to authenticated, service_role;
grant execute on function public.ckd_shadowban_matin() to service_role;
grant execute on function public.ckd_shadowban_ignorer(uuid) to authenticated, service_role;
grant execute on function public.ckd_shadowban_reserver(uuid, uuid) to service_role;
grant execute on function public.ckd_shadowban_compte_cree(uuid, uuid) to service_role;
grant execute on function public.ckd_shadowban_liberer(uuid, text) to service_role;

-- ---------------------------------------------------------------------------
-- Le nudge au posteur commence par la raison (0338 à l'identique sinon)
-- ---------------------------------------------------------------------------
create or replace function public.ckd_decider(p_id uuid, p_decision text, p_note text default null,
                                              p_par uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_service boolean := coalesce(auth.role(), '') = 'service_role';
  v_par uuid;
  p public.ckd_propositions%rowtype;
  v_prevu timestamptz;
  v_nudge record;
  v_motifs text[];
  v_handle text;
begin
  if not v_service and not public.is_admin() then
    raise exception 'ckd_decider : réservé à l''admin';
  end if;
  v_par := case when v_service then p_par else auth.uid() end;
  if p_decision in ('recreer', 'doubler') and not v_service then
    raise exception 'ckd_decider : % crée un compte et passe par la fonction ckd', p_decision;
  end if;

  select * into p from public.ckd_propositions where id = p_id for update;
  if not found then
    raise exception 'ckd_decider : proposition introuvable';
  end if;
  if p.decision is not null then
    raise exception 'ckd_decider : déjà décidé (%)', p.decision;
  end if;
  if not (p_decision = any(public.ckd_decisions_permises(p.regle))) then
    raise exception 'ckd_decider : % impossible pour la règle %', p_decision, p.regle;
  end if;

  update public.ckd_propositions
     set decision = p_decision, decision_par = v_par, decision_at = now(),
         note = nullif(btrim(coalesce(p_note, '')), ''), erreur = null
   where id = p_id;

  if p_decision = 'ne_pas_renouveler' then
    update public.comptes
       set non_renouveler = true, non_renouveler_at = now(), non_renouveler_par = v_par,
           non_renouveler_raison = 'ckd:' || p.regle
     where id = p.compte_id;
    v_prevu := public.ckd_prochain_arret(now(), true);
    insert into public.ckd_arrets as a (compte_id, proposition_id, raison, prevu_at, decide_par)
    values (p.compte_id, p_id, 'ne_pas_renouveler', v_prevu, v_par)
    on conflict (compte_id) do update
      set proposition_id = excluded.proposition_id, raison = excluded.raison, prevu_at = excluded.prevu_at,
          decide_par = excluded.decide_par, annule_at = null
      where a.fait_at is null;
    if v_prevu <= now() then
      perform public.ckd_arreter_comptes();
    end if;
  elsif p_decision = 'nudge' then
    v_motifs := array(select jsonb_array_elements_text(coalesce(p.donnees->'motifs', '[]'::jsonb)));
    v_handle := coalesce(p.donnees->>'handle', '');
    select * into v_nudge from public.ckd_texte_nudge(p.regle, v_motifs, p.donnees->>'handle');
    -- Le texte modifié pour ce posteur (0338), sinon la raison en une phrase
    -- (0362) puis le texte de Réglages.
    insert into public.compte_nudges (compte_id, modele_id, titre, corps, envoye_par)
    values (p.compte_id, v_nudge.modele,
            coalesce(replace(nullif(btrim(coalesce(p.nudge_titre, '')), ''), '{handle}', v_handle), v_nudge.titre),
            coalesce(replace(nullif(btrim(coalesce(p.nudge_corps, '')), ''), '{handle}', v_handle),
                     concat_ws(E'\n\n', public.ckd_raison_nudge(p.donnees), nullif(v_nudge.corps, ''))),
            v_par);
  end if;

  return jsonb_build_object('id', p_id, 'decision', p_decision, 'arret_at', v_prevu);
end;
$$;

create or replace function public.ckd_apercu_nudge(p_id uuid)
returns table (titre text, corps text)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  p public.ckd_propositions%rowtype;
  v_nudge record;
begin
  if coalesce(auth.role(), '') in ('anon', 'authenticated') and not public.is_admin() then
    raise exception 'ckd_apercu_nudge : réservé à l''admin';
  end if;
  select * into p from public.ckd_propositions where id = p_id;
  if not found then
    raise exception 'ckd_apercu_nudge : proposition introuvable';
  end if;
  select * into v_nudge
    from public.ckd_texte_nudge(
      p.regle,
      array(select jsonb_array_elements_text(coalesce(p.donnees->'motifs', '[]'::jsonb))),
      p.donnees->>'handle');
  return query select v_nudge.titre,
                      concat_ws(E'\n\n', public.ckd_raison_nudge(p.donnees), nullif(v_nudge.corps, ''));
end;
$$;

-- ---------------------------------------------------------------------------
-- Le cron du matin : 4 h et 5 h 20 UTC, la fonction ne garde que 6 h à Paris.
-- ---------------------------------------------------------------------------
do $sb$
begin
  if exists (select 1 from cron.job where jobname = 'ckd-shadowban') then
    perform cron.unschedule('ckd-shadowban');
  end if;
  perform cron.schedule('ckd-shadowban', '20 4,5 * * *', 'select public.ckd_shadowban_matin()');
end
$sb$;

notify pgrst, 'reload schema';
