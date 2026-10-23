-- 17 · Concentration des vues : un passage mûr par ligne (30 jours), avec compte,
-- contenu, label, app, original, rappel. À exporter en JSON puis :
--   python3 -I analyse/outils/concentration.py rows.json
-- Répond à « moyenne ou médiane ? qui porte les vues : quelle part des posts,
-- des comptes, des contenus ? » (Notion → Analyses, 23/10).
with lab as (
  select cl.contenu_id, min(l.nom) label from contenu_labels cl join labels l on l.id = cl.label_id group by 1
)
select pa.id, pa.contenu_id, pa.compte_id, (pa.publie_at at time zone 'Europe/Paris')::date::text jour,
  pa.vues, pa.likes, pa.partages, coalesce(pa.est_rappel,false) rappel, pa.langue, coalesce(a.slug,'sophia') app,
  coalesce(lab.label,'?') label, co.handle_tiktok compte, co.created_at::date::text compte_cree, co.classement,
  c.tier, (c.pod is not null or c.creation_mode = 'manuel') original,
  round(extract(epoch from (pa.stats_maj_at - coalesce(pa.tiktok_publie_at, pa.publie_at)))/3600) age_releve_h
from passages pa
left join applications a on a.id = pa.application_id
join comptes co on co.id = pa.compte_id
join contenus c on c.id = pa.contenu_id
left join lab on lab.contenu_id = pa.contenu_id
where pa.statut = 'publie' and pa.vues is not null
  and pa.publie_at >= '2026-09-19 22:00+00' and pa.publie_at < '2026-10-19 22:00+00'
