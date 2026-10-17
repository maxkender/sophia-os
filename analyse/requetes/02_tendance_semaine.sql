-- 02 · Tendance par semaine et par application.
-- La semaine en cours est incomplète ET pas encore mûre (vues relevées à J+2) :
-- ne pas la comparer telle quelle.
select date_trunc('week', p.publie_at)::date as semaine,
       coalesce(a.slug, 'sophia')            as app,
       count(*)                              as posts,
       count(p.vues)                         as mesures,
       sum(p.vues)                           as vues_tot,
       percentile_cont(0.5) within group (order by p.vues)::int as mediane,
       round(avg(p.vues))::int               as moyenne,
       percentile_cont(0.9) within group (order by p.vues)::int as p90,
       count(*) filter (where p.vues >= 10000)  as ge10k,
       count(*) filter (where p.vues >= 100000) as ge100k,
       count(distinct p.compte_id)           as comptes
from passages p
left join applications a on a.id = p.application_id
where p.statut = 'publie' and p.publie_at > now() - interval '63 days'
group by 1, 2
order by 1, 2;
