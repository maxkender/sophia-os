-- 0308 : d'où viennent les recrues, par marché.
--
-- POURQUOI. Un créateur de la cohorte Ruul va TOUJOURS sur Sophia. Ce n'est
-- pas une préférence qu'un classement pourrait renverser, c'est une
-- contrainte. Tant que la page Répartition l'ignore, elle ment : elle montre
-- une cible « 60 % Sophia, 25 % Unswipe, 15 % Micabo » comme si les trois se
-- disputaient chaque recrue, alors qu'une partie des recrues est déjà promise.
--
-- CE QUE ÇA CHANGE, CONCRÈTEMENT. Sur 30 jours glissants, en français, 5
-- recrues sur 11 viennent de Ruul, soit 45 %. Si un admin vise 30 % Sophia sur
-- ce marché, la cible est tout simplement INATTEIGNABLE : la cohorte Ruul
-- fournit déjà 45 % de comptes Sophia à elle seule. La page doit pouvoir le
-- dire, et pour ça il lui faut ces deux nombres par marché.
--
-- L'IDENTIFICATION. `hub_posteurs` EST la table de la cohorte ; on joint sur
-- `profile_id` = `comptes.poster_id`. Deux autres chemins existent
-- (`hub_posteurs.compte_id`, et `profiles.manager_id` = le profil « RUUL
-- cohort ») ; vérifié en prod, les trois rendent exactement le même ensemble
-- de 7 comptes, 0 écart. On prend celui-ci pour deux raisons : il ne dépend
-- d'aucun UUID écrit en dur, et il couvre TOUS les comptes du poster, alors
-- que `hub_posteurs.compte_id` n'est écrit qu'une fois et ne retient que le
-- premier.
--
-- LE DÉNOMINATEUR est le même que celui de `simulation_repartition` : les
-- comptes actifs servis par l'assignation, hors `cm` et hors UGC vidéo. Les
-- clés de marché sont la langue et le pays BRUTS, pour que la page apparie
-- cette table avec les deux autres sans rien normaliser.
--
-- ÉCHANTILLON. Petit, et la page doit le montrer : on rend les EFFECTIFS, pas
-- un pourcentage. 5 sur 11 et 50 sur 110 ne se lisent pas de la même façon, et
-- c'est à la lecture de trancher, pas à la base.
--
-- CE QUE ÇA N'EST PAS. Cette fonction ne fait RESPECTER aucune règle. À ce
-- jour, rien n'empêche un créateur Ruul de naître sur une autre application :
-- c'est le site qui envoie `applications`, et `partsPourApplications`
-- (_shared/hub_posteurs.ts) le recopie tel quel. La règle n'est pour l'instant
-- que modélisée, dans la page Répartition.
--
-- Additive, lecture seule, réservée à l'admin. Retour arrière :
--   drop function public.simulation_repartition_provenance(integer);

create or replace function public.simulation_repartition_provenance(
  p_jours integer default 30
)
returns table (
  langue text,
  pays text,
  recrues integer,
  recrues_ruul integer
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
  )
  select
    co.langue,
    co.pays,
    count(*)::integer,
    count(*) filter (where co.poster_id in (select profile_id from cohorte))::integer
  from public.comptes co
  where co.is_active
    and coalesce(co.type_compte, '') <> 'cm'
    and coalesce(co.ugc_ai_video, false) = false
    and co.langue is not null
    and co.created_at >= now() - make_interval(days => v_jours)
  group by co.langue, co.pays
  order by co.langue, co.pays;
end;
$$;

comment on function public.simulation_repartition_provenance(integer) is
  'Recrues par marché (langue × pays) sur une fenêtre glissante, et combien viennent de la cohorte Ruul. Lecture seule, admin uniquement : la page Répartition s''en sert pour savoir quelle part des prochaines recrues est déjà promise à Sophia, et donc si une cible est atteignable.';

revoke all on function public.simulation_repartition_provenance(integer) from public;
revoke execute on function public.simulation_repartition_provenance(integer) from anon;
grant execute on function public.simulation_repartition_provenance(integer) to authenticated;
