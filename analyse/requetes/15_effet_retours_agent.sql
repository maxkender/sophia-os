-- 15 · Effet des retours envoyés par l'agent de relecture (relectures_auto,
-- envoi = 'envoye' depuis la nuit du 17 au 18/10).
--
-- A. Le défaut revient-il ? Pour chaque retour envoyé (posts du jour J), les
-- points du message (2 premières remarques dans l'ordre PRIORITE de
-- _shared/relecture.ts) sont cherchés dans les posts du créateur le jour J+1,
-- relus par la même nuit de cron. Trois groupes :
--   « base »      : J = 16/10, aucun envoi ; le retour qu'il aurait reçu est
--                   rechoisi comme le fait choisirRetoursAEnvoyer ;
--   « lu avant »  : retour ouvert (reviews.seen_at) avant la publication ;
--   « pas lu »    : retour pas encore ouvert quand il a publié.
-- Témoin : les défauts relevés le jour J mais absents du message (dans_msg = false).
-- Réserve : un jour de recul par ligne ; un créateur à plusieurs posts compte
-- plusieurs paires (pct_moy_createur corrige ce poids).
with prio(code, rk) as (values ('texte_absent',0),('justification',1),('largeur',2),('hierarchie',3),
                                ('taille',4),('alignement',5),('couleur',6),('effet',7)),
ra as (select r.id, r.poster_id, r.jour, r.defauts, r.brouillon, r.envoi, r.review_id,
              coalesce(p.tiktok_publie_at, p.publie_at) pub
       from relectures_auto r left join passages p on p.id = r.passage_id
       where r.origine = 'cron' and r.statut = 'fait' and r.jour >= '2026-10-16'),
codes as (select ra.id, d ->> 'code' code, pr.rk from ra cross join lateral jsonb_array_elements(ra.defauts) d
          join prio pr on pr.code = d ->> 'code' where d ->> 'niveau' = 'remarque'),
top as (select id, code, rk, row_number() over (partition by id order by rk) rn,
               count(*) over (partition by id) n from codes),
cand as (select ra.id, ra.poster_id, ra.jour, min(t.rk) rk1, max(t.n) n from ra join top t on t.id = ra.id
         where ra.brouillon is not null and ra.poster_id is not null and ra.jour = '2026-10-16' group by 1, 2, 3),
base as (select distinct on (poster_id) id, poster_id, jour, null::timestamptz seen
         from cand order by poster_id, rk1, n desc, id::text),
choisi as (select * from base
           union all
           select ra.id, ra.poster_id, ra.jour, rv.seen_at from ra join reviews rv on rv.id = ra.review_id
           where ra.envoi = 'envoye'),
points as (select c.poster_id, c.jour, c.seen, t.code, true dans_msg from choisi c join top t on t.id = c.id and t.rn <= 2),
autres as (select distinct c.poster_id, c.jour, c.seen, co.code, false
           from choisi c join ra x on x.poster_id = c.poster_id and x.jour = c.jour join codes co on co.id = x.id
           where not exists (select 1 from points p where p.poster_id = c.poster_id and p.jour = c.jour and p.code = co.code)),
eval as (select p.poster_id, p.jour, p.code, p.dans_msg, s.id sid,
           case when p.jour = '2026-10-16' then '1 base' when p.seen < s.pub then '3 lu avant' else '2 pas lu' end grp,
           exists (select 1 from jsonb_array_elements(s.defauts) d
                   where d ->> 'code' = p.code and d ->> 'niveau' = 'remarque') rec
         from (select * from points union all select * from autres) p
         join ra s on s.poster_id = p.poster_id and s.jour = p.jour + 1),
par_createur as (select jour, grp, dans_msg, poster_id, avg(rec::int) taux, bool_or(rec) recidive
                 from eval group by 1, 2, 3, 4)
select jour, grp, dans_msg, count(*) createurs,
       round(100 * avg(taux), 1) pct_moy_createur,
       round(100.0 * avg(recidive::int), 1) pct_createurs_recidive
from par_createur group by 1, 2, 3 order by 3 desc, 1, 2;

-- A bis. Par code (points du message seulement) : remplacer le select final par
-- select grp, code, count(*) paires, round(100.0 * avg(rec::int), 1) pct_encore_la
-- from eval where dans_msg group by 1, 2 order by 2, 1;

-- B. Vues à âge égal (relectures_auto.vues, relevées par la nuit de relecture,
-- vers 10 h d'âge) : r = vues ÷ médiane du compte (posts mûrs, 45 j, ≥ 5).
-- Cohorte « servi » = créateurs servis la nuit du 17 au 18/10 ; comparer
-- leur r jour par jour aux autres. Attention : à partir du 19/10, les « autres »
-- reçoivent aussi des retours, la cohorte se dilue. Relire avec passages.vues
-- (J+2) quand les posts sont mûrs.
-- with mur as (select p.compte_id, p.vues from passages p
--   where p.statut = 'publie' and not coalesce(p.est_rappel, false) and p.vues is not null
--     and p.publie_at between now() - interval '45 days' and now() - interval '3 days'),
-- med as (select compte_id, percentile_cont(0.5) within group (order by vues) m from mur group by 1 having count(*) >= 5),
-- servis as (select distinct poster_id from relectures_auto where jour = '2026-10-17' and envoi = 'envoye'),
-- x as (select r.jour, r.poster_id in (select poster_id from servis) servi, r.vues / nullif(med.m, 0) rr
--   from relectures_auto r join med on med.compte_id = r.compte_id
--   where r.origine = 'cron' and r.statut = 'fait' and r.jour >= '2026-10-16' and r.vues is not null)
-- select jour, servi, count(*) n, round(percentile_cont(0.5) within group (order by rr)::numeric, 2) r_10h
-- from x group by 1, 2 order by 2, 1;
