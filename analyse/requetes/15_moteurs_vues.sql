-- 15 · Moteurs de la hausse des vues : un passage par ligne avec le statut du
-- contenu au moment du post (prior_max = meilleur score ailleurs, connu 2 jours
-- avant ; prior_n = passages précédents), le type (original, cohorte d import),
-- le label et la date de création du compte. À exporter puis analyser avec
-- analyse/outils/moteurs_vues.py (régression à effet fixe compte).
with tous as (
  select pa.id, pa.contenu_id, pa.publie_at, pa.vues, pa.compte_id, pa.est_rappel, pa.langue, coalesce(a.slug,'sophia') app,
    jsonb_array_length(case when jsonb_typeof(pa.slides) = 'array' then pa.slides else '[]'::jsonb end) nb_slides,
    max(pa.vues) over (partition by pa.contenu_id order by pa.publie_at range between unbounded preceding and interval '2 days' preceding) prior_max,
    count(*) over (partition by pa.contenu_id order by pa.publie_at rows between unbounded preceding and 1 preceding) prior_n
  from passages pa left join applications a on a.id = pa.application_id
  where pa.statut='publie' and pa.publie_at is not null
), lab as (
  select cl.contenu_id, min(l.nom) label from contenu_labels cl join labels l on l.id = cl.label_id group by 1
)
select t.id, (t.publie_at at time zone 'Europe/Paris')::date::text jour, t.compte_id, t.vues, t.est_rappel, t.langue, t.app,
  coalesce(lab.label,'?') label, c.tier, (c.pod is not null or c.creation_mode = 'manuel') original, c.parent_id is not null variation,
  c.created_at::date::text contenu_cree, co.created_at::date::text compte_cree, t.prior_max, t.prior_n, t.nb_slides
from tous t join contenus c on c.id = t.contenu_id join comptes co on co.id = t.compte_id
left join lab on lab.contenu_id = t.contenu_id
where t.vues is not null and t.publie_at >= '2026-09-14 22:00+00' and t.publie_at < '2026-10-20 22:00+00'
