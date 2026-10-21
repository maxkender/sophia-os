-- 0310 : ce n'est pas « Ruul va sur Sophia », c'est « le site a déjà choisi ».
--
-- CE QU'ON CROYAIT (0308, 0309). Qu'un créateur venu du site partait toujours
-- sur Sophia, et que la page devait modéliser cette règle. Décision du 18/10 :
-- la règle n'existe pas et ne doit pas exister. C'est le SITE qui décide de
-- l'application de ses candidats, candidat par candidat, et c'est très bien
-- comme ça.
--
-- CE QUE ÇA CHANGE POUR LA PAGE. La contrainte sur le moteur n'est plus « ces
-- recrues iront sur Sophia ». C'est « ces recrues-là, le moteur ne les place
-- pas » — quelle que soit l'application qu'elles reçoivent. La bonne question
-- n'est donc plus « combien dérogent à la règle » mais « combien de recrues le
-- moteur ne placera pas, et où sont-elles allées en pratique ».
--
-- C'est plus général ET plus juste : si le site se met à envoyer des comptes
-- Unswipe, la page le voit et corrige ses projections toute seule, là où la
-- version précédente aurait affiché un avertissement et des chiffres faux.
--
-- CE QUE ÇA REND. Par marché : les recrues de la fenêtre, combien venaient du
-- site, et leur répartition RÉELLE entre applications, en parts
-- fractionnaires. `parts_applications` nulle vaut 100 % Sophia (commentaire de
-- colonne de 0256) ; sinon on éclate l'objet, comme le fait déjà
-- `simulation_repartition_apps`. Un marché sans recrue du site rend `{}`.
--
-- LE DÉNOMINATEUR est le même que celui de `simulation_repartition` : comptes
-- actifs servis par l'assignation, hors `cm` et hors UGC vidéo. Clés de marché
-- BRUTES, pour que la page apparie ses tableaux sans rien normaliser.
--
-- L'IDENTIFICATION reste `hub_posteurs.profile_id` = `comptes.poster_id` :
-- elle ne dépend d'aucun UUID en dur et couvre tous les comptes du poster,
-- alors que `hub_posteurs.compte_id` n'est écrit qu'une fois.
--
-- MÉNAGE À FAIRE À LA MAIN, dans le SQL Editor : les deux fonctions
-- précédentes ne sont plus appelées par personne.
--   drop function if exists public.simulation_repartition_provenance(integer);
--   drop function if exists public.simulation_repartition_cohorte(integer);
-- Elles ne sont pas supprimées ici parce que l'outil qui applique les
-- migrations depuis cette session reste bloqué sur tout énoncé contenant
-- `drop`, même un `drop ... if exists` sur une fonction inexistante. Rien ne
-- presse : les deux sont en lecture seule et réservées à l'admin.
--
-- Additive, lecture seule, réservée à l'admin. Retour arrière :
--   drop function if exists public.simulation_recrues_site(integer);

create or replace function public.simulation_recrues_site(
  p_jours integer default 30
)
returns table (
  langue text,
  pays text,
  recrues integer,
  recrues_site integer,
  site_par_app jsonb
)
language plpgsql
stable
security definer
set search_path = public
as $$
-- Les paramètres de sortie portent le nom de colonnes réelles (`langue`,
-- `pays`). Sans cette directive, plpgsql peut rendre la référence ambiguë et
-- la fonction échouerait à l'exécution, pas à la création.
#variable_conflict use_column
declare
  -- Bornée : une fenêtre de 0 jour ne rendrait rien et une fenêtre absurde
  -- ferait scanner la table pour un résultat que personne ne saurait lire.
  v_jours integer := least(greatest(coalesce(p_jours, 30), 1), 365);
begin
  if not public.is_admin() then
    raise exception 'reserve aux administrateurs' using errcode = '42501';
  end if;

  return query
  with cohorte as (
    select h.profile_id
    from public.hub_posteurs h
    where h.profile_id is not null
  ),
  recrues as (
    select co.langue, co.pays, co.parts_applications,
           (co.poster_id in (select profile_id from cohorte)) as du_site
    from public.comptes co
    where co.is_active
      and coalesce(co.type_compte, '') <> 'cm'
      and coalesce(co.ugc_ai_video, false) = false
      and co.langue is not null
      and co.created_at >= now() - make_interval(days => v_jours)
  ),
  -- Comptage fractionnaire : un compte réglé 50/50 vaut une demi-recrue de
  -- chaque côté. En pratique la flotte est binaire, mais le jour où elle ne
  -- l'est plus le tableau reste juste au lieu de mentir d'un demi-compte.
  eclate as (
    select r.langue, r.pays, 'sophia'::text as slug, 1.0::numeric as part
    from recrues r
    where r.du_site and r.parts_applications is null
    union all
    select r.langue, r.pays, e.key, (e.value)::numeric / 100.0
    from recrues r
    cross join lateral jsonb_each_text(r.parts_applications) e
    where r.du_site and r.parts_applications is not null and (e.value)::numeric > 0
  ),
  par_app as (
    select langue, pays, slug, sum(part) as part from eclate group by 1, 2, 3
  ),
  agg as (
    select langue, pays, jsonb_object_agg(slug, part) as j from par_app group by 1, 2
  )
  select
    r.langue,
    r.pays,
    count(*)::integer,
    count(*) filter (where r.du_site)::integer,
    coalesce(a.j, '{}'::jsonb)
  from recrues r
  left join agg a on a.langue = r.langue and a.pays is not distinct from r.pays
  group by r.langue, r.pays, a.j
  order by r.langue, r.pays;
end;
$$;

comment on function public.simulation_recrues_site(integer) is
  'Recrues par marché (langue × pays) sur une fenêtre glissante : combien au total, combien venaient du site (cohorte Ruul), et leur répartition réelle entre applications en parts fractionnaires. Lecture seule, admin uniquement. Ces recrues-là, le moteur ne les place pas : c''est le site qui a choisi. Remplace simulation_repartition_provenance (0308) et simulation_repartition_cohorte (0309).';

revoke all on function public.simulation_recrues_site(integer) from public;
revoke execute on function public.simulation_recrues_site(integer) from anon;
grant execute on function public.simulation_recrues_site(integer) to authenticated;
