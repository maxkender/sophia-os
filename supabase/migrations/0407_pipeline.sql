-- 0407 — La page « Pipeline » : toutes les recrues, de l'offre acceptée au
-- 1er jour de posts, en direct.
--
-- 1. `recrue_evenements` : l'historique daté de chaque recrue (offre,
--    bienvenue, connexion, compte TikTok, warm-up, relances, réponses, Kills,
--    arrêt, 2e compte, 1er post). Remplie par des déclencheurs sur les tables
--    que tiennent l'accueil automatique, recrues-check, les relances, les
--    réponses et les Kills ; un déclencheur ne fait JAMAIS échouer l'écriture
--    d'origine (toute erreur est avalée). Les recrues déjà dans l'OS
--    reçoivent leur historique reconstitué (création, 1re connexion, relevés
--    TikTok, Start warmup, nudges, réponses, Kills).
-- 2. `pipeline_recrues()` : une carte par recrue (et par 2e compte), sa
--    colonne (1 offre acceptée … 6 1er jour posté), son état (attente,
--    relancé, a répondu, Kill, fait), la date limite et le dernier événement.
-- 3. `pipeline_arretes()` : les arrêtés des 7 derniers jours ;
--    `pipeline_historique(p_poster)` : le panneau d'une carte ;
--    `pipeline_arreter(p_poster)` : « Arrêter » (file des arrêts complets).
-- 4. Realtime : `recrue_evenements` dans la publication supabase_realtime.
--
-- Admin et Head of Ops (is_admin). Additive : une table, des fonctions, des
-- déclencheurs AFTER qui n'écrivent que dans la nouvelle table. Aucune donnée
-- existante modifiée.
-- Retour arrière : drop des déclencheurs pipeline_* ; drop des fonctions
-- pipeline_* (dont pipeline_arreter) et recrue_evenement_noter ; drop table
-- recrue_evenements.

create table if not exists public.recrue_evenements (
  id         uuid primary key default gen_random_uuid(),
  poster_id  uuid not null references public.profiles (id) on delete cascade,
  compte_id  uuid references public.comptes (id) on delete set null,
  type       text not null,
  at         timestamptz not null,
  detail     text,
  -- Une clé par événement (l'id de la ligne source) : jamais deux fois le même.
  cle        text not null,
  created_at timestamptz not null default now(),
  unique (poster_id, type, cle)
);

create index if not exists recrue_evenements_poster on public.recrue_evenements (poster_id, at desc);

comment on table public.recrue_evenements is
  'Pipeline (0407) : l''historique daté de chaque recrue, rempli par déclencheurs (accueil, recrues-check, relances, réponses, Kills).';

alter table public.recrue_evenements enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'recrue_evenements'
                  and policyname = 'recrue_evenements lecture') then
    create policy "recrue_evenements lecture" on public.recrue_evenements
      for select to authenticated using ((select public.is_admin()));
  end if;
end $$;
revoke all on public.recrue_evenements from public, anon, authenticated;
grant select on public.recrue_evenements to authenticated;
grant all on public.recrue_evenements to service_role;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'recrue_evenements') then
    alter publication supabase_realtime add table public.recrue_evenements;
  end if;
end $$;

-- Noter un événement : une fois par (posteur, type, clé) ; ne lève jamais.
create or replace function public.recrue_evenement_noter(
  p_poster uuid, p_compte uuid, p_type text, p_at timestamptz, p_detail text, p_cle text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_poster is null or p_at is null then
    return;
  end if;
  insert into public.recrue_evenements (poster_id, compte_id, type, at, detail, cle)
  values (p_poster, p_compte, p_type, p_at, left(p_detail, 500), coalesce(p_cle, p_type))
  on conflict (poster_id, type, cle) do nothing;
exception when others then
  raise warning 'recrue_evenement_noter : %', sqlerrm;
end;
$$;

revoke execute on function public.recrue_evenement_noter(uuid, uuid, text, timestamptz, text, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Les déclencheurs : un par table source, AFTER, sans jamais lever.
-- ---------------------------------------------------------------------------

-- profiles : l'offre acceptée, la 1re connexion.
create or replace function public.pipeline_tg_profiles()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.offre_acceptee_le is not null and (tg_op = 'INSERT' or old.offre_acceptee_le is distinct from new.offre_acceptee_le) then
    perform public.recrue_evenement_noter(new.id, null, 'offre', new.offre_acceptee_le, null, 'offre');
  end if;
  if new.premiere_connexion_at is not null and (tg_op = 'INSERT' or old.premiere_connexion_at is null) then
    perform public.recrue_evenement_noter(new.id, null, 'connexion', new.premiere_connexion_at, null, 'connexion');
  end if;
  return null;
exception when others then
  return null;
end;
$$;

drop trigger if exists pipeline_profiles on public.profiles;
create trigger pipeline_profiles after insert or update of offre_acceptee_le, premiere_connexion_at on public.profiles
  for each row execute function public.pipeline_tg_profiles();

-- accueils : le message de bienvenue parti.
create or replace function public.pipeline_tg_accueils()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.poster_id is not null and new.message_at is not null and (tg_op = 'INSERT' or old.message_at is null) then
    perform public.recrue_evenement_noter(new.poster_id, null, 'bienvenue', new.message_at, 'Upwork', 'bienvenue');
  end if;
  return null;
exception when others then
  return null;
end;
$$;

drop trigger if exists pipeline_accueils on public.accueils;
create trigger pipeline_accueils after insert or update of message_at on public.accueils
  for each row execute function public.pipeline_tg_accueils();

-- comptes : un 2e compte (Double), le Start warmup.
create or replace function public.pipeline_tg_comptes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.poster_id is null or new.type_compte is distinct from 'perso' then
    return null;
  end if;
  if tg_op = 'INSERT' and exists (select 1 from public.comptes c where c.poster_id = new.poster_id and c.id <> new.id
                                    and c.type_compte = 'perso' and c.created_at < new.created_at) then
    perform public.recrue_evenement_noter(new.poster_id, new.id, 'deuxieme_compte', new.created_at, new.handle_tiktok, new.id::text);
  end if;
  if new.warmup_started_at is not null and (tg_op = 'INSERT' or old.warmup_started_at is null) then
    perform public.recrue_evenement_noter(new.poster_id, new.id, 'warmup_lance', new.warmup_started_at, new.handle_tiktok, new.id::text);
  end if;
  return null;
exception when others then
  return null;
end;
$$;

drop trigger if exists pipeline_comptes on public.comptes;
create trigger pipeline_comptes after insert or update of warmup_started_at on public.comptes
  for each row execute function public.pipeline_tg_comptes();

-- ckd_warmup_releves : le compte TikTok vu pour la 1re fois, le warm-up bien fait.
create or replace function public.pipeline_tg_releves()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  c record;
begin
  if new.existe is not true then
    return null;
  end if;
  select id, poster_id, warmup_started_at into c from public.comptes where id = new.compte_id;
  if c.poster_id is null then
    return null;
  end if;
  perform public.recrue_evenement_noter(c.poster_id, c.id, 'tiktok_cree', new.releve_at, '@' || new.handle, c.id::text);
  if c.warmup_started_at is not null and coalesce(new.abonnements, 0) >= 5 and coalesce(new.videos, 0) = 0 then
    perform public.recrue_evenement_noter(c.poster_id, c.id, 'warmup_bien_fait', new.releve_at,
                                          new.abonnements || ' follows', c.id::text);
  end if;
  return null;
exception when others then
  return null;
end;
$$;

drop trigger if exists pipeline_releves on public.ckd_warmup_releves;
create trigger pipeline_releves after insert on public.ckd_warmup_releves
  for each row execute function public.pipeline_tg_releves();

-- passages : le 1er post publié avec son lien, par compte.
create or replace function public.pipeline_tg_passages()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_poster uuid;
begin
  if new.publie_url is null or (tg_op = 'UPDATE' and old.publie_url is not null) then
    return null;
  end if;
  select poster_id into v_poster from public.comptes where id = new.compte_id;
  perform public.recrue_evenement_noter(v_poster, new.compte_id, 'premier_post', coalesce(new.publie_at, now()), null,
                                        new.compte_id::text);
  return null;
exception when others then
  return null;
end;
$$;

drop trigger if exists pipeline_passages on public.passages;
create trigger pipeline_passages after insert or update of publie_url on public.passages
  for each row execute function public.pipeline_tg_passages();

-- nudges : une relance partie ; relances_prevues : prévue (test) ou bloquée.
create or replace function public.pipeline_tg_nudges()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.recrue_evenement_noter(new.poster_id, new.compte_id, 'relance', new.envoye_at,
                                        new.type || ' · ' || new.canal || coalesce(' · échec : ' || new.slack_erreur, ''),
                                        new.id::text);
  return null;
exception when others then
  return null;
end;
$$;

drop trigger if exists pipeline_nudges on public.nudges;
create trigger pipeline_nudges after insert on public.nudges
  for each row execute function public.pipeline_tg_nudges();

create or replace function public.pipeline_tg_prevues()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.recrue_evenement_noter(new.poster_id, null,
                                        case when new.statut = 'bloque' then 'relance_bloquee' else 'relance_prevue' end,
                                        coalesce(new.premier_at, now()),
                                        new.type || coalesce(' · ' || new.canal, '') || coalesce(' · ' || new.raison, ''),
                                        new.type || '|' || new.periode::text);
  return null;
exception when others then
  return null;
end;
$$;

drop trigger if exists pipeline_prevues on public.relances_prevues;
create trigger pipeline_prevues after insert on public.relances_prevues
  for each row execute function public.pipeline_tg_prevues();

-- posteur_reponses : une réponse reçue.
create or replace function public.pipeline_tg_reponses()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.recrue_evenement_noter(new.poster_id, null, 'reponse', new.recu_at,
                                        new.canal || ' · ' || coalesce(new.texte, ''), new.id::text);
  return null;
exception when others then
  return null;
end;
$$;

drop trigger if exists pipeline_reponses on public.posteur_reponses;
create trigger pipeline_reponses after insert on public.posteur_reponses
  for each row execute function public.pipeline_tg_reponses();

-- kills_auto : chaque statut (simulé, en attente, annulé, parti, erreur).
create or replace function public.pipeline_tg_kills()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and old.statut = new.statut then
    return null;
  end if;
  perform public.recrue_evenement_noter(new.poster_id, null, 'kill_' || new.statut, now(),
                                        new.etape || coalesce(' · ' || new.raison, ''), new.id::text);
  return null;
exception when others then
  return null;
end;
$$;

drop trigger if exists pipeline_kills on public.kills_auto;
create trigger pipeline_kills after insert or update of statut on public.kills_auto
  for each row execute function public.pipeline_tg_kills();

-- arrets : l'arrêt complet demandé.
create or replace function public.pipeline_tg_arrets()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.recrue_evenement_noter(new.poster_id, null, 'arret', new.created_at, new.source, new.id::text);
  return null;
exception when others then
  return null;
end;
$$;

drop trigger if exists pipeline_arrets on public.arrets;
create trigger pipeline_arrets after insert on public.arrets
  for each row execute function public.pipeline_tg_arrets();

-- ---------------------------------------------------------------------------
-- L'historique reconstitué des recrues déjà dans l'OS (cohortes des 3
-- dernières semaines et à venir) : seulement des lignes nouvelles.
-- ---------------------------------------------------------------------------
with po as (
  select pr.* from public.profiles pr
   where pr.cohorte_lundi >= (now() at time zone 'Europe/Paris')::date - 21
     and exists (select 1 from public.user_roles r where r.user_id = pr.id and r.role = 'poster')
     and not exists (select 1 from public.hub_posteurs h where h.profile_id = pr.id)
),
cpt as (
  select c.* from public.comptes c where c.poster_id in (select id from po) and c.type_compte = 'perso'
),
ev as (
  select po.id as poster_id, null::uuid as compte_id, 'offre' as type, coalesce(po.offre_acceptee_le, po.created_at) as at,
         null::text as detail, 'offre' as cle from po
  union all
  select po.id, null, 'connexion', coalesce(po.premiere_connexion_at, u.last_sign_in_at), null, 'connexion'
    from po left join auth.users u on u.id = po.id
   where coalesce(po.premiere_connexion_at, u.last_sign_in_at) is not null
  union all
  select a.poster_id, null, 'bienvenue', a.message_at, 'Upwork', 'bienvenue'
    from public.accueils a where a.poster_id in (select id from po) and a.message_at is not null
  union all
  select c.poster_id, c.id, 'deuxieme_compte', c.created_at, c.handle_tiktok, c.id::text
    from cpt c where exists (select 1 from cpt d where d.poster_id = c.poster_id and d.id <> c.id and d.created_at < c.created_at)
  union all
  select c.poster_id, c.id, 'warmup_lance', c.warmup_started_at, c.handle_tiktok, c.id::text
    from cpt c where c.warmup_started_at is not null
  union all
  select c.poster_id, c.id, 'tiktok_cree', r.premier, '@' || c.handle_tiktok, c.id::text
    from cpt c join lateral (select min(w.releve_at) as premier from public.ckd_warmup_releves w
                              where w.compte_id = c.id and w.existe) r on r.premier is not null
  union all
  select c.poster_id, c.id, 'warmup_bien_fait', r.premier, '5+ follows', c.id::text
    from cpt c join lateral (select min(w.releve_at) as premier from public.ckd_warmup_releves w
                              where w.compte_id = c.id and w.existe and coalesce(w.abonnements, 0) >= 5
                                and coalesce(w.videos, 0) = 0) r on r.premier is not null
   where c.warmup_started_at is not null
  union all
  select c.poster_id, c.id, 'premier_post', p.premier, null, c.id::text
    from cpt c join lateral (select min(coalesce(x.publie_at, x.created_at)) as premier from public.passages x
                              where x.compte_id = c.id and x.publie_url is not null) p on p.premier is not null
  union all
  select n.poster_id, n.compte_id, 'relance', n.envoye_at, n.type || ' · ' || n.canal, n.id::text
    from public.nudges n where n.poster_id in (select id from po) and n.periode is not null
  union all
  select v.poster_id, null, case when v.statut = 'bloque' then 'relance_bloquee' else 'relance_prevue' end, v.premier_at,
         v.type || coalesce(' · ' || v.canal, '') || coalesce(' · ' || v.raison, ''), v.type || '|' || v.periode::text
    from public.relances_prevues v where v.poster_id in (select id from po)
  union all
  select x.poster_id, null, 'reponse', x.recu_at, x.canal || ' · ' || coalesce(x.texte, ''), x.id::text
    from public.posteur_reponses x where x.poster_id in (select id from po)
  union all
  select k.poster_id, null, 'kill_' || k.statut, coalesce(k.annule_at, k.parti_at, k.detecte_at), k.etape, k.id::text
    from public.kills_auto k where k.poster_id in (select id from po)
  union all
  select a.poster_id, null, 'arret', a.created_at, a.source, a.id::text
    from public.arrets a where a.poster_id in (select id from po)
)
insert into public.recrue_evenements (poster_id, compte_id, type, at, detail, cle)
select poster_id, compte_id, type, at, left(detail, 500), cle from ev where at is not null
on conflict (poster_id, type, cle) do nothing;

-- ---------------------------------------------------------------------------
-- Les cartes du pipeline
-- ---------------------------------------------------------------------------
create or replace function public.pipeline_recrues()
returns table (
  carte_id          text,
  poster_id         uuid,
  compte_id         uuid,
  nom               text,
  pays              text,
  hm_id             uuid,
  hm_prenom         text,
  cohorte_lundi     date,
  deuxieme          boolean,
  handle            text,
  colonne           integer,
  colonne_depuis    timestamptz,
  etape_attendue    text,
  etat              text,
  message_at        timestamptz,
  message_canal     text,
  message_test      boolean,
  limite_at         timestamptz,
  reponse_at        timestamptz,
  reponse_extrait   text,
  kill_id           uuid,
  kill_prevu_at     timestamptz,
  pause_jusqu_au    timestamptz,
  upwork_contrat_url text,
  slack_user_id     text,
  dernier_type      text,
  dernier_at        timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_auj date := (now() at time zone 'Europe/Paris')::date;
  v_kill_h numeric := coalesce((select (valeur->>'kill_h')::numeric from public.reglages where cle = 'etapes_delais'), 48);
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return query
  with po as (
    select pr.* from public.profiles pr
     where pr.is_active and pr.cohorte_lundi >= v_auj - 7
       and exists (select 1 from public.user_roles r where r.user_id = pr.id and r.role = 'poster')
       and not exists (select 1 from public.hub_posteurs h where h.profile_id = pr.id)
  ),
  -- Une carte par recrue (son 1er compte) et une par 2e compte récent.
  cartes as (
    select po.id as poster_id, c1.id as compte_id, false as deuxieme, po.cohorte_lundi as debut
      from po
      left join lateral (select c.id from public.comptes c where c.poster_id = po.id and c.type_compte = 'perso'
                          order by c.created_at limit 1) c1 on true
    union all
    select c.poster_id, c.id, true,
           coalesce(pj.premier_jour - (extract(isodow from pj.premier_jour)::int - 1),
                    (c.warmup_ends_at at time zone 'Europe/Paris')::date)
      from public.comptes c
      join public.profiles pr on pr.id = c.poster_id and pr.is_active
      left join public.comptes_premier_jour pj on pj.compte_id = c.id
     where c.type_compte = 'perso' and c.is_active and c.created_at > now() - interval '28 days'
       and exists (select 1 from public.comptes d where d.poster_id = c.poster_id and d.id <> c.id
                     and d.type_compte = 'perso' and d.created_at < c.created_at)
       and not exists (select 1 from public.hub_posteurs h where h.profile_id = c.poster_id)
  ),
  faits as (
    select ca.*, pr.prenom, pr.nom, pr.manager_id, pr.upwork_contrat_url, pr.slack_user_id,
           c.handle_tiktok, c.pays, c.warmup_started_at,
           coalesce((select a.message_at from public.accueils a where a.poster_id = ca.poster_id and a.message_at is not null
                      order by a.message_at limit 1), pr.offre_acceptee_le, pr.created_at) as t1,
           coalesce(pr.premiere_connexion_at, u.last_sign_in_at) as t2,
           (select min(w.releve_at) from public.ckd_warmup_releves w where w.compte_id = ca.compte_id and w.existe) as t3,
           c.warmup_started_at as t4,
           (select min(w.releve_at) from public.ckd_warmup_releves w
             where w.compte_id = ca.compte_id and w.existe and coalesce(w.abonnements, 0) >= 5 and coalesce(w.videos, 0) = 0
               and c.warmup_started_at is not null and w.releve_at >= c.warmup_started_at) as t5,
           (select min(coalesce(p.publie_at, p.created_at)) from public.passages p
             where p.compte_id = ca.compte_id and p.publie_url is not null) as t6
      from cartes ca
      join public.profiles pr on pr.id = ca.poster_id
      left join auth.users u on u.id = ca.poster_id
      left join public.comptes c on c.id = ca.compte_id
  ),
  colonnes as (
    select f.*,
           case
             when f.t6 is not null then 6
             when f.deuxieme then case when f.t4 is null then 3 when f.t5 is null then 4 else 5 end
             when f.t2 is null then 1
             when f.t3 is null then 2
             when f.t4 is null then 3
             when f.t5 is null then 4
             else 5
           end as col
      from faits f
  ),
  etapes as (
    select co.*,
           case co.col when 1 then 'connexion' when 2 then 'tiktok' when 3 then 'warmup_lance'
                       when 4 then 'warmup_bien_fait' when 5 then 'lundi_soir' end as attendue,
           case co.col when 1 then co.t1 when 2 then co.t2 when 3 then coalesce(co.t3, co.t2, co.t1)
                       when 4 then co.t4 when 5 then co.t5 else co.t6 end as depuis
      from colonnes co
  ),
  suivi as (
    select e.*,
           n.envoye_at as n_at, n.canal as n_canal,
           v.premier_at as v_at, v.canal as v_canal,
           k.id as k_id, k.statut as k_statut, k.prevu_at as k_prevu,
           (select max(x.recu_at) from public.posteur_reponses x where x.poster_id = e.poster_id) as rep_at,
           (select left(x.texte, 120) from public.posteur_reponses x where x.poster_id = e.poster_id
             order by x.recu_at desc limit 1) as rep_texte,
           (select max(p.jusqu_au) from public.posteur_pauses p where p.poster_id = e.poster_id and p.jusqu_au > now()) as pause
      from etapes e
      left join lateral (select n.envoye_at, n.canal from public.nudges n
                          where n.poster_id = e.poster_id and n.type = e.attendue and n.periode = e.debut
                          order by n.envoye_at desc limit 1) n on true
      left join lateral (select v.premier_at, v.canal from public.relances_prevues v
                          where v.poster_id = e.poster_id and v.type = e.attendue and v.periode = e.debut and v.statut = 'prevu'
                          limit 1) v on true
      left join lateral (select k.id, k.statut, k.prevu_at from public.kills_auto k
                          where k.poster_id = e.poster_id and k.etape = e.attendue and k.periode = e.debut
                          limit 1) k on true
  )
  select case when s.deuxieme then s.compte_id::text else s.poster_id::text end,
         s.poster_id, s.compte_id,
         nullif(btrim(concat_ws(' ', s.prenom, s.nom)), ''),
         s.pays, s.manager_id, hm.prenom, s.debut, s.deuxieme, s.handle_tiktok,
         s.col, s.depuis, s.attendue,
         case
           when s.col = 6 then 'fait'
           when s.k_statut = 'en_attente' then 'kill'
           when coalesce(s.n_at, s.v_at) is not null and s.rep_at >= coalesce(s.n_at, s.v_at) then 'repondu'
           when coalesce(s.n_at, s.v_at) is not null then 'relance'
           else 'attente'
         end,
         coalesce(s.n_at, s.v_at), coalesce(s.n_canal, s.v_canal), s.n_at is null and s.v_at is not null,
         case when coalesce(s.n_at, s.v_at) is not null then coalesce(s.n_at, s.v_at) + make_interval(hours => v_kill_h::int) end,
         case when coalesce(s.n_at, s.v_at) is not null and s.rep_at >= coalesce(s.n_at, s.v_at) then s.rep_at end,
         case when coalesce(s.n_at, s.v_at) is not null and s.rep_at >= coalesce(s.n_at, s.v_at) then s.rep_texte end,
         case when s.k_statut = 'en_attente' then s.k_id end,
         case when s.k_statut = 'en_attente' then s.k_prevu end,
         s.pause, s.upwork_contrat_url, s.slack_user_id,
         d.type, d.at
    from suivi s
    left join public.profiles hm on hm.id = s.manager_id
    left join lateral (select ev.type, ev.at from public.recrue_evenements ev where ev.poster_id = s.poster_id
                        order by ev.at desc limit 1) d on true
   -- Le 1er jour posté sort le mardi ; les autres restent 7 jours après leur lundi.
   where (s.col = 6 and s.debut >= v_auj) or (s.col < 6 and s.debut >= v_auj - 7);
end;
$$;

revoke execute on function public.pipeline_recrues() from public, anon;
grant execute on function public.pipeline_recrues() to authenticated;

-- Les arrêtés des 7 derniers jours (Kill fait, je ne veux plus, Arrêter).
create or replace function public.pipeline_arretes()
returns table (poster_id uuid, nom text, pays text, hm_prenom text, source text, arrete_at timestamptz, statut text)
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
  select distinct on (a.poster_id) a.poster_id, nullif(btrim(concat_ws(' ', pr.prenom, pr.nom)), ''),
         (select c.pays from public.comptes c where c.poster_id = a.poster_id and c.type_compte = 'perso' order by c.created_at limit 1),
         hm.prenom, a.source, a.created_at, a.statut
    from public.arrets a
    join public.profiles pr on pr.id = a.poster_id
    left join public.profiles hm on hm.id = pr.manager_id
   where a.created_at > now() - interval '7 days'
   order by a.poster_id, a.created_at desc;
end;
$$;

revoke execute on function public.pipeline_arretes() from public, anon;
grant execute on function public.pipeline_arretes() to authenticated;

-- Le panneau d'une carte : son historique daté.
create or replace function public.pipeline_historique(p_poster uuid)
returns table (type text, at timestamptz, detail text, compte_id uuid, handle text)
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
  select e.type, e.at, e.detail, e.compte_id, c.handle_tiktok
    from public.recrue_evenements e
    left join public.comptes c on c.id = e.compte_id
   where e.poster_id = p_poster
   order by e.at desc, e.created_at desc;
end;
$$;

revoke execute on function public.pipeline_historique(uuid) from public, anon;
grant execute on function public.pipeline_historique(uuid) to authenticated;

-- « Arrêter » (panneau du pipeline, admin et Head of Ops) : la file des
-- arrêts complets (partie C, source manuel), un seul arrêt ouvert par posteur.
create or replace function public.pipeline_arreter(p_poster uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'pipeline_arreter : réservé à l''admin et au Head of Ops';
  end if;
  if exists (select 1 from public.arrets where poster_id = p_poster and statut in ('a_faire', 'en_cours')) then
    raise exception 'pipeline_arreter : un arrêt est déjà en cours pour ce posteur';
  end if;
  insert into public.arrets (poster_id, source, demande_par) values (p_poster, 'manuel', auth.uid());
end;
$$;

revoke execute on function public.pipeline_arreter(uuid) from public, anon;
grant execute on function public.pipeline_arreter(uuid) to authenticated;

notify pgrst, 'reload schema';
