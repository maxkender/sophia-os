-- 0415 — Prompt 21, parties S et B : les tarifs des contrats, la règle des 6 posts.
--
-- S. Chaque posteur est payé au tarif et au rythme de SON contrat Upwork.
--   - `upwork_jalons.jalons` : toutes les milestones de chaque contrat actif
--     relié (fonction upwork, action « jalons », dimanche 20 h et lundi 4 h 30) ;
--   - `contrats_tarifs` : le tarif déduit (_shared/tarifs.ts) : hebdo (tarif
--     par compte), Legacy (montant et durée de la période) ou à vérifier ;
--     `contrat_tarif_fixer` : l'admin fixe un tarif à la main ;
--   - `paie_tarif_contrat(poster)` et `paie_tarifs(posteurs)` : le tarif du
--     contrat à côté du tarif de zone (Payroll).
-- B. La paie de la semaine (paie_calculer_v3) :
--   - le tarif du contrat d'abord, puis tarif_hebdo, puis la zone ;
--   - un post compte s'il a son lien ; plus aucune retenue (tarif plein par
--     compte qui a posté) ;
--   - moins de `paie_minimum_posts` (6) posts avec lien sur un compte : ce
--     compte s'arrête ; tous les comptes du posteur → Kill, semaine payée,
--     rien de financé (à partir de la semaine `paie_kill6_des`) ; une pause
--     (malade, absent) dans la semaine : pas de Kill, semaine payée ;
--   - Legacy : action « legacy » (payé à la fin de sa période) ; tarif à
--     vérifier : action « a_verifier », hors de la paie automatique.
--   - La semaine suivante (paie_suivante_calc) : un 2e compte n'est financé
--     qu'après son 1er post avec lien ; un compte sous les 6 posts, jamais.
-- Réglages : paie_minimum_posts = 6, paie_auto_heure = 9, paie_kill6_des =
-- 2026-11-02, kill_moins6_texte ; paie_api.tous_des = 2026-11-02 ; « paie »
-- sans retenue_par_post ni manques_toleres.
--
-- Additive : une colonne, une table, des fonctions. Données changées : les
-- réglages ci-dessus.
-- Retour arrière : recréer paie_calculer_v3 et paie_reglages de 0393,
-- paie_suivante_calc de 0388, paie_liste_v2 de 0403 ; retirer la table, la
-- colonne et les fonctions ajoutées.

alter table public.upwork_jalons add column if not exists jalons jsonb;

create table if not exists public.contrats_tarifs (
  contrat_id    text primary key,
  rythme        text not null check (rythme in ('hebdo', 'legacy', 'a_verifier')),
  montant       numeric,
  comptes       integer not null default 1,
  tarif_compte  numeric,
  periode_jours integer,
  courant       jsonb,
  raison        text,
  lu_at         timestamptz not null default now(),
  -- Fixé à la main par l'admin (gagne sur la déduction).
  force_tarif   numeric,
  force_par     uuid references auth.users (id) on delete set null,
  force_at      timestamptz
);

comment on table public.contrats_tarifs is
  'Prompt 21, S (0415) : le tarif et le rythme de chaque contrat, déduits de ses milestones (fonction upwork, action jalons).';

alter table public.contrats_tarifs enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'contrats_tarifs'
                  and policyname = 'contrats_tarifs lecture') then
    create policy "contrats_tarifs lecture" on public.contrats_tarifs
      for select to authenticated using ((select public.is_admin()));
  end if;
end $$;
revoke all on public.contrats_tarifs from public, anon, authenticated;
grant select on public.contrats_tarifs to authenticated;
grant all on public.contrats_tarifs to service_role;

-- L'admin fixe le tarif hebdo (par compte) d'un contrat impossible à déduire.
create or replace function public.contrat_tarif_fixer(p_contrat text, p_tarif numeric)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin_strict() then
    raise exception 'contrat_tarif_fixer : réservé à l''admin' using errcode = '42501';
  end if;
  if p_tarif is not null and (p_tarif < 1 or p_tarif > 100) then
    raise exception 'Tarif hors bornes (1 à 100 $)';
  end if;
  insert into public.contrats_tarifs (contrat_id, rythme, raison, force_tarif, force_par, force_at)
  values (p_contrat, 'a_verifier', 'fixé à la main', p_tarif, auth.uid(), now())
  on conflict (contrat_id) do update set force_tarif = excluded.force_tarif, force_par = excluded.force_par, force_at = now();
end;
$$;

revoke execute on function public.contrat_tarif_fixer(text, numeric) from public, anon;
grant execute on function public.contrat_tarif_fixer(text, numeric) to authenticated;

-- Le tarif hebdo d'un compte du posteur, selon son contrat (null : pas de contrat hebdo connu).
create or replace function public.paie_tarif_contrat(p_poster uuid)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(ct.force_tarif, case when ct.rythme = 'hebdo' then ct.tarif_compte end)
    from public.profiles pr
    join public.contrats_tarifs ct on ct.contrat_id = pr.upwork_contract_id
   where pr.id = p_poster;
$$;

-- Le rythme du contrat du posteur : hebdo, legacy, a_verifier (fixé à la main = hebdo) ; null sans contrat lu.
create or replace function public.paie_rythme_contrat(p_poster uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case when ct.force_tarif is not null then 'hebdo' else ct.rythme end
    from public.profiles pr
    join public.contrats_tarifs ct on ct.contrat_id = pr.upwork_contract_id
   where pr.id = p_poster;
$$;

-- Payroll : tarif du contrat et tarif de zone de chaque posteur.
create or replace function public.paie_tarifs(p_posters uuid[])
returns table (poster_id uuid, contrat_id text, tarif_zone numeric, tarif_contrat numeric, rythme text,
               montant numeric, comptes integer, periode_jours integer, raison text, courant jsonb, force boolean, lu_at timestamptz)
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
  select pr.id, pr.upwork_contract_id, public.paie_tarif_zone(pr.id),
         coalesce(ct.force_tarif, case when ct.rythme = 'hebdo' then ct.tarif_compte end),
         case when ct.force_tarif is not null then 'hebdo' else ct.rythme end,
         ct.montant, ct.comptes, ct.periode_jours, ct.raison, ct.courant, ct.force_tarif is not null, ct.lu_at
    from public.profiles pr
    left join public.contrats_tarifs ct on ct.contrat_id = pr.upwork_contract_id
   where pr.id = any (p_posters);
end;
$$;

revoke execute on function public.paie_tarifs(uuid[]) from public, anon;
grant execute on function public.paie_tarifs(uuid[]) to authenticated;

-- ---------------------------------------------------------------------------
-- Réglages
-- ---------------------------------------------------------------------------
insert into public.reglages (cle, valeur) values
  ('paie_minimum_posts', to_jsonb(6)),
  ('paie_auto_heure', to_jsonb(9)),
  ('paie_kill6_des', to_jsonb('2026-11-02'::text)),
  ('kill_moins6_texte', to_jsonb('Hi {prenom}, last week you posted {n} times out of 14, below our minimum of 6. Your week is paid today, and we''re ending our collaboration. Thank you for your time.'::text))
on conflict (cle) do nothing;

update public.reglages set valeur = valeur - 'retenue_par_post' - 'manques_toleres'
 where cle = 'paie' and jsonb_typeof(valeur) = 'object';

update public.reglages set valeur = jsonb_set(valeur, '{tous_des}', to_jsonb('2026-11-02'::text))
 where cle = 'paie_api' and jsonb_typeof(valeur) = 'object';

-- Les nouveaux réglages de paie : admin seulement (0412).
create or replace function public.reglage_admin_seulement(p_cle text)
returns boolean
language sql
immutable
as $$
  select p_cle = any (array['automation_pause', 'accueil_auto', 'relances_auto', 'lundi_message_auto', 'lundi_soir_auto',
                            'kill_auto', 'arret_auto', 'reponses_auto', 'rappels_reprise_le', 'faq_automatique',
                            'kill_message_auto', 'paie_api', 'paie_minimum_posts', 'paie_auto_heure', 'paie_kill6_des',
                            'paie_plafond_ligne', 'paie_plafond_jour'])
      or p_cle like '%texte%';
$$;

create or replace function public.paie_reglages()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'seuil_posts_complets', coalesce((v->>'seuil_posts_complets')::int, 10),
    'minimum_posts', coalesce((select (r.valeur #>> '{}')::int from public.reglages r where r.cle = 'paie_minimum_posts'), 6),
    'kill6_des', coalesce((select (r.valeur #>> '{}')::date from public.reglages r where r.cle = 'paie_kill6_des'), date '2026-11-02'))
  from (select coalesce((select valeur from public.reglages where cle = 'paie'), '{}'::jsonb) as v) r;
$$;

-- ---------------------------------------------------------------------------
-- La paie de la semaine
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
    select (r->>'minimum_posts')::int as minimum,
           -- La règle des 6 posts (Kill) vaut à partir de cette semaine-là.
           p_lundi >= (r->>'kill6_des')::date as kill6
      from (select public.paie_reglages() as r) x
  ),
  bornes as (
    select (p_lundi::timestamp at time zone 'Europe/Paris') as debut,
           ((p_lundi + 7)::timestamp at time zone 'Europe/Paris') as fin,
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
           -- Un post compte s'il a son lien (« No link = not paid »).
           (count(p.id) filter (where p.publie_url is not null))::int as faits,
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
    select po.id as poster_id,
           -- Le tarif du contrat gagne (prompt 21, S) ; la zone ne sert qu'aux nouvelles offres.
           coalesce(public.paie_tarif_contrat(po.id), po.tarif_hebdo, public.paie_tarif_zone(po.id)) as tarif,
           public.paie_rythme_contrat(po.id) as rythme,
           exists (select 1 from public.posteur_pauses pp cross join bornes b
                    where pp.poster_id = po.id and pp.debut < b.fin and pp.jusqu_au > b.debut) as pause
      from posteurs po
     where po.id in (select cs.poster_id from comptes_semaine cs)
  ),
  par_compte as (
    select cs.*, t.tarif, t.rythme, t.pause,
           greatest(cs.attendus - cs.faits, 0) as rates,
           (rg.kill6 and cs.attendus > 0 and cs.faits < rg.minimum and not t.pause) as moins6
      from comptes_semaine cs
      join tarifs t on t.poster_id = cs.poster_id
      cross join reg rg
  ),
  agreg as (
    select pc.poster_id,
           max(pc.tarif) as tarif,
           max(pc.rythme) as rythme,
           bool_or(pc.pause) as pause,
           (count(*) filter (where pc.attendus > 0))::int as nb_comptes,
           -- Payé : chaque compte qui a posté (tarif plein, plus de retenue) ; en pause, chaque compte prévu.
           (count(*) filter (where pc.attendus > 0 and (pc.faits > 0 or pc.pause)))::int as comptes_payes,
           coalesce(sum(pc.attendus), 0)::int as prevus,
           coalesce(sum(pc.faits), 0)::int as faits,
           coalesce(sum(pc.rates), 0)::int as manques,
           (count(*) filter (where pc.attendus > 0 and pc.moins6))::int as comptes_moins6,
           coalesce(sum(pc.tarif) filter (where pc.attendus > 0 and (pc.faits > 0 or pc.pause)), 0)::numeric as montant,
           bool_or(pc.en_warmup and pc.attendus = 0) as warmup,
           coalesce(jsonb_agg(jsonb_build_object(
             'compte_id', pc.id, 'handle', pc.handle_tiktok, 'attendus', pc.attendus, 'faits', pc.faits,
             'rates', pc.rates, 'retenue', 0, 'moins6', pc.moins6,
             'montant', case when (pc.faits > 0 or pc.pause) and pc.tarif is not null then pc.tarif else 0 end,
             'warmup', pc.en_warmup and pc.attendus = 0)
             order by pc.handle_tiktok) filter (where pc.attendus > 0 or (pc.en_warmup and pc.attendus = 0)), '[]'::jsonb)
             as detail
      from par_compte pc
     group by pc.poster_id
    having (count(*) filter (where pc.attendus > 0)) > 0 or bool_or(pc.en_warmup)
  ),
  etat as (
    select a.*, po.is_active,
           exists (select 1 from public.ckd_arrets ar
                     join public.comptes c on c.id = ar.compte_id
                    cross join bornes b
                   where c.poster_id = a.poster_id and ar.raison = 'ne_pas_renouveler'
                     and ar.annule_at is null
                     and coalesce(ar.fait_at, ar.prevu_at) >= b.debut
                     and coalesce(ar.fait_at, ar.prevu_at) <= b.coupure) as kill,
           exists (select 1 from public.paie_semaines ps
                    where ps.poster_id = a.poster_id and ps.semaine = p_lundi - 7
                      and ps.semaine_suivante_faite_at is not null) as deja_financee,
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
             when (e.kill or not e.is_active) and e.faits = 0 and not e.pause and e.deja_financee then 'annuler'
             when (e.kill or not e.is_active) and e.faits = 0 and not e.pause then 'rien'
             when (e.kill or not e.is_active) then 'kill'
             -- Tous les comptes sous les 6 posts avec lien : Kill, la semaine payée.
             when e.nb_comptes > 0 and e.comptes_moins6 >= e.nb_comptes then 'kill'
             when e.nb_comptes = 0 or (e.faits = 0 and not e.pause) then 'rien'
             when e.rythme = 'legacy' then 'legacy'
             when e.rythme = 'a_verifier' then 'a_verifier'
             when e.n_suiv >= 2 and e.n_suiv > e.comptes_payes then 'modifier'
             else 'payer'
           end as action,
           array_remove(array[
             case when e.nb_comptes = 0 then 'Semaine de warm-up : rien à payer (la 1re semaine de posts le paie)' end,
             case when e.nb_comptes > 0 and e.faits = 0 and not e.pause then '0 post avec lien dans la semaine : rien à payer' end,
             case when e.faits > 0 and e.tarif is null then 'Tarif à renseigner (pays hors zone de paie)' end,
             case when e.nb_comptes > 0 and e.comptes_moins6 >= e.nb_comptes and e.is_active and not e.kill
                  then 'Moins de 6 posts avec lien : Kill, semaine payée' end,
             case when e.comptes_moins6 > 0 and e.comptes_moins6 < e.nb_comptes
                  then 'Un compte sous les 6 posts : ce compte s''arrête, semaine suivante au tarif simple' end,
             case when e.pause then 'Pause (malade, absent) cette semaine : pas de Kill, semaine payée' end,
             case when e.rythme = 'legacy' then 'Contrat Legacy : payé à la fin de sa période' end,
             case when e.rythme = 'a_verifier' then 'Tarif du contrat à vérifier : hors paie automatique' end
           ], null) as liste
      from etat e
  )
  select d.poster_id, d.nb_comptes, d.comptes_payes, d.prevus, d.faits, d.manques, d.tarif,
         0::numeric,
         case when d.tarif is null then 0 else d.montant end,
         case when (d.faits > 0 and d.tarif is null) or d.rythme = 'a_verifier' then 'a_voir' else 'ok' end,
         nullif(array_to_string(d.liste, ' · '), ''),
         d.action,
         d.detail
    from decision d;
$$;

-- La semaine suivante : un 2e compte financé après son 1er post avec lien ; jamais un compte sous les 6 posts ni un Kill.
create or replace function public.paie_suivante_calc(p_lundi date, p_lignes jsonb)
returns table (poster_id uuid, action text, comptes integer, montant numeric, raison text)
language sql
stable
security definer
set search_path = public
as $$
  with bornes as (
    select p_lundi + 7 as suiv,
           (p_lundi::timestamp at time zone 'Europe/Paris') as debut,
           -- Lundi 10 h de la semaine suivante : un arrêt jusque-là, la milestone n'est pas financée.
           (((p_lundi + 7)::timestamp + interval '10 hours') at time zone 'Europe/Paris') as coupure
  ),
  lignes as (
    select l.poster_id, l.prevus, l.faits, l.tarif, l.semaine_suivante_faite_at, pr.is_active,
           coalesce(l.action, '') as action_paie, coalesce(l.moins6, '[]'::jsonb) as moins6
      from jsonb_to_recordset(coalesce(p_lignes, '[]'::jsonb))
           as l(poster_id uuid, prevus integer, faits integer, tarif numeric, semaine_suivante_faite_at timestamptz,
                action text, moins6 jsonb)
      join public.profiles pr on pr.id = l.poster_id
  ),
  cpt as (
    select c.id, c.poster_id,
           coalesce((select pj.premier_jour - (extract(isodow from pj.premier_jour)::int - 1)
                       from public.comptes_premier_jour pj where pj.compte_id = c.id),
                    (c.warmup_ends_at at time zone 'Europe/Paris')::date) as debut,
           c.is_active
             and not exists (select 1 from public.ckd_arrets a cross join bornes b
                              where a.compte_id = c.id and a.annule_at is null
                                and coalesce(a.fait_at, a.prevu_at) <= b.coupure)
             -- Prompt 21, B9 : un 2e compte n'est financé qu'après son 1er post avec lien.
             -- (le 1er compte ACTIF : un compte recréé remplace l'ancien).
             and (c.id = (select d.id from public.comptes d where d.poster_id = c.poster_id and d.type_compte = 'perso'
                           and d.is_active order by d.created_at limit 1)
                  or exists (select 1 from public.passages p where p.compte_id = c.id and p.publie_url is not null))
             -- Prompt 21, B1 : un compte sous les 6 posts s'arrête.
             and not exists (select 1 from lignes l, jsonb_array_elements_text(l.moins6) m
                              where l.poster_id = c.poster_id and m = c.id::text) as actif
      from public.comptes c
     where c.type_compte = 'perso'
       and c.poster_id in (select l.poster_id from lignes l)
  ),
  etat as (
    select l.*,
           (select count(*) from cpt cross join bornes b
             where cpt.poster_id = l.poster_id and cpt.actif
               and cpt.debut is not null and cpt.debut <= b.suiv)::int as n_suiv,
           exists (select 1 from public.ckd_arrets a
                     join public.comptes c on c.id = a.compte_id
                    cross join bornes b
                    where c.poster_id = l.poster_id and a.raison = 'ne_pas_renouveler'
                      and a.annule_at is null
                      and coalesce(a.fait_at, a.prevu_at) >= b.debut
                      and coalesce(a.fait_at, a.prevu_at) <= b.coupure) as kill,
           exists (select 1 from public.ckd_recreations r cross join bornes b
                    where r.poster_id = l.poster_id
                      and r.created_at >= b.debut and r.created_at <= b.coupure) as recree
      from lignes l
  ),
  decision as (
    select e.*,
           case
             when not e.is_active then 'ne_pas_financer'
             -- Kill (samedi, ou moins de 6 posts) : la semaine est payée, rien n'est financé.
             when e.action_paie = 'kill' then 'ne_pas_financer'
             when e.n_suiv = 0 and e.kill then 'ne_pas_financer'
             when e.recree then 'financer_normal'
             when e.n_suiv >= 2 then 'financer_double'
             when e.n_suiv = 1 and (e.faits > 0 or e.prevus = 0) then 'financer'
             else 'a_voir'
           end as a,
           case
             when not e.is_active then 'desactive'
             when e.action_paie = 'kill' then 'kill'
             when e.n_suiv = 0 and e.kill then 'kill'
             when e.recree or e.n_suiv >= 1 and (e.faits > 0 or e.prevus = 0) then null
             when e.n_suiv = 0 then 'aucun_compte'
             else 'zero_post'
           end as r
      from etat e
  )
  select d.poster_id,
         case when d.a = 'ne_pas_financer' and d.semaine_suivante_faite_at is not null
              then 'deja_financee' else d.a end,
         case when d.a = 'financer_normal' then 1 else d.n_suiv end,
         case when d.a in ('financer', 'financer_double', 'financer_normal')
              then d.tarif * (case when d.a = 'financer_normal' then 1 else d.n_suiv end) end,
         d.r
    from decision d;
$$;

create or replace function public.paie_liste_v2(p_lundi date, p_simulation boolean default false)
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
  semaine_suivante_faite_at timestamptz,
  premiere_semaine          boolean,
  bonus                     numeric,
  suivante_action           text,
  suivante_comptes          integer,
  suivante_montant          numeric,
  suivante_raison           text,
  upwork_compte             text,
  remboursement_semaine     date,
  remboursement_montant     numeric
)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_bonus numeric;
begin
  if coalesce(auth.role(), '') in ('anon', 'authenticated') and not public.is_admin() then
    raise exception 'paie_liste_v2 : réservé à l''admin et au Head of Ops';
  end if;
  if extract(isodow from p_lundi) <> 1 then
    raise exception 'paie_liste_v2 : % n''est pas un lundi', p_lundi;
  end if;
  select case when jsonb_typeof(r.valeur) = 'number' then (r.valeur #>> '{}')::numeric end
    into v_bonus
    from public.reglages r where r.cle = 'paie_bonus_premiere_semaine';
  v_bonus := coalesce(v_bonus, 1);

  return query
  with calcule as (
    select ps.id, ps.poster_id, ps.nb_comptes, ps.comptes_payes, ps.prevus, ps.faits, ps.tarif, ps.retenue,
           ps.montant, ps.montant_corrige, ps.raison_correction, ps.statut, ps.raison,
           coalesce(ps.action, case when ps.faits = 0 then 'rien' when ps.retenue > 0 then 'payer_moins' else 'payer' end)
             as action,
           coalesce(ps.detail_comptes, '[]'::jsonb) as detail_comptes, ps.exclu, ps.exclu_raison, ps.paye_at,
           ps.semaine_suivante_faite_at
      from public.paie_semaines ps
     where ps.semaine = p_lundi and not p_simulation
    union all
    select null::uuid, c.poster_id, c.nb_comptes, c.comptes_payes, c.prevus, c.faits, c.tarif, c.retenue,
           c.montant, null::numeric, null::text, c.statut, c.raison, c.action, c.detail_comptes,
           false, null::text, null::timestamptz, null::timestamptz
      from public.paie_calculer_v3(p_lundi) c
     where p_simulation
  ),
  -- Arrêtés (page Cohortes, 0392, et file des arrêts, 0403) entre le lundi payé et le lundi suivant 10 h.
  arretes as (
    select x.poster_id,
           -- Jamais posté (aucun post publié, tous comptes) : la milestone de sa
           -- 1re semaine, financée à l'embauche, est à rembourser (28 oct., F2).
           not exists (select 1 from public.passages p
                         join public.comptes c on c.id = p.compte_id
                        where c.poster_id = x.poster_id
                          and (p.publie_at is not null or p.publie_url is not null)) as jamais_poste
      from (
        select x.poster_id, x.decision_at as le
          from public.recrues_rouges x
         where x.decision = 'arreter'
        union all
        -- Système du 2 nov. (0403) : la file des arrêts complets (Kill à 48 h,
        -- « je ne veux plus », Kill du samedi), sauf un contrat déjà fermé par l'API.
        select ar.poster_id, ar.created_at
          from public.arrets ar
         where not exists (select 1 from jsonb_array_elements(ar.etapes) e
                            where e->>'action' = 'fermeture' and e->>'statut' = 'fait')
      ) x
     where x.le >= (p_lundi::timestamp at time zone 'Europe/Paris')
       and x.le < (((p_lundi + 7)::timestamp + interval '10 hours') at time zone 'Europe/Paris')
     group by x.poster_id
  ),
  base as (
    select c.id, c.poster_id, c.nb_comptes, c.comptes_payes, c.prevus, c.faits, c.tarif, c.retenue,
           c.montant, c.montant_corrige, c.raison_correction, c.statut, c.raison,
           case when c.poster_id in (select a.poster_id from arretes a where a.jamais_poste) then 'annuler'
                when c.poster_id in (select a.poster_id from arretes a) then 'kill'
                else c.action end as action,
           c.detail_comptes, c.exclu, c.exclu_raison, c.paye_at, c.semaine_suivante_faite_at
      from calcule c
    union all
    select null::uuid, a.poster_id, 0, 0, 0, 0, coalesce(public.paie_tarif_contrat(pr.id), pr.tarif_hebdo), 0::numeric,
           0::numeric, null::numeric, null::text, 'ok'::text, null::text,
           case when a.jamais_poste then 'annuler' else 'kill' end, '[]'::jsonb,
           false, null::text, null::timestamptz, null::timestamptz
      from arretes a
      join public.profiles pr on pr.id = a.poster_id
     where a.poster_id not in (select c.poster_id from calcule c)
  ),
  suiv as (
    select s.*
      from public.paie_suivante_calc(p_lundi, (
             select coalesce(jsonb_agg(jsonb_build_object(
                      'poster_id', b.poster_id, 'prevus', b.prevus, 'faits', b.faits, 'tarif', b.tarif,
                      'semaine_suivante_faite_at', b.semaine_suivante_faite_at,
                      -- 0415 : Kill (pas de financement) et comptes sous les 6 posts.
                      'action', b.action,
                      'moins6', (select coalesce(jsonb_agg(d->>'compte_id'), '[]'::jsonb)
                                   from jsonb_array_elements(b.detail_comptes) d where (d->>'moins6')::boolean))), '[]'::jsonb)
               from base b)) s
  ),
  premier as (
    select co.poster_id, min(pj.premier_jour) as jour
      from public.comptes co
      join public.comptes_premier_jour pj on pj.compte_id = co.id
     where co.type_compte = 'perso'
       and co.poster_id in (select b.poster_id from base b)
     group by co.poster_id
  ),
  lignes as (
    select b.*,
           coalesce(pm.jour between p_lundi and p_lundi + 6, false) as premiere,
           case when pm.jour between p_lundi and p_lundi + 6 and b.faits > 0 and b.tarif is not null
                     and b.action in ('payer', 'payer_moins', 'modifier', 'kill')
                then v_bonus else 0 end as bonus
      from base b
      left join premier pm on pm.poster_id = b.poster_id
  ),
  remb as (
    -- La milestone à rembourser : celle de sa cohorte, au tarif + bonus de la 1re semaine (0388).
    select a.poster_id, pr.cohorte_lundi as semaine,
           coalesce(public.paie_tarif_contrat(pr.id), pr.tarif_hebdo, public.paie_tarif_zone(pr.id)) + v_bonus as montant
      from arretes a
      join public.profiles pr on pr.id = a.poster_id
     where a.jamais_poste
  )
  select l.id, l.poster_id,
         coalesce(nullif(btrim(concat_ws(' ', pr.prenom, pr.nom)), ''), pr.email),
         pr.manager_id, hm.prenom,
         -- Groupée par HM (28/10) : son nom, plus l'équipe Upwork.
         nullif(btrim(concat_ws(' ', hm.prenom, hm.nom)), ''),
         pr.upwork_contrat_url,
         l.nb_comptes, l.comptes_payes, l.prevus, l.faits, l.tarif, l.retenue,
         l.montant + l.bonus, coalesce(l.montant_corrige, l.montant + l.bonus), l.montant_corrige, l.raison_correction,
         l.statut, l.raison, l.action, l.detail_comptes, l.exclu, l.exclu_raison, l.paye_at, l.semaine_suivante_faite_at,
         l.premiere, l.bonus,
         s.action, s.comptes, s.montant, s.raison,
         null::text,
         rb.semaine, rb.montant
    from lignes l
    join public.profiles pr on pr.id = l.poster_id
    left join public.profiles hm on hm.id = pr.manager_id
    left join suiv s on s.poster_id = l.poster_id
    left join remb rb on rb.poster_id = l.poster_id;
end;
$$;

-- Les milestones de tous les contrats relus le dimanche 20 h et le lundi 4 h 30
-- (heure de Paris), avant la liste de 6 h : clonés du cron upwork-verifier.
do $$
declare
  v_cmd text;
begin
  select regexp_replace(command, '"action"\s*:\s*"verifier"', '"action":"jalons"') into v_cmd
    from cron.job where jobname = 'upwork-verifier';
  if v_cmd is null or v_cmd not like '%"action":"jalons"%' then
    raise notice 'jalons : cron upwork-verifier introuvable, crons non créés';
    return;
  end if;
  if not exists (select 1 from cron.job where jobname = 'jalons-dimanche') then
    perform cron.schedule('jalons-dimanche', '0 19 * * 0', v_cmd);
  end if;
  if not exists (select 1 from cron.job where jobname = 'jalons-lundi') then
    perform cron.schedule('jalons-lundi', '30 3 * * 1', v_cmd);
  end if;
end $$;

notify pgrst, 'reload schema';
