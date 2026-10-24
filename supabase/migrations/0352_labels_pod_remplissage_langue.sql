-- 0352 : un label 100 % pod se remplit langue par langue, sans règle de réserve.
--
-- LE PROBLÈME. Le choix de label met en dernier un label qui a moins de 7
-- jours de réserve. Pour un label dont tout le contenu est livré par un pod
-- (fathomly, that_girl_study, mentalmaxxing, white_bg), c'est un cercle
-- vicieux : le pod produit pour les comptes du label, donc sans compte il ne
-- produit pas, donc la réserve reste basse, donc le label ne reçoit jamais de
-- compte. Le 24/10 : fathomly 8 passages, that_girl_study 10, mentalmaxxing
-- 20, aucun nouveau compte depuis leur création.
--
-- LA RÈGLE (décidée par Adrien le 24/10). Pour un label 100 % pod :
--   * la réserve ne compte plus (ni « réserve basse », ni poids du stock) ;
--   * il ne va que dans une langue que son pod sert (sinon compte muet) ;
--   * il se remplit langue par langue : 1 compte dans chaque langue, puis 2,
--     etc. Un post livré sert toutes les langues, donc la charge du pod suit le
--     nombre de comptes PAR LANGUE ; remplir en largeur la garde égale.
--
-- CE QUE CETTE MIGRATION AJOUTE. Trois colonnes à `stats_choix_label` (le
-- moteur) et à `simulation_repartition` (la page Répartition, son miroir) :
--   * `pod_seul` : tous les contenus validés du label sont livrés ;
--   * `livre_langue` : le pod sert la langue du compte (deck livré dans cette
--     langue, ou dans sa langue de base pour une variante régionale, 0350) ;
--   * `niveau_pod` : les comptes du label dans sa langue la moins remplie,
--     parmi les AUTRES langues servies où l'application a recruté ces 14
--     derniers jours (une langue qui ne recrute pas ne retient personne).
--     Le label est « en avance » dans une langue quand il y a plus de comptes
--     que ce niveau : il attend que les autres rattrapent.
-- La décision reste dans `choix_label_equilibre.ts` (et son miroir front).
--
-- Le type de retour change : les deux fonctions sont supprimées puis recréées,
-- avec leurs droits d'avant (0287, 0348).
--
-- Retour arrière : réappliquer les deux fonctions de 0348 (après drop).

drop function if exists public.stats_choix_label(uuid[], uuid, text, text, integer);
drop function if exists public.simulation_repartition(uuid);

create or replace function public.stats_choix_label(
  p_labels uuid[],
  p_application uuid,
  p_langue text,
  p_pays text,
  p_recents integer
)
returns table (
  label_id uuid,
  comptes_langue integer,
  comptes_pays integer,
  comptes_total integer,
  passages_restants numeric,
  demande_jour numeric,
  passages integer,
  perf_label numeric,
  perf_flotte numeric,
  recents_langue integer,
  recence_langue integer,
  recents_pays integer,
  recence_pays integer,
  pod_seul boolean,
  livre_langue boolean,
  niveau_pod integer
)
language sql
stable
set search_path = public
as $function$
  with app as (
    select coalesce(p_application, '00000000-0000-4000-8000-000000000001'::uuid) as id
  ),
  cible as (
    select
      lower(nullif(trim(coalesce(p_langue, '')), '')) as langue,
      coalesce(
        upper(nullif(trim(coalesce(p_pays, '')), '')),
        public.pays_defaut_langue(nullif(trim(coalesce(p_langue, '')), ''))
      ) as pays,
      greatest(coalesce(p_recents, 0), 0) as fenetre
  ),
  lab as (
    select distinct unnest(p_labels) as label_id
  ),
  liens as (
    select cl.label_id, lower(c.langue) as langue, upper(c.pays) as pays
    from compte_labels cl
    join comptes c on c.id = cl.compte_id
    where c.is_active and cl.label_id = any(p_labels)
  ),
  -- La part livrée par un pod, lue une fois pour la réserve et pour les
  -- langues servies (0352).
  livre as materialized (
    select lv.label_id, lv.restants_livres, lv.restants_par_langue
    from label_application_reserve_livre lv
    cross join app
    where lv.application_id = app.id and lv.label_id = any(p_labels)
  ),
  -- Label 100 % pod (0352) : tous ses contenus validés sont livrés par un
  -- pod. Son stock suit les comptes (le pod produit pour eux) : la réserve ne
  -- le juge pas, il se remplit langue par langue.
  pod as (
    select xl.label_id, bool_and(c.livre) as seul
    from contenu_labels xl
    join contenus c on c.id = xl.contenu_id
     and c.statut = 'valide'::contenu_statut and c.import_statut = 'done'
    where xl.label_id = any(p_labels)
    group by xl.label_id
  ),
  -- Les langues de compte que le pod sert pour l'application.
  servies as (
    select lv.label_id, k.langue
    from livre lv
    cross join lateral jsonb_object_keys(lv.restants_par_langue) as k(langue)
  ),
  -- Les langues où l'application a recruté ces 14 derniers jours. Une langue
  -- qui ne recrute pas ne peut pas se remplir : elle ne retient pas les autres.
  recrutent as (
    select distinct lower(c.langue) as langue
    from comptes c
    join applications a on a.id = (select id from app)
    where c.is_active
      and c.langue is not null
      and c.created_at >= now() - interval '14 days'
      and case
        when c.parts_applications is null or c.parts_applications = '{}'::jsonb
          then (select id from app) = '00000000-0000-4000-8000-000000000001'::uuid
        when jsonb_typeof(c.parts_applications -> a.slug) = 'number'
          then (c.parts_applications ->> a.slug)::numeric > 0
        else false
      end
  ),
  -- Niveau de remplissage : les comptes du label dans sa langue la moins
  -- remplie, parmi les AUTRES langues servies qui recrutent. Nul s'il n'y en
  -- a aucune.
  niveau as (
    select s.label_id,
           min((select count(*) from liens l where l.label_id = s.label_id and l.langue = s.langue)) as n
    from servies s
    join recrutent r on r.langue = s.langue
    cross join cible
    where s.langue is distinct from cible.langue
    group by s.label_id
  ),
  -- La réserve, amputée de ce que le pod n'a pas livré dans CETTE langue
  -- (0348). Sans langue (passe de fermeture de la nuit), la réserve d'avant.
  reserve as (
    select
      r.label_id,
      case
        when cible.langue is null then r.passages_restants
        else greatest(
          r.passages_restants
            - coalesce(lv.restants_livres, 0)
            + coalesce((lv.restants_par_langue ->> cible.langue)::numeric, 0),
          0
        )
      end as passages_restants,
      r.demande_jour
    from label_application_reserve r
    cross join app
    cross join cible
    left join livre lv on lv.label_id = r.label_id
    where r.application_id = app.id and r.label_id = any(p_labels)
  ),
  publies as (
    select xl.label_id, pa.vues, lower(pa.langue) as langue
    from passages pa
    join contenu_labels xl on xl.contenu_id = pa.contenu_id
    cross join app
    where xl.label_id = any(p_labels)
      and pa.statut = 'publie'
      and pa.publie_at >= now() - interval '28 days'
      and pa.vues is not null
      and pa.langue is not null
      and coalesce(pa.application_id, '00000000-0000-4000-8000-000000000001'::uuid) = app.id
  ),
  mediane_langue as (
    select p.langue, percentile_cont(0.5) within group (order by p.vues) as med
    from publies p
    group by p.langue
  ),
  rapports as (
    select p.label_id, p.vues / m.med as rapport
    from publies p
    join mediane_langue m on m.langue = p.langue
    where m.med > 0
  ),
  perf as (
    select r.label_id, count(*) as n, percentile_cont(0.5) within group (order by r.rapport) as med
    from rapports r
    group by r.label_id
  ),
  flotte as (
    select percentile_cont(0.5) within group (order by r.rapport) as med from rapports r
  ),
  recents_langue as (
    select c.id, row_number() over (order by c.created_at desc, c.id desc) as rang
    from comptes c, cible
    where c.is_active
      and cible.langue is not null
      and lower(c.langue) = cible.langue
      and exists (select 1 from compte_labels x where x.compte_id = c.id and x.label_id = any(p_labels))
    order by c.created_at desc, c.id desc
    limit (select fenetre from cible)
  ),
  recents_pays as (
    select c.id, row_number() over (order by c.created_at desc, c.id desc) as rang
    from comptes c, cible
    where c.is_active
      and cible.pays is not null
      and upper(c.pays) = cible.pays
      and exists (select 1 from compte_labels x where x.compte_id = c.id and x.label_id = any(p_labels))
    order by c.created_at desc, c.id desc
    limit (select fenetre from cible)
  ),
  porteurs_langue as (
    select x.label_id, count(distinct r.id) as nb, max((select fenetre from cible) + 1 - r.rang) as recence
    from recents_langue r
    join compte_labels x on x.compte_id = r.id
    where x.label_id = any(p_labels)
    group by x.label_id
  ),
  porteurs_pays as (
    select x.label_id, count(distinct r.id) as nb, max((select fenetre from cible) + 1 - r.rang) as recence
    from recents_pays r
    join compte_labels x on x.compte_id = r.id
    where x.label_id = any(p_labels)
    group by x.label_id
  )
  select
    lab.label_id,
    (select count(*) from liens l, cible
      where l.label_id = lab.label_id and cible.langue is not null and l.langue = cible.langue)::integer,
    (select count(*) from liens l, cible
      where l.label_id = lab.label_id and cible.pays is not null and l.pays = cible.pays)::integer,
    (select count(*) from liens l where l.label_id = lab.label_id)::integer,
    coalesce(reserve.passages_restants, 0)::numeric,
    coalesce(reserve.demande_jour, 0)::numeric,
    coalesce(perf.n, 0)::integer,
    perf.med::numeric,
    (select med from flotte)::numeric,
    coalesce(pl.nb, 0)::integer,
    coalesce(pl.recence, 0)::integer,
    coalesce(pp.nb, 0)::integer,
    coalesce(pp.recence, 0)::integer,
    coalesce(pod.seul, false),
    (select cb.langue is null
        or exists (select 1 from servies s where s.label_id = lab.label_id and s.langue = cb.langue)
      from cible cb),
    niveau.n::integer
  from lab
  left join reserve on reserve.label_id = lab.label_id
  left join perf on perf.label_id = lab.label_id
  left join porteurs_langue pl on pl.label_id = lab.label_id
  left join porteurs_pays pp on pp.label_id = lab.label_id
  left join pod on pod.label_id = lab.label_id
  left join niveau on niveau.label_id = lab.label_id;
$function$;

comment on function public.stats_choix_label(uuid[], uuid, text, text, integer) is
  'Entrées du choix de label à la création : présence par langue/pays/flotte, réserve (consciente de la langue pour les contenus livrés, 0348), performance sur 28 jours, fenêtre anti-rafale, remplissage des labels 100 % pod (0352).';

revoke all on function public.stats_choix_label(uuid[], uuid, text, text, integer) from public;
revoke all on function public.stats_choix_label(uuid[], uuid, text, text, integer) from anon;
revoke all on function public.stats_choix_label(uuid[], uuid, text, text, integer) from authenticated;
grant execute on function public.stats_choix_label(uuid[], uuid, text, text, integer) to service_role;

create or replace function public.simulation_repartition(
  p_application uuid default '00000000-0000-4000-8000-000000000001'::uuid
)
returns table (
  langue text,
  pays text,
  label_id uuid,
  label_nom text,
  comptes_langue integer,
  comptes_pays integer,
  comptes_total integer,
  passages_restants numeric,
  demande_jour numeric,
  passages integer,
  perf_label numeric,
  perf_flotte numeric,
  recents_langue integer,
  recence_langue integer,
  recents_pays integer,
  recence_pays integer,
  pod_seul boolean,
  livre_langue boolean,
  niveau_pod integer
)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_app uuid := coalesce(p_application, '00000000-0000-4000-8000-000000000001'::uuid);
  v_recents integer := 3;
  v_pool uuid[];
begin
  if not public.is_admin() then
    raise exception 'reserve aux administrateurs' using errcode = '42501';
  end if;

  select coalesce(array_agg(l.id), '{}'::uuid[]) into v_pool
  from public.labels l
  where coalesce(l.slug, '') not in ('hook', 'ugc-ai-video')
    and coalesce(lower(l.nom), '') not in ('hook', 'ugc ai video')
    and (
      exists (
        select 1 from public.label_applications la
        where la.label_id = l.id and la.application_id = v_app
      )
      -- Héritage : un label sans aucune ligne sert Sophia.
      or (
        v_app = '00000000-0000-4000-8000-000000000001'::uuid
        and not exists (select 1 from public.label_applications la where la.label_id = l.id)
      )
    );

  if array_length(v_pool, 1) is null then
    return;
  end if;

  return query
  with lab as materialized (
    select distinct unnest(v_pool) as label_id
  ),
  marches as materialized (
    select distinct
      co.langue as lg_brut, lower(co.langue) as lg,
      co.pays as py_brut, upper(co.pays) as py
    from public.comptes co
    where co.is_active
      and coalesce(co.type_compte, '') <> 'cm'
      and coalesce(co.ugc_ai_video, false) = false
      and co.langue is not null
  ),
  liens as materialized (
    select cl.label_id, lower(c.langue) as langue, upper(c.pays) as pays
    from public.compte_labels cl
    join public.comptes c on c.id = cl.compte_id
    where c.is_active and cl.label_id = any(v_pool)
  ),
  par_langue as materialized (
    select label_id, langue, count(*) as n from liens group by 1, 2
  ),
  par_pays as materialized (
    select label_id, pays, count(*) as n from liens where pays is not null group by 1, 2
  ),
  par_total as materialized (
    select label_id, count(*) as n from liens group by 1
  ),
  reserve as materialized (
    select r.label_id, r.passages_restants, r.demande_jour
    from public.label_application_reserve r
    where r.application_id = v_app and r.label_id = any(v_pool)
  ),
  -- La part livrée par un pod, et ses langues (0348). Matérialisée comme le
  -- reste : la page tient dans 8 secondes.
  livre as materialized (
    select lv.label_id, lv.restants_livres, lv.restants_par_langue
    from public.label_application_reserve_livre lv
    where lv.application_id = v_app and lv.label_id = any(v_pool)
  ),
  -- Label 100 % pod (0352) : tous ses contenus validés sont livrés par un
  -- pod. Son stock suit les comptes (le pod produit pour eux) : la réserve ne
  -- le juge pas, il se remplit langue par langue.
  pod as materialized (
    select xl.label_id, bool_and(c.livre) as seul
    from public.contenu_labels xl
    join public.contenus c on c.id = xl.contenu_id
     and c.statut = 'valide'::contenu_statut and c.import_statut = 'done'
    where xl.label_id = any(v_pool)
    group by xl.label_id
  ),
  -- Les langues de compte que le pod sert pour l'application.
  servies as materialized (
    select lv.label_id, k.langue
    from livre lv
    cross join lateral jsonb_object_keys(lv.restants_par_langue) as k(langue)
  ),
  -- Les langues où l'application a recruté ces 14 derniers jours. Une langue
  -- qui ne recrute pas ne peut pas se remplir : elle ne retient pas les autres.
  recrutent as materialized (
    select distinct lower(c.langue) as langue
    from public.comptes c
    join public.applications a on a.id = v_app
    where c.is_active
      and c.langue is not null
      and c.created_at >= now() - interval '14 days'
      and case
        when c.parts_applications is null or c.parts_applications = '{}'::jsonb
          then v_app = '00000000-0000-4000-8000-000000000001'::uuid
        when jsonb_typeof(c.parts_applications -> a.slug) = 'number'
          then (c.parts_applications ->> a.slug)::numeric > 0
        else false
      end
  ),
  -- Les langues servies qui recrutent, avec les comptes du label dans chacune.
  servies_actives as materialized (
    select s.label_id, s.langue, coalesce(pl.n, 0) as n
    from servies s
    join recrutent r on r.langue = s.langue
    left join par_langue pl on pl.label_id = s.label_id and pl.langue = s.langue
  ),
  publies as materialized (
    select xl.label_id, pa.vues, lower(pa.langue) as langue
    from public.passages pa
    join public.contenu_labels xl on xl.contenu_id = pa.contenu_id
    where xl.label_id = any(v_pool)
      and pa.statut = 'publie'
      and pa.publie_at >= now() - interval '28 days'
      and pa.vues is not null
      and pa.langue is not null
      and coalesce(pa.application_id, '00000000-0000-4000-8000-000000000001'::uuid) = v_app
  ),
  mediane_langue as materialized (
    select p.langue, percentile_cont(0.5) within group (order by p.vues) as med
    from publies p group by p.langue
  ),
  rapports as materialized (
    select p.label_id, p.vues / m.med as rapport
    from publies p join mediane_langue m on m.langue = p.langue
    where m.med > 0
  ),
  perf as materialized (
    select r.label_id, count(*) as n,
           percentile_cont(0.5) within group (order by r.rapport) as med
    from rapports r group by r.label_id
  ),
  flotte as materialized (
    select percentile_cont(0.5) within group (order by r.rapport) as med from rapports r
  ),
  candidats as materialized (
    select c.id, lower(c.langue) as langue, upper(c.pays) as pays, c.created_at
    from public.comptes c
    where c.is_active
      and exists (
        select 1 from public.compte_labels x
        where x.compte_id = c.id and x.label_id = any(v_pool)
      )
  ),
  rang_langue as materialized (
    select id, langue,
           row_number() over (partition by langue order by created_at desc, id desc) as rang
    from candidats where langue is not null
  ),
  rang_pays as materialized (
    select id, pays,
           row_number() over (partition by pays order by created_at desc, id desc) as rang
    from candidats where pays is not null
  ),
  porteurs_langue as materialized (
    select r.langue, x.label_id, count(distinct r.id) as nb,
           max(v_recents + 1 - r.rang) as recence
    from rang_langue r join public.compte_labels x on x.compte_id = r.id
    where r.rang <= v_recents and x.label_id = any(v_pool)
    group by 1, 2
  ),
  porteurs_pays as materialized (
    select r.pays, x.label_id, count(distinct r.id) as nb,
           max(v_recents + 1 - r.rang) as recence
    from rang_pays r join public.compte_labels x on x.compte_id = r.id
    where r.rang <= v_recents and x.label_id = any(v_pool)
    group by 1, 2
  )
  select
    m.lg_brut,
    m.py_brut,
    lab.label_id,
    l.nom,
    coalesce(pl.n, 0)::integer,
    coalesce(pp.n, 0)::integer,
    coalesce(pt.n, 0)::integer,
    greatest(
      coalesce(res.passages_restants, 0)
        - coalesce(lv.restants_livres, 0)
        + coalesce((lv.restants_par_langue ->> m.lg)::numeric, 0),
      0
    )::numeric,
    coalesce(res.demande_jour, 0)::numeric,
    coalesce(perf.n, 0)::integer,
    perf.med::numeric,
    (select med from flotte)::numeric,
    coalesce(rl.nb, 0)::integer,
    coalesce(rl.recence, 0)::integer,
    coalesce(rp.nb, 0)::integer,
    coalesce(rp.recence, 0)::integer,
    coalesce(pod.seul, false),
    exists (select 1 from servies s where s.label_id = lab.label_id and s.langue = m.lg),
    (select min(sa.n) from servies_actives sa
      where sa.label_id = lab.label_id and sa.langue <> m.lg)::integer
  from marches m
  cross join lab
  join public.labels l on l.id = lab.label_id
  left join par_langue pl on pl.label_id = lab.label_id and pl.langue = m.lg
  left join par_pays pp on pp.label_id = lab.label_id and pp.pays = m.py
  left join par_total pt on pt.label_id = lab.label_id
  left join reserve res on res.label_id = lab.label_id
  left join livre lv on lv.label_id = lab.label_id
  left join perf on perf.label_id = lab.label_id
  left join porteurs_langue rl on rl.label_id = lab.label_id and rl.langue = m.lg
  left join porteurs_pays rp on rp.label_id = lab.label_id and rp.pays = m.py
  left join pod on pod.label_id = lab.label_id
  order by m.lg_brut, m.py_brut, l.nom;
end;
$$;

comment on function public.simulation_repartition(uuid) is
  'Entrées du choix de label (0287) pour tous les marchés (langue × pays) d''une application, en une seule passe (0307), réserve consciente de la langue pour les contenus livrés (0348), remplissage des labels 100 % pod (0352). Lecture seule, admin uniquement : alimente la page Répartition. Ne choisit rien, le classement se fait côté front avec le miroir de choix_label_equilibre.ts.';

revoke all on function public.simulation_repartition(uuid) from public;
revoke execute on function public.simulation_repartition(uuid) from anon;
grant execute on function public.simulation_repartition(uuid) to authenticated;
