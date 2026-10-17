-- 08 · Santé des comptes : bridés, morts, effondrés.
-- Signaux : la moitié des posts de la semaine sous 200 vues, ou médiane de la
-- semaine < 30 % de la médiane des 4 semaines d'avant.
-- Confirmer EN DIRECT avec outils/apify_live.py : un profil qui ne renvoie
-- aucun post est privé, renommé ou banni.
with h as (
  select p.compte_id, c.handle_tiktok, c.langue, c.classement::text as classement, c.created_at::date as cree_le,
         count(*) filter (where p.publie_at > now() - interval '7 days' and p.publie_at < now() - interval '1 day') as n7,
         count(*) filter (where p.publie_at > now() - interval '7 days' and p.publie_at < now() - interval '1 day'
                          and p.vues < 200) as sous200_7,
         percentile_cont(0.5) within group (order by p.vues)
           filter (where p.publie_at > now() - interval '7 days' and p.publie_at < now() - interval '1 day') as med7,
         percentile_cont(0.5) within group (order by p.vues)
           filter (where p.publie_at between now() - interval '35 days' and now() - interval '8 days') as med_avant,
         max(p.publie_at)::date as dernier_post
  from passages p join comptes c on c.id = p.compte_id
  where p.statut = 'publie' and p.vues is not null and c.is_active
  group by 1, 2, 3, 4, 5)
select handle_tiktok, langue, classement, cree_le, dernier_post, n7, sous200_7,
       med7::int, med_avant::int, round((med7 / nullif(med_avant, 0))::numeric, 2) as ratio
from h
where n7 >= 3 and (sous200_7 * 2 >= n7 or (med_avant >= 1000 and med7 < 0.3 * med_avant))
order by ratio nulls first;

-- 08b · Posts mûrs à moins de 50 vues, par compte (14 j) : non publics ?
select c.handle_tiktok, c.langue, count(*) as posts, count(*) filter (where p.vues < 50) as sous50
from passages p join comptes c on c.id = p.compte_id
where p.statut = 'publie' and p.vues is not null
  and p.publie_at between now() - interval '17 days' and now() - interval '3 days'
group by 1, 2
having count(*) filter (where p.vues < 50) >= 3
order by 4 desc;
