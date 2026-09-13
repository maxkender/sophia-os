-- Réétalement des rappels J+7 tombés en tas le 2026-09-13.
--
-- La mise en service des rappels a fait scanner 30 jours d'historique d'un coup :
-- tous les J+7 déjà échus ont été reportés au même lendemain, jusqu'à 9 posts sur
-- un compte qui en prévoit 2. Le correctif de code (`etalerRappels`) évite que ça
-- se reproduise ; cette migration répare la journée déjà distribuée.
--
-- Même règle que le code : un rappel prend la place d'un post classique, jamais
-- plus que `posts_par_jour` par jour, les sources les plus anciennes d'abord, le
-- surplus glissé au premier jour libre. Les rappels déjà publiés ne bougent pas.
--
-- Idempotent : une fois les journées ramenées sous le quota, rejouer ne déplace
-- plus rien.
with movers as (
  select p.id, p.post_id, p.compte_id,
         row_number() over (partition by p.compte_id order by s.publie_at, p.id) as rang
  from passages p
  join passages s on s.id = p.rappel_source_id
  where p.date_publication_prevue = date '2026-09-13'
    and p.est_rappel and p.statut <> 'publie'
),
touches as (select distinct compte_id from movers),
quota as (
  select c.id as compte_id, least(3, greatest(1, coalesce(c.posts_par_jour, 1)))::int as q
  from comptes c where c.id in (select compte_id from touches)
),
-- Tout ce qui reste en place et occupe déjà un créneau : posts du jour, rappels
-- publiés, rappels correctement datés des jours suivants.
fixes as (
  select p.compte_id, p.date_publication_prevue as jour, count(*)::int as n
  from passages p
  join posts po on po.id = p.post_id and po.est_test = false
  where p.compte_id in (select compte_id from touches)
    and p.date_publication_prevue >= date '2026-09-13'
    and p.id not in (select id from movers)
  group by 1, 2
),
-- Un créneau libre par place restante, ordonnés dans le temps.
libres as (
  select q.compte_id, d::date as jour,
         row_number() over (partition by q.compte_id order by d, s) as rang
  from quota q
  cross join generate_series(date '2026-09-13', date '2026-10-15', interval '1 day') d
  left join fixes f on f.compte_id = q.compte_id and f.jour = d::date
  cross join lateral generate_series(1, greatest(0, q.q - coalesce(f.n, 0))) s
),
plan as (
  select m.id as passage_id, m.post_id, l.jour as nouveau
  from movers m
  join libres l on l.compte_id = m.compte_id and l.rang = m.rang
  where l.jour <> date '2026-09-13'
),
maj_passages as (
  update passages p set date_publication_prevue = pl.nouveau
  from plan pl where p.id = pl.passage_id
  returning p.id
)
update posts po set date_publication_prevue = pl.nouveau
from plan pl where po.id = pl.post_id;
