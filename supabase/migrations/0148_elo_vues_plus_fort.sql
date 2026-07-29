-- ELO : les vues pèsent beaucoup plus. Plafond log ~120k → un post à 100k
-- vues est énorme (~96/100). Poids vues 80 % / pertinence 20 %.
-- N'altère ni posts, ni stocks existants — s'applique aux prochains calculs ELO.

update public.reglages
set valeur = coalesce(valeur, '{}'::jsonb) || jsonb_build_object(
      'elo_poids_vues', 0.8,
      'elo_vues_plafond', 120000
    ),
    updated_at = now()
where cle = 'scoring';
