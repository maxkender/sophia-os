-- 04 · Par label (famille de contenu), 3 dernières semaines mûres.
-- ATTENTION : un compte ne porte en général qu'un label, donc r (vues /
-- médiane du compte) vaut ≈ 1 par construction au niveau du label. Juger un
-- label sur vues_med, pct_ge10k et part_pm, pas sur r.
select coalesce(a.slug, 'sophia') as app,
       coalesce(l.nom, '(sans label)') as label,
       count(*) as passages,
       count(distinct p.contenu_id) as contenus,
       count(distinct p.compte_id) as comptes,
       percentile_cont(0.5) within group (order by p.vues)::int as vues_med,
       count(*) filter (where p.vues >= 10000) as ge10k,
       round(100.0 * count(*) filter (where p.vues >= 10000) / count(*), 1) as pct_ge10k,
       round(1000.0 * sum(p.partages) / nullif(sum(p.vues), 0), 2) as part_pm
from passages p
left join contenu_labels cl on cl.contenu_id = p.contenu_id
left join labels l on l.id = cl.label_id
left join applications a on a.id = p.application_id
where p.statut = 'publie' and p.vues is not null and not coalesce(p.est_rappel, false)
  and p.publie_at between now() - interval '24 days' and now() - interval '3 days'
group by 1, 2
having count(*) >= 20
order by app, vues_med desc;
