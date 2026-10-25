-- 0357 : la performance d'une source PAR RAPPORT À SON LABEL.
--
-- Demande d'Adrien du 25/10, après 0356 : le r seul ne dit pas si une source
-- fait mieux que les autres sources de son label (un label entier peut être
-- au-dessus ou en dessous de 1). On ajoute à `source_performance` :
--   * le label de la source (`compte_reference_labels`, un seul par source
--     active au 25/10 ; s'il y en avait plusieurs, le premier par nom) ;
--   * le r médian de TOUS les slideshows de ce label (toutes sources et podz
--     confondus), même fenêtre et même r que 0356 ;
--   * r_vs_label = r de la source ÷ r du label. 1,10 = la source fait 10 %
--     mieux que son label.
--
-- create or replace : les colonnes de 0356 restent, les nouvelles s'ajoutent
-- en fin de vue.
-- Retour arrière : réappliquer la vue de 0356.

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
  posts as (
    select p.contenu_id, p.vues, p.vues / nullif(med.m, 0) as r
      from public.passages p
      left join med on med.compte_id = p.compte_id
     where p.statut = 'publie' and p.vues is not null and not coalesce(p.est_rappel, false)
       and p.publie_at between now() - interval '30 days' and now() - interval '3 days'
  ),
  par_source as (
    select c.compte_reference_id,
           count(po.r) as posts,
           percentile_cont(0.5) within group (order by po.r) as r,
           percentile_cont(0.5) within group (order by po.vues) as vues
      from posts po
      join public.contenus c on c.id = po.contenu_id and c.compte_reference_id is not null
     group by c.compte_reference_id
  ),
  par_label as (
    select cl.label_id,
           count(po.r) as posts,
           percentile_cont(0.5) within group (order by po.r) as r
      from posts po
      join public.contenu_labels cl on cl.contenu_id = po.contenu_id
     group by cl.label_id
  ),
  label_source as (
    select distinct on (crl.compte_reference_id) crl.compte_reference_id, l.id as label_id, l.nom
      from public.compte_reference_labels crl
      join public.labels l on l.id = crl.label_id
     order by crl.compte_reference_id, l.nom
  )
  select s.compte_reference_id,
         s.posts,
         round(s.r::numeric, 2) as r_mediane,
         s.vues::int as vues_mediane,
         ls.label_id,
         ls.nom as label_nom,
         coalesce(pl.posts, 0) as posts_label,
         round(pl.r::numeric, 2) as r_label,
         round((s.r / nullif(pl.r, 0))::numeric, 2) as r_vs_label
    from par_source s
    left join label_source ls on ls.compte_reference_id = s.compte_reference_id
    left join par_label pl on pl.label_id = ls.label_id;

grant select on public.source_performance to authenticated;

comment on view public.source_performance is
  'Par compte source : r médian de ses slideshows publiés il y a 3 à 30 jours (hors rappels, même r que pods_tableau 0324), vues médianes, et la même chose rapportée au r de son label (r_vs_label = r source ÷ r label). Page Sources. Voir 0356, 0357.';
