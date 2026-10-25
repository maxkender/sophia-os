-- 0356 : la performance de chaque source, le « r » de la page Pods.
--
-- Demande d'Adrien du 25/10 : voir sur la page Sources si les slideshows d'une
-- source marchent, pour décider de la mettre à jour (importer ses nouveaux
-- posts) ou non.
--
-- Même définition que le r médian de `pods_tableau` (0324) :
--   * r d'un post = ses vues ÷ les vues médianes du compte qui l'a publié
--     (posts mûrs de ce compte sur 45 jours, 5 au moins) ;
--   * posts retenus : publiés il y a 3 à 30 jours (vues mûres), hors rappels ;
--   * r médian de la source = médiane des r de ses posts.
-- r = 1 : les slideshows de la source font autant que d'habitude sur les
-- comptes qui les postent ; au-dessus, mieux ; en dessous, moins bien.
--
-- Une ligne par compte source (`contenus.compte_reference_id`).
-- security_invoker : lit `passages` et `contenus` avec les droits de
-- l'appelant (admin : tout).
--
-- Retour arrière : drop view public.source_performance.

create or replace view public.source_performance
  with (security_invoker = true)
as
  with mat as (
    select p.compte_id, p.vues
      from public.passages p
     where p.statut = 'publie' and p.vues is not null and not coalesce(p.est_rappel, false)
       and p.publie_at between now() - interval '45 days' and now() - interval '3 days'
  ),
  med as (
    select mat.compte_id, percentile_cont(0.5) within group (order by mat.vues) as m
      from mat
     group by mat.compte_id
    having count(*) >= 5
  ),
  x as (
    select c.compte_reference_id, p.vues, p.vues / nullif(med.m, 0) as r
      from public.passages p
      join public.contenus c on c.id = p.contenu_id and c.compte_reference_id is not null
      left join med on med.compte_id = p.compte_id
     where p.statut = 'publie' and p.vues is not null and not coalesce(p.est_rappel, false)
       and p.publie_at between now() - interval '30 days' and now() - interval '3 days'
  )
  select x.compte_reference_id,
         count(x.r) as posts,
         round((percentile_cont(0.5) within group (order by x.r))::numeric, 2) as r_mediane,
         (percentile_cont(0.5) within group (order by x.vues))::int as vues_mediane
    from x
   group by x.compte_reference_id;

grant select on public.source_performance to authenticated;

comment on view public.source_performance is
  'Par compte source : r médian (vues ÷ médiane du compte qui poste) et vues médianes de ses slideshows publiés il y a 3 à 30 jours, hors rappels. Même r que pods_tableau (0324). Page Sources. Voir 0356.';
