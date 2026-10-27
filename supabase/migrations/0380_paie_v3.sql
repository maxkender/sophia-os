-- 0380 : organisation v3, point 1 — la liste de paie de Lucia (27/10).
--
-- Une seule liste par lundi, pour la semaine qui vient de finir, regroupée par
-- équipe (une HM et sa zone, `profiles.equipe_upwork`). Lue par l'admin et le
-- Head of Ops (`paie_liste`).
--
-- Nouvelle règle de retenue, compte par compte (`paie_calculer_v3`) :
--   attendus = posts prévus de la semaine (les posts retirés par nous,
--   recréation ou report, sont effacés : ni attendus ni ratés) ;
--   faits ≥ paie.seuil_posts_complets (10), ou tous les attendus faits → plein ;
--   sinon retenue = ratés × paie.retenue_par_post (1 $) ;
--   montant du compte = tarif − retenue, jamais négatif ; 0 post : rien.
--   2 comptes : tarif × 2, chaque compte calculé séparément.
-- L'action de la ligne : payer, payer_moins, kill (arrêté : payer la dernière
-- semaine, ne pas financer, fermer le contrat), modifier (un 2e compte poste la
-- semaine suivante : financer au double), annuler (semaine déjà financée d'un
-- posteur arrêté qui n'a pas posté : demander le remboursement), rien (0 post
-- ou semaine de warm-up).
--
-- Lucia peut corriger un montant (raison obligatoire) ou retirer une ligne de
-- la liste (statut exclu + raison, jamais supprimée) ; chaque modification
-- est journalisée (`paie_modifications` : qui, quand, avant, après).
--
-- Parrainages : réglage `bonus_parrainage_actif` (false) ; à false, aucun
-- bonus de parrainage n'est calculé ni montré. Les données sont gardées.
--
-- Écritures sur l'existant, demandées par Max : `profiles.equipe_upwork`
-- (colonne neuve) prérempli pour les 9 HMs. Rien d'autre n'est modifié.
--
-- Additive : colonnes, une table, deux lignes de réglages (créées si
-- absentes), des fonctions. Retour arrière : réappliquer `paie_generer` de
-- 0361 et `bonus_calculer` / `bonus_a_venir` de 0374 ; supprimer les
-- fonctions et la table ajoutées.

-- ---------------------------------------------------------------------------
-- Équipes
-- ---------------------------------------------------------------------------
alter table public.profiles add column if not exists equipe_upwork text;

update public.profiles p
   set equipe_upwork = e.equipe
  from (values
    ('regina', 'Zone – DACH & Nordics'),
    ('rana', 'Zone – English-speaking & Netherlands'),
    ('lucia', 'Zone – Italy, Poland, Adriatic, Baltics & Japan'),
    ('sara', 'Zone – France & Belgium'),
    ('kris', 'Zone – Spain, Romania, Kazakhstan & Latin America'),
    ('amanda', 'Zone – Turkey & Israel'),
    ('olizhia', 'Zone – Czechia, Slovakia, Estonia, Bulgaria & UAE'),
    ('margherita', 'Zone – Greece'),
    ('nana', 'Zone – Hungary & Serbia')
  ) as e(prenom, equipe)
 where lower(btrim(p.prenom)) = e.prenom
   and p.equipe_upwork is null
   and coalesce(p.is_active, true)
   and exists (select 1 from public.user_roles r
                where r.user_id = p.id and r.role::text in ('hiring_manager', 'head_of_ops'));

-- ---------------------------------------------------------------------------
-- Réglages
-- ---------------------------------------------------------------------------
insert into public.reglages (cle, valeur)
values ('paie', jsonb_build_object('seuil_posts_complets', 10, 'retenue_par_post', 1))
on conflict (cle) do nothing;
insert into public.reglages (cle, valeur)
values ('bonus_parrainage_actif', 'false'::jsonb)
on conflict (cle) do nothing;

create or replace function public.paie_reglages()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'seuil_posts_complets', coalesce((v->>'seuil_posts_complets')::int, 10),
    'retenue_par_post', coalesce((v->>'retenue_par_post')::numeric, 1))
  from (select coalesce((select valeur from public.reglages where cle = 'paie'), '{}'::jsonb) as v) r;
$$;

create or replace function public.bonus_parrainage_actif()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select (valeur #>> '{}')::boolean from public.reglages where cle = 'bonus_parrainage_actif'), false);
$$;

-- ---------------------------------------------------------------------------
-- Colonnes de la liste et journal
-- ---------------------------------------------------------------------------
alter table public.paie_semaines
  add column if not exists action text,
  add column if not exists detail_comptes jsonb,
  add column if not exists montant_corrige numeric check (montant_corrige >= 0),
  add column if not exists raison_correction text,
  add column if not exists exclu boolean not null default false,
  add column if not exists exclu_raison text,
  add column if not exists corrige_par uuid,
  add column if not exists corrige_at timestamptz;

create table if not exists public.paie_modifications (
  id        uuid primary key default gen_random_uuid(),
  paie_id   uuid not null references public.paie_semaines (id) on delete cascade,
  par       uuid,
  at        timestamptz not null default now(),
  quoi      text not null check (quoi in ('montant', 'exclu')),
  avant     jsonb,
  apres     jsonb,
  raison    text
);
create index if not exists paie_modifications_paie on public.paie_modifications (paie_id, at);

alter table public.paie_modifications enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'paie_modifications'
                  and policyname = 'paie_modifications lecture admin') then
    create policy "paie_modifications lecture admin" on public.paie_modifications
      for select to authenticated using ((select public.is_admin()));
  end if;
end $$;
revoke all on public.paie_modifications from public, anon, authenticated;
grant select on public.paie_modifications to authenticated;
grant all on public.paie_modifications to service_role;

-- ---------------------------------------------------------------------------
-- Le calcul v3 (lecture seule)
-- ---------------------------------------------------------------------------
create or replace function public.paie_calculer_v3(p_lundi date)
returns table (
  poster_id      uuid,
  nb_comptes     integer,
  comptes_payes  integer,
  prevus         integer,
  faits          integer,
  manques        integer,
  tarif          numeric,
  retenue        numeric,
  montant        numeric,
  statut         text,
  raison         text,
  action         text,
  detail_comptes jsonb
)
language sql
stable
security definer
set search_path = public
as $$
  with reg as (
    select (r->>'seuil_posts_complets')::int as seuil, (r->>'retenue_par_post')::numeric as par_post
      from (select public.paie_reglages() as r) x
  ),
  bornes as (
    select (p_lundi::timestamp at time zone 'Europe/Paris') as debut,
           ((p_lundi + 7)::timestamp at time zone 'Europe/Paris') as fin,
           -- Lundi 10 h de la semaine suivante : un arrêt jusque-là vaut pour cette paie.
           (((p_lundi + 7)::timestamp + interval '10 hours') at time zone 'Europe/Paris') as coupure
  ),
  posteurs as (
    select pr.id, pr.is_active, pr.tarif_hebdo
      from public.profiles pr
     where exists (select 1 from public.user_roles r where r.user_id = pr.id and r.role = 'poster')
       and not exists (select 1 from public.hub_posteurs h where h.profile_id = pr.id)
  ),
  comptes_semaine as (
    select c.id, c.poster_id, c.handle_tiktok,
           count(p.id)::int as attendus,
           (count(p.id) filter (where p.publie_at is not null))::int as faits,
           (c.is_active
             and ((c.warmup_ends_at > b.debut and c.warmup_ends_at <= b.fin + interval '1 day')
                  or (c.warmup_ends_at is null and c.created_at < b.debut
                      and c.created_at >= b.debut - interval '21 days'))) as en_warmup
      from public.comptes c
      join posteurs po on po.id = c.poster_id
      cross join bornes b
      left join public.passages p
        on p.compte_id = c.id
       and p.date_publication_prevue between p_lundi and p_lundi + 6
       and p.statut::text <> 'brouillon'
       and not coalesce(p.est_rappel, false)
     where c.type_compte = 'perso'
     group by c.id, c.poster_id, c.handle_tiktok, c.is_active, c.created_at, c.warmup_ends_at, b.fin, b.debut
  ),
  tarifs as (
    select po.id as poster_id, coalesce(po.tarif_hebdo, public.paie_tarif_zone(po.id)) as tarif
      from posteurs po
     where po.id in (select cs.poster_id from comptes_semaine cs)
  ),
  par_compte as (
    select cs.*, t.tarif,
           greatest(cs.attendus - cs.faits, 0) as rates,
           case when cs.faits = 0 then 0
                when cs.faits >= rg.seuil or cs.faits >= cs.attendus then 0
                else greatest(cs.attendus - cs.faits, 0) * rg.par_post end as retenue_compte
      from comptes_semaine cs
      join tarifs t on t.poster_id = cs.poster_id
      cross join reg rg
  ),
  agreg as (
    select pc.poster_id,
           max(pc.tarif) as tarif,
           (count(*) filter (where pc.attendus > 0))::int as nb_comptes,
           (count(*) filter (where pc.attendus > 0 and pc.faits > 0))::int as comptes_payes,
           coalesce(sum(pc.attendus), 0)::int as prevus,
           coalesce(sum(pc.faits), 0)::int as faits,
           coalesce(sum(pc.rates), 0)::int as manques,
           coalesce(sum(pc.retenue_compte) filter (where pc.faits > 0), 0)::numeric as retenue,
           coalesce(sum(greatest(pc.tarif - pc.retenue_compte, 0)) filter (where pc.faits > 0), 0)::numeric as montant,
           bool_or(pc.en_warmup and pc.attendus = 0) as warmup,
           coalesce(jsonb_agg(jsonb_build_object(
             'compte_id', pc.id, 'handle', pc.handle_tiktok, 'attendus', pc.attendus, 'faits', pc.faits,
             'rates', pc.rates, 'retenue', pc.retenue_compte,
             'montant', case when pc.faits > 0 and pc.tarif is not null then greatest(pc.tarif - pc.retenue_compte, 0) else 0 end,
             'warmup', pc.en_warmup and pc.attendus = 0)
             order by pc.handle_tiktok) filter (where pc.attendus > 0 or (pc.en_warmup and pc.attendus = 0)), '[]'::jsonb)
             as detail
      from par_compte pc
     group by pc.poster_id
    having (count(*) filter (where pc.attendus > 0)) > 0 or bool_or(pc.en_warmup)
  ),
  etat as (
    select a.*, po.is_active,
           -- Kill (ne pas renouveler) validé : arrêt prévu ou fait d'ici lundi 10 h.
           exists (select 1 from public.ckd_arrets ar
                     join public.comptes c on c.id = ar.compte_id
                    cross join bornes b
                   where c.poster_id = a.poster_id and ar.raison = 'ne_pas_renouveler'
                     and ar.annule_at is null
                     and coalesce(ar.fait_at, ar.prevu_at) <= b.coupure) as kill,
           -- La semaine payée avait déjà été financée (« Semaine suivante faite » la semaine d'avant).
           exists (select 1 from public.paie_semaines ps
                    where ps.poster_id = a.poster_id and ps.semaine = p_lundi - 7
                      and ps.semaine_suivante_faite_at is not null) as deja_financee,
           -- Comptes qui posteront la semaine suivante (même calcul que `paie_semaine_suivante`, 0369).
           (select count(*) from public.comptes c
             where c.poster_id = a.poster_id and c.type_compte = 'perso' and c.is_active
               and coalesce((select pj.premier_jour - (extract(isodow from pj.premier_jour)::int - 1)
                               from public.comptes_premier_jour pj where pj.compte_id = c.id),
                            (c.warmup_ends_at at time zone 'Europe/Paris')::date) <= p_lundi + 7)::int as n_suiv
      from agreg a
      join posteurs po on po.id = a.poster_id
  ),
  decision as (
    select e.*,
           case
             when (e.kill or not e.is_active) and e.faits = 0 and e.deja_financee then 'annuler'
             when (e.kill or not e.is_active) then 'kill'
             when e.nb_comptes = 0 or e.faits = 0 then 'rien'
             when e.n_suiv >= 2 and e.n_suiv > e.comptes_payes then 'modifier'
             when e.retenue > 0 then 'payer_moins'
             else 'payer'
           end as action,
           array_remove(array[
             case when e.nb_comptes = 0 then 'Semaine de warm-up : rien à payer (la 1re semaine de posts le paie)' end,
             case when e.nb_comptes > 0 and e.faits = 0 then '0 post dans la semaine : rien à payer' end,
             case when e.faits > 0 and e.tarif is null then 'Tarif à renseigner (pays hors zone de paie)' end
           ], null) as liste
      from etat e
  )
  select d.poster_id, d.nb_comptes, d.comptes_payes, d.prevus, d.faits, d.manques, d.tarif,
         case when d.tarif is null then 0 else d.retenue end,
         case when d.tarif is null then 0 else d.montant end,
         case when cardinality(d.liste) > 0 and d.faits > 0 then 'a_voir' else 'ok' end,
         nullif(array_to_string(d.liste, ' · '), ''),
         d.action,
         d.detail
    from decision d;
$$;

revoke execute on function public.paie_calculer_v3(date) from public, anon, authenticated;
grant execute on function public.paie_calculer_v3(date) to service_role;

-- La génération passe au calcul v3. Une ligne payée, corrigée ou retirée par
-- Lucia garde son montant corrigé et son retrait.
create or replace function public.paie_generer(p_lundi date)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer;
begin
  if not public.paie_droit_admin() then
    raise exception 'paie_generer : réservé à l''admin';
  end if;
  if extract(isodow from p_lundi) <> 1 then
    raise exception 'paie_generer : % n''est pas un lundi', p_lundi;
  end if;

  insert into public.paie_semaines as ps
    (poster_id, semaine, nb_comptes, comptes_payes, prevus, faits, manques,
     tarif, retenue, montant, statut, raison, action, detail_comptes, calcule_at)
  select c.poster_id, p_lundi, c.nb_comptes, c.comptes_payes, c.prevus, c.faits, c.manques,
         c.tarif, c.retenue, c.montant, c.statut, c.raison, c.action, c.detail_comptes, now()
    from public.paie_calculer_v3(p_lundi) c
  on conflict (poster_id, semaine) do update
     set nb_comptes = excluded.nb_comptes,
         comptes_payes = excluded.comptes_payes,
         prevus = excluded.prevus,
         faits = excluded.faits,
         manques = excluded.manques,
         tarif = excluded.tarif,
         retenue = excluded.retenue,
         montant = excluded.montant,
         statut = excluded.statut,
         raison = excluded.raison,
         action = excluded.action,
         detail_comptes = excluded.detail_comptes,
         calcule_at = excluded.calcule_at
   where ps.paye_at is null;
  get diagnostics n = row_count;
  return n;
end;
$$;

-- ---------------------------------------------------------------------------
-- La liste (admin et Head of Ops)
-- ---------------------------------------------------------------------------
create or replace function public.paie_liste(p_lundi date)
returns table (
  id                        uuid,
  poster_id                 uuid,
  poster_nom                text,
  hm_id                     uuid,
  hm_prenom                 text,
  equipe                    text,
  contrat_url               text,
  nb_comptes                integer,
  comptes_payes             integer,
  prevus                    integer,
  faits                     integer,
  tarif                     numeric,
  retenue                   numeric,
  montant_calcule           numeric,
  montant                   numeric,
  montant_corrige           numeric,
  raison_correction         text,
  statut                    text,
  raison                    text,
  action                    text,
  detail_comptes            jsonb,
  exclu                     boolean,
  exclu_raison              text,
  paye_at                   timestamptz,
  semaine_suivante_faite_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
begin
  if coalesce(auth.role(), '') in ('anon', 'authenticated') and not public.is_admin() then
    raise exception 'paie_liste : réservé à l''admin et au Head of Ops';
  end if;
  return query
  select ps.id, ps.poster_id,
         coalesce(nullif(btrim(concat_ws(' ', pr.prenom, pr.nom)), ''), pr.email),
         pr.manager_id, hm.prenom,
         coalesce(hm.equipe_upwork, nullif(btrim(concat_ws(' ', hm.prenom, hm.nom)), '')),
         pr.upwork_contrat_url,
         ps.nb_comptes, ps.comptes_payes, ps.prevus, ps.faits, ps.tarif, ps.retenue,
         ps.montant, coalesce(ps.montant_corrige, ps.montant), ps.montant_corrige, ps.raison_correction,
         ps.statut, ps.raison,
         coalesce(ps.action, case when ps.faits = 0 then 'rien' when ps.retenue > 0 then 'payer_moins' else 'payer' end),
         coalesce(ps.detail_comptes, '[]'::jsonb), ps.exclu, ps.exclu_raison, ps.paye_at, ps.semaine_suivante_faite_at
    from public.paie_semaines ps
    join public.profiles pr on pr.id = ps.poster_id
    left join public.profiles hm on hm.id = pr.manager_id
   where ps.semaine = p_lundi;
end;
$$;

revoke execute on function public.paie_liste(date) from public, anon;
grant execute on function public.paie_liste(date) to authenticated, service_role;

-- Corriger un montant (raison obligatoire) ; null : revenir au montant calculé.
create or replace function public.paie_corriger(p_id uuid, p_montant numeric, p_raison text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  l public.paie_semaines%rowtype;
begin
  if coalesce(auth.role(), '') in ('anon', 'authenticated') and not public.is_admin() then
    raise exception 'paie_corriger : réservé à l''admin et au Head of Ops';
  end if;
  select * into l from public.paie_semaines where id = p_id for update;
  if not found then raise exception 'paie : ligne introuvable'; end if;
  if l.paye_at is not null then raise exception 'paie : ligne déjà payée'; end if;
  if p_montant is not null and (p_montant < 0 or nullif(btrim(coalesce(p_raison, '')), '') is null) then
    raise exception 'paie_corriger : montant positif et raison obligatoire';
  end if;
  insert into public.paie_modifications (paie_id, par, quoi, avant, apres, raison)
  values (p_id, auth.uid(), 'montant',
          jsonb_build_object('montant', coalesce(l.montant_corrige, l.montant), 'corrige', l.montant_corrige is not null),
          jsonb_build_object('montant', coalesce(p_montant, l.montant), 'corrige', p_montant is not null),
          nullif(btrim(coalesce(p_raison, '')), ''));
  update public.paie_semaines
     set montant_corrige = p_montant,
         raison_correction = case when p_montant is null then null else btrim(p_raison) end,
         corrige_par = auth.uid(), corrige_at = now()
   where id = p_id;
end;
$$;

-- Retirer une ligne de la liste (raison obligatoire), ou la remettre.
create or replace function public.paie_exclure(p_id uuid, p_exclu boolean, p_raison text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  l public.paie_semaines%rowtype;
begin
  if coalesce(auth.role(), '') in ('anon', 'authenticated') and not public.is_admin() then
    raise exception 'paie_exclure : réservé à l''admin et au Head of Ops';
  end if;
  select * into l from public.paie_semaines where id = p_id for update;
  if not found then raise exception 'paie : ligne introuvable'; end if;
  if p_exclu and nullif(btrim(coalesce(p_raison, '')), '') is null then
    raise exception 'paie_exclure : raison obligatoire';
  end if;
  insert into public.paie_modifications (paie_id, par, quoi, avant, apres, raison)
  values (p_id, auth.uid(), 'exclu',
          jsonb_build_object('exclu', l.exclu, 'raison', l.exclu_raison),
          jsonb_build_object('exclu', p_exclu), nullif(btrim(coalesce(p_raison, '')), ''));
  update public.paie_semaines
     set exclu = p_exclu,
         exclu_raison = case when p_exclu then btrim(p_raison) end,
         corrige_par = auth.uid(), corrige_at = now()
   where id = p_id;
end;
$$;

revoke execute on function public.paie_corriger(uuid, numeric, text), public.paie_exclure(uuid, boolean, text) from public, anon;
grant execute on function public.paie_corriger(uuid, numeric, text), public.paie_exclure(uuid, boolean, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Parrainages en pause : bonus_calculer, bonus_lister et bonus_a_venir de 0374,
-- avec la seule condition `bonus_parrainage_actif()` en plus.
-- ---------------------------------------------------------------------------
create or replace function public.bonus_calculer(p_lundi date)
returns table (
  poster_id     uuid,
  type          text,
  referral_id   uuid,
  recrue_id     uuid,
  periode_debut date,
  periode_fin   date,
  detail        text,
  quantite      integer,
  verifies      integer,
  montant       numeric
)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  r jsonb := public.bonus_reglages();
  v_debut date := p_lundi - 28;
  v_fin date := p_lundi - 1;
begin
  return query
  -- Parrainage : une seule fois par parrainage, au parrain.
  select f.referrer_id, 'parrainage'::text, f.id, f.recrue_id, v_debut, v_fin,
         format('parrainage de %s, %s semaines faites',
                coalesce(nullif(btrim(concat_ws(' ', pr.prenom, pr.nom)), ''), btrim(concat_ws(' ', f.prenom, f.nom))),
                s.n),
         s.n, null::int, (r->>'parrainage_montant')::numeric
    from public.creator_referrals f
    join public.profiles pr on pr.id = f.recrue_id
    cross join lateral (
      select public.bonus_semaines_completes(f.recrue_id, v_fin, (r->>'parrainage_posts_min_semaine')::int) as n
    ) s
   where f.statut = 'accepte'
     and f.recrue_id is not null
     and coalesce(pr.is_active, true)
     and s.n >= (r->>'parrainage_semaines_min')::int
     and (r->>'parrainage_montant')::numeric > 0
     -- Parrainages en pause (v3, 0380) : rien n'est calculé tant que le réglage est à false.
     and public.bonus_parrainage_actif()
     and not exists (select 1 from public.bonus b where b.referral_id = f.id)
  union all
  -- Comment Master : ses Done de la période qui comptent (attribués au mandat, 0373).
  select d.cm_profile_id, 'comment_master'::text, null::uuid, null::uuid, v_debut, v_fin,
         format('%s commentaires du %s au %s', count(*),
                case when extract(month from v_debut) = extract(month from v_fin)
                     then extract(day from v_debut)::int::text else public.bonus_date_courte(v_debut) end,
                public.bonus_date_courte(v_fin)),
         count(*)::int, count(*) filter (where d.verifie)::int,
         round(count(*) * (r->>'comment_master_par_commentaire')::numeric, 2)
    from public.cm_demandes_toutes(v_debut, v_fin) d
   where d.compte
     and d.cm_profile_id is not null
     and (r->>'comment_master_par_commentaire')::numeric > 0
   group by d.cm_profile_id;
end;
$$;

create or replace function public.bonus_lister(p_lundi date)
returns table (
  id            uuid,
  poster_id     uuid,
  hm_id         uuid,
  type          text,
  referral_id   uuid,
  recrue_id     uuid,
  lundi_bonus   date,
  periode_debut date,
  periode_fin   date,
  detail        text,
  quantite      integer,
  verifies      integer,
  montant       numeric,
  statut        text,
  contrat_url   text,
  paye_at       timestamptz,
  paye_par      uuid
)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
begin
  if coalesce(auth.role(), '') in ('anon', 'authenticated') and not public.is_admin() then
    raise exception 'bonus_lister : réservé à l''admin et au Head of Ops';
  end if;
  return query
  select b.id, b.poster_id, pr.manager_id, b.type, b.referral_id, b.recrue_id, b.lundi_bonus,
         b.periode_debut, b.periode_fin, b.detail, b.quantite, b.verifies, b.montant,
         case when b.statut = 'paye' then 'paye'
              when nullif(btrim(coalesce(pr.upwork_contrat_url, '')), '') is null then 'a_voir'
              else 'a_payer' end,
         pr.upwork_contrat_url, b.paye_at, b.paye_par
    from public.bonus b
    join public.profiles pr on pr.id = b.poster_id
   where b.lundi_bonus = p_lundi
     and (b.type <> 'parrainage' or public.bonus_parrainage_actif())
   order by b.type, b.montant desc;
end;
$$;

create or replace function public.bonus_a_venir()
returns table (
  poster_id   uuid,
  hm_id       uuid,
  type        text,
  detail      text,
  quantite    integer,
  montant     numeric,
  lundi_bonus date,
  -- genere : ligne déjà créée, à payer ; apercu : estimation de la période en cours.
  etat        text
)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_hm uuid;
  v_auj date := (now() at time zone 'Europe/Paris')::date;
  v_lundi date;
begin
  if coalesce(auth.role(), '') in ('anon', 'authenticated') and not public.is_admin() then
    if not public.is_hiring_manager() then
      raise exception 'bonus_a_venir : réservé à l''admin et aux HMs';
    end if;
    v_hm := auth.uid();
  end if;
  -- Le lundi bonus d'aujourd'hui est payé : l'aperçu porte sur le suivant.
  v_lundi := public.bonus_prochain_lundi(v_auj + 1);

  return query
  select b.poster_id, pr.manager_id, b.type, b.detail, b.quantite, b.montant, b.lundi_bonus, 'genere'::text
    from public.bonus b
    join public.profiles pr on pr.id = b.poster_id
   where b.statut <> 'paye'
     and (b.type <> 'parrainage' or public.bonus_parrainage_actif())
     and (v_hm is null or pr.manager_id = v_hm)
  union all
  select c.poster_id, pr.manager_id, c.type, c.detail, c.quantite, c.montant, v_lundi, 'apercu'::text
    from public.bonus_calculer(v_lundi) c
    join public.profiles pr on pr.id = c.poster_id
   where (v_hm is null or pr.manager_id = v_hm);
end;
$$;

notify pgrst, 'reload schema';
