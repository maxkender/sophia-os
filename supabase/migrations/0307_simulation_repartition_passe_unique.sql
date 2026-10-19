-- 0307 : la page Répartition ne doit plus dépasser le délai de 8 secondes.
--
-- LE SYMPTÔME. `canceling statement due to statement timeout` à l'ouverture de
-- /admin/repartition. Le rôle `authenticated` est coupé à 8 s (anon à 3 s) ;
-- `simulation_repartition` mettait 7,0 s en moyenne et passait la barre dès
-- que la base était un peu chargée.
--
-- LA CAUSE. La version 0305 appelait `stats_choix_label` en LATERAL, une fois
-- par marché, soit 36 appels. Or l'essentiel de ce que cette fonction calcule
-- ne dépend pas du marché : la réserve par label, les vues publiées sur 28
-- jours, la médiane par langue, la performance de chaque label et celle de la
-- flotte sont les mêmes pour les 36 marchés. On les recalculait 36 fois. La
-- seule part qui dépend du marché est un filtre sur langue et pays.
--
-- LE CORRECTIF. Une seule passe : tout ce qui est commun est calculé une fois,
-- et les 36 marchés se contentent de JOINdre dessus. 7046 ms -> 531 ms.
--
-- POURQUOI `AS MATERIALIZED` PARTOUT. Sans ça, PostgreSQL inline une CTE
-- référencée une seule fois. Ici il estimait `rows=1` là où `marches` en rend
-- 36, choisissait une boucle imbriquée, et RÉ-EXÉCUTAIT `reserve` (donc la vue
-- `label_application_reserve`, 261 ms à elle seule) une fois par ligne. La
-- première réécriture, sans `MATERIALIZED`, mettait 7046 ms : aussi lent
-- qu'avant. `MATERIALIZED` force une évaluation unique et c'est tout le gain.
-- Ne pas les retirer en croyant simplifier.
--
-- IDENTIQUE À L'ANCIENNE. Vérifié en transaction annulée contre la prod, les
-- deux versions côte à côte : 288 lignes chacune, 0 ligne en écart dans un
-- sens comme dans l'autre. La signature, les noms et les types de colonnes ne
-- bougent pas, le front n'a rien à changer.
--
-- Les clés de marché restent la langue et le pays BRUTS (`lg_brut`, `py_brut`,
-- jamais la version normalisée) : la page apparie ses deux tableaux sur
-- `langue|pays`, et `simulation_repartition_apps` groupe sur les valeurs
-- brutes. Normaliser ici désaccorderait les deux.
--
-- Retour arrière : réappliquer 0305.

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
  -- `numeric` et pas `integer` : c'est le type que rend `stats_choix_label`,
  -- et un `integer` ici fait échouer la fonction à l'exécution.
  passages_restants numeric,
  demande_jour numeric,
  passages integer,
  perf_label numeric,
  perf_flotte numeric,
  recents_langue integer,
  recence_langue integer,
  recents_pays integer,
  recence_pays integer
)
language plpgsql
stable
security definer
set search_path = public
as $$
-- Les paramètres de sortie portent le nom de colonnes réelles (`langue`,
-- `pays`, `label_id`). Sans cette directive, plpgsql peut rendre la référence
-- ambiguë et la fonction échouerait à l'exécution, pas à la création.
#variable_conflict use_column
declare
  v_app uuid := coalesce(p_application, '00000000-0000-4000-8000-000000000001'::uuid);
  -- Le 5e argument que 0305 passait à `stats_choix_label` : la profondeur de
  -- la fenêtre « comptes récents » qui sert à départager deux labels à égalité.
  v_recents integer := 3;
  v_pool uuid[];
begin
  -- Réservée à l'admin : ces chiffres disent où partiront les prochaines
  -- recrues, ce n'est pas une donnée de poster.
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
  -- Un marché = un couple (langue, pays) réellement peuplé par les comptes
  -- servis par l'assignation. On garde la valeur brute POUR LA SORTIE et la
  -- valeur normalisée POUR LES JOINTURES.
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
  -- Présence : combien de comptes actifs portent déjà chaque label.
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
  -- Runway du stock. Indépendant du marché : c'est ici que se jouait le plus
  -- gros du temps perdu.
  reserve as materialized (
    select r.label_id, r.passages_restants, r.demande_jour
    from public.label_application_reserve r
    where r.application_id = v_app and r.label_id = any(v_pool)
  ),
  -- Performance : vues publiées sur 28 jours, rapportées à la médiane de la
  -- langue pour qu'un label servi surtout en turc ne soit pas comparé à un
  -- label servi surtout en anglais.
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
  -- Départage : les N derniers comptes créés dans la langue et dans le pays,
  -- pour éviter deux fois le même label d'affilée.
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
    coalesce(res.passages_restants, 0)::numeric,
    coalesce(res.demande_jour, 0)::numeric,
    coalesce(perf.n, 0)::integer,
    perf.med::numeric,
    (select med from flotte)::numeric,
    coalesce(rl.nb, 0)::integer,
    coalesce(rl.recence, 0)::integer,
    coalesce(rp.nb, 0)::integer,
    coalesce(rp.recence, 0)::integer
  from marches m
  cross join lab
  join public.labels l on l.id = lab.label_id
  left join par_langue pl on pl.label_id = lab.label_id and pl.langue = m.lg
  left join par_pays pp on pp.label_id = lab.label_id and pp.pays = m.py
  left join par_total pt on pt.label_id = lab.label_id
  left join reserve res on res.label_id = lab.label_id
  left join perf on perf.label_id = lab.label_id
  left join porteurs_langue rl on rl.label_id = lab.label_id and rl.langue = m.lg
  left join porteurs_pays rp on rp.label_id = lab.label_id and rp.pays = m.py
  order by m.lg_brut, m.py_brut, l.nom;
end;
$$;

comment on function public.simulation_repartition(uuid) is
  'Entrées du choix de label (0287) pour tous les marchés (langue × pays) d''une application, en une seule passe (0307). Lecture seule, admin uniquement : alimente la page Répartition. Ne choisit rien, le classement se fait côté front avec le miroir de choix_label_equilibre.ts.';

-- `create or replace` conserve les droits existants, mais une base reconstruite
-- depuis zéro rejouerait les `alter default privileges` de Supabase, qui
-- donnent EXECUTE à anon. On réaffirme donc les deux côtés (cf. 0306).
revoke all on function public.simulation_repartition(uuid) from public;
revoke execute on function public.simulation_repartition(uuid) from anon;
grant execute on function public.simulation_repartition(uuid) to authenticated;
