-- 0305 : chiffres du choix de label, LISIBLES PAR UN ADMIN.
--
-- POURQUOI. `stats_choix_label` (0287) décide où part chaque nouveau compte,
-- et elle est réservée au service : ni anon ni authenticated. Résultat, treize
-- réglages et une fermeture automatique de label pilotent la flotte sans que
-- personne puisse les voir depuis l'OS. La page « Répartition » a besoin des
-- mêmes chiffres, pour toutes les langues d'un coup.
--
-- CE QUE ÇA N'EST PAS. Cette fonction ne choisit rien et n'écrit rien. Elle
-- rend les ENTRÉES du calcul ; le classement se fait côté front, avec le même
-- code que le moteur (`src/features/moteur/repartition/scoreLabel.ts`, miroir
-- de `_shared/choix_label_equilibre.ts`, un test interdit la divergence).
--
-- LE POOL. Les labels qui servent l'application (`label_applications` ; un
-- label sans ligne sert Sophia), moins les deux labels système. C'est
-- exactement le pool de `manage-users`, recalculé ici pour que la page ne
-- puisse pas montrer un candidat que le moteur n'aurait jamais proposé.
--
-- LES MARCHÉS. Une ligne par couple (langue, pays) réellement peuplé par les
-- comptes servis par l'assignation. 23 langues sur 26 n'ont qu'un pays ;
-- en / es-419 / ar en ont plusieurs, et ce sont les seuls cas où la dimension
-- pays change quelque chose.
--
-- Additive, lecture seule, réservée à l'admin. Retour arrière :
--   drop function public.simulation_repartition(uuid);

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
-- `pays`, `label_id`, `slug`). Sans cette directive, plpgsql peut rendre la
-- référence ambiguë et la fonction échouerait à l'exécution, pas à la
-- création : on tranche explicitement en faveur de la colonne.
#variable_conflict use_column
declare
  v_app uuid := coalesce(p_application, '00000000-0000-4000-8000-000000000001'::uuid);
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
  with marches as (
    select distinct co.langue as lg, co.pays as py
    from public.comptes co
    where co.is_active
      and coalesce(co.type_compte, '') <> 'cm'
      and coalesce(co.ugc_ai_video, false) = false
      and co.langue is not null
  )
  select
    m.lg,
    m.py,
    s.label_id,
    l.nom,
    s.comptes_langue,
    s.comptes_pays,
    s.comptes_total,
    s.passages_restants,
    s.demande_jour,
    s.passages,
    s.perf_label,
    s.perf_flotte,
    s.recents_langue,
    s.recence_langue,
    s.recents_pays,
    s.recence_pays
  from marches m
  cross join lateral public.stats_choix_label(v_pool, v_app, m.lg, m.py, 3) s
  join public.labels l on l.id = s.label_id
  order by m.lg, m.py, l.nom;
end;
$$;

comment on function public.simulation_repartition(uuid) is
  'Entrées du choix de label (0287) pour tous les marchés (langue × pays) d''une application. Lecture seule, admin uniquement : alimente la page Répartition. Ne choisit rien, le classement se fait côté front avec le miroir de choix_label_equilibre.ts.';

revoke all on function public.simulation_repartition(uuid) from public;
grant execute on function public.simulation_repartition(uuid) to authenticated;

-- La même lecture, pour l'APPLICATION cette fois.
--
-- POURQUOI À PART. Le label se choisit DANS une application : il faut d'abord
-- savoir où va le compte. Aujourd'hui c'est le recruteur qui coche, sans
-- aucune cible de flotte ; la page doit donc montrer la répartition réelle,
-- par marché, avant qu'on décide d'une cible.
--
-- COMPTAGE FRACTIONNAIRE. `comptes.parts_applications` est un pourcentage par
-- slug (`null` = 100 % Sophia). En pratique la flotte est binaire (209 Sophia,
-- 39 Unswipe, 15 Micabo, aucun compte partagé), mais on compte la part réelle
-- plutôt que « l'application majoritaire » : le jour où un compte est réglé
-- 50/50, le tableau reste juste au lieu de mentir d'un demi-compte.
create or replace function public.simulation_repartition_apps()
returns table (
  langue text,
  pays text,
  application_id uuid,
  slug text,
  comptes numeric
)
language plpgsql
stable
security definer
set search_path = public
as $$
-- Les paramètres de sortie portent le nom de colonnes réelles (`langue`,
-- `pays`, `label_id`, `slug`). Sans cette directive, plpgsql peut rendre la
-- référence ambiguë et la fonction échouerait à l'exécution, pas à la
-- création : on tranche explicitement en faveur de la colonne.
#variable_conflict use_column
begin
  if not public.is_admin() then
    raise exception 'reserve aux administrateurs' using errcode = '42501';
  end if;

  return query
  with servis as (
    select co.langue, co.pays, co.parts_applications
    from public.comptes co
    where co.is_active
      and coalesce(co.type_compte, '') <> 'cm'
      and coalesce(co.ugc_ai_video, false) = false
      and co.langue is not null
  ),
  eclate as (
    -- Pas de réglage : 100 % Sophia, le cas de 209 comptes sur 263.
    select s.langue, s.pays, 'sophia'::text as slug, 1.0::numeric as part
    from servis s
    where s.parts_applications is null
    union all
    select s.langue, s.pays, e.key, (e.value)::numeric / 100.0
    from servis s
    cross join lateral jsonb_each_text(s.parts_applications) e
    where s.parts_applications is not null and (e.value)::numeric > 0
  )
  select x.langue, x.pays, a.id, a.slug, sum(x.part)
  from eclate x
  join public.applications a on a.slug = x.slug
  group by x.langue, x.pays, a.id, a.slug
  order by x.langue, x.pays, a.slug;
end;
$$;

comment on function public.simulation_repartition_apps() is
  'Comptes actifs par marché (langue × pays) et par application, part fractionnaire de parts_applications (null = 100 % Sophia). Lecture seule, admin uniquement : alimente la page Répartition.';

revoke all on function public.simulation_repartition_apps() from public;
grant execute on function public.simulation_repartition_apps() to authenticated;
