-- Vidéos d'explication (5–15 s) liées aux remarques génériques TikTok QA.
-- Copiées sur la review à l'envoi pour que le créateur les voie même si la
-- remarque change ensuite.

alter table public.review_remarques
  add column if not exists video_url text,
  add column if not exists video_path text;

alter table public.reviews
  add column if not exists videos jsonb not null default '[]'::jsonb;

comment on column public.review_remarques.video_url is
  'URL publique de la vidéo d''explication liée à la remarque générique.';
comment on column public.reviews.videos is
  'Liste [{url, titre}] des vidéos d''explication envoyées au créateur, dans l''ordre.';
