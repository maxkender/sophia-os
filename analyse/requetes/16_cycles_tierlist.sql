-- 16 · Passages Sophia avec leur rang dans leur cycle tierlist, le nombre de
-- passages du cycle (= rang du contenu pour un cycle fermé : 1 C, 2 B, 4 A,
-- 8 S, 16 S+) et le cycle suivant (issue). À exporter en JSON puis :
--   python3 -I analyse/outils/cycles_tierlist.py cycles.json
-- Question du 21/10 : les longueurs de cycle (A = 4, S = 8…) sont-elles bonnes ?
with soph as (
  select pa.id, pa.contenu_id, pa.compte_id, pa.publie_at, pa.vues, pa.tier_cycle, pa.est_rappel
  from passages pa left join applications a on a.id = pa.application_id
  where pa.statut = 'publie' and pa.publie_at is not null and coalesce(a.slug,'sophia') = 'sophia'
    and not coalesce(pa.est_rappel, false) and pa.tier_cycle is not null
), base as (
  select compte_id, percentile_cont(0.5) within group (order by vues) med
  from soph where vues is not null and publie_at >= '2026-08-20' and publie_at < '2026-10-18 22:00+00'
  group by 1 having count(*) >= 5
), cyc as (
  select contenu_id, tier_cycle, count(*) n_cycle, count(vues) n_mesures, min(publie_at) debut, max(publie_at) fin
  from soph group by 1, 2
), r as (
  select s.id, s.contenu_id, s.tier_cycle, (s.publie_at at time zone 'Europe/Paris')::date::text jour, s.vues,
    s.vues / nullif(b.med, 0) rr,
    row_number() over (partition by s.contenu_id, s.tier_cycle order by s.publie_at) rang,
    c.n_cycle, c.n_mesures,
    co.tier tier_actuel, co.tier_cycle cycle_actuel, co.passages_prevus,
    cn.n_cycle n_cycle_suivant
  from soph s
  join base b on b.compte_id = s.compte_id
  join cyc c on c.contenu_id = s.contenu_id and c.tier_cycle = s.tier_cycle
  join contenus co on co.id = s.contenu_id
  left join cyc cn on cn.contenu_id = s.contenu_id and cn.tier_cycle = s.tier_cycle + 1
  where s.vues is not null and s.publie_at >= '2026-09-14 22:00+00' and s.publie_at < '2026-10-18 22:00+00'
)
select * from r
