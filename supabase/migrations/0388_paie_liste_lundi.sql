-- 0388 — Prompt 15, point 5 : la liste de paie prête pour lundi.
--
-- 1. Réglage `paie_bonus_premiere_semaine` (1 $) : la 1re semaine de posts
--    d'un posteur, le montant à approuver est tarif + ce bonus, comme la
--    milestone financée par la HM à l'embauche. La 1re semaine : la semaine du
--    tout premier post prévu du posteur (tous ses comptes perso, 0333).
-- 2. `paie_suivante_calc` : que faire de la milestone de la semaine d'après,
--    le même calcul que `paie_semaine_suivante` (0369), mais sur des lignes
--    passées en argument, pour servir aussi à la simulation.
-- 3. `paie_liste_v2(p_lundi, p_simulation)` : la liste de `paie_liste` (ou de
--    `paie_simuler`), groupée par HM (décision du 28/10 : plus d'équipes
--    Upwork), avec en plus : 1re semaine et son bonus, la milestone de la
--    semaine d'après (action, comptes, montant), le compte Upwork (vide pour
--    l'instant, rempli par le prompt 14 point 2).
--
-- Additive : un réglage créé s'il manque, deux fonctions nouvelles.
-- `paie_liste`, `paie_simuler`, `paie_semaine_suivante`, `paie_generer` et
-- les lignes de `paie_semaines` ne changent pas : le bonus est ajouté à la
-- lecture (un montant corrigé par Lucia reste le sien).
-- Retour arrière : drop function public.paie_liste_v2(date, boolean),
-- public.paie_suivante_calc(date, jsonb) ; delete from reglages where cle =
-- 'paie_bonus_premiere_semaine'.

insert into public.reglages (cle, valeur) values
  ('paie_bonus_premiere_semaine', to_jsonb(1))
on conflict (cle) do nothing;

-- ---------------------------------------------------------------------------
-- La milestone de la semaine d'après, sur des lignes données
--   p_lignes : [{poster_id, prevus, faits, tarif, semaine_suivante_faite_at}]
--   action   : financer | financer_double | financer_normal | ne_pas_financer
--              | deja_financee | a_voir (comme 0369)
-- ---------------------------------------------------------------------------
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
    select l.poster_id, l.prevus, l.faits, l.tarif, l.semaine_suivante_faite_at, pr.is_active
      from jsonb_to_recordset(coalesce(p_lignes, '[]'::jsonb))
           as l(poster_id uuid, prevus integer, faits integer, tarif numeric, semaine_suivante_faite_at timestamptz)
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
                                and coalesce(a.fait_at, a.prevu_at) <= b.coupure) as actif
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
             when e.n_suiv = 0 and e.kill then 'ne_pas_financer'
             when e.recree then 'financer_normal'
             when e.n_suiv >= 2 then 'financer_double'
             when e.n_suiv = 1 and (e.faits > 0 or e.prevus = 0) then 'financer'
             else 'a_voir'
           end as a,
           case
             when not e.is_active then 'desactive'
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

revoke execute on function public.paie_suivante_calc(date, jsonb) from public, anon, authenticated;
grant execute on function public.paie_suivante_calc(date, jsonb) to service_role;

-- ---------------------------------------------------------------------------
-- La liste du lundi (admin et Head of Ops), enregistrée ou simulée
-- ---------------------------------------------------------------------------
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
  upwork_compte             text
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
  with base as (
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
  suiv as (
    select s.*
      from public.paie_suivante_calc(p_lundi, (
             select coalesce(jsonb_agg(jsonb_build_object(
                      'poster_id', b.poster_id, 'prevus', b.prevus, 'faits', b.faits, 'tarif', b.tarif,
                      'semaine_suivante_faite_at', b.semaine_suivante_faite_at)), '[]'::jsonb)
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
         null::text
    from lignes l
    join public.profiles pr on pr.id = l.poster_id
    left join public.profiles hm on hm.id = pr.manager_id
    left join suiv s on s.poster_id = l.poster_id;
end;
$$;

revoke execute on function public.paie_liste_v2(date, boolean) from public, anon;
grant execute on function public.paie_liste_v2(date, boolean) to authenticated, service_role;

notify pgrst, 'reload schema';
