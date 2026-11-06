-- 0659 : UGC IA, le montage des vidéos générées (demande d'Adrien du 6/11).
--
-- Une vidéo Genjutsu se monte dans la page :
--   * recadrée dans le temps (début, fin) ;
--   * avec un bandeau style Snapchat (barre noire translucide, texte blanc
--     centré), écrit depuis le texte à l'écran (CTA) de la source,
--     placé à la hauteur voulue.
-- La vidéo montée devient la vidéo enregistrée (`video_url`) ; l'original de
-- Genjutsu reste gardé (`video_brute_*`) pour remonter autrement ensuite.
--
-- `montage_statut` : en_cours pendant le rendu (fait en arrière-plan par la
-- fonction `ugc-ia`), echec avec `montage_erreur`, vide sinon.
--
-- Additive. Reprise : l'original des vidéos déjà prêtes est leur vidéo
-- actuelle. Retour arrière : drop column des colonnes ajoutées.

alter table public.ugc_ia_generations
  add column video_brute_path text,
  add column video_brute_url text,
  add column montage_debut_s numeric,
  add column montage_fin_s numeric,
  add column bandeau_actif boolean not null default false,
  add column bandeau_texte text,
  add column bandeau_position numeric check (bandeau_position between 0 and 100),
  add column montage_statut text check (montage_statut in ('en_cours', 'echec')),
  add column montage_erreur text;

update public.ugc_ia_generations
set video_brute_path = video_path, video_brute_url = video_url
where video_url is not null and video_brute_url is null;
