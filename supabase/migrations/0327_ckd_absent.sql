-- 0327 : Check, Kill or Double, règle « Absent » (retour du 20/10).
--
-- POURQUOI. Aucune règle du samedi ne voyait les posteurs qui ne postent pas :
-- un post jamais publié n'a pas de vues, donc il n'est jamais « mort », et un
-- compte qui poste peu n'atteint pas les 20 posts relevés de la règle des
-- comptes anciens. Sur la semaine du 12 au 16/10, 7 comptes n'avaient rien
-- publié et 2 en avaient manqué 5 ou plus, sans aucune proposition.
--
-- CE QUI CHANGE.
--   * Règle « absent » (samedi) : au moins `manques_absent` (4 par défaut)
--     posts manqués ou sans lien sur les 10 du lundi au vendredi → Kill (ne
--     pas renouveler). Même seuil que la case « inactif » de la page
--     Surveillance (6 posts sur 10 ou moins). La page permet aussi Nudge ou
--     Garder à la place. Un posteur qui sort en Absent n'est pas proposé au
--     doublement.
--   * `ckd_manques_semaine` : les comptes qui ont manqué au moins un post dans
--     la semaine, affichés pour info sous les propositions.
--
-- Attention : l'OS ne sait que « le poster n'a pas collé son lien ». Un compte
-- qui poste sur TikTok sans passer par l'OS sort aussi : le HM vérifie.
--
-- Retour arrière : remettre `ckd_calculer` de 0326, retirer 'absent' et
-- 'manques_absent' des deux contraintes, supprimer le réglage `manques_absent`
-- et la fonction `ckd_manques_semaine`.

set lock_timeout = '10s';

alter table public.ckd_reglages drop constraint if exists ckd_reglages_cle_check;
alter table public.ckd_reglages add constraint ckd_reglages_cle_check check (cle in (
  'seuil_bon_post', 'vues_min_j2', 'seuil_mort', 'morts_premiere_semaine',
  'age_min_heures', 'part_mediane_pays', 'anciennete_semaines', 'posts_min_anciens',
  'bons_posts_doubler', 'manques_max_doubler', 'doublement_autorise', 'comptes_min_mediane',
  'manques_absent'));

alter table public.ckd_propositions drop constraint if exists ckd_propositions_regle_check;
alter table public.ckd_propositions add constraint ckd_propositions_regle_check
  check (regle in ('jeudi', 'premiere_semaine', 'anciens', 'doubler', 'absent'));

insert into public.ckd_reglages (cle, pays, valeur)
select 'manques_absent', null, '4'::jsonb
 where not exists (select 1 from public.ckd_reglages
                    where cle = 'manques_absent' and pays is null and label_id is null);

create or replace function public.ckd_calculer(p_type text, p_jour date)
returns table (
  regle       text,
  action      text,
  compte_id   uuid,
  poster_id   uuid,
  hm_id       uuid,
  pays        text,
  langue      text,
  label_id    uuid,
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
           exists (select 1 from public.hub_posteurs h where h.profile_id = c.poster_id) as ruul
      from public.comptes c
      join public.profiles pr on pr.id = c.poster_id
     where c.is_active
       and coalesce(pr.is_active, true)
       and c.type_compte = 'perso'
       and not coalesce(c.ugc_ai_video, false)
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
  cand as (
    select e.id, 'jeudi'::text as regle,
           public.ckd_detail(e.id, e.j0, v_vendredi, e.age_min, e.seuil_mort, e.seuil_bon, 4) as d
      from elig e
     where p_type = 'jeudi' and e.j0 between p_jour - 9 and p_jour - 3
    union all
    select e.id, 'premiere_semaine',
           public.ckd_detail(e.id, e.j0, e.j0 + 4, e.age_min, e.seuil_mort, e.seuil_bon)
      from elig e
     where p_type = 'samedi' and e.j0 between v_lundi - 6 and v_lundi
    union all
    select e.id, 'anciens',
           public.ckd_detail(e.id, v_vendredi - 27, v_vendredi, e.age_min, e.seuil_mort, e.seuil_bon)
      from elig e
     where p_type = 'samedi'
       and e.j0 <= v_vendredi - (7 * coalesce((e.r->'anciennete_semaines'->>'v')::integer, 4) - 1)
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
       and e.j0 <= v_lundi
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
             when 'jeudi' then
               case when cardinality(m.motifs) > 0 then 'nudge' end
             when 'premiere_semaine' then
               case when (k.d->>'morts')::int >= coalesce((c.r->'morts_premiere_semaine'->>'v')::numeric, 3)
                    then 'ne_pas_renouveler' end
             when 'anciens' then
               case when (k.d->>'mesures')::int >= coalesce((c.r->'posts_min_anciens'->>'v')::numeric, 20)
                     and coalesce((k.d->'haut'->>'vues')::numeric, 0) < c.seuil_bon
                     and (k.d->>'mediane')::numeric
                         < coalesce((c.r->'part_mediane_pays'->>'v')::numeric, 0.6) * (rf.mediane_ref->>'valeur')::numeric
                    then case when exists (select 1 from public.ckd_recreations x
                                            where x.poster_id = c.poster_id and x.regle = 'anciens')
                              then 'ne_pas_renouveler' else 'recreer' end end
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
           bool_or(d.action in ('recreer', 'ne_pas_renouveler')) over (partition by d.id) as a_un_kill
      from dec d
     where d.action is not null
       -- « Garder » ou « Pas maintenant » pour la même règle : rien pendant 14 jours.
       and not exists (
         select 1 from public.ckd_propositions o
          where o.compte_id = d.id and o.regle = d.regle
            and o.decision in ('garder', 'pas_maintenant')
            and o.decision_at > p_jour - 14)
  )
  select t.regle, t.action, c.id, c.poster_id, c.hm_id, c.pays, c.langue, c.label_id, c.application,
         jsonb_build_object(
           'handle', c.handle_tiktok,
           'abonnes', (select cp.abonnes from public.compte_profils cp where cp.compte_id = c.id),
           'j0', j.j0,
           'periode', t.d,
           'motifs', to_jsonb(coalesce(t.motifs, array[]::text[])),
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
   -- Un posteur qui sort aussi en kill n'est pas proposé au doublement.
   where not (t.regle = 'doubler' and t.a_un_kill);
end;
$$;


-- Les comptes qui ont manqué au moins un post du lundi au vendredi (pour info).
create or replace function public.ckd_manques_semaine(p_jour date)
returns table (compte_id uuid, handle text, poster_id uuid, hm_id uuid, pays text,
               prevus bigint, publies bigint, jours jsonb)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
begin
  if not public.is_admin() then
    raise exception 'ckd_manques_semaine : réservé à l''admin';
  end if;
  return query
  select c.id, c.handle_tiktok, c.poster_id, pr.manager_id, c.pays,
         count(p.id),
         count(p.id) filter (where p.publie_url is not null),
         coalesce(jsonb_agg(p.date_publication_prevue order by p.date_publication_prevue)
                    filter (where p.publie_url is null), '[]'::jsonb)
    from public.comptes c
    join public.profiles pr on pr.id = c.poster_id
    join public.passages p on p.compte_id = c.id
                          and not coalesce(p.est_rappel, false)
                          and p.statut <> 'brouillon'
                          and p.date_publication_prevue between p_jour - 5 and p_jour - 1
   where c.is_active
     and coalesce(pr.is_active, true)
     and c.type_compte = 'perso'
     and not coalesce(c.ugc_ai_video, false)
     and not coalesce(c.videos_uniquement, false)
     and not coalesce(c.non_renouveler, false)
     and not exists (select 1 from public.hub_posteurs h where h.profile_id = c.poster_id)
   group by c.id, c.handle_tiktok, c.poster_id, pr.manager_id, c.pays
  having count(p.id) filter (where p.publie_url is null) > 0;
end;
$$;

revoke all on function public.ckd_manques_semaine(date) from public, anon;
grant execute on function public.ckd_manques_semaine(date) to authenticated, service_role;

notify pgrst, 'reload schema';
