-- Frame 10 nettoyée (text-removal classique) avant Nano Banana face-ref.
alter table public.ugc_video_posts
  add column if not exists frame_clean_path text null,
  add column if not exists frame_clean_url text null;

comment on column public.ugc_video_posts.frame_clean_url is
  '10e frame reaction après nettoyage texte (Fal/Replicate) — entrée Nano Banana.';
