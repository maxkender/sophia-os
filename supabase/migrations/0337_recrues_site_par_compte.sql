-- 0337 : « du site » veut dire « ce COMPTE-LÀ, le moteur ne l'a pas placé ».
--
-- POURQUOI. 0310 identifie une recrue du site par son POSTER :
-- `comptes.poster_id in (select profile_id from hub_posteurs)`. Son en-tête
-- assume le choix — « couvre tous les comptes du poster, alors que
-- `hub_posteurs.compte_id` n'est écrit qu'une fois ». C'est précisément ce
-- qu'il ne faut pas ici.
--
-- Ce que la colonne doit dire, l'en-tête de 0310 le formule lui-même : « ces
-- recrues-là, le moteur ne les place pas ». Or le moteur ne se tient à l'écart
-- qu'à UNE création, celle qui vient du guichet : `vientDuGuichet`
-- (manage-users) est vrai quand l'appel est fait par le cron avec
-- `source: "hub-posteurs"`, et c'est cet appel-là qui écrit
-- `hub_posteurs.compte_id`. Un SECOND compte ouvert plus tard pour le même
-- poster, depuis l'écran Posters, passe par le moteur comme les autres.
-- 0310 le comptait quand même « du site ».
--
-- CE QUE ÇA CHANGE AUJOURD'HUI : rien. Sur les 30 derniers jours, les deux
-- définitions donnent exactement 16 recrues du site sur 151 ; aucun poster du
-- guichet n'a encore reçu de second compte. C'est pour ça que la correction
-- passe maintenant : elle est vérifiable à zéro écart, alors qu'après coup il
-- faudrait démêler un chiffre déjà faux.
--
-- CE QUE ÇA ÉVITE. La part du site est un PLANCHER : la page s'en sert pour
-- déclarer une cible impossible (« Impossible : sophia ≥ 45 % ») et, depuis la
-- correction de la projection, pour réserver des tirages au guichet. Un
-- plancher gonflé par des comptes que le moteur a bel et bien placés ferait
-- renoncer à une cible atteignable.
--
-- La CTE `cohorte` disparaît, elle ne servait qu'à ça. Tout le reste de la
-- fonction est repris à l'identique.
--
-- Lecture seule, réservée à l'admin, idempotente (`create or replace`).
-- Retour arrière : réappliquer 0310.

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
#variable_conflict use_column
declare
  v_jours integer := least(greatest(coalesce(p_jours, 30), 1), 365);
begin
  if not public.is_admin() then
    raise exception 'reserve aux administrateurs' using errcode = '42501';
  end if;

  return query
  with recrues as (
    select co.langue, co.pays, co.parts_applications,
           exists (
             select 1 from public.hub_posteurs h where h.compte_id = co.id
           ) as du_site
    from public.comptes co
    where co.is_active
      and coalesce(co.type_compte, '') <> 'cm'
      and coalesce(co.ugc_ai_video, false) = false
      and co.langue is not null
      and co.created_at >= now() - make_interval(days => v_jours)
  ),
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
  'Recrues par marché (langue × pays) sur une fenêtre glissante : combien au total, combien de comptes le moteur n''a pas placés parce que le guichet avait déjà choisi (hub_posteurs.compte_id), et leur répartition réelle entre applications en parts fractionnaires. Lecture seule, admin uniquement. Un second compte ouvert plus tard pour un poster venu du guichet n''en fait pas partie : celui-là, le moteur l''a placé.';

revoke all on function public.simulation_recrues_site(integer) from public;
revoke execute on function public.simulation_recrues_site(integer) from anon;
grant execute on function public.simulation_recrues_site(integer) to authenticated;
