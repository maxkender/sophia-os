-- Seedance 2.0 Fast accepte 4–15 s : les plans papier suivent le texte, plus seulement 4/6/8.
alter table public.papier_scenes drop constraint if exists papier_scenes_duree_check;
alter table public.papier_scenes
  add constraint papier_scenes_duree_check check (duree_cible between 4 and 15);

comment on column public.papier_scenes.duree_cible is
  'Durée Seedance du plan (4–15 s), calée sur le texte ; le mix coupe ensuite à la voix.';
