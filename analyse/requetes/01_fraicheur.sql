-- 01 · Fraîcheur et qualité des données. À lancer EN PREMIER : si le relevé
-- est en panne, toute la suite est fausse.
-- Attendu : dernier_releve < 24 h, sans_vues < 5 %, rc_sophia < 6 h.
select
  (select max(stats_maj_at) from passages)                                   as dernier_releve,
  (select max(collecte_at) from compte_metrics)                              as dernier_compte_metrics,
  (select fetched_at from rc_metrics_cache where id = 'sophia')              as rc_sophia,
  (select count(*) from comptes where is_active)                             as comptes_actifs,
  (select count(*) from passages where statut = 'publie'
     and publie_at > now() - interval '7 days')                              as publies_7j,
  -- Posts mûrs (3 à 14 jours) : ils devraient tous avoir une mesure.
  (select json_build_object(
     'publies', count(*),
     'sans_vues', count(*) filter (where vues is null),
     'pct_sans_vues', round(100.0 * count(*) filter (where vues is null) / nullif(count(*), 0), 1),
     'introuvables', count(*) filter (where resolution_statut = 'introuvable'),
     'a_resoudre', count(*) filter (where resolution_statut = 'a_resoudre'))
   from passages where statut = 'publie'
     and publie_at between now() - interval '14 days' and now() - interval '3 days') as qualite,
  -- Taux de publication : créneaux échus (hier et avant) réellement postés.
  (select json_build_object(
     'prevus', count(*),
     'publies', count(*) filter (where statut = 'publie'),
     'pct', round(100.0 * count(*) filter (where statut = 'publie') / nullif(count(*), 0), 1))
   from passages where date_publication_prevue between current_date - 15 and current_date - 1) as completion_14j,
  -- Âge des vues au moment du relevé (heures) : la base garde les vues vers J+2.
  (select round(percentile_cont(0.5) within group (order by
     extract(epoch from (stats_maj_at - coalesce(tiktok_publie_at, publie_at))) / 3600)::numeric)
   from passages where statut = 'publie' and vues is not null
     and publie_at between now() - interval '17 days' and now() - interval '3 days') as age_releve_h_median;
