-- 19 · Ventre mou de la tierlist : un contenu Sophia par ligne avec tout son
-- historique de passages (nombre, premier / dernier, meilleur score, moyenne,
-- posts des 14 et 30 derniers jours) et son état de cycle. Sert à repérer les
-- contenus qui n'ont jamais percé (max < 10 k) mais tournent depuis des
-- semaines entre C, B et A (analyse du 24/10, SUIVI P41). Export JSON puis pandas.
with lab as (
  select cl.contenu_id, min(l.nom) label from contenu_labels cl join labels l on l.id = cl.label_id group by 1
), pa as (
  select p.contenu_id, p.vues, p.publie_at, coalesce(p.est_rappel,false) rappel, p.compte_id
  from passages p left join applications a on a.id = p.application_id
  where p.statut = 'publie' and coalesce(a.slug,'sophia') = 'sophia'
), agg as (
  select contenu_id,
    count(*) n_pub, count(vues) n_mes, min(publie_at) premier, max(publie_at) dernier,
    max(vues) max_vues, round(avg(vues)) moy_vues, percentile_cont(0.5) within group (order by vues) med_vues, sum(vues) sum_vues,
    count(*) filter (where vues >= 10000) n_10k, count(*) filter (where vues >= 5000) n_5k, count(*) filter (where vues >= 3000) n_3k,
    count(*) filter (where publie_at > now() - interval '14 days') n_14j,
    count(*) filter (where publie_at > now() - interval '30 days') n_30j,
    sum(vues) filter (where publie_at > now() - interval '30 days' and publie_at < now() - interval '3 days') vues_30j,
    count(*) filter (where publie_at > now() - interval '30 days' and publie_at < now() - interval '3 days' and vues is not null) n_30j_mur,
    count(*) filter (where rappel) n_rappels,
    count(distinct compte_id) n_comptes
  from pa group by 1
)
select c.id, coalesce(lab.label,'?') label, c.tier, c.tier_cycle, c.passages_prevus, c.statut::text statut, c.created_at::date::text cree,
  (c.pod is not null or c.creation_mode='manuel') original, c.vues_source,
  e.restants, e.en_vol, e.publies cycle_publies, e.mesures cycle_mesures, e.moyenne_vues cycle_moy,
  a.n_pub, a.n_mes, a.premier::date::text premier, a.dernier::date::text dernier, a.max_vues, a.moy_vues, a.med_vues, a.sum_vues,
  a.n_10k, a.n_5k, a.n_3k, a.n_14j, a.n_30j, a.vues_30j, a.n_30j_mur, a.n_rappels, a.n_comptes
from contenus c
left join applications ap on ap.id = c.application_id
left join lab on lab.contenu_id = c.id
left join contenu_tier_etat e on e.contenu_id = c.id
join agg a on a.contenu_id = c.id
where coalesce(ap.slug,'sophia') = 'sophia'
