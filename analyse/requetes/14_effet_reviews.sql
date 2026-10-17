-- 14 · Effet d'une review sur les posts suivants du créateur (différence de
-- différences). Créateurs actifs avant la vague de reviews (14 → 17/09), avec
-- ou sans review ; r médian avant / après / plus tard.
-- Réserve : les reviewés partaient plus bas (rattrapage) : comparer aussi à
-- niveau de départ égal (r avant < 1 et ≥ 1) avant de conclure.
with mur as (
  select p.id, p.compte_id, p.vues, p.publie_at, c.poster_id
  from passages p join comptes c on c.id = p.compte_id
  where p.statut = 'publie' and not coalesce(p.est_rappel, false) and p.vues is not null
    and p.publie_at < now() - interval '3 days'),
med as (select compte_id, percentile_cont(0.5) within group (order by vues) m
        from mur group by 1 having count(*) >= 5),
rv as (select distinct poster_id from reviews where created_at >= '2026-09-14'),
x as (
  select case when rv.poster_id is not null then 'avec review' else 'sans review' end as grp,
         case when publie_at between '2026-08-31' and '2026-09-14' then '1_avant'
              when publie_at between '2026-09-18' and '2026-10-02' then '2_apres'
              when publie_at between '2026-10-02' and '2026-10-12' then '3_plus_tard' end as periode,
         mur.poster_id, mur.vues / nullif(med.m, 0) as r, mur.vues
  from mur join med using (compte_id) left join rv on rv.poster_id = mur.poster_id
  where mur.poster_id in (select poster_id from mur where publie_at between '2026-08-31' and '2026-09-14'))
select grp, periode, count(*) as n, count(distinct poster_id) as createurs,
       round(percentile_cont(0.5) within group (order by r)::numeric, 2) as r_med,
       round(percentile_cont(0.5) within group (order by vues)::numeric) as vues_med
from x where periode is not null group by 1, 2 order by 1, 2;
