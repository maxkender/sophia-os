-- 06 · Format : nombre de slides, position de la slide appli, heure (Paris).
-- r = vues / médiane du compte (45 j), donc indépendant de la taille du compte.
with mat as (
  select p.*, coalesce(a.slug, 'sophia') as app
  from passages p left join applications a on a.id = p.application_id
  where p.statut = 'publie' and p.vues is not null
    and p.publie_at between now() - interval '45 days' and now() - interval '3 days'),
med as (select compte_id, percentile_cont(0.5) within group (order by vues) m
        from mat where not coalesce(est_rappel, false) group by 1 having count(*) >= 5),
r as (select mat.*, mat.vues / nullif(med.m, 0) as r,
             jsonb_array_length(mat.slides) as nslides,
             (select min((s->>'position')::int) from jsonb_array_elements(mat.slides) s
               where (s->>'position_sophia')::boolean) as pos_app,
             extract(hour from (coalesce(mat.tiktok_publie_at, mat.publie_at) at time zone 'Europe/Paris'))::int as heure
      from mat join med using (compte_id)
      where not coalesce(mat.est_rappel, false))
select 'slides' as facteur,
       case when nslides <= 4 then '<=4' when nslides <= 6 then '5-6' when nslides <= 8 then '7-8' else '9+' end as valeur,
       count(*) as n, round((percentile_cont(0.5) within group (order by r))::numeric, 2) as r_med,
       percentile_cont(0.5) within group (order by vues)::int as vues_med
from r where app = 'sophia' group by 1, 2
union all
select 'slide_appli',
       case when pos_app is null then 'aucune' when pos_app = nslides then 'dernière'
            when pos_app = nslides - 1 then 'avant-dernière' when pos_app <= 3 then 'début (2-3)' else 'milieu' end,
       count(*), round((percentile_cont(0.5) within group (order by r))::numeric, 2),
       percentile_cont(0.5) within group (order by vues)::int
from r where app = 'sophia' group by 1, 2
union all
select 'heure_paris',
       case when heure < 6 then '00-06' when heure < 10 then '06-10' when heure < 14 then '10-14'
            when heure < 18 then '14-18' when heure < 21 then '18-21' else '21-24' end,
       count(*), round((percentile_cont(0.5) within group (order by r))::numeric, 2),
       percentile_cont(0.5) within group (order by vues)::int
from r group by 1, 2
order by 1, 2;
