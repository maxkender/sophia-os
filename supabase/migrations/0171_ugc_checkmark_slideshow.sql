-- Checkmark UGC sur slideshows + détection visage humain au premier plan (vision)

alter table public.contenus
  add column if not exists ugc_compatible boolean not null default false;

comment on column public.contenus.ugc_compatible is
  'Slideshow marqué UGC — déclenche le scan visage premier plan sur les images.';

create index if not exists contenus_ugc_compatible_idx
  on public.contenus (ugc_compatible)
  where ugc_compatible;

alter table public.media_library
  add column if not exists visage_premier_plan boolean null;

comment on column public.media_library.visage_premier_plan is
  'Visage humain nettement au premier plan (scan UGC openrouter/vision). Null = non scanné. Éditable manuellement.';
