-- Trace upscale bibliothèque (Recraft Crisp via Replicate).
-- Null = jamais upscalé → éligible à « Upscale all (non upscalés) ».
alter table public.media_library
  add column if not exists upscale_le timestamptz;

create index if not exists media_library_upscale_le_idx
  on public.media_library (upscale_le)
  where upscale_le is null;
