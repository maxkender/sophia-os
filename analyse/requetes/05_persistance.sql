-- 05 · Un contenu qui a bien (ou mal) démarré refait-il pareil ensuite ?
-- C'est le test de la tierlist : si oui, recycler les gagnants et couper les
-- perdants vite rapporte. r = vues / médiane du compte (45-60 j, ≥ 5 posts).

-- 05a · r du 1er passage → r médian des passages suivants.
with mat as (
  select p.* from passages p
  where p.statut = 'publie' and p.vues is not null and not coalesce(p.est_rappel, false)
    and p.publie_at between now() - interval '60 days' and now() - interval '3 days'),
med as (select compte_id, percentile_cont(0.5) within group (order by vues) m
        from mat group by 1 having count(*) >= 5),
r as (select mat.contenu_id, mat.publie_at, mat.vues / nullif(med.m, 0) as r,
             row_number() over (partition by mat.contenu_id order by mat.publie_at) as rang
      from mat join med using (compte_id)),
prem as (select contenu_id, r as r1 from r where rang = 1),
suite as (select contenu_id, percentile_cont(0.5) within group (order by r) as r_suite, count(*) as n
          from r where rang > 1 group by 1)
select case when r1 < 0.5 then '1. <0.5' when r1 < 1 then '2. 0.5-1' when r1 < 2 then '3. 1-2'
            when r1 < 4 then '4. 2-4' else '5. >=4' end as premier_passage_r,
       count(*) as contenus, sum(n) as passages_suivants,
       round((percentile_cont(0.5) within group (order by r_suite))::numeric, 2) as r_med_suivants,
       round(avg(case when r_suite >= 1 then 1 else 0 end) * 100) as pct_au_dessus_normale
from prem join suite using (contenu_id)
group by 1 order by 1;

-- 05b · Passages publiés PLUS DE 4 JOURS après un mauvais départ (r moyen < 0,6
-- sur les 2 premiers passages) : le verdict était connu, ce sont des créneaux
-- qu'une coupe plus rapide aurait donnés à de meilleurs contenus.
with mat as (
  select p.* from passages p
  where p.statut = 'publie' and p.vues is not null and not coalesce(p.est_rappel, false)
    and p.publie_at between now() - interval '60 days' and now() - interval '3 days'),
med as (select compte_id, percentile_cont(0.5) within group (order by vues) m
        from mat group by 1 having count(*) >= 5),
r as (select mat.contenu_id, mat.publie_at, mat.vues, mat.vues / nullif(med.m, 0) as r,
             row_number() over (partition by mat.contenu_id order by mat.publie_at) as rang
      from mat join med using (compte_id)),
c as (select contenu_id, max(case when rang = 1 then publie_at end) as t1,
             avg(case when rang <= 2 then r end) as r12, count(*) filter (where rang <= 2) as n12
      from r group by 1)
select case when r12 < 0.6 then 'mauvais départ (r<0.6)' when r12 >= 2 then 'bon départ (r>=2)' else 'moyen' end as verdict,
       count(distinct c.contenu_id) as contenus,
       count(*) filter (where r.rang > 2 and r.publie_at > c.t1 + interval '4 days') as passages_apres_verdict,
       round((percentile_cont(0.5) within group (order by r.r)
              filter (where r.rang > 2 and r.publie_at > c.t1 + interval '4 days'))::numeric, 2) as r_med_apres,
       percentile_cont(0.5) within group (order by r.vues)
         filter (where r.rang > 2 and r.publie_at > c.t1 + interval '4 days') as vues_med_apres
from c join r using (contenu_id)
where n12 = 2
group by 1 order by 1;
