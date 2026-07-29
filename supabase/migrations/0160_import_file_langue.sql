-- Langue d'origine du TikTok précisée à l'import (plus de défaut silencieux « fr »).
-- Sert au boost ELO (kk = k/2 sur la langue source).

alter table public.import_file
  add column if not exists langue text;

comment on column public.import_file.langue is
  'Langue d''origine du TikTok (code ISO court). Prioritaire sur comptes_reference.langue.';

notify pgrst, 'reload schema';
