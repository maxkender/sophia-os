-- 0716 : URGENT (Max, 14/11) : la liste du samedi (semaine_comptes) dépassait le délai (17 s pour 620 comptes) :
-- « canceling statement due to statement timeout », 0 compte affiché.
-- Cause : pour chaque compte et chaque jour, 3 sous-requêtes recomptaient tous les passages de la semaine
-- (≈ 13 000 parcours de la CTE p). Ici les passages de la semaine sont comptés une seule fois, par compte et par jour,
-- puis joints. Même signature, mêmes colonnes, mêmes valeurs (vérifié ligne à ligne contre l'ancienne version).

create or replace function public.semaine_comptes(p_lundi date, p_jusqu date)
 returns table(compte_id uuid, handle text, poster_id uuid, poster_nom text, prenom text, hm_id uuid, hm_nom text, pays text, cohorte_lundi date, premier_post date, jours jsonb, prevus_passes integer, lien_passes integer, lien_aujourdhui integer, lien_total integer, prevus_semaine integer, vues jsonb, shadowban text, liens_introuvables integer, canal text, nudge_envoye_at timestamp with time zone, nudge_en_file boolean, ckd_jeudi_id uuid, ckd_jeudi_action text, ckd_jeudi_decision text, ckd_samedi_id uuid, ckd_samedi_action text, ckd_samedi_regle text, ckd_samedi_decision text, ckd_samedi_donnees jsonb, recreer text, autres_comptes integer)
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
#variable_conflict use_column
begin
  if not (public.is_admin() or coalesce(auth.jwt() ->> 'role', '') = 'service_role') then
    raise exception 'semaine_comptes : réservé à l''admin et au Head of Ops' using errcode = '42501';
  end if;
  return query
  with c as (
    select c.id, c.handle_tiktok, c.poster_id, c.pays, pr.prenom, pr.nom, pr.manager_id, pr.cohorte_lundi,
           pr.slack_user_id, pr.upwork_contract_id
      from public.comptes c
      join public.profiles pr on pr.id = c.poster_id and pr.is_active
     where c.is_active and c.type_compte = 'perso'
       and exists (select 1 from public.user_roles ur where ur.user_id = c.poster_id and ur.role = 'poster')
       and not exists (select 1 from public.hub_posteurs h where h.profile_id = c.poster_id and h.exclu_suivi /* 0575 */)
  ),
  mardi as (
    select distinct dc.poster_id from public.debut_choix dc where dc.lundi = p_lundi and dc.choix = 'mardi'
  ),
  p as materialized (
    select pa.compte_id, pa.date_publication_prevue as jour, pa.publie_url, pa.vues, pa.resolution_statut
      from public.passages pa
     where pa.compte_id in (select c.id from c)
       and pa.date_publication_prevue between p_lundi and p_lundi + 6
       and pa.statut::text <> 'brouillon' and not coalesce(pa.est_rappel, false)
  ),
  pj as (
    select p.compte_id, p.jour, count(*)::int as n, (count(*) filter (where p.publie_url is not null))::int as nl
      from p group by p.compte_id, p.jour
  ),
  pc as (
    select p.compte_id,
           (count(*) filter (where not (p.jour = p_lundi and p.publie_url is null and m.poster_id is not null)))::int as prevus_semaine,
           (count(*) filter (where p.resolution_statut = 'introuvable'))::int as introuvables
      from p
      join c on c.id = p.compte_id
      left join mardi m on m.poster_id = c.poster_id
     group by p.compte_id
  ),
  j as (
    select c.id as compte_id, d::date as jour,
           case when d::date = p_lundi and m.poster_id is not null then coalesce(pj.nl, 0) else coalesce(pj.n, 0) end as prevus,
           coalesce(pj.nl, 0) as lien
      from c cross join generate_series(p_lundi, p_jusqu, interval '1 day') d
      left join mardi m on m.poster_id = c.poster_id
      left join pj on pj.compte_id = c.id and pj.jour = d::date
  ),
  agg as (
    select j.compte_id,
           jsonb_agg(jsonb_build_object('jour', j.jour, 'prevus', j.prevus, 'lien', j.lien) order by j.jour) as jours,
           coalesce(sum(j.prevus) filter (where j.jour < p_jusqu), 0)::int as prevus_passes,
           coalesce(sum(j.lien) filter (where j.jour < p_jusqu), 0)::int as lien_passes,
           coalesce(sum(j.lien) filter (where j.jour = p_jusqu), 0)::int as lien_aujourdhui,
           coalesce(sum(j.lien), 0)::int as lien_total
      from j group by j.compte_id
  )
  select c.id, c.handle_tiktok, c.poster_id,
         nullif(btrim(concat_ws(' ', c.prenom, c.nom)), ''), c.prenom,
         c.manager_id, nullif(btrim(concat_ws(' ', hm.prenom, hm.nom)), ''), c.pays, c.cohorte_lundi,
         (select min(pa.date_publication_prevue) from public.passages pa where pa.compte_id = c.id and pa.publie_url is not null),
         a.jours, a.prevus_passes, a.lien_passes, a.lien_aujourdhui, a.lien_total,
         coalesce(pc.prevus_semaine, 0),
         coalesce((select jsonb_agg(jsonb_build_object('jour', x.date_publication_prevue, 'vues', x.vues, 'url', x.publie_url)
                                    order by x.date_publication_prevue desc)
                     from (select pa.date_publication_prevue, pa.vues, pa.publie_url, pa.id
                             from public.passages pa
                            where pa.compte_id = c.id and pa.publie_url is not null
                            order by pa.date_publication_prevue desc, pa.id desc limit 3) x), '[]'::jsonb),
         (select s.type from public.ckd_shadowban s
           where s.compte_id = c.id and s.recreation_at is null and s.nouveau_compte_id is null limit 1),
         coalesce(pc.introuvables, 0),
         case when c.slack_user_id is not null then 'slack' when c.upwork_contract_id is not null then 'upwork' end,
         (select max(n.envoye_at) from public.nudges n
           where n.poster_id = c.poster_id and n.type = 'jeudi' and n.periode = p_lundi
             and (n.slack_erreur is null or coalesce(array_length(n.canaux, 1), 0) > 0)),
         exists (select 1 from public.relances_prevues rp
                  where rp.poster_id = c.poster_id and rp.type = 'jeudi' and rp.periode = p_lundi
                    and rp.statut = 'prevu' and rp.valide_at is not null),
         cj.id, cj.action, cj.decision,
         cs.id, cs.action, cs.regle, cs.decision, cs.donnees,
         case when cj.id is not null and cj.action = 'recreer' and cj.decision is null then 'ckd'
              when exists (select 1 from public.ckd_shadowban s where s.compte_id = c.id
                            and s.recreation_at is null and s.nouveau_compte_id is null) then 'shadowban' end,
         (select count(*) from public.comptes c2 where c2.poster_id = c.poster_id and c2.is_active and c2.id <> c.id)::int
    from c
    join agg a on a.compte_id = c.id
    left join pc on pc.compte_id = c.id
    left join public.profiles hm on hm.id = c.manager_id
    left join lateral (
      select cp.id, cp.action, cp.decision from public.ckd_propositions cp
        join public.ckd_controles ct on ct.id = cp.controle_id
       where cp.compte_id = c.id and ct.type = 'jeudi' and ct.jour between p_lundi and p_lundi + 6
       order by (cp.action = 'recreer') desc, cp.created_at desc limit 1) cj on true
    left join lateral (
      select cp.id, cp.action, cp.regle, cp.decision, cp.donnees from public.ckd_propositions cp
        join public.ckd_controles ct on ct.id = cp.controle_id
       where cp.compte_id = c.id and ct.type = 'samedi' and ct.jour between p_lundi and p_lundi + 6
       order by (cp.action = 'ne_pas_renouveler') desc, (cp.action = 'doubler') desc, cp.created_at desc limit 1) cs on true;
end;
$function$;
