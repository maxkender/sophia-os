-- 0309 : la règle « créateur Ruul => Sophia » n'est pas une loi, on la vérifie.
--
-- CE QUE 0308 SUPPOSAIT. Elle comptait tout poster du hub comme promis à
-- Sophia. C'est la RÈGLE qu'on veut, ce n'est pas ce que le système garantit :
-- `APPLICATIONS_HUB` vaut `["sophia", "unswipe"]` et `partsPourApplications`
-- (_shared/hub_posteurs.ts) sait rendre `{unswipe: 100}` et même
-- `{sophia: 50, unswipe: 50}`. Le site choisit, candidat par candidat, et rien
-- dans l'OS ne l'en empêche.
--
-- Autrement dit, la page affichait « ces recrues iront sur Sophia » sur la foi
-- d'une règle que personne n'applique. Au 18/10 c'est vrai pour les 7 comptes
-- de la cohorte, mais c'est un fait, pas une propriété.
--
-- CE QUE ÇA AJOUTE. Une colonne : combien de ces recrues ne sont PAS
-- entièrement sur Sophia. La page peut alors dire « la règle tient » au lieu
-- de le supposer, et le jour où le site enverra un `unswipe`, le chiffre
-- cessera d'être zéro au lieu de passer inaperçu.
--
-- CONFORME veut dire : la part de Sophia vaut 100. `parts_applications` nulle
-- compte pour 100 (c'est le chemin historique, d'après le commentaire de
-- colonne de 0256) ; sinon on lit la clé `sophia`, absente valant zéro. Tout
-- ce qui est en dessous de 100 est un écart, y compris le 50/50 : une
-- demi-recrue sur Unswipe n'est pas la règle.
--
-- On compare la PART et pas l'objet entier : `{"sophia": 100, "unswipe": 0}`
-- vaut bien 100 % Sophia, et une égalité jsonb brute le compterait à tort
-- comme un écart. Les sept formes possibles ont été passées une à une.
--
-- POURQUOI UN NOUVEAU NOM plutôt que remplacer celle de 0308 : changer le type
-- de retour d'une fonction impose un `drop function`, et l'outil qui applique
-- les migrations d'ici reste bloqué sur tout énoncé contenant `drop` (vérifié :
-- même un `drop ... if exists` sur une fonction inexistante n'aboutit pas).
-- `simulation_repartition_cohorte` dit d'ailleurs mieux ce que ça fait.
--
-- RESTE À FAIRE À LA MAIN, dans le SQL Editor de Supabase : la fonction de
-- 0308 n'est plus appelée par personne et peut partir.
--   drop function if exists public.simulation_repartition_provenance(integer);
-- Rien ne presse : elle est en lecture seule et réservée à l'admin.
--
-- Additive, lecture seule, réservée à l'admin. Retour arrière :
--   drop function if exists public.simulation_repartition_cohorte(integer);

create or replace function public.simulation_repartition_cohorte(
  p_jours integer default 30
)
returns table (
  langue text,
  pays text,
  recrues integer,
  recrues_ruul integer,
  recrues_ruul_hors_sophia integer
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
    count(*) filter (where co.poster_id in (select profile_id from cohorte))::integer,
    -- On compare la PART de Sophia, pas l'objet entier : nulle vaut 100 (le
    -- chemin historique), clé absente vaut zéro, et `{"sophia":100,
    -- "unswipe":0}` reste conforme là où une égalité jsonb le rejetterait.
    count(*) filter (
      where co.poster_id in (select profile_id from cohorte)
        and (case
               when co.parts_applications is null then 100
               else coalesce((co.parts_applications ->> 'sophia')::numeric, 0)
             end) < 100
    )::integer
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

comment on function public.simulation_repartition_cohorte(integer) is
  'Recrues par marché (langue × pays) sur une fenêtre glissante : combien au total, combien de la cohorte Ruul, et combien de celles-là ne sont pas entièrement sur Sophia. Lecture seule, admin uniquement. La dernière colonne existe pour que la page VÉRIFIE la règle « créateur Ruul => Sophia » au lieu de la supposer : rien dans l''OS ne l''applique aujourd''hui. Remplace simulation_repartition_provenance (0308).';

revoke all on function public.simulation_repartition_cohorte(integer) from public;
revoke execute on function public.simulation_repartition_cohorte(integer) from anon;
grant execute on function public.simulation_repartition_cohorte(integer) to authenticated;
