-- 0346 : versions traduites d'une mise en scène (décision d'Adrien, 24/10).
--   Une mise en scène = une photo × un écran ; les langues en sont des
--   VERSIONS. La version espagnole part de la mise en scène française validée
--   (même photo, même main, même lumière) : Nano Banana Pro n'y remplace que
--   l'écran, par la capture traduite et relue à plat.
--   version_de : la mise en scène d'origine (null pour l'originale).
--   Une seule version vivante par mise en scène et par langue.
-- Additive, idempotente.

alter table public.mises_en_scene
  add column if not exists version_de uuid references public.mises_en_scene (id) on delete cascade;

create index if not exists mises_en_scene_version_idx on public.mises_en_scene (version_de);

create unique index if not exists mises_en_scene_version_langue_idx
  on public.mises_en_scene (version_de, langue) where version_de is not null and statut <> 'rejetee';
