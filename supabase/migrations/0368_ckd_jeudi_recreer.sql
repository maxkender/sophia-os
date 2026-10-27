-- 0368 : le jeudi recrée directement (point A, 27/10).
--
-- 1. `ckd_calculer` : le jeudi propose
--      - « Recréer » (pré-choisi) pour un nouveau compte sans réveil (motif
--        reveil) ou signalé shadowban, et pour la règle « anciens », qui passe
--        du samedi au jeudi ; « Nudge » sinon ;
--      - les comptes de la page Shadowban (0362), en plus des nouveaux.
--    Un posteur déjà recréé une fois n'a plus jamais « Recréer » : la règle
--    anciens le propose le samedi en « Kill » (ne pas renouveler). Les arrêts
--    restent le samedi. Le corps est celui de 0327, ces changements à part.
-- 2. `ckd_decisions_permises` : le jeudi = Nudge, Recréer, Rien.
-- 3. À la recréation (jeudi, ou « Nouveau compte » de la page Shadowban),
--    `ckd_compte_cree` et `ckd_shadowban_compte_cree` retirent en plus les
--    posts non publiés de l'ancien compte à partir d'aujourd'hui (Paris) :
--    ils ne comptent ni comme manqués, ni dans la paie (qui compte les posts
--    prévus). L'arrêt immédiat de l'ancien compte est celui de 0366.
-- 4. `ckd_recreations` : deux colonnes pour le message Slack au posteur
--    (envoyé, ou ID Slack introuvable), écrites par la fonction `ckd`.
-- 5. `ckd_mes_recreations()` : le bandeau de l'espace du posteur (ses
--    recréations des 10 derniers jours).
--
-- Additive : deux colonnes ajoutées (vides), deux fonctions nouvelles, quatre
-- fonctions réécrites à signature identique. La migration ne modifie ni ne
-- supprime aucune ligne. Seule l'action « Recréer », quand un admin la valide,
-- retire les posts non publiés de l'ancien compte (point 3).
-- Retour arrière : réappliquer ckd_calculer (0327), ckd_decisions_permises
-- (0328), ckd_compte_cree et ckd_shadowban_compte_cree (0366) ;
-- drop function public.ckd_retirer_posts_a_venir(uuid),
--               public.ckd_mes_recreations().

set lock_timeout = '10s';

-- ---------------------------------------------------------------------------
-- 1. Les règles
-- ---------------------------------------------------------------------------
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
   where not (t.regle = 'doubler' and t.a_un_kill)
     and not (t.regle = 'jeudi' and t.recree_anciens);
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Les décisions du jeudi
-- ---------------------------------------------------------------------------
create or replace function public.ckd_decisions_permises(p_regle text)
returns text[]
language sql
immutable
as $$
  select case p_regle
    when 'jeudi'            then array['nudge', 'recreer', 'rien']
    when 'absent'           then array['ne_pas_renouveler', 'nudge', 'garder']
    when 'premiere_semaine' then array['ne_pas_renouveler', 'recreer', 'garder']
    when 'anciens'          then array['recreer', 'ne_pas_renouveler', 'garder']
    when 'doubler'          then array['doubler', 'pas_maintenant']
    else array[]::text[]
  end
$$;

-- ---------------------------------------------------------------------------
-- 3. Recréer : l'ancien compte s'arrête, ses posts à venir sont retirés
-- ---------------------------------------------------------------------------
-- Les posts pas encore publiés d'un compte, à partir d'aujourd'hui (Paris) :
-- passages, puis leurs posts (comme la recharge d'un post, `revoquer-post`).
-- Les posts publiés et les jours passés ne bougent pas. Rend le nombre retiré.
create or replace function public.ckd_retirer_posts_a_venir(p_compte uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_auj date := (now() at time zone 'Europe/Paris')::date;
  v_posts uuid[];
  v_n integer;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'ckd_retirer_posts_a_venir : réservé à la fonction ckd';
  end if;
  select coalesce(array_agg(distinct p.post_id) filter (where p.post_id is not null), '{}')
    into v_posts
    from public.passages p
   where p.compte_id = p_compte
     and p.date_publication_prevue >= v_auj
     and p.publie_url is null and p.publie_at is null and p.statut::text <> 'publie';
  delete from public.passages p
   where p.compte_id = p_compte
     and p.date_publication_prevue >= v_auj
     and p.publie_url is null and p.publie_at is null and p.statut::text <> 'publie';
  get diagnostics v_n = row_count;
  delete from public.posts po
   where po.id = any(v_posts)
     and po.publie_at is null
     and po.publie_url is null
     and not exists (select 1 from public.passages x where x.post_id = po.id);
  return v_n;
end;
$$;

create or replace function public.ckd_compte_cree(p_id uuid, p_compte uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  p public.ckd_propositions%rowtype;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'ckd_compte_cree : réservé à la fonction ckd';
  end if;
  select * into p from public.ckd_propositions where id = p_id for update;
  if not found or p.decision not in ('recreer', 'doubler') then
    raise exception 'ckd_compte_cree : proposition introuvable ou pas en Recréer / Doubler';
  end if;
  update public.ckd_propositions set nouveau_compte_id = p_compte, erreur = null where id = p_id;
  if p.decision = 'recreer' then
    insert into public.ckd_recreations (poster_id, ancien_compte_id, nouveau_compte_id, regle, proposition_id, decide_par)
    values (p.poster_id, p.compte_id, p_compte, p.regle, p_id, p.decision_par);
    -- L'ancien compte part en Archive maintenant (0366), plus le dimanche soir.
    insert into public.ckd_arrets as a (compte_id, proposition_id, raison, prevu_at, decide_par)
    values (p.compte_id, p_id, 'recreer', now(), p.decision_par)
    on conflict (compte_id) do update
      set proposition_id = excluded.proposition_id, raison = excluded.raison, prevu_at = excluded.prevu_at,
          decide_par = excluded.decide_par, annule_at = null
      where a.fait_at is null;
    perform public.ckd_arreter_comptes();
    -- Ses posts à venir ne comptent plus comme manqués (0368).
    perform public.ckd_retirer_posts_a_venir(p.compte_id);
  end if;
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
  -- L'ancien compte part en Archive maintenant (0366), plus le dimanche soir.
  insert into public.ckd_arrets as a (compte_id, proposition_id, raison, prevu_at, decide_par)
  values (p_compte, null, 'recreer', now(), r.recreation_par)
  on conflict (compte_id) do update
    set proposition_id = excluded.proposition_id, raison = excluded.raison, prevu_at = excluded.prevu_at,
        decide_par = excluded.decide_par, annule_at = null
    where a.fait_at is null;
  perform public.ckd_arreter_comptes();
  -- Ses posts à venir ne comptent plus comme manqués (0368).
  perform public.ckd_retirer_posts_a_venir(p_compte);
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Le message Slack au posteur
-- ---------------------------------------------------------------------------
alter table public.ckd_recreations add column if not exists slack_statut text
  check (slack_statut in ('envoye', 'introuvable', 'erreur'));
alter table public.ckd_recreations add column if not exists slack_at timestamptz;

comment on column public.ckd_recreations.slack_statut is
  'Message Slack au posteur (0368) : envoye, introuvable (aucun ID Slack pour email_perso ni email), erreur. Null : pas encore tenté.';

-- ---------------------------------------------------------------------------
-- 5. Le bandeau du posteur
-- ---------------------------------------------------------------------------
-- Ses recréations des 10 derniers jours : ancien et nouveau @, date, et le
-- lundi des premiers posts du nouveau compte (le lundi qui suit la recréation).
create or replace function public.ckd_mes_recreations()
returns table (ancien_handle text, nouveau_handle text, le date, lundi date)
language sql
stable
security definer
set search_path = public
as $$
  select a.handle_tiktok, n.handle_tiktok, j.jour,
         j.jour + (8 - extract(isodow from j.jour)::int)
    from public.ckd_recreations r
    join public.comptes a on a.id = r.ancien_compte_id
    join public.comptes n on n.id = r.nouveau_compte_id
    cross join lateral (select (r.created_at at time zone 'Europe/Paris')::date as jour) j
   where r.poster_id = auth.uid()
     and r.created_at > now() - interval '10 days'
     and n.is_active
   order by r.created_at desc;
$$;

revoke execute on function public.ckd_retirer_posts_a_venir(uuid) from public, anon, authenticated;
grant execute on function public.ckd_retirer_posts_a_venir(uuid) to service_role;
revoke execute on function public.ckd_mes_recreations() from public, anon;
grant execute on function public.ckd_mes_recreations() to authenticated, service_role;

notify pgrst, 'reload schema';
