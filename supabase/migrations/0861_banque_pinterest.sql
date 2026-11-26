-- Banque de l'OS : photos versées depuis Pinterest par les podz (demande
-- d'Adrien du 25/11 : le label male_run n'a plus de coureur neuf ; le podz 24
-- verse aussi des filles qui courent). Une source à part, vraie, et l'URL de la
-- pin d'origine gardée pour la traçabilité et le dédoublonnage.
alter type public.media_source add value if not exists 'pinterest';

alter table public.media_library
  add column if not exists origine_url text;

create unique index if not exists media_library_origine_url_idx
  on public.media_library (origine_url)
  where origine_url is not null;
