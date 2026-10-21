-- 11 · Contenus des pods (originaux, page blanche…) contre l'import classique,
-- 30 derniers jours. r = vues / médiane du compte : c'est la seule comparaison
-- juste, les pods ne tournent pas sur les mêmes comptes.
with mat as (
  select p.* from passages p
  where p.statut = 'publie' and p.vues is not null and not coalesce(p.est_rappel, false)
    and p.publie_at between now() - interval '45 days' and now() - interval '3 days'),
med as (select compte_id, percentile_cont(0.5) within group (order by vues) m
        from mat group by 1 having count(*) >= 5),
r as (select mat.*, mat.vues / nullif(med.m, 0) as r from mat join med using (compte_id))
select coalesce(c.pod, case when c.creation_mode = 'manuel' then '(manuel)' else '(import)' end) as origine,
       c.livre, count(distinct c.id) as contenus, count(*) as passages,
       round((percentile_cont(0.5) within group (order by r.r))::numeric, 2) as r_med,
       percentile_cont(0.5) within group (order by r.vues)::int as vues_med,
       max(r.vues) as max_vues
from r join contenus c on c.id = r.contenu_id
where r.publie_at > now() - interval '30 days'
group by 1, 2 order by 1;
