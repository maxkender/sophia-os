-- 12 · Traîne : vues d'aujourd'hui (Apify) contre vues stockées à J+2.
-- 1. python3 -I analyse/outils/apify_live.py <comptes…> --posts 30 > /tmp/live.sql
-- 2. Coller le bloc `with live(...) as (values …)` à la place de la ligne
--    ci-dessous, puis lancer la requête.
with live(tid, vues_live, likes_live, partages_live, saves_live, cree_le) as (values
  ('0', 0, 0, 0, 0, now()::timestamp)  -- ← remplacer par la sortie de apify_live.py
)
select co.handle_tiktok, p.langue, p.publie_at::date as publie_le, p.vues as vues_j2, l.vues_live,
       round(l.vues_live::numeric / nullif(p.vues, 0), 2) as x_depuis_j2,
       round(extract(epoch from (p.stats_maj_at - p.publie_at)) / 3600) as age_releve_h
from live l
join passages p on substring(p.publie_url from '/(?:photo|video)/(\d+)') = l.tid
join comptes co on co.id = p.compte_id
where p.statut = 'publie' and p.vues > 0 and p.publie_at < now() - interval '3 days'
order by x_depuis_j2 desc;
