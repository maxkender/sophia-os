-- 0274 : photo d'un membre de l'équipe (HM, DM, Head of Ops…).
--
-- profiles.photo_url : URL publique de sa photo, COPIÉE une fois depuis son
-- profil Upwork dans le bucket `medias` (`profils/<id>.jpg`) — jamais un lien
-- vers Upwork, dont les adresses de portrait changent avec la photo. La page
-- Posters (carte des zones, blocs recruteur) la montre, à défaut les initiales.
--
-- Additive : colonne nullable, aucune lecture existante ne change.
-- Retour arrière : retirer d'abord la lecture côté front (listerPosters
-- sélectionne la colonne), puis `alter table public.profiles drop column
-- photo_url;`.

alter table public.profiles add column if not exists photo_url text;

alter table public.profiles drop constraint if exists profiles_photo_url_format;
alter table public.profiles add constraint profiles_photo_url_format check (
  photo_url is null or (photo_url ~ '^https://' and length(photo_url) <= 500)
);

comment on column public.profiles.photo_url is
  'Photo publique du membre (copie dans medias/profils/, depuis son profil Upwork). Null : initiales.';
