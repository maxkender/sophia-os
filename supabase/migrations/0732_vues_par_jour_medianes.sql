-- 0732 : médianes du graphique « Vues par jour » du Pilotage (demande
-- d'Adrien du 15/11 : juger par total, moyenne, médiane ou nombre de posts).
--
-- Mêmes colonnes que 0731, plus, à la fin : med (vues médianes par post
-- mesuré), med_j1/j3/j7 (médianes des vues figées à 1, 3 et 7 jours).
-- La médiane dit ce que fait un post « normal », sans les quelques posts
-- viraux qui tirent la moyenne.
-- Retour arrière : recréer la vue de 0731.

create or replace view public.vues_par_jour_publication as
select p.date_publication_prevue as jour,
       sum(p.vues) as vues,
       count(*)::integer as posts_publies,
       count(p.vues)::integer as posts_mesures,
       count(distinct p.compte_id) filter (where p.vues is not null)::integer as nb_comptes,
       sum(j1.vues) as vues_j1,
       sum(j3.vues) as vues_j3,
       sum(j7.vues) as vues_j7,
       count(j1.vues)::integer as posts_j1,
       count(j3.vues)::integer as posts_j3,
       count(j7.vues)::integer as posts_j7,
       percentile_cont(0.5) within group (order by p.vues) as med,
       percentile_cont(0.5) within group (order by j1.vues) as med_j1,
       percentile_cont(0.5) within group (order by j3.vues) as med_j3,
       percentile_cont(0.5) within group (order by j7.vues) as med_j7
  from public.passages p
  left join public.posts po on po.id = p.post_id
  left join public.passage_vues_jalons j1 on j1.passage_id = p.id and j1.age_jours = 1
  left join public.passage_vues_jalons j3 on j3.passage_id = p.id and j3.age_jours = 3
  left join public.passage_vues_jalons j7 on j7.passage_id = p.id and j7.age_jours = 7
 where p.statut = 'publie'
   and not coalesce(po.est_test, false)
   and p.date_publication_prevue >= (now() at time zone 'Europe/Paris')::date - 120
 group by p.date_publication_prevue;

insert into supabase_migrations.schema_migrations (version, name, statements)
values (to_char(now() at time zone 'UTC', 'YYYYMMDDHH24MISS'), 'vues_par_jour_medianes', array['voir 0732']);
