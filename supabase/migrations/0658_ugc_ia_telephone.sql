-- 0658 : UGC IA, la partie téléphone de la source (demande d'Adrien du 5/11).
--
-- Une réaction TikTok type = une réaction face caméra (refaite par les
-- personas avec Genjutsu), puis la démo de l'appli sur un téléphone. Cette
-- seconde partie se coupe aussi dans la page et se garde telle quelle
-- (son compris) : elle n'est pas envoyée à Genjutsu.
--
-- Additive. Retour arrière : alter table … drop column des 4 colonnes.

alter table public.ugc_ia_sources
  add column telephone_debut_s numeric,
  add column telephone_fin_s numeric,
  add column telephone_path text,
  add column telephone_url text;
