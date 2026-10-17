-- 13 · Défauts relevés dans la file de reviews (/admin/file-reviews) et leur
-- effet sur les vues. Un post est soit reviewé (reviews.remarques = remarques-
-- types utilisées), soit passé (review_passes, « rien à dire »).
-- r = vues ÷ médiane du compte (posts mûrs, ≥ 5 par compte) ;
-- r_vs_contenu = r ÷ r médian des AUTRES passages du même contenu (≥ 2).
-- Réserve : une partie des « passés » l'ont été en rafale (< 5 s d'écart),
-- ce n'est pas un groupe sans défaut. Échantillon : reviews du 14 au 17/09.
with mur as (
  select p.* from passages p
  where p.statut = 'publie' and not coalesce(p.est_rappel, false) and p.vues is not null
    and p.publie_at < now() - interval '3 days'),
med as (select compte_id, percentile_cont(0.5) within group (order by vues) m
        from mur group by 1 having count(*) >= 5),
r_all as (select m.id, m.contenu_id, m.post_id, m.vues, m.vues / nullif(med.m, 0) as r
          from mur m join med using (compte_id)),
ailleurs as (
  select a.id,
         (select percentile_cont(0.5) within group (order by b.r) from r_all b
           where b.contenu_id = a.contenu_id and b.id <> a.id) as r_autres,
         (select count(*) from r_all b where b.contenu_id = a.contenu_id and b.id <> a.id) as n_autres
  from r_all a),
cible as (
  select r.post_id, e ->> 'titre' as groupe
  from reviews r cross join lateral jsonb_array_elements(r.remarques) e
  where r.post_id is not null and e ->> 'titre' <> 'Hello'
  union all
  select r.post_id, 'AU MOINS 1 DEFAUT' from reviews r
  where r.post_id is not null
    and exists (select 1 from jsonb_array_elements(r.remarques) e where e ->> 'titre' <> 'Hello')
  union all
  select r.post_id, 'Jutifier SEUL (sans text not the same)' from reviews r
  where r.post_id is not null
    and r.remarques @> '[{"titre":"Jutifier"}]' and not r.remarques @> '[{"titre":"text not the same"}]'
  union all
  select rp.post_id, 'PASSE (rien a dire)' from review_passes rp)
select c.groupe, count(distinct a.id) as n,
       round(percentile_cont(0.5) within group (order by a.vues)::numeric) as vues_med,
       round(percentile_cont(0.5) within group (order by a.r)::numeric, 2) as r_med,
       round(percentile_cont(0.5) within group (order by a.r / nullif(x.r_autres, 0))
             filter (where x.n_autres >= 2)::numeric, 2) as r_vs_contenu,
       count(*) filter (where x.n_autres >= 2) as n_controle
from cible c join r_all a on a.post_id = c.post_id left join ailleurs x on x.id = a.id
group by 1 order by 1;
