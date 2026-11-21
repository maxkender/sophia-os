-- 0807 : jours comptés comme faits quand la panne est de notre côté (21/11, Max, règle 3). Additif.
-- passages.credite_raison : le passage compte comme fait (payé, compté dans les posts de la semaine, jamais un jour
-- manqué ni une raison de kill ou de refus de doublement). jours_credites : le journal (posteur, jour, raison).
-- Les fonctions de comptage traitent « publie_url is not null » comme « publie_url is not null or credite_raison is
-- not null » (définitions ci-dessous, reprises de la base ; les anciennes sont gardées dans fonctions_sauvegarde).
-- Le 20/11 : 131 posts arrivés en retard (créés après 06:00 UTC) et non publiés, 73 posteurs, crédités (OK de Max).

alter table public.passages add column if not exists credite_raison text;
create table if not exists public.jours_credites (
  id uuid primary key default gen_random_uuid(),
  poster_id uuid not null references public.profiles(id),
  jour date not null,
  raison text not null,
  cree_at timestamptz not null default now(),
  unique (poster_id, jour)
);
alter table public.jours_credites enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'jours_credites' and policyname = 'jours_credites_admin') then
    create policy jours_credites_admin on public.jours_credites for select to authenticated using (public.is_admin() or poster_id = auth.uid());
  end if;
end $$;
create table if not exists public.fonctions_sauvegarde (nom text, migration text, def text, at timestamptz default now());

with cible as (
  select p.id, c.poster_id from public.passages p join public.comptes c on c.id = p.compte_id
   where c.type_compte = 'perso' and not coalesce(p.est_rappel, false) and p.statut <> 'brouillon'
     and p.date_publication_prevue = '2026-11-20' and p.created_at >= '2026-11-20 06:00+00' and p.publie_url is null
     and p.credite_raison is null),
u as (update public.passages p set credite_raison = 'Panne du 20/11 (posts arrivés en retard) : jour compté comme fait'
        from cible where p.id = cible.id returning cible.poster_id)
insert into public.jours_credites (poster_id, jour, raison)
select distinct poster_id, date '2026-11-20', 'Panne du 20/11 (posts arrivés en retard)' from u
on conflict (poster_id, jour) do nothing;

-- Le calendrier du posteur : un post crédité s'affiche comme fait.
create or replace view public.posts_poster as
 SELECT p.id, c.poster_id, p.compte_id, c.type_compte, c.persona_nom, c.handle_tiktok, c.langue, p.date_publication_prevue, p.type, p.statut,
    p.musique_url, p.musique_titre, p.musique_plateforme,
    coalesce(p.publie_at, case when pas.credite_raison is not null then pas.created_at end) as publie_at,
    p.publie_url, p.recharges_createur, COALESCE(s.titre, cont.titre) AS sujet_titre, p.created_at
   FROM posts p
     JOIN comptes c ON c.id = p.compte_id
     LEFT JOIN sujets s ON s.id = p.sujet_id
     LEFT JOIN passages pas ON pas.post_id = p.id
     LEFT JOIN contenus cont ON cont.id = pas.contenu_id
  WHERE p.pipeline_statut = 'done'::text AND COALESCE(p.est_test, false) = false AND (c.poster_id = (( SELECT auth.uid() AS uid)) OR ( SELECT is_admin() AS is_admin));

-- Les fonctions de comptage (état en base après le 21/11).
CREATE OR REPLACE FUNCTION public.ckd_calculer(p_type text, p_jour date)
 RETURNS TABLE(regle text, action text, compte_id uuid, poster_id uuid, hm_id uuid, pays text, langue text, label_id uuid, application text, donnees jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
#variable_conflict use_column
declare
  v_lundi     date;
  v_vendredi  date;
  v_min       integer;
begin
  if coalesce(auth.role(), '') in ('anon', 'authenticated') and not public.is_admin() then
    raise exception 'ckd_calculer : réservé à l''admin';
  end if;
  if p_type not in ('jeudi', 'samedi') then
    raise exception 'ckd_calculer : type inconnu %', p_type;
  end if;

  -- Samedi : la semaine du lundi au vendredi. Jeudi : jusqu'au mercredi.
  v_lundi := p_jour - case p_type when 'samedi' then 5 else 3 end;
  v_vendredi := p_jour - 1;
  select coalesce((r.valeur #>> '{}')::integer, 5) into v_min
    from public.ckd_reglage('comptes_min_mediane', null, null) r;
  v_min := coalesce(v_min, 5);

  return query
  with
  base as (
    select c.id, c.poster_id, c.pays, c.langue, c.handle_tiktok, c.parts_applications,
           coalesce(c.non_renouveler, false) as non_renouveler,
           pr.manager_id as hm_id,
           exists (select 1 from public.hub_posteurs h where h.profile_id = c.poster_id and h.exclu_suivi /* 0575 */) as ruul
      from public.comptes c
      join public.profiles pr on pr.id = c.poster_id
     where c.is_active
       and coalesce(pr.is_active, true)
       and c.type_compte = 'perso'
       and not coalesce(c.ugcv, false)
       and not coalesce(c.videos_uniquement, false)
  ),
  -- Le label du compte : celui de la majorité de ses posts sur 28 jours.
  lab as (
    select b.id as compte_id,
           (select cl.label_id
              from public.compte_labels cl
              left join lateral (
                select count(*) as n
                  from public.passages p2
                  join public.contenu_labels x on x.contenu_id = p2.contenu_id and x.label_id = cl.label_id
                 where p2.compte_id = cl.compte_id
                   and p2.date_publication_prevue between v_vendredi - 27 and v_vendredi
              ) k on true
             where cl.compte_id = b.id
             order by k.n desc, cl.label_id
             limit 1) as label_id
      from base b
  ),
  cles as (
    select unnest(array[
      'seuil_bon_post', 'vues_min_j2', 'seuil_mort', 'morts_premiere_semaine', 'age_min_heures',
      'part_mediane_pays', 'anciennete_semaines', 'posts_min_anciens', 'bons_posts_doubler',
      'manques_max_doubler', 'doublement_autorise', 'manques_absent']) as cle
  ),
  reg as (
    select b.id as compte_id,
           jsonb_object_agg(k.cle, jsonb_build_object('v', r.valeur, 's', r.source)) as r
      from base b
      join lab l on l.compte_id = b.id
      cross join cles k
      left join lateral public.ckd_reglage(k.cle, b.pays, l.label_id) r on true
     group by b.id
  ),
  cpt as (
    select b.*, l.label_id, g.r,
           coalesce((g.r->'age_min_heures'->>'v')::numeric, 10) as age_min,
           coalesce((g.r->'seuil_mort'->>'v')::numeric, 50) as seuil_mort,
           coalesce((g.r->'seuil_bon_post'->>'v')::numeric, cm.seuil_vues, 5000) as seuil_bon,
           case when g.r->'seuil_bon_post'->>'v' is not null then g.r->'seuil_bon_post'->>'s'
                when cm.seuil_vues is not null then 'comment_masters'
                else 'repli' end as seuil_bon_source,
           public.application_principale(b.parts_applications) as application
      from base b
      join lab l on l.compte_id = b.id
      join reg g on g.compte_id = b.id
      left join lateral (
        select m.seuil_vues from public.comment_master_pays m
         where m.pays = b.pays order by (m.langue = b.langue) desc limit 1
      ) cm on true
  ),
  pp as (
    select x.compte_id, x.date_publication_prevue as jour, x.vues,
           (x.publie_url is not null and x.vues is not null and x.stats_maj_at is not null
             and x.stats_maj_at - coalesce(x.tiktok_publie_at, x.publie_at)
                 >= c.age_min::double precision * interval '1 hour') as mesure
      from public.passages x
      join cpt c on c.id = x.compte_id
     where not coalesce(x.est_rappel, false)
       and x.statut <> 'brouillon'
       and x.date_publication_prevue <= v_vendredi
  ),
  j0 as (select pp.compte_id, min(pp.jour) as j0 from pp group by pp.compte_id),
  -- Médianes de référence : posts relevés des 28 jours qui finissent le vendredi.
  m28 as (
    select pp.compte_id, pp.vues, c.pays, c.langue, c.label_id
      from pp join cpt c on c.id = pp.compte_id
     where pp.mesure and pp.jour between v_vendredi - 27 and v_vendredi
  ),
  med_pays as (
    select m.pays, percentile_cont(0.5) within group (order by m.vues) as med,
           count(distinct m.compte_id) as n
      from m28 m group by m.pays
  ),
  med_pays_label as (
    select m.pays, m.label_id, percentile_cont(0.5) within group (order by m.vues) as med,
           count(distinct m.compte_id) as n
      from m28 m group by m.pays, m.label_id
  ),
  med_langue as (
    select m.langue, percentile_cont(0.5) within group (order by m.vues) as med,
           count(distinct m.compte_id) as n
      from m28 m group by m.langue
  ),
  med_flotte as (
    select percentile_cont(0.5) within group (order by m.vues) as med,
           count(distinct m.compte_id) as n
      from m28 m
  ),
  ref as (
    select c.id as compte_id,
           case
             when (c.r->'part_mediane_pays'->>'s') in ('label', 'pays_label') and mpl.n >= v_min
               then jsonb_build_object('valeur', round(mpl.med), 'source', 'pays_label', 'n_comptes', mpl.n)
             when mp.n >= v_min
               then jsonb_build_object('valeur', round(mp.med), 'source', 'pays', 'n_comptes', mp.n)
             when ml.n >= v_min
               then jsonb_build_object('valeur', round(ml.med), 'source', 'langue', 'n_comptes', ml.n)
             else jsonb_build_object('valeur', round(mf.med), 'source', 'flotte', 'n_comptes', mf.n)
           end as mediane_ref
      from cpt c
      left join med_pays mp on mp.pays = c.pays
      left join med_pays_label mpl on mpl.pays = c.pays and mpl.label_id is not distinct from c.label_id
      left join med_langue ml on ml.langue = c.langue
      cross join med_flotte mf
  ),
  elig as (
    select c.*, j.j0
      from cpt c join j0 j on j.compte_id = c.id
     where not c.non_renouveler and not c.ruul
  ),
  -- Posteurs déjà recréés une fois : plus jamais « Recréer » (0368).
  recrees as (select distinct x.poster_id from public.ckd_recreations x),
  -- Les comptes de la page Shadowban (0362), sans nouveau compte en cours.
  sb as (
    select s.compte_id, s.type from public.ckd_shadowban s
     where s.recreation_at is null and s.nouveau_compte_id is null
  ),
  cand as (
    -- Jeudi : les nouveaux (premier post il y a 3 à 9 jours), sur leurs posts ;
    -- et les comptes de la page Shadowban, sur leurs 7 derniers jours.
    select e.id, 'jeudi'::text as regle,
           case when e.j0 between p_jour - 9 and p_jour - 3
                then public.ckd_detail(e.id, e.j0, v_vendredi, e.age_min, e.seuil_mort, e.seuil_bon, 4)
                else public.ckd_detail(e.id, v_vendredi - 6, v_vendredi, e.age_min, e.seuil_mort, e.seuil_bon)
           end as d
      from elig e
     where p_type = 'jeudi'
       and (e.j0 between p_jour - 9 and p_jour - 3 or exists (select 1 from sb where sb.compte_id = e.id))
    union all
    select e.id, 'premiere_semaine',
           public.ckd_detail(e.id, e.j0, e.j0 + 4, e.age_min, e.seuil_mort, e.seuil_bon)
      from elig e
     where p_type = 'samedi' and e.j0 between v_lundi - 6 and v_lundi
    union all
    select e.id, 'anciens',
           public.ckd_detail(e.id, v_vendredi - 27, v_vendredi, e.age_min, e.seuil_mort, e.seuil_bon)
      from elig e
     where e.j0 <= v_vendredi - (7 * coalesce((e.r->'anciennete_semaines'->>'v')::integer, 4) - 1)
    union all
    -- Absent : la semaine du lundi au vendredi, pour tout compte parti au plus
    -- tard le lundi (nouveau ou ancien).
    select e.id, 'absent',
           public.ckd_detail(e.id, v_lundi, v_vendredi, e.age_min, e.seuil_mort, e.seuil_bon)
      from elig e
     where p_type = 'samedi' and e.j0 <= v_lundi
    union all
    select e.id, 'doubler',
           public.ckd_detail(e.id, v_lundi, v_vendredi, e.age_min, e.seuil_mort, e.seuil_bon)
      from elig e
     where p_type = 'samedi'
       and e.j0 <= v_lundi - 7  -- 0559 : 2 semaines complètes au moins
       and not exists (select 1 from public.posteur_messages pm
                        where pm.poster_id = e.poster_id and pm.type = 'double' and pm.created_at > p_jour - 28
                          and pm.visible_de < now() + interval '1 year'
                          and (pm.reponse = 'non' or (pm.reponse is null and pm.expire_at <= now())))
       and coalesce((select sum(rp.proceeds) from public.rc_proceeds_pays_semaine rp
                      where rp.pays = upper(e.pays) and rp.semaine > v_lundi - 28 and rp.semaine <= v_lundi)
                    / nullif((select count(*) from public.comptes c4 where c4.is_active and upper(c4.pays) = upper(e.pays)), 0), 0) >= 50
       and coalesce((e.r->'doublement_autorise'->>'v')::boolean, true)
       and (select count(*) from public.comptes c2 where c2.poster_id = e.poster_id and c2.is_active) = 1
  ),
  mot as (
    select k.*, c.r,
           array_remove(array[
             case when (k.d->>'mesures')::int >= 3
                   and coalesce((k.d->'haut'->>'vues')::numeric, 0)
                       < coalesce((c.r->'vues_min_j2'->>'v')::numeric, 200) then 'reveil' end,
             case when (k.d->>'morts')::int >= 1
                   and not ((k.d->>'mesures')::int >= 3
                            and coalesce((k.d->'haut'->>'vues')::numeric, 0)
                                < coalesce((c.r->'vues_min_j2'->>'v')::numeric, 200)) then 'surveiller' end,
             case when (k.d->>'attendus')::int > (k.d->>'publies')::int then 'discipline' end
           ], null) as motifs
      from cand k join cpt c on c.id = k.id
     where k.regle = 'jeudi'
  ),
  dec as (
    select k.id, k.regle, k.d,
           case k.regle
             -- Jeudi (0368) : « Recréer » pré-choisi pour un compte sans réveil
             -- (motif reveil) ou signalé shadowban, sauf posteur déjà recréé ;
             -- « Nudge » sinon, dès qu'il y a un motif ou un signalement.
             when 'jeudi' then
               case when not exists (select 1 from recrees r where r.poster_id = c.poster_id)
                     and ('reveil' = any(m.motifs)
                          or exists (select 1 from sb where sb.compte_id = k.id and sb.type = 'shadowban'))
                    then 'recreer'
                    when cardinality(m.motifs) > 0 or exists (select 1 from sb where sb.compte_id = k.id)
                    then 'nudge' end
             when 'premiere_semaine' then
               case when (k.d->>'morts')::int >= coalesce((c.r->'morts_premiere_semaine'->>'v')::numeric, 3)
                    then 'ne_pas_renouveler' end
             -- Anciens (0368) : « Recréer » le jeudi, la 1re fois seulement ; un
             -- posteur déjà recréé passe au samedi en « Kill ». Les arrêts restent
             -- le samedi.
             when 'anciens' then
               case when (k.d->>'mesures')::int >= coalesce((c.r->'posts_min_anciens'->>'v')::numeric, 20)
                     and coalesce((k.d->'haut'->>'vues')::numeric, 0) < c.seuil_bon
                     and (k.d->>'mediane')::numeric
                         < coalesce((c.r->'part_mediane_pays'->>'v')::numeric, 0.6) * (rf.mediane_ref->>'valeur')::numeric
                    then case
                           when p_type = 'jeudi'
                                and not exists (select 1 from recrees r where r.poster_id = c.poster_id)
                             then 'recreer'
                           when p_type = 'samedi'
                                and exists (select 1 from recrees r where r.poster_id = c.poster_id)
                             then 'ne_pas_renouveler'
                         end end
             when 'absent' then
               case when (k.d->>'attendus')::int >= 1
                     and (k.d->>'attendus')::int - (k.d->>'publies')::int
                         >= coalesce((c.r->'manques_absent'->>'v')::numeric, 4)
                    then 'ne_pas_renouveler' end
             when 'doubler' then
               case when (k.d->>'bons')::int >= coalesce((c.r->'bons_posts_doubler'->>'v')::numeric, 3)
                     and (k.d->>'attendus')::int >= 1
                     and (k.d->>'attendus')::int - (k.d->>'publies')::int
                         <= coalesce((c.r->'manques_max_doubler'->>'v')::numeric, 1)
                    then 'doubler' end
           end as action,
           m.motifs
      from cand k
      join cpt c on c.id = k.id
      join ref rf on rf.compte_id = k.id
      left join mot m on m.id = k.id and m.regle = k.regle
  ),
  retenus as (
    select d.*,
           bool_or(d.action in ('recreer', 'ne_pas_renouveler')) over (partition by d.id) as a_un_kill,
           bool_or(d.regle = 'anciens' and d.action = 'recreer') over (partition by d.id) as recree_anciens
      from dec d
     where d.action is not null
       -- « Garder » ou « Pas maintenant » pour la même règle : rien pendant 14 jours.
       and not exists (
         select 1 from public.ckd_propositions o
          where o.compte_id = d.id and o.regle = d.regle
            and ((o.decision = 'garder'
                  and (d.action <> 'ne_pas_renouveler'
                       or exists (select 1 from public.passages px
                                   where px.compte_id = d.id and (px.publie_url is not null or px.credite_raison is not null)
                                     and px.date_publication_prevue > (o.decision_at at time zone 'Europe/Paris')::date)))
                 or (o.decision = 'pas_maintenant' and d.action <> 'doubler'))
            and o.decision_at > p_jour - 14)
  )
  select t.regle, t.action, c.id, c.poster_id, c.hm_id, c.pays, c.langue, c.label_id, c.application,
         jsonb_build_object(
           'handle', c.handle_tiktok,
           'abonnes', (select cp.abonnes from public.compte_profils cp where cp.compte_id = c.id),
           'j0', j.j0,
           'periode', t.d,
           'motifs', to_jsonb(coalesce(t.motifs, array[]::text[])),
           'shadowban', (select sb.type from sb where sb.compte_id = t.id),
           'mediane_ref', rf.mediane_ref,
           'seuil_bon_post', jsonb_build_object('valeur', c.seuil_bon, 'source', c.seuil_bon_source),
           'reglages', c.r,
           'recreations', (select count(*) from public.ckd_recreations x where x.poster_id = c.poster_id),
           'autres_comptes', coalesce((
             select jsonb_agg(jsonb_build_object('id', c2.id, 'handle', c2.handle_tiktok, 'actif', c2.is_active)
                              order by c2.is_active desc, c2.created_at)
               from public.comptes c2
              where c2.poster_id = c.poster_id and c2.id <> c.id), '[]'::jsonb)
         )
    from retenus t
    join cpt c on c.id = t.id
    join j0 j on j.compte_id = t.id
    join ref rf on rf.compte_id = t.id
   -- Un posteur qui sort aussi en kill n'est pas proposé au doublement ; un
   -- compte recréé par la règle anciens n'a pas aussi une ligne du jeudi.
   where not (t.regle = 'doubler' and (t.a_un_kill or p_type = 'samedi' /* 0756 */))
     and not (t.regle = 'jeudi' and t.recree_anciens);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.ckd_manques_semaine(p_jour date)
 RETURNS TABLE(compte_id uuid, handle text, poster_id uuid, hm_id uuid, pays text, prevus bigint, publies bigint, jours jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
#variable_conflict use_column
begin
  if not public.is_admin() then
    raise exception 'ckd_manques_semaine : réservé à l''admin';
  end if;
  return query
  select c.id, c.handle_tiktok, c.poster_id, pr.manager_id, c.pays,
         count(p.id),
         count(p.id) filter (where (p.publie_url is not null or p.credite_raison is not null)),
         coalesce(jsonb_agg(p.date_publication_prevue order by p.date_publication_prevue)
                    filter (where (p.publie_url is null and p.credite_raison is null)), '[]'::jsonb)
    from public.comptes c
    join public.profiles pr on pr.id = c.poster_id
    join public.passages p on p.compte_id = c.id
                          and not coalesce(p.est_rappel, false)
                          and p.statut <> 'brouillon'
                          and p.date_publication_prevue between p_jour - 5 and p_jour - 1
   where c.is_active
     and coalesce(pr.is_active, true)
     and c.type_compte = 'perso'
     and not coalesce(c.ugcv, false)
     and not coalesce(c.videos_uniquement, false)
     and not coalesce(c.non_renouveler, false)
     and not exists (select 1 from public.hub_posteurs h where h.profile_id = c.poster_id and h.exclu_suivi /* 0575 */)
   group by c.id, c.handle_tiktok, c.poster_id, pr.manager_id, c.pays
  having count(p.id) filter (where (p.publie_url is null and p.credite_raison is null)) > 0;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.dimanche_kill(p_poster uuid, p_lundi date, p_code text, p_detail text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_montant numeric;
begin
  if not public.is_admin_strict() then
    raise exception 'dimanche_kill : réservé à l''admin' using errcode = '42501';
  end if;
  if p_code not in ('stop', 'retrait', 'rien_fait', 'autre') then
    raise exception 'raison obligatoire';
  end if;
  if p_code = 'autre' and coalesce(btrim(p_detail), '') = '' then
    raise exception 'raison « autre » : le détail est obligatoire';
  end if;
  if exists (select 1 from public.passages p join public.comptes c on c.id = p.compte_id
              where c.poster_id = p_poster and (p.publie_at is not null or (p.publie_url is not null or p.credite_raison is not null))) then
    raise exception 'cette recrue a déjà posté : son Kill se décide le samedi';
  end if;
  select nullif(regexp_replace(coalesce(m ->> 'depot', ''), '[^0-9.]', '', 'g'), '')::numeric into v_montant
    from public.profiles pr
    join public.upwork_jalons j on j.contrat_id = pr.upwork_contract_id,
         jsonb_array_elements(case when jsonb_typeof(j.jalons) = 'array' then j.jalons else '[]'::jsonb end) m
   where pr.id = p_poster and m ->> 'etat' in ('Active', 'Submitted')
   order by (m ->> 'sequence')::int nulls last
   limit 1;
  insert into public.dimanche_kills (poster_id, lundi, code, detail, montant, decide_par)
  values (p_poster, p_lundi, p_code, nullif(btrim(p_detail), ''), v_montant, auth.uid())
  on conflict (poster_id, lundi) do update
    set code = excluded.code, detail = excluded.detail, montant = excluded.montant, decide_par = excluded.decide_par, decide_at = now();
  perform public.samedi_arreter_recrue(p_poster);
  perform public.recrue_evenement_noter(p_poster, null, 'kill_dimanche', now(),
    'Sunday check: Kill (' || p_code || coalesce(' : ' || nullif(btrim(p_detail), ''), '') || ')', 'kill_dimanche:' || p_lundi::text);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.hm_calendrier(p_lundi date, p_hm uuid DEFAULT NULL::uuid)
 RETURNS TABLE(compte_id uuid, poster_id uuid, hm_id uuid, handle text, pays text, langue text, is_active boolean, warmup_lance boolean, seuil_mort numeric, mediane_pays numeric, posts jsonb, diagnostic jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
#variable_conflict use_column
declare
  v_hm uuid := p_hm;
  v_auj date := (now() at time zone 'Europe/Paris')::date;
begin
  if coalesce(auth.role(), '') in ('anon', 'authenticated') and not public.is_admin() then
    if not public.is_hiring_manager() then
      raise exception 'hm_calendrier : réservé à l''admin et aux HMs';
    end if;
    v_hm := auth.uid();
  end if;
  if extract(isodow from p_lundi) <> 1 then
    raise exception 'hm_calendrier : % n''est pas un lundi', p_lundi;
  end if;

  return query
  with
  med as (select * from public.hm_mediane_pays(least(v_auj - 1, p_lundi + 6))),
  cpt as (
    select m.compte_id, c.poster_id, pr.manager_id as hm_id, c.handle_tiktok, c.pays, c.langue,
           c.is_active, c.warmup_started_at is not null as warmup_lance,
           coalesce((select (r.valeur #>> '{}')::numeric
                       from public.ckd_reglage('seuil_mort', c.pays, l.label_id) r), 50) as seuil_mort,
           coalesce(mp.mediane, mf.mediane) as mediane_pays,
           exists (select 1 from public.ckd_shadowban s
                    where s.compte_id = c.id and s.type = 'shadowban' and s.recreation_at is null) as signale
      from public.ckd_cohorte_comptes(p_lundi) m
      join public.comptes c on c.id = m.compte_id
      join public.profiles pr on pr.id = c.poster_id
      cross join lateral (
        select (select cl.label_id from public.compte_labels cl
                  where cl.compte_id = c.id order by cl.label_id limit 1) as label_id
      ) l
      left join med mp on mp.pays = c.pays
      left join med mf on mf.pays is null
     where v_hm is null or pr.manager_id = v_hm
  ),
  px as (
    select x.compte_id, x.date_publication_prevue as jour, coalesce(x.publie_url, case when x.credite_raison is not null then 'credit:jour-compte' end) as url, x.vues,
           coalesce(x.tiktok_publie_at, x.publie_at) as publie_at,
           row_number() over (partition by x.compte_id, x.date_publication_prevue
                              order by coalesce(x.tiktok_publie_at, x.publie_at, x.created_at), x.created_at) as rang,
           (x.publie_url is not null and x.vues is not null and x.stats_maj_at is not null
             and x.stats_maj_at - coalesce(x.tiktok_publie_at, x.publie_at) >= interval '10 hours') as mesure,
           extract(epoch from (now() - coalesce(x.tiktok_publie_at, x.publie_at))) / 3600 as age_h
      from public.passages x
      join cpt c on c.compte_id = x.compte_id
     where not coalesce(x.est_rappel, false)
       and x.statut <> 'brouillon'
       and x.date_publication_prevue between p_lundi - 7 and p_lundi + 6
  ),
  per as (
    select c.compte_id,
           count(p.*) filter (where p.jour < v_auj)::int as attendus,
           count(p.*) filter (where p.jour < v_auj and p.url is not null)::int as publies,
           count(p.*) filter (where p.jour < v_auj and p.mesure and p.vues < c.seuil_mort)::int as morts,
           percentile_cont(0.5) within group (order by p.vues) filter (where p.jour < v_auj and p.mesure) as mediane,
           coalesce(jsonb_agg(jsonb_build_object('jour', p.jour))
                      filter (where p.jour < v_auj and p.url is null), '[]'::jsonb) as liens_manquants
      from cpt c
      left join px p on p.compte_id = c.compte_id and p.jour >= p_lundi
     group by c.compte_id
  )
  select c.compte_id, c.poster_id, c.hm_id, c.handle_tiktok, c.pays, c.langue, c.is_active,
         c.warmup_lance, c.seuil_mort, c.mediane_pays,
         coalesce((
           select jsonb_agg(jsonb_build_object(
                    'jour', p.jour, 'rang', p.rang, 'url', p.url, 'vues', p.vues,
                    'publie_at', p.publie_at, 'mesure', p.mesure)
                  order by p.jour, p.rang)
             from px p where p.compte_id = c.compte_id and p.jour >= p_lundi), '[]'::jsonb),
         public.ckd_diagnostic(jsonb_build_object(
           'periode', jsonb_build_object(
             'attendus', r.attendus, 'publies', r.publies, 'morts', r.morts,
             'mediane', round(r.mediane::numeric), 'liens_manquants', r.liens_manquants,
             'posts', coalesce((
               select jsonb_agg(jsonb_build_object('jour', p.jour, 'vues', p.vues, 'mesure', p.mesure, 'age_h', p.age_h))
                 from px p where p.compte_id = c.compte_id and p.jour < v_auj), '[]'::jsonb)),
           'mediane_ref', jsonb_build_object('valeur', c.mediane_pays),
           'seuil_mort', c.seuil_mort,
           'shadowban', case when c.signale then true end))
    from cpt c
    join per r on r.compte_id = c.compte_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.inactifs_detecter(p_jour date DEFAULT ((now() AT TIME ZONE 'Europe/Paris'::text))::date)
 RETURNS TABLE(poster_id uuid, categorie text, canal_paie text, prenom text, signe_le date, debut date, connecte boolean, prevus integer, comptes_sans_posts uuid[], contrat_id text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with base as (
    select pr.id, pr.prenom, coalesce(pr.canal_paie, 'upwork') as canal, pr.upwork_contract_id,
           coalesce(pr.offre_acceptee_le, pr.created_at)::date as signe,
           (pr.premiere_connexion_at is not null or u.last_sign_in_at is not null
              or exists (select 1 from auth.sessions s where s.user_id = pr.id)) as co,
           coalesce(pr.cohorte_lundi,
                    (select min(c.premiers_posts_le) from public.comptes c where c.poster_id = pr.id),
                    (select min(pa.date_publication_prevue) from public.passages pa join public.comptes c on c.id = pa.compte_id
                      where c.poster_id = pr.id)) as debut
      from public.profiles pr
      join public.user_roles ur on ur.user_id = pr.id and ur.role = 'poster'
      left join auth.users u on u.id = pr.id
     where pr.is_active
       and ((coalesce(pr.canal_paie, 'upwork') = 'upwork' and coalesce(pr.upwork_contract_id, '') <> '')
            or (pr.canal_paie = 'ruul' and (pr.ruul_email is not null or pr.site_application_id is not null)))
       and not public.ne_plus_contacter_bloque(pr.id)
       and not exists (select 1 from public.contrats_test t where t.retire_at is null
                         and (t.poster_id = pr.id or t.contrat_id = pr.upwork_contract_id))
  ),
  x as (
    select b.*,
           (select count(*) from public.passages pa join public.comptes c on c.id = pa.compte_id
             where c.poster_id = b.id and pa.date_publication_prevue <= p_jour)::int as nb_prevus,
           exists (select 1 from public.passages pa join public.comptes c on c.id = pa.compte_id
                    where c.poster_id = b.id
                      and ((pa.publie_url is not null or pa.credite_raison is not null) or pa.publie_at is not null or pa.lien_confirme_at is not null)) as a_publie,
           exists (select 1 from public.passages pa join public.comptes c on c.id = pa.compte_id
                    where c.poster_id = b.id
                      and coalesce(pa.publie_at, pa.lien_confirme_at, pa.tiktok_publie_at) >= p_jour - 14) as publie_14j,
           exists (select 1 from public.comptes c where c.poster_id = b.id and c.is_active
                    and c.warmup_started_at is not null and coalesce(c.warmup_ends_at, now() + interval '1 day') > now()) as en_warmup,
           array(select c.id from public.comptes c
                  where c.poster_id = b.id and c.is_active and c.warmup_started_at is not null
                    and c.warmup_ends_at is not null and c.warmup_ends_at <= now()
                    and not exists (select 1 from public.passages pa where pa.compte_id = c.id)) as sans_posts
      from base b
  ),
  y as (
    select x.*, (x.debut is not null and p_jour between x.debut - 7 and x.debut + 6) as protege from x
  )
  select y.id,
         case
           when not y.co and y.signe <= p_jour - 14 then 'A'
           when y.co and y.debut <= p_jour - 14 and not y.a_publie and cardinality(y.sans_posts) > 0 then 'alerte'
           when y.co and y.debut <= p_jour - 14 and not y.a_publie and y.nb_prevus > 0 then 'B'
         end,
         y.canal, y.prenom, y.signe, y.debut, y.co, y.nb_prevus, y.sans_posts, y.upwork_contract_id
    from y
   where not y.publie_14j and not y.en_warmup and not y.protege
     and ((not y.co and y.signe <= p_jour - 14)
          or (y.co and y.debut <= p_jour - 14 and not y.a_publie and (y.nb_prevus > 0 or cardinality(y.sans_posts) > 0)));
$function$
;

CREATE OR REPLACE FUNCTION public.jeudi_doubles_calculer_v2(p_jeudi date)
 RETURNS TABLE(compte_id uuid, poster_id uuid, star boolean, vues_med integer, viraux integer, bons integer, posts integer, meilleur_url text, meilleur_vues integer, label_propose_id uuid, rang integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with b as (
    select p_jeudi - 8 as d1, p_jeudi - 2 as d2,
           coalesce((select (r.valeur #>> '{}')::integer from public.ckd_reglages r where r.cle = 'seuil_mort' and r.pays is null limit 1), 50) as mort
  ),
  c as (
    select c.id, c.poster_id, c.langue, c.application_id, (c.classement::text = 'star') as star
      from public.comptes c
      join public.profiles pr on pr.id = c.poster_id
      cross join b
     where c.is_active and coalesce(c.type_compte, 'perso') = 'perso' and pr.is_active
       and not coalesce(c.non_renouveler, false)
       -- Un seul compte actif : une proposition par posteur, jamais de 3e compte.
       and (select count(*) from public.comptes o where o.poster_id = c.poster_id and o.is_active
             and coalesce(o.type_compte, 'perso') = 'perso') = 1
       -- Plus en warm-up, et au moins 2 semaines de posts.
       and c.warmup_ends_at is not null and c.warmup_ends_at <= now()
       and coalesce((select pj.premier_jour from public.comptes_premier_jour pj where pj.compte_id = c.id),
                    (c.warmup_ends_at at time zone 'Europe/Paris')::date) <= p_jeudi - 17
       -- Pas en pause, pas de demande d'arrêt ouverte.
       and not exists (select 1 from public.posteur_pauses pp where pp.poster_id = c.poster_id
                         and pp.debut <= (p_jeudi + 4)::timestamptz and coalesce(pp.jusqu_au, 'infinity'::timestamptz) >= (p_jeudi - 7)::timestamptz)
       and not exists (select 1 from public.demandes_arret d where d.poster_id = c.poster_id and d.decision is null)
       -- Pays où le doublement est autorisé (réglage du pays, sinon le réglage général).
       and coalesce((select (r.valeur #>> '{}')::boolean from public.ckd_reglages r where r.cle = 'doublement_autorise' and r.pays = c.pays limit 1),
                    (select (r.valeur #>> '{}')::boolean from public.ckd_reglages r where r.cle = 'doublement_autorise' and r.pays is null limit 1),
                    true)
       -- Pas déjà doublé ou en cours.
       and not exists (select 1 from public.doubles_jeudi d where d.compte_id = c.id and d.jeudi <> p_jeudi
                         and d.statut in ('a_creer', 'cree', 'erreur'))
  ),
  posts as (
    select p.compte_id, p.date_publication_prevue as d, p.publie_url, p.vues, p.langue
      from public.passages p join c on c.id = p.compte_id cross join b
     where p.date_publication_prevue between b.d1 and p_jeudi - 1
  ),
  med_langue as (
    select p.langue, percentile_cont(0.5) within group (order by p.vues) as med
      from public.passages p cross join b
     where p.date_publication_prevue between b.d1 and b.d2 and (p.publie_url is not null or p.credite_raison is not null) and p.vues is not null
     group by p.langue
  ),
  stats as (
    select c.id, c.poster_id, c.star, c.langue, c.application_id,
           percentile_cont(0.5) within group (order by x.vues) filter (where x.d <= b.d2 and x.vues is not null) as vues_med,
           count(*) filter (where x.d <= b.d2 and x.vues is not null and x.vues >= 5 * coalesce(ml.med, 0) and x.vues > 0) as viraux,
           count(*) filter (where x.d <= b.d2 and x.vues is not null and x.vues >= coalesce(ml.med, 0)) as bons,
           count(*) filter (where x.d <= b.d2) as posts,
           bool_or(x.publie_url is null) as manque,
           bool_or(x.d <= b.d2 and x.vues is not null and x.vues < b.mort) as mort
      from c cross join b
      join posts x on x.compte_id = c.id
      left join med_langue ml on ml.langue = x.langue
     group by c.id, c.poster_id, c.star, c.langue, c.application_id
  ),
  ok as (
    select s.* from stats s
     where s.posts >= 5 and not s.manque and not s.mort and s.vues_med is not null
       -- Un NON n'est pas reproposé, sauf si les vues médianes ont augmenté d'au moins 50 %.
       and not exists (select 1 from public.doubles_jeudi d where d.compte_id = s.id and d.decision = 'non' and d.jeudi <> p_jeudi
                         and s.vues_med < 1.5 * coalesce(d.vues_med, 0))
  ),
  perf as (
    select cl.label_id, p.langue, percentile_cont(0.5) within group (order by p.vues) as med, count(*) as n
      from public.passages p join public.compte_labels cl on cl.compte_id = p.compte_id cross join b
     where p.date_publication_prevue between b.d1 - 14 and b.d2 and (p.publie_url is not null or p.credite_raison is not null) and p.vues is not null
     group by cl.label_id, p.langue
    having count(*) >= 5
  )
  select o.id, o.poster_id, o.star, round(o.vues_med)::integer, o.viraux::integer, o.bons::integer, o.posts::integer,
         (select x.publie_url from posts x cross join b where x.compte_id = o.id and x.d <= b.d2 and x.vues is not null
           order by x.vues desc limit 1),
         (select x.vues from posts x cross join b where x.compte_id = o.id and x.d <= b.d2 and x.vues is not null
           order by x.vues desc limit 1),
         coalesce(
           (select l.id from perf pf join public.labels l on l.id = pf.label_id
             where pf.langue = o.langue and not coalesce(l.manuel, false)
               and not exists (select 1 from public.compte_labels cl where cl.compte_id = o.id and cl.label_id = l.id)
             order by (l.application_id is distinct from o.application_id) desc, pf.med desc limit 1),
           -- Langue avec trop peu de posts : le meilleur label toutes langues confondues.
           (select l.id from perf pf join public.labels l on l.id = pf.label_id
             where not coalesce(l.manuel, false)
               and not exists (select 1 from public.compte_labels cl where cl.compte_id = o.id and cl.label_id = l.id)
             group by l.id, l.application_id
             order by (l.application_id is distinct from o.application_id) desc, max(pf.med) desc limit 1)),
         (row_number() over (order by o.vues_med desc, (o.viraux::numeric / nullif(o.posts, 0)) desc nulls last, o.bons desc))::integer
    from ok o
   order by o.vues_med desc, (o.viraux::numeric / nullif(o.posts, 0)) desc nulls last, o.bons desc
   limit 40;
$function$
;

CREATE OR REPLACE FUNCTION public.kill_checklist(p_poster uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with pr as (
    select p.*, public.kill_date(p.id) as le,
           ((public.kill_date(p.id) at time zone 'Europe/Paris')::date
             + (8 - extract(isodow from (public.kill_date(p.id) at time zone 'Europe/Paris')::date))::int) as lundi_suivant
      from public.profiles p where p.id = p_poster
  ),
  ar as (select a.* from public.arrets a where a.poster_id = p_poster and a.annule_at is null order by a.created_at desc limit 1),
  ct as (select u.* from public.upwork_contrats u join pr on u.contrat_id = pr.upwork_contract_id limit 1),
  sm as (select m.* from public.slack_membres m join pr on m.slack_user_id = pr.slack_user_id limit 1),
  sr as (select r.* from public.slack_retraits r where r.poster_id = p_poster order by r.maj_at desc nulls last limit 1),
  tx as (select t.* from public.posteur_textes t where t.poster_id = p_poster and t.cle = 'fin')
  select jsonb_build_array(
    jsonb_build_object('etape', 'a', 'libelle', 'Comptes désactivés (raison + date)',
      'statut', case when exists (select 1 from public.comptes c where c.poster_id = p_poster and c.is_active) then 'echec'
                     when (select le from pr) is null then 'echec' else 'fait' end,
      'at', (select le from pr),
      'detail', coalesce((select nullif(motif, '') from ar),
                         (select string_agg(distinct c.non_renouveler_raison, ', ') from public.comptes c where c.poster_id = p_poster and c.non_renouveler))),
    jsonb_build_object('etape', 'b', 'libelle', 'Plus de posts planifiés après le lundi',
      'statut', case when exists (select 1 from public.passages p join public.comptes c on c.id = p.compte_id cross join pr
                                   where c.poster_id = p_poster and p.date_publication_prevue >= pr.lundi_suivant
                                     and (p.publie_url is null and p.credite_raison is null)) then 'echec' else 'fait' end,
      'detail', (select count(*)::text || ' post(s) encore planifié(s)' from public.passages p join public.comptes c on c.id = p.compte_id cross join pr
                  where c.poster_id = p_poster and p.date_publication_prevue >= pr.lundi_suivant and (p.publie_url is null and p.credite_raison is null))),
    jsonb_build_object('etape', 'c', 'libelle', 'Dernière semaine due : dans la paie',
      'statut', case
        when (select canal_paie from pr) = 'ruul' then
          case when exists (select 1 from public.ruul_paiements rp cross join pr
                             where rp.poster_id = p_poster and rp.semaine >= pr.lundi_suivant - 14) then 'fait' else 'a_faire' end
        else coalesce((select e->>'statut' from ar, jsonb_array_elements(coalesce(ar.etapes, '[]'::jsonb)) e where e->>'action' = 'paie' limit 1), 'a_faire')
      end,
      'detail', case when (select canal_paie from pr) = 'ruul' then 'Ruul' else 'Upwork' end),
    jsonb_build_object('etape', 'd', 'libelle', 'Contrat Upwork fermé',
      'statut', case when (select canal_paie from pr) = 'ruul' then 'sans_objet'
                     when not exists (select 1 from ct) then 'sans_objet'
                     when (select actif from ct) then 'main' else 'fait' end,
      'detail', (select coalesce(contrat_id, '') || ' ' || coalesce(etat, '') from ct)),
    jsonb_build_object('etape', 'e', 'libelle', 'Retiré de la paie Ruul',
      'statut', case when (select canal_paie from pr) <> 'ruul' then 'sans_objet'
                     when exists (select 1 from public.ruul_paiements rp cross join pr
                                   where rp.poster_id = p_poster and rp.semaine >= pr.lundi_suivant and rp.statut in ('a_payer', 'reporte')) then 'echec'
                     else 'fait' end),
    jsonb_build_object('etape', 'f', 'libelle', 'Désactivé du Slack',
      'statut', case when (select slack_user_id from pr) is null then 'sans_objet'
                     when coalesce((select supprime from sm), false) or (select desactive_at from sr) is not null then 'fait'
                     when (select canaux_retires_at from sr) is not null then 'main'
                     else 'a_faire' end,
      'at', coalesce((select desactive_at from sr), (select canaux_retires_at from sr))),
    jsonb_build_object('etape', 'g', 'libelle', 'Retiré des relances et messages',
      'statut', case when exists (select 1 from public.relances_prevues r where r.poster_id = p_poster and r.statut = 'prevu') then 'echec'
                     else 'fait' end),
    jsonb_build_object('etape', 'h', 'libelle', 'Message de fin envoyé (une fois)',
      'statut', case when (select envoye_at from tx) is not null then 'fait'
                     when (select le from pr) < '2026-11-19'::timestamptz then 'sans_objet'
                     when (select envoi_erreur from tx) is not null then 'echec'
                     else 'a_faire' end,
      'at', (select envoye_at from tx), 'detail', (select envoi_erreur from tx))
  );
$function$
;

CREATE OR REPLACE FUNCTION public.kill_partiel_checklist(p_compte uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with c as (select c.*, pr.canal_paie, pr.upwork_contract_id, pr.tarif_hebdo from public.comptes c join public.profiles pr on pr.id = c.poster_id where c.id = p_compte),
  j as (select u.montant, u.nom, u.etat from public.upwork_jalons u join c on u.contrat_id = c.upwork_contract_id order by u.lu_at desc nulls last limit 1)
  select jsonb_build_array(
    jsonb_build_object('etape', 'a', 'libelle', 'Compte désactivé (raison + date)',
      'statut', case when (select is_active from c) then 'echec' else 'fait' end,
      'at', (select non_renouveler_at from c), 'detail', (select non_renouveler_raison from c)),
    jsonb_build_object('etape', 'b', 'libelle', 'Posts futurs du compte retirés',
      'statut', case when exists (select 1 from public.passages p where p.compte_id = p_compte
                                   and p.date_publication_prevue > (now() at time zone 'Europe/Paris')::date and (p.publie_url is null and p.credite_raison is null))
                     then 'echec' else 'fait' end),
    jsonb_build_object('etape', 'c', 'libelle', 'Milestone au tarif 1 compte',
      'statut', case when (select canal_paie from c) = 'ruul' then 'fait'
                     when not exists (select 1 from j) then 'a_faire'
                     when (select montant from j) > coalesce((select tarif_hebdo from c), 0) then 'main' else 'fait' end,
      'detail', (select coalesce(nom, '') || ' : ' || coalesce(montant::text, '?') || ' $ (attendu ' || coalesce((select tarif_hebdo from c)::text, '?') || ' $)' from j)),
    jsonb_build_object('etape', 'd', 'libelle', 'Bandeau affiché au posteur',
      'statut', case when exists (select 1 from public.posteur_textes t where t.poster_id = (select poster_id from c) and t.cle = 'compte_arrete:' || p_compte)
                     then 'fait' else 'a_faire' end)
  );
$function$
;

CREATE OR REPLACE FUNCTION public.kills_controle()
 RETURNS TABLE(type text, libelle text, poster_id uuid, nom text, detail text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with fins as (
    select pr.id, pr.canal_paie, pr.upwork_contract_id, pr.slack_user_id, pr.tarif_hebdo,
           coalesce(nullif(btrim(concat_ws(' ', pr.prenom, pr.nom)), ''), pr.email) as nom,
           public.fin_collaboration_cas(pr.id) as f
      from public.profiles pr
     where not pr.is_active or not exists (select 1 from public.comptes c where c.poster_id = pr.id and c.is_active)
  ),
  tues as (select * from fins where f is not null),
  nom as (select pr.id, coalesce(nullif(btrim(concat_ws(' ', pr.prenom, pr.nom)), ''), pr.email) as nom from public.profiles pr)
  select 'contrat_actif', 'Désactivé mais contrat Upwork encore actif', t.id, t.nom, u.contrat_id || ' (' || coalesce(u.etat, '?') || ', lu ' || to_char(u.lu_at, 'DD/MM') || ')'
    from tues t join public.upwork_contrats u on u.contrat_id = t.upwork_contract_id
   where t.canal_paie <> 'ruul' and u.actif
  union all
  select 'slack', 'Killé mais encore dans Slack', t.id, t.nom, t.slack_user_id
    from tues t join public.slack_membres m on m.slack_user_id = t.slack_user_id
   where not coalesce(m.supprime, false)
     and not exists (select 1 from public.slack_retraits r where r.poster_id = t.id and r.desactive_at is not null)
  union all
  select 'ruul', 'Killé mais encore dans la paie Ruul', t.id, t.nom, string_agg(rp.semaine::text, ', ')
    from tues t join public.ruul_paiements rp on rp.poster_id = t.id
   where t.canal_paie = 'ruul' and rp.statut in ('a_payer', 'reporte')
     and rp.semaine > ((t.f->>'le')::timestamptz at time zone 'Europe/Paris')::date
   group by t.id, t.nom
  union all
  select 'posts', 'Compte désactivé mais posts planifiés', c.poster_id, n.nom, '@' || coalesce(c.handle_tiktok, '?') || ' : ' || count(*) || ' post(s)'
    from public.comptes c join public.passages p on p.compte_id = c.id join nom n on n.id = c.poster_id
   where not c.is_active and p.date_publication_prevue > (now() at time zone 'Europe/Paris')::date and (p.publie_url is null and p.credite_raison is null)
   group by c.poster_id, n.nom, c.handle_tiktok
  union all
  select 'milestone', 'Passé à 1 compte, milestone à 2 comptes', pr.id, n.nom,
         coalesce(j.nom, '?') || ' : ' || j.montant || ' $ (attendu ' || pr.tarif_hebdo || ' $)'
    from public.profiles pr join nom n on n.id = pr.id
    join lateral (select u.nom, u.montant from public.upwork_jalons u where u.contrat_id = pr.upwork_contract_id
                   order by u.lu_at desc nulls last limit 1) j on true
   where pr.is_active and pr.canal_paie <> 'ruul' and pr.tarif_hebdo > 0
     and (select count(*) from public.comptes c where c.poster_id = pr.id and c.is_active and coalesce(c.type_compte, 'perso') = 'perso') = 1
     and exists (select 1 from public.comptes c where c.poster_id = pr.id and not c.is_active and c.non_renouveler
                   and c.non_renouveler_at > now() - interval '28 days')
     and j.montant >= 2 * pr.tarif_hebdo
  union all
  select 'bot_arret', 'Actif, mais le bot a dit « arrêté »', d.poster_id, n.nom, left(d.bot_reponse, 120)
    from public.support_demandes d join nom n on n.id = d.poster_id
   where d.cree_at > now() - interval '30 days'
     and d.bot_reponse ~* '(account|contract|collaboration) (was|has been|is) (stopped|ended|terminated|no longer active)|collaboration with vik studios ended'
     and exists (select 1 from public.comptes c where c.poster_id = d.poster_id and c.is_active)
     and exists (select 1 from public.profiles p where p.id = d.poster_id and p.is_active)
  union all
  select 'demande', 'Demande d''arrêt pas exécutée', d.poster_id, n.nom, 'demandée le ' || to_char(d.demande_at, 'DD/MM') || ' (' || coalesce(d.source, '?') || ')'
    from public.demandes_arret d join nom n on n.id = d.poster_id
   where d.decision is null
     and d.demande_at < (date_trunc('week', now() at time zone 'Europe/Paris') - interval '2 days')
     and exists (select 1 from public.comptes c where c.poster_id = d.poster_id and c.is_active);
$function$
;

CREATE OR REPLACE FUNCTION public.lundi_soir_posteurs(p_lundi date)
 RETURNS TABLE(poster_id uuid, compte_id uuid, deuxieme boolean, prenom text, fuseau text, contrat_id text, publies_lundi integer, dernier_post_at timestamp with time zone, message_at timestamp with time zone, message_id uuid, message_erreur text, prevu_at timestamp with time zone, repondu_at timestamp with time zone, kill_id uuid, kill_statut text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
#variable_conflict use_column
begin
  if coalesce(auth.role(), '') <> 'service_role' and not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if extract(isodow from p_lundi) <> 1 then
    raise exception 'lundi_soir_posteurs : % n''est pas un lundi', p_lundi;
  end if;
  return query
  with cartes as (
    select pr.id as poster_id, c1.id as compte_id, false as deuxieme
      from public.profiles pr
      left join lateral (select c.id from public.comptes c where c.poster_id = pr.id and c.type_compte = 'perso'
                          order by c.created_at limit 1) c1 on true
     where pr.is_active and pr.cohorte_lundi = p_lundi
       and exists (select 1 from public.user_roles r where r.user_id = pr.id and r.role = 'poster')
    union all
    select c.poster_id, c.id, true
      from public.comptes c
      join public.profiles pr on pr.id = c.poster_id and pr.is_active
      left join public.comptes_premier_jour pj on pj.compte_id = c.id
     where c.type_compte = 'perso' and c.is_active
       and coalesce(pj.premier_jour - (extract(isodow from pj.premier_jour)::int - 1),
                    (c.warmup_ends_at at time zone 'Europe/Paris')::date) = p_lundi
       and exists (select 1 from public.comptes d where d.poster_id = c.poster_id and d.id <> c.id
                     and d.type_compte = 'perso' and d.created_at < c.created_at)
  )
  select ca.poster_id, ca.compte_id, ca.deuxieme, pr.prenom,
         case when cpt.pays is null then 'Europe/Paris' else public.fuseau_pays(cpt.pays) end,
         pr.upwork_contract_id,
         (select count(*) from public.passages p
           where p.compte_id = ca.compte_id and (p.publie_url is not null or p.credite_raison is not null)
             and (p.date_publication_prevue = p_lundi
                  or (coalesce(p.publie_at, p.created_at)
                      at time zone (case when cpt.pays is null then 'Europe/Paris' else public.fuseau_pays(cpt.pays) end))::date = p_lundi))::int,
         (select max(coalesce(p.publie_at, p.created_at)) from public.passages p
           where p.compte_id = ca.compte_id and (p.publie_url is not null or p.credite_raison is not null)),
         n.envoye_at, n.id, n.slack_erreur,
         v.premier_at,
         public.posteur_reaction_at(ca.poster_id),
         k.id, k.statut
    from cartes ca
    join public.profiles pr on pr.id = ca.poster_id
    left join public.comptes cpt on cpt.id = ca.compte_id
    left join lateral (select n.id, n.envoye_at, n.slack_erreur from public.nudges n
                        where n.poster_id = ca.poster_id and n.type = 'lundi_soir' and n.periode = p_lundi
                        order by n.envoye_at desc limit 1) n on true
    left join lateral (select v.premier_at from public.relances_prevues v
                        where v.poster_id = ca.poster_id and v.type = 'lundi_soir' and v.periode = p_lundi
                          and v.statut = 'prevu') v on true
    left join lateral (select k.id, k.statut from public.kills_auto k
                        where k.poster_id = ca.poster_id and k.etape = 'lundi_soir' and k.periode = p_lundi) k on true
   where not exists (select 1 from public.hub_posteurs h where h.profile_id = ca.poster_id and h.exclu_suivi /* 0575 */)
     -- 0793 : un compte dont l'application est gelée n'a rien à poster ce lundi.
     and not public.compte_gele(ca.compte_id)
     and not exists (select 1 from public.arrets a where a.poster_id = ca.poster_id and a.created_at >= p_lundi::timestamp - interval '7 days')
     -- Prompt 25 MAJ : seulement ceux qui ont fini leur warm-up (trouvé, Start warmup, 5 abonnements).
     and exists (select 1 from public.comptes w where w.id = ca.compte_id and w.warmup_started_at is not null)
     and exists (select 1 from public.ckd_warmup_releves x
                  where x.compte_id = ca.compte_id and x.existe and coalesce(x.abonnements, 0) >= 5)
     -- A3 (0413) : une recrue pas prête dimanche minuit ne commence pas ce lundi.
     and (ca.deuxieme or not exists (select 1 from public.recrues_rouges rr
                                      where rr.poster_id = ca.poster_id and rr.periode = p_lundi))
     -- 0515 : jamais pour une recrue « Start Tuesday » ou « Postpone » (choix du dimanche).
     and not exists (select 1 from public.debut_choix dc
                      where dc.poster_id = ca.poster_id and dc.lundi = p_lundi and dc.choix in ('mardi', 'reporter'));
end;
$function$
;

CREATE OR REPLACE FUNCTION public.masterlist_contexte(p_lundi date, p_posteurs uuid[])
 RETURNS TABLE(poster_id uuid, dernier_recu jsonb, dernier_envoye jsonb, repondu boolean, derniere_connexion timestamp with time zone, dernier_post_at timestamp with time zone, arrivee timestamp with time zone, badges text[], absence jsonb, absences_30j integer, upwork_lu_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with m as materialized (select * from public.messages_posteurs(p_posteurs) where at is not null),
  debut as (select (p_lundi::timestamp at time zone 'Europe/Paris') as t),
  recu as (
    select distinct on (x.poster_id) x.poster_id, x.at,
           jsonb_build_object('canal', x.canal, 'at', x.at, 'texte', x.texte, 'lien', x.lien) as j
      from m x where x.sens = 'recu' order by x.poster_id, x.at desc),
  envoye as (
    select distinct on (x.poster_id) x.poster_id, x.at,
           jsonb_build_object('canal', x.canal, 'at', x.at, 'texte', x.texte, 'lien', x.lien) as j
      from m x where x.sens = 'envoye' order by x.poster_id, x.at desc),
  badges as (
    select x.poster_id,
           array_agg(distinct case x.cas when 'stop' then 'stop' when 'absent' then 'absent' when 'paie' then 'paie' end)
             filter (where x.cas in ('stop', 'absent', 'paie')) as b
      from m x, debut d where x.sens = 'recu' and x.at >= d.t group by x.poster_id),
  posts as (
    select co.poster_id, max(coalesce(pa.publie_at, pa.lien_confirme_at)) as at
      from public.passages pa join public.comptes co on co.id = pa.compte_id
     where co.poster_id = any (p_posteurs) and (pa.publie_url is not null or pa.credite_raison is not null)
     group by co.poster_id),
  sess as (
    select s.user_id, max(coalesce(s.refreshed_at, s.updated_at)) as at
      from auth.sessions s where s.user_id = any (p_posteurs) group by s.user_id)
  select pr.id,
         r.j,
         e.j,
         coalesce(r.at > e.at, false),
         greatest(u.last_sign_in_at, se.at),
         po.at,
         coalesce(pr.offre_acceptee_le::timestamptz, pr.created_at),
         b.b,
         (select jsonb_build_object('debut', a.debut, 'fin', coalesce(a.retour_le, a.fin), 'jours', a.jours, 'raison', a.raison,
                                    'declare_at', a.declare_at, 'retour', a.retour_le is not null)
            from public.absences_declarees a
           where a.poster_id = pr.id and (a.retour_le is null or a.retour_le >= a.debut)
             and a.debut <= p_lundi + 6 and coalesce(a.retour_le, a.fin) >= p_lundi
           order by a.declare_at desc limit 1),
         (select count(*)::int from public.absences_declarees a
           where a.poster_id = pr.id and a.declare_at > now() - interval '30 days'),
         (select s.lu_at from public.upwork_salons s where s.contrat_id = pr.upwork_contract_id)
    from public.profiles pr
    left join auth.users u on u.id = pr.id
    left join recu r on r.poster_id = pr.id
    left join envoye e on e.poster_id = pr.id
    left join badges b on b.poster_id = pr.id
    left join posts po on po.poster_id = pr.id
    left join sess se on se.user_id = pr.id
   where pr.id = any (p_posteurs) and public.is_admin();
$function$
;

CREATE OR REPLACE FUNCTION public.paie_calculer_v3(p_lundi date)
 RETURNS TABLE(poster_id uuid, nb_comptes integer, comptes_payes integer, prevus integer, faits integer, manques integer, tarif numeric, retenue numeric, montant numeric, statut text, raison text, action text, detail_comptes jsonb)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with reg as (
    select (r->>'minimum_posts')::int as minimum,
           false as kill6
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
       and not exists (select 1 from public.hub_posteurs h where h.profile_id = pr.id and h.exclu_suivi) /* 0574 : les posteurs Ruul sont calculés comme les autres (payés par le lot Ruul) */
  ),
  -- 0793 : les comptes dont l'application était gelée dans la semaine.
  geles as materialized (
    select gs.compte_id from public.comptes_geles_semaine(p_lundi) gs
  ),
  comptes_semaine as (
    select c.id, c.poster_id, c.handle_tiktok,
           count(p.id)::int as attendus,
           -- Un post compte s'il a son lien. Prompt 21, U4 : sous la règle des 6, un lien
           -- « introuvable » ne compte qu'une fois confirmé (Needs you).
           (count(p.id) filter (where (p.publie_url is not null or p.credite_raison is not null)
                                  and (not rg.kill6 or p.resolution_statut is distinct from 'introuvable'
                                       or p.lien_confirme_at is not null)))::int as faits,
           (count(p.id) filter (where rg.kill6 and (p.publie_url is not null or p.credite_raison is not null) and p.resolution_statut = 'introuvable'
                                  and p.lien_confirme_at is null))::int as douteux,
           (c.is_active
             and ((c.warmup_ends_at > b.debut and c.warmup_ends_at <= b.fin + interval '1 day')
                  or (c.warmup_ends_at is null and c.created_at < b.debut
                      and c.created_at >= b.debut - interval '21 days'))) as en_warmup,
           exists (select 1 from geles gl where gl.compte_id = c.id) as gel
      from public.comptes c
      join posteurs po on po.id = c.poster_id
      cross join bornes b
      cross join reg rg
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
           -- 0793 : gelé ET sans aucun post assigné dans la semaine. Avec des posts assignés
           -- (avant le gel, ou après le « go »), la règle d'avant s'applique telle quelle.
           (cs.gel and cs.attendus = 0) as gele,
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
           (count(*) filter (where pc.attendus > 0 or pc.gele))::int as nb_comptes,
           bool_or(pc.gele) as gele,
           (count(*) filter (where (pc.attendus > 0 and (pc.faits > 0 or pc.pause)) or pc.gele))::int as comptes_payes,
           coalesce(sum(pc.attendus), 0)::int as prevus,
           coalesce(sum(pc.faits), 0)::int as faits,
           coalesce(sum(pc.rates), 0)::int as manques,
           (count(*) filter (where pc.attendus > 0 and pc.moins6))::int as comptes_moins6,
           coalesce(sum(pc.tarif) filter (where (pc.attendus > 0 and (pc.faits > 0 or pc.pause)) or pc.gele), 0)::numeric as montant,
           bool_or(pc.en_warmup and pc.attendus = 0 and not pc.gele) as warmup,
           coalesce(jsonb_agg(jsonb_build_object(
             'compte_id', pc.id, 'handle', pc.handle_tiktok, 'attendus', pc.attendus, 'faits', pc.faits,
             'rates', pc.rates, 'retenue', 0, 'moins6', pc.moins6, 'douteux', pc.douteux,
             'montant', case when (pc.faits > 0 or pc.pause or pc.gele) and pc.tarif is not null then pc.tarif else 0 end,
             'gele', pc.gele,
             'warmup', pc.en_warmup and pc.attendus = 0 and not pc.gele)
             order by pc.handle_tiktok) filter (where pc.attendus > 0 or pc.gele or (pc.en_warmup and pc.attendus = 0)), '[]'::jsonb)
             as detail
      from par_compte pc
     group by pc.poster_id
    having (count(*) filter (where pc.attendus > 0)) > 0 or bool_or(pc.en_warmup) or bool_or(pc.gele)
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
             when (e.kill or not e.is_active) and e.faits = 0 and not e.pause and not e.gele and e.deja_financee then 'annuler'
             when (e.kill or not e.is_active) and e.faits = 0 and not e.pause and not e.gele then 'rien'
             when (e.kill or not e.is_active) then 'kill'
             when e.nb_comptes > 0 and e.comptes_moins6 >= e.nb_comptes then 'kill'
             when e.nb_comptes = 0 or (e.faits = 0 and not e.pause and not e.gele) then 'rien'
             when e.rythme = 'legacy' then 'legacy'
             when e.rythme = 'a_verifier' then 'a_verifier'
             when e.n_suiv >= 2 and e.n_suiv > e.comptes_payes then 'modifier'
             else 'payer'
           end as action,
           array_remove(array[
             case when e.nb_comptes = 0 then 'Semaine de warm-up : rien à payer (la 1re semaine de posts le paie)' end,
             case when e.nb_comptes > 0 and e.faits = 0 and not e.pause and not e.gele then '0 post avec lien dans la semaine : rien à payer' end,
             case when e.gele then 'Application pas encore lancée (warm-up prolongé) : semaine payée' end,
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
$function$
;

CREATE OR REPLACE FUNCTION public.paie_liste_v2(p_lundi date, p_simulation boolean DEFAULT false)
 RETURNS TABLE(id uuid, poster_id uuid, poster_nom text, hm_id uuid, hm_prenom text, equipe text, contrat_url text, nb_comptes integer, comptes_payes integer, prevus integer, faits integer, tarif numeric, retenue numeric, montant_calcule numeric, montant numeric, montant_corrige numeric, raison_correction text, statut text, raison text, action text, detail_comptes jsonb, exclu boolean, exclu_raison text, paye_at timestamp with time zone, semaine_suivante_faite_at timestamp with time zone, premiere_semaine boolean, bonus numeric, suivante_action text, suivante_comptes integer, suivante_montant numeric, suivante_raison text, upwork_compte text, remboursement_semaine date, remboursement_montant numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  v_bonus := 0; -- 0453 : plus de bonus de 1re semaine

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
       and not exists (select 1 from public.profiles x where x.id = c.poster_id and x.canal_paie = 'ruul' /* 0589 */)
  ),
  arretes as (
    select x.poster_id,
           not exists (select 1 from public.passages p
                         join public.comptes c on c.id = p.compte_id
                        where c.poster_id = x.poster_id
                          and (p.publie_at is not null or (p.publie_url is not null or p.credite_raison is not null))) as jamais_poste
      from (
        select x.poster_id, x.decision_at as le
          from public.recrues_rouges x
         where x.decision = 'arreter'
        union all
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
           case when c.poster_id in (select k.poster_id from public.paie_kills_sans_paie k
                                         where k.semaine = p_lundi and k.annule_at is null)
                     and (c.action = 'kill' or c.poster_id in (select a.poster_id from arretes a where not a.jamais_poste)) then 'kill_sans_paie'
                when c.poster_id in (select a.poster_id from arretes a where a.jamais_poste) then 'annuler'
                when c.poster_id in (select a.poster_id from arretes a) then 'kill'
                else c.action end as action,
           c.detail_comptes, c.exclu, c.exclu_raison, c.paye_at, c.semaine_suivante_faite_at
      from calcule c
    union all
    select null::uuid, a.poster_id, 0, 0, 0, 0, coalesce(public.paie_tarif_contrat(pr.id), pr.tarif_hebdo), 0::numeric,
           0::numeric, null::numeric, null::text, 'ok'::text, null::text,
           case when a.jamais_poste then 'annuler'
                when exists (select 1 from public.paie_kills_sans_paie k
                              where k.poster_id = a.poster_id and k.semaine = p_lundi and k.annule_at is null) then 'kill_sans_paie'
                else 'kill' end, '[]'::jsonb,
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
    select a.poster_id, pr.cohorte_lundi as semaine,
           coalesce(public.paie_tarif_contrat(pr.id), pr.tarif_hebdo, public.paie_tarif_zone(pr.id)) + v_bonus as montant
      from arretes a
      join public.profiles pr on pr.id = a.poster_id
     where a.jamais_poste
  )
  select l.id, l.poster_id,
         coalesce(nullif(btrim(concat_ws(' ', pr.prenom, pr.nom)), ''), pr.email),
         pr.manager_id, hm.prenom,
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
$function$
;

CREATE OR REPLACE FUNCTION public.paie_suivante_calc(p_lundi date, p_lignes jsonb)
 RETURNS TABLE(poster_id uuid, action text, comptes integer, montant numeric, raison text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with bornes as (
    select p_lundi + 7 as suiv,
           (p_lundi::timestamp at time zone 'Europe/Paris') as debut,
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
  -- 0536 : les Doubles acceptés avant la coupure (21 jours au plus) : comptés pour 2 dès le lundi suivant.
  doubles as (
    select distinct on (m.poster_id) m.poster_id, p.nouveau_compte_id
      from public.posteur_messages m
      join public.ckd_propositions p on p.id = m.proposition_id
     cross join bornes b
     where m.type = 'double' and m.reponse = 'oui' and p.decision = 'doubler'
       and m.repondu_at <= b.coupure and m.repondu_at >= b.coupure - interval '21 days'
       and m.poster_id in (select l.poster_id from lignes l)
     order by m.poster_id, m.repondu_at desc
  ),
  cpt as (
    select c.id, c.poster_id,
           (exists (select 1 from doubles x where x.nouveau_compte_id = c.id)
                or exists (select 1 from public.doubles_jeudi dj cross join bornes b2 /* 0756 */
                            where dj.nouveau_compte_id = c.id and dj.statut = 'cree' and dj.reponse = 'oui' /* 0802 : accord du posteur */
                              and dj.repondu_at <= b2.coupure - interval '10 hours' and dj.repondu_at >= b2.coupure - interval '21 days')) as double_accepte,
           -- 0570 : compte recréé (remplace un compte, jamais un Double).
           exists (select 1 from public.ckd_recreations r cross join bornes b
                    where r.nouveau_compte_id = c.id
                      and r.created_at <= b.coupure and r.created_at >= b.coupure - interval '21 days') as recree_compte,
           coalesce((select public.double_jeudi_lundi(dj3.repondu_at) from public.doubles_jeudi dj3
                        where dj3.nouveau_compte_id = c.id and dj3.reponse = 'oui' limit 1),
                    (select pj.premier_jour - (extract(isodow from pj.premier_jour)::int - 1)
                       from public.comptes_premier_jour pj where pj.compte_id = c.id),
                    (c.warmup_ends_at at time zone 'Europe/Paris')::date) as debut,
           c.is_active
             and not exists (select 1 from public.ckd_arrets a cross join bornes b
                              where a.compte_id = c.id and a.annule_at is null
                                and coalesce(a.fait_at, a.prevu_at) <= b.coupure)
             -- Prompt 21, B9 (0536 : sauf Double accepté) : un 2e compte n'est financé qu'après son 1er post avec lien
             -- (le 1er compte ACTIF : un compte recréé remplace l'ancien).
             and (c.id = (select d.id from public.comptes d where d.poster_id = c.poster_id and d.type_compte = 'perso'
                           and d.is_active order by d.created_at limit 1)
                  or exists (select 1 from public.passages p where p.compte_id = c.id and (p.publie_url is not null or p.credite_raison is not null))
                  -- 0536 : Double accepté : financé sans attendre le 1er post.
                  or (exists (select 1 from doubles x where x.nouveau_compte_id = c.id)
                or exists (select 1 from public.doubles_jeudi dj cross join bornes b2 /* 0756 */
                            where dj.nouveau_compte_id = c.id and dj.statut = 'cree' and dj.reponse = 'oui' /* 0802 : accord du posteur */
                              and dj.repondu_at <= b2.coupure - interval '10 hours' and dj.repondu_at >= b2.coupure - interval '21 days'))
                  -- 0570 : compte recréé : financé sans attendre le 1er post (il remplace l'ancien).
                  or exists (select 1 from public.ckd_recreations r cross join bornes b
                              where r.nouveau_compte_id = c.id
                                and r.created_at <= b.coupure and r.created_at >= b.coupure - interval '21 days'))
             -- Prompt 21, B1 : un compte sous les 6 posts s'arrête.
             and not exists (select 1 from lignes l, jsonb_array_elements_text(l.moins6) m
                              where l.poster_id = c.poster_id and m = c.id::text) as actif
      from public.comptes c
     where c.type_compte = 'perso'
       and c.poster_id in (select l.poster_id from lignes l)
  ),
  etat as (
    select l.*,
           ((select count(*) from cpt cross join bornes b
             where cpt.poster_id = l.poster_id and cpt.actif
               and (cpt.recree_compte or cpt.debut is not null and cpt.debut <= b.suiv)) /* 0573 : plus de Double compté pendant le warm-up */
            -- 0536 : Double accepté, 2e compte pas encore créé : il compte déjà (si le 1er compte est là).
            /* 0573 : un 2e compte pas encore créé ne compte pas */ + 0)::int as n_suiv,
           exists (select 1 from public.ckd_arrets a
                     join public.comptes c on c.id = a.compte_id
                    cross join bornes b
                    where c.poster_id = l.poster_id and a.raison = 'ne_pas_renouveler'
                      and a.annule_at is null
                      and coalesce(a.fait_at, a.prevu_at) >= b.debut
                      and coalesce(a.fait_at, a.prevu_at) <= b.coupure) as kill,
           exists (select 1 from public.ckd_recreations r cross join bornes b
                    where r.poster_id = l.poster_id
                      and r.created_at >= b.debut and r.created_at <= b.coupure) as recree,
           -- 0530 : Kill préparé pour le samedi de cette semaine (Problèmes, fiche Posters ou samedi).
           exists (select 1 from public.samedi_brouillons sb join public.comptes sc on sc.id = sb.compte_id
                    where sc.poster_id = l.poster_id and sb.lundi = p_lundi and sb.choix in ('kill', 'kill_np')) as kill_prevu
      from lignes l
  ),
  decision as (
    select e.*,
           case
             when e.kill_prevu then 'ne_pas_financer'
             when not e.is_active then 'ne_pas_financer'
             -- Kill (samedi, ou moins de 6 posts) : la semaine est payée, rien n'est financé.
             when e.action_paie in ('kill', 'kill_sans_paie') then 'ne_pas_financer'
             when e.n_suiv = 0 and e.kill then 'ne_pas_financer'
             when e.action_paie = 'rien' and e.faits = 0 and e.prevus > 0 then 'renommer'
             -- 0570 : un posteur recréé garde ses comptes (plus de retour forcé à 1).
             when e.recree and e.n_suiv >= 2 then 'financer_double'
             when e.recree then 'financer_normal'
             when e.n_suiv >= 2 then 'financer_double'
             when e.n_suiv = 1 and (e.faits > 0 or e.prevus = 0 or e.action_paie in ('payer', 'modifier')) then 'financer'
             else 'a_voir'
           end as a,
           case
             when e.kill_prevu then 'kill_samedi'
             when not e.is_active then 'desactive'
             when e.action_paie in ('kill', 'kill_sans_paie') then 'kill'
             when e.n_suiv = 0 and e.kill then 'kill'
             when e.action_paie = 'rien' and e.faits = 0 and e.prevus > 0 then 'zero_post_garde'
             when e.recree or e.n_suiv >= 1 and (e.faits > 0 or e.prevus = 0 or e.action_paie in ('payer', 'modifier')) then null
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
$function$
;

CREATE OR REPLACE FUNCTION public.posteur_posts_lien_total(p_poster uuid)
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select (select count(*) from public.passages pa join public.comptes c on c.id = pa.compte_id
           where c.poster_id = p_poster and (pa.publie_url is not null or pa.credite_raison is not null))::int
       + (select count(*) from public.posts po join public.comptes c on c.id = po.compte_id
           where c.poster_id = p_poster and po.publie_url is not null)::int;
$function$
;

CREATE OR REPLACE FUNCTION public.posteur_resume(p_poster uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with p as (select * from public.profiles where id = p_poster),
  c as (select * from public.comptes c where c.poster_id = p_poster and coalesce(c.type_compte, 'perso') = 'perso'
         order by c.is_active desc, c.created_at limit 1),
  semaine as (select date_trunc('week', (now() at time zone 'Europe/Paris'))::date as lundi)
  select jsonb_build_object(
    'poster_id', p.id,
    'nom', concat_ws(' ', p.prenom, p.nom),
    'actif', p.is_active,
    'cohorte', p.cohorte_lundi,
    'contrat', p.upwork_contract_id,
    'etapes', jsonb_build_object(
      'connecte', coalesce(p.premiere_connexion_at, (select u.last_sign_in_at from auth.users u where u.id = p.id)) is not null,
      'slack', p.slack_user_id is not null,
      'handle', (select c.handle_tiktok from c),
      'start_warmup', (select c.warmup_started_at from c),
      'follows', (select r.abonnements from public.ckd_warmup_releves r where r.compte_id = (select c.id from c) and r.existe
                   order by r.releve_at desc limit 1),
      'pret', (select public.compte_pret(c.id) from c)),
    'posts_semaine', (select jsonb_build_object('publies', count(*) filter (where (ps.publie_url is not null or ps.credite_raison is not null)), 'prevus', count(*))
                        from public.passages ps join public.comptes cc on cc.id = ps.compte_id, semaine s
                       where cc.poster_id = p_poster and ps.date_publication_prevue between s.lundi and s.lundi + 6),
    'derniere_decision', (select d from (
        select jsonb_build_object('quoi', 'debut:' || dc.choix, 'at', dc.decide_at) d, dc.decide_at t from public.debut_choix dc where dc.poster_id = p_poster
        union all select jsonb_build_object('quoi', 'kill_dimanche:' || k.code, 'at', k.decide_at), k.decide_at from public.dimanche_kills k where k.poster_id = p_poster
        union all select jsonb_build_object('quoi', 'arret:' || a.source, 'at', a.created_at), a.created_at from public.arrets a where a.poster_id = p_poster and a.annule_at is null
      ) x order by t desc limit 1),
    'derniers_messages', coalesce((select jsonb_agg(jsonb_build_object('at', m.at, 'role', m.role, 'texte', left(m.texte, 300)) order by m.at desc)
                                     from (select * from public.upwork_messages m where m.poster_id = p_poster order by m.at desc limit 3) m), '[]'::jsonb))
  from p;
$function$
;

CREATE OR REPLACE FUNCTION public.samedi_bilan_calc(p_jour date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_jour date := coalesce(p_jour, (select max(o.jour) from public.ckd_propositions o
                                     where o.type = 'samedi' and o.decision is not null
                                       and o.jour < (now() at time zone 'Europe/Paris')::date - 1));
begin
  return (
    with d as (
      select o.id, o.poster_id, o.decision, o.nouveau_compte_id,
             coalesce(nullif(btrim(concat_ws(' ', pr.prenom, pr.nom)), ''), '?') as nom, pr.is_active,
             (select count(*) from public.passages ps join public.comptes c on c.id = ps.compte_id
               where c.poster_id = o.poster_id and (ps.publie_url is not null or ps.credite_raison is not null) and ps.date_publication_prevue > o.jour) as posts,
             (select pm.reponse from public.posteur_messages pm where pm.proposition_id = o.id and pm.type = 'double' limit 1) as reponse,
             (select pm.visible_de > now() + interval '1 year' from public.posteur_messages pm where pm.proposition_id = o.id and pm.type = 'double' limit 1) as retenu,
             (select count(*) from public.passages ps where ps.compte_id = o.nouveau_compte_id and (ps.publie_url is not null or ps.credite_raison is not null)) as posts2,
             coalesce(public.paie_tarif_contrat(o.poster_id), public.paie_tarif_zone(o.poster_id)) as tarif
        from public.ckd_propositions o
        left join public.profiles pr on pr.id = o.poster_id
       where o.type = 'samedi' and o.jour = v_jour and o.decision is not null
    ),
    v as (
      select d.*,
             case d.decision
               when 'ne_pas_renouveler' then case when not coalesce(d.is_active, false) then 'bonne' else 'a_revoir' end
               when 'doubler' then case when d.reponse = 'oui' and d.posts2 > 0 then 'bonne'
                                        when d.reponse = 'oui' or d.reponse is null then 'a_revoir'
                                        else 'a_revoir' end
               when 'garder' then case when d.posts >= 6 then 'bonne' when d.posts > 0 then 'a_revoir' else 'erreur' end
               when 'pas_maintenant' then case when d.posts >= 6 then 'bonne' else 'a_revoir' end
               else 'a_revoir' end as verdict,
             case d.decision
               when 'ne_pas_renouveler' then case when not coalesce(d.is_active, false) then 'tué' else 'encore actif' end
               when 'doubler' then case when coalesce(d.retenu, false) then 'proposition en attente'
                                        when d.reponse = 'oui' then 'accepté, ' || d.posts2 || ' post(s) sur le 2e compte'
                                        when d.reponse = 'non' then 'refusé'
                                        else 'pas encore de réponse' end
               else d.posts || ' post(s) avec lien depuis' end as detail
        from d
    )
    select jsonb_build_object(
      'jour', v_jour,
      'kills', count(*) filter (where decision = 'ne_pas_renouveler'),
      'doubles', count(*) filter (where decision = 'doubler' and not coalesce(retenu, false)),
      'doubles_acceptes', count(*) filter (where decision = 'doubler' and reponse = 'oui'),
      'gardes', count(*) filter (where decision in ('garder', 'pas_maintenant')),
      'cout_ajoute', coalesce(sum(tarif) filter (where decision = 'doubler' and reponse = 'oui'), 0),
      'verdicts', jsonb_build_object('bonne', count(*) filter (where verdict = 'bonne'),
                                     'a_revoir', count(*) filter (where verdict = 'a_revoir'),
                                     'erreur', count(*) filter (where verdict = 'erreur')),
      'lignes', coalesce(jsonb_agg(jsonb_build_object('poster_id', poster_id, 'nom', nom, 'decision', decision,
                                                      'verdict', verdict, 'detail', detail)
                                   order by case verdict when 'erreur' then 0 when 'a_revoir' then 1 else 2 end, nom), '[]'::jsonb))
      from v);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.samedi_simulation(p_lundi date, p_kills jsonb)
 RETURNS TABLE(poster_id uuid, nom text, choix text, desactivation text, slack text, fermeture text, remboursement text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
                    where c.poster_id = p.poster_id and (pa.publie_at is not null or (pa.publie_url is not null or pa.credite_raison is not null))) as a_poste,
           (select count(*) from public.passages pa join public.comptes c on c.id = pa.compte_id
             where c.poster_id = p.poster_id and (pa.publie_url is not null or pa.credite_raison is not null)
               and pa.date_publication_prevue between p_lundi and p_lundi + 6)::int as posts_semaine,
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
              when d.posts_semaine = 0 then format('0 post with link this week: nothing paid Monday; refund to ask in the payroll list (%s)', d.finances)
              else format('Kill & pay: this week paid Monday (%s post(s) with link) from %s; anything else funded: refund', d.posts_semaine, d.finances) end
    from d
   order by 2;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.semaine_comptes(p_lundi date, p_jusqu date)
 RETURNS TABLE(compte_id uuid, handle text, poster_id uuid, poster_nom text, prenom text, hm_id uuid, hm_nom text, pays text, cohorte_lundi date, premier_post date, jours jsonb, prevus_passes integer, lien_passes integer, lien_aujourdhui integer, lien_total integer, prevus_semaine integer, vues jsonb, shadowban text, liens_introuvables integer, canal text, nudge_envoye_at timestamp with time zone, nudge_en_file boolean, ckd_jeudi_id uuid, ckd_jeudi_action text, ckd_jeudi_decision text, ckd_samedi_id uuid, ckd_samedi_action text, ckd_samedi_regle text, ckd_samedi_decision text, ckd_samedi_donnees jsonb, recreer text, autres_comptes integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    select pa.compte_id, pa.date_publication_prevue as jour, pa.publie_url, pa.credite_raison, pa.vues, pa.resolution_statut
      from public.passages pa
     where pa.compte_id in (select c.id from c)
       and pa.date_publication_prevue between p_lundi and p_lundi + 6
       and pa.statut::text <> 'brouillon' and not coalesce(pa.est_rappel, false)
  ),
  pj as (
    select p.compte_id, p.jour, count(*)::int as n, (count(*) filter (where (p.publie_url is not null or p.credite_raison is not null)))::int as nl
      from p group by p.compte_id, p.jour
  ),
  pc as (
    select p.compte_id,
           (count(*) filter (where not (p.jour = p_lundi and (p.publie_url is null and p.credite_raison is null) and m.poster_id is not null)))::int as prevus_semaine,
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
         (select min(pa.date_publication_prevue) from public.passages pa where pa.compte_id = c.id and (pa.publie_url is not null or pa.credite_raison is not null)),
         a.jours, a.prevus_passes, a.lien_passes, a.lien_aujourdhui, a.lien_total,
         coalesce(pc.prevus_semaine, 0),
         coalesce((select jsonb_agg(jsonb_build_object('jour', x.date_publication_prevue, 'vues', x.vues, 'url', x.publie_url)
                                    order by x.date_publication_prevue desc)
                     from (select pa.date_publication_prevue, pa.vues, pa.publie_url, pa.id
                             from public.passages pa
                            where pa.compte_id = c.id and (pa.publie_url is not null or pa.credite_raison is not null)
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
$function$
;

CREATE OR REPLACE FUNCTION public.semaine_posteurs(p_lundi date)
 RETURNS TABLE(poster_id uuid, prenom text, pays text, fuseau text, slack_user_id text, contrat_id text, cohorte_lundi date, attendus_lun_mer integer, faits_lun_mer integer, prevus_semaine integer, envoyes text[], prevus_test text[])
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
#variable_conflict use_column
begin
  if coalesce(auth.role(), '') <> 'service_role' and not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if extract(isodow from p_lundi) <> 1 then
    raise exception 'semaine_posteurs : % n''est pas un lundi', p_lundi;
  end if;
  return query
  with po as (
    select pr.* from public.profiles pr
     where pr.is_active
       and exists (select 1 from public.user_roles r where r.user_id = pr.id and r.role = 'poster')
       and not exists (select 1 from public.hub_posteurs h where h.profile_id = pr.id and h.exclu_suivi /* 0575 */)
  ),
  s as (
    select c.poster_id,
           min(c.pays) as pays,
           (count(p.id) filter (where p.date_publication_prevue between p_lundi and p_lundi + 2))::int as attendus,
           (count(p.id) filter (where p.date_publication_prevue between p_lundi and p_lundi + 2
                                  and (p.publie_url is not null or p.credite_raison is not null)))::int as faits,
           count(p.id)::int as semaine
      from public.comptes c
      join public.passages p on p.compte_id = c.id
     where c.poster_id in (select id from po) and c.type_compte = 'perso' and c.is_active
       and p.date_publication_prevue between p_lundi and p_lundi + 6
       and p.statut::text <> 'brouillon' and not coalesce(p.est_rappel, false)
     group by c.poster_id
  ),
  cpt as (
    select distinct on (c.poster_id) c.poster_id, c.pays
      from public.comptes c
     where c.poster_id in (select id from po) and c.type_compte = 'perso' and c.is_active
     order by c.poster_id, c.created_at
  )
  select po.id, po.prenom, coalesce(s.pays, cpt.pays),
         case when coalesce(s.pays, cpt.pays) is null then 'Europe/Paris' else public.fuseau_pays(coalesce(s.pays, cpt.pays)) end,
         po.slack_user_id, po.upwork_contract_id,
         -- Reportée dimanche minuit : encore de la cohorte du jour pour le message du lundi.
         case when re.poster_id is not null then p_lundi else po.cohorte_lundi end,
         coalesce(s.attendus, 0), coalesce(s.faits, 0), coalesce(s.semaine, 0),
         coalesce((select array_agg(n.type) from public.nudges n
                    where n.poster_id = po.id and n.periode = p_lundi and n.type in ('lundi', 'jeudi')), '{}'),
         coalesce((select array_agg(v.type) from public.relances_prevues v
                    where v.poster_id = po.id and v.periode = p_lundi and v.type in ('lundi', 'jeudi')), '{}')
    from po
    left join s on s.poster_id = po.id
    left join cpt on cpt.poster_id = po.id
    left join lateral (select distinct rr.poster_id from public.recrues_rouges rr
                        where rr.poster_id = po.id and rr.periode = p_lundi and rr.decision = 'reporter') re on true
   where s.poster_id is not null or po.cohorte_lundi = p_lundi or re.poster_id is not null;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.semaine_posts_comptes(p_lundi date, p_jusqu date)
 RETURNS TABLE(poster_id uuid, compte_id uuid, handle text, posts_lien integer, prevus integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
#variable_conflict use_column
begin
  if coalesce(auth.role(), '') <> 'service_role' and not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return query
  select c.poster_id, c.id, c.handle_tiktok,
         (count(p.id) filter (where (p.publie_url is not null or p.credite_raison is not null) and p.date_publication_prevue between p_lundi and p_jusqu))::int,
         count(p.id)::int
    from public.comptes c
    join public.profiles pr on pr.id = c.poster_id and pr.is_active
    join public.passages p on p.compte_id = c.id
   where c.type_compte = 'perso' and c.is_active
     and p.date_publication_prevue between p_lundi and p_lundi + 6
     and p.statut::text <> 'brouillon' and not coalesce(p.est_rappel, false)
     and exists (select 1 from public.user_roles r where r.user_id = c.poster_id and r.role = 'poster')
     and not exists (select 1 from public.hub_posteurs h where h.profile_id = c.poster_id and h.exclu_suivi /* 0575 */)
   group by c.poster_id, c.id, c.handle_tiktok;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.support_etat_reel(p_poster uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare pr public.profiles%rowtype; v_lundi date := date_trunc('week', (now() at time zone 'Europe/Paris'))::date; v_jour date := (now() at time zone 'Europe/Paris')::date;
begin
  if not (coalesce(auth.role(), '') = 'service_role' or public.is_admin()) then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into pr from public.profiles where id = p_poster;
  if not found then return null; end if;
  return jsonb_build_object('actif', pr.is_active, 'canal_paie', case when pr.canal_paie = 'ruul' then 'ruul' else 'upwork' end, 'cohorte', pr.cohorte_lundi, 'gel' /* 0793 */, public.poster_gel(p_poster),
    'comptes', coalesce((select jsonb_agg(jsonb_build_object('handle', c.handle_tiktok, 'actif', c.is_active, 'non_renouveler', c.non_renouveler, 'raison', c.non_renouveler_raison, 'le', c.non_renouveler_at) order by c.created_at)
                          from public.comptes c where c.poster_id = p_poster and coalesce(c.type_compte, 'perso') = 'perso'), '[]'::jsonb),
    'comptes_actifs', (select count(*) from public.comptes c where c.poster_id = p_poster and c.is_active),
    'warmup', (select jsonb_build_object('pret', public.compte_pret(c.id), 'abonnements', w.abonnements, 'existe', w.existe, 'releve_at', w.releve_at, 'debut', c.warmup_started_at, 'fin', c.warmup_ends_at /* 0751 */,
                                         'minuteur', case when c.warmup_started_at is null or c.warmup_ends_at is null then 'attente'
                                                          when c.warmup_ends_at > now() then 'en_cours' else 'termine' end)
                 from public.comptes c left join lateral (select x.existe, x.abonnements, x.releve_at from public.ckd_warmup_releves x
                    where x.compte_id = c.id and x.existe is not null and (x.existe or public.releve_methode(x.erreur) = 'page+apify') order by x.releve_at desc limit 1) w on true
                where c.poster_id = p_poster and c.is_active and coalesce(c.type_compte, 'perso') = 'perso' order by c.created_at limit 1),
    'posts_aujourdhui', (select jsonb_build_object('prevus', count(*), 'publies', count(*) filter (where p.publie_at is not null)) from public.posts p join public.comptes c on c.id = p.compte_id
                          where c.poster_id = p_poster and p.pipeline_statut = 'done' and not coalesce(p.est_test, false) and p.date_publication_prevue = v_jour),
    'posts_semaine', (select jsonb_build_object('prevus', count(*), 'publies', count(*) filter (where p.publie_at is not null), 'liens', count(*) filter (where (p.publie_url is not null or p.credite_raison is not null)))
                        from public.posts p join public.comptes c on c.id = p.compte_id
                       where c.poster_id = p_poster and p.pipeline_statut = 'done' and not coalesce(p.est_test, false) and p.date_publication_prevue between v_lundi and v_lundi + 6),
    'arret', (select jsonb_build_object('source', a.source, 'motif', a.motif, 'le', a.created_at, 'statut', a.statut, 'semaine', a.semaine) from public.arrets a where a.poster_id = p_poster and a.annule_at is null order by a.created_at desc limit 1),
    'contrat_upwork', (select jsonb_build_object('id', uc.contrat_id, 'etat', uc.etat, 'actif', uc.actif, 'lu_at', uc.lu_at) from public.upwork_contrats uc where uc.contrat_id = pr.upwork_contract_id limit 1),
    'ruul', case when pr.canal_paie = 'ruul' then jsonb_build_object('onboarding', pr.ruul_onboarding, 'statut', pr.ruul_statut, 'compte', pr.ruul_compte) end,
    'paie', case when pr.canal_paie = 'ruul'
      then coalesce((select jsonb_agg(jsonb_build_object('semaine', rp.semaine, 'total', rp.montant + rp.bonus, 'statut', rp.statut, 'ruul_statut', rp.ruul_statut, 'paye_at', rp.paye_at) order by rp.semaine desc)
                       from (select * from public.ruul_paiements x where x.poster_id = p_poster and x.statut <> 'annule' order by x.semaine desc limit 4) rp), '[]'::jsonb)
      else coalesce((select jsonb_agg(jsonb_build_object('semaine', ps.semaine, 'montant', coalesce(ps.montant_corrige, ps.montant), 'statut', ps.statut, 'action', ps.action, 'paye_at', ps.paye_at) order by ps.semaine desc)
                       from (select * from public.paie_semaines x where x.poster_id = p_poster order by x.semaine desc limit 4) ps), '[]'::jsonb) end,
    'upwork_exception', (select jsonb_build_object('statut', u.statut, 'lien', u.profil_url is not null) from public.upwork_a_ajouter u where u.poster_id = p_poster order by u.demande_at desc limit 1));
end; $function$
;
