-- 10 · RevenueCat Sophia : essais par pays (cache `rc_metrics_cache`, 13 jours,
-- 20 premiers pays seulement — le reste est dans « Other »), à rapprocher des
-- vues Sophia par langue sur la même fenêtre (requête 10b).
-- Rattachement pays → langue : src/features/revenuecat/paysLangue.ts
-- (Mexique, Colombie, Argentine → es ; Brésil → pt ; États-Unis → en…).
with ch as (select payload->'charts'->'trials_new' as t from rc_metrics_cache where id = 'sophia'),
seg as (select (ord - 1)::int as idx, s from ch, jsonb_array_elements(t->'segments') with ordinality as e(s, ord)),
v as (select (x->>'segment')::int as idx, (x->>'value')::numeric as val,
             to_timestamp((x->>'cohort')::bigint)::date as jour, (x->>'incomplete')::boolean as incomplet
      from ch, jsonb_array_elements(t->'values') x
      where (x->>'measure') = '0')
select seg.s->>'display_name' as pays, sum(val) filter (where not incomplet) as essais,
       min(jour) as debut, max(jour) as fin
from v join seg using (idx)
group by 1 order by 2 desc nulls last;

-- 10b · Vues Sophia par langue sur la fenêtre RC (décaler d'1 à 2 jours avant :
-- un essai suit la vue). Remplacer les dates par debut / fin de 10.
select p.langue, count(*) as posts, sum(p.vues) as vues, count(distinct p.compte_id) as comptes
from passages p left join applications a on a.id = p.application_id
where p.statut = 'publie' and coalesce(a.slug, 'sophia') = 'sophia'
  and p.publie_at >= date '2026-09-29' and p.publie_at < date '2026-10-12'
group by 1 order by 3 desc nulls last;
