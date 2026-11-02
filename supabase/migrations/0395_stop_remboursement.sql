-- 0395 — Chantier du 28 oct., partie F point 2 : arrêter une recrue qui
-- n'a jamais posté.
--
-- « Stop » sur la page Cohorts (cohorte_arreter, 0392) crée sa ligne dans la
-- liste de paie du lundi suivant. Jusqu'ici : « kill » (End the contract).
-- Désormais, si elle n'a jamais publié un seul post : action « annuler »
-- (0380), et la milestone à rembourser, celle de sa 1re semaine financée à
-- l'embauche (lundi de sa cohorte, tarif + bonus de la 1re semaine). La liste
-- l'écrit : « Ask for a refund (Week NN, $X) · End the contract ».
-- Une recrue arrêtée qui a déjà posté garde « kill ».
--
-- paie_liste_v2 rend 2 colonnes de plus (remboursement_semaine,
-- remboursement_montant) : la fonction est recréée. Rien d'autre ne change.
-- Additive : aucune donnée modifiée.
-- Retour arrière : recréer paie_liste_v2 de 0392.

drop function if exists public.paie_liste_v2(date, boolean);

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
  -- Arrêtés depuis la page Cohortes (0392) entre le lundi payé et le lundi suivant 10 h.
  arretes as (
    select x.poster_id,
           -- Jamais posté (aucun post publié, tous comptes) : la milestone de sa
           -- 1re semaine, financée à l'embauche, est à rembourser (28 oct., F2).
           not exists (select 1 from public.passages p
                         join public.comptes c on c.id = p.compte_id
                        where c.poster_id = x.poster_id
                          and (p.publie_at is not null or p.publie_url is not null)) as jamais_poste
      from public.recrues_rouges x
     where x.decision = 'arreter'
       and x.decision_at >= (p_lundi::timestamp at time zone 'Europe/Paris')
       and x.decision_at < (((p_lundi + 7)::timestamp + interval '10 hours') at time zone 'Europe/Paris')
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
    select null::uuid, a.poster_id, 0, 0, 0, 0, pr.tarif_hebdo, 0::numeric,
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
  ),
  remb as (
    -- La milestone à rembourser : celle de sa cohorte, au tarif + bonus de la 1re semaine (0388).
    select a.poster_id, pr.cohorte_lundi as semaine,
           coalesce(pr.tarif_hebdo, public.paie_tarif_zone(pr.id)) + v_bonus as montant
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

revoke execute on function public.paie_liste_v2(date, boolean) from public, anon;
grant execute on function public.paie_liste_v2(date, boolean) to authenticated, service_role;

notify pgrst, 'reload schema';
