-- UGC AI VIDEO : créateurs marqués vidéo (sans labels), HM dédiés.
-- Persona unique partagé avec UGC AI slideshow (index comptes_ugc_persona_unique).

alter table public.comptes
  add column if not exists ugc_ai_video boolean not null default false;

comment on column public.comptes.ugc_ai_video is
  'Créateur UGC AI VIDEO — marque seule, aucun label ; persona unique (pool partagé slideshow).';

create index if not exists comptes_ugc_ai_video_idx
  on public.comptes (ugc_ai_video)
  where ugc_ai_video;

alter table public.profiles
  add column if not exists hm_ugc_ai_video boolean not null default false;

comment on column public.profiles.hm_ugc_ai_video is
  'Hiring manager UGC AI VIDEO : ses créateurs naissent ugc_ai_video + persona, sans labels.';
