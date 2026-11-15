-- 0731 : le graphique « Vues par jour » du Pilotage montre aussi les vues à
-- J+1, J+3 et J+7 (demande d'Adrien du 15/11).
--
-- Les vues actuelles d'un jour montent encore pendant des jours : on ne peut
-- pas comparer hier à il y a dix jours. Les photos de la nuit
-- (`passage_vues_jalons`, 0727) figent les vues de chaque post à 1, 3 et 7
-- jours : la somme par jour de publication se compare d'un jour à l'autre.
-- Mêmes colonnes qu'avant, plus, à la fin : vues_j1/j3/j7 (somme des vues à
-- cet âge) et posts_j1/j3/j7 (posts photographiés à cet âge ; un jour où peu
-- de posts l'ont été, avant le 1/11 ou le 12/11, n'est pas montré).
-- Retour arrière : recréer la vue sans les six colonnes (0640).

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
       count(j7.vues)::integer as posts_j7
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
values (to_char(now() at time zone 'UTC', 'YYYYMMDDHH24MISS'), 'vues_par_jour_jalons', array['voir 0731']);
