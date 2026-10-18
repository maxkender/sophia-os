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
  passages_restants integer,
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
