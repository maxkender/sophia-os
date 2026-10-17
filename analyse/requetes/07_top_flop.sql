-- 07 · Top 15 (vues) et flops (r le plus bas, comptes à ≥ 1 500 de médiane)
-- des 10 derniers jours, avec l'accroche (slide 1).
-- Un flop à 1-20 vues est presque toujours un problème de COMPTE (post non
-- public, compte bridé) et pas de contenu : croiser avec 08_sante_comptes.sql.
with mat as (
  select p.* from passages p
  where p.statut = 'publie' and p.vues is not null and not coalesce(p.est_rappel, false)
    and p.publie_at between now() - interval '45 days' and now() - interval '2 days'),
med as (select compte_id, percentile_cont(0.5) within group (order by vues) m
        from mat group by 1 having count(*) >= 5),
r as (select mat.*, round((mat.vues / nullif(med.m, 0))::numeric, 1) as r, med.m::int as med_compte
      from mat join med using (compte_id)
      where mat.publie_at > now() - interval '10 days'),
d as (select r.*, co.handle_tiktok, coalesce(a.slug, 'sophia') as app, l.nom as label, c.tier,
             left(replace(r.slides->0->>'texte_overlay', E'\n', ' / '), 90) as accroche,
             jsonb_array_length(r.slides) as ns
      from r
      join comptes co on co.id = r.compte_id
      left join applications a on a.id = r.application_id
      left join contenus c on c.id = r.contenu_id
      left join contenu_labels cl on cl.contenu_id = r.contenu_id
      left join labels l on l.id = cl.label_id)
(select 'TOP' as g, left(contenu_id::text, 8) as contenu, handle_tiktok, langue, app, label, tier,
        vues, med_compte, r, partages, accroche, ns
 from d order by vues desc limit 15)
union all
(select 'FLOP', left(contenu_id::text, 8), handle_tiktok, langue, app, label, tier,
        vues, med_compte, r, partages, accroche, ns
 from d where med_compte >= 1500 order by r asc limit 12);
