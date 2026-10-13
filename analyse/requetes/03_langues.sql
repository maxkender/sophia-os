-- 03 · Par langue : 14 derniers jours mûrs (J-17 → J-3) contre les 14 d'avant.
-- Hors rappels J+7 (ce sont des reprises de gagnants, biais de sélection).
-- part_pm / likes_pm = partages / likes pour mille vues.
with base as (
  select p.*, coalesce(a.slug, 'sophia') as app,
         case when p.publie_at > now() - interval '17 days' then 'recent' else 'avant' end as periode
  from passages p
  left join applications a on a.id = p.application_id
  where p.statut = 'publie' and p.vues is not null and not coalesce(p.est_rappel, false)
    and p.publie_at between now() - interval '31 days' and now() - interval '3 days')
select app, langue,
       count(*) filter (where periode = 'recent')                     as n_recent,
       count(distinct compte_id) filter (where periode = 'recent')    as comptes,
       (percentile_cont(0.5) within group (order by vues) filter (where periode = 'recent'))::int as med_recent,
       (percentile_cont(0.5) within group (order by vues) filter (where periode = 'avant'))::int  as med_avant,
       count(*) filter (where periode = 'recent' and vues >= 10000)   as ge10k_recent,
       round(100.0 * count(*) filter (where periode = 'recent' and vues < 500)
             / nullif(count(*) filter (where periode = 'recent'), 0)) as pct_sous500,
       round(1000.0 * sum(partages) filter (where periode = 'recent')
             / nullif(sum(vues) filter (where periode = 'recent'), 0), 2) as part_pm,
       round(1000.0 * sum(likes) filter (where periode = 'recent')
             / nullif(sum(vues) filter (where periode = 'recent'), 0), 1) as likes_pm
from base
group by 1, 2
having count(*) filter (where periode = 'recent') >= 15
order by 1, med_recent desc;
