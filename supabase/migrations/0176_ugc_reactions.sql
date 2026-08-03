-- Vidéos AI — bundle « reactions » (import TikTok + crop + frame + OCR)

create table if not exists public.ugc_reactions (
  id uuid primary key default gen_random_uuid(),
  titre text not null default '',
  source_url text not null,
  tiktok_post_id text null,
  caption_source text null,
  -- Vidéo source (Apify)
  video_source_path text not null,
  video_source_url text not null,
  -- Vidéo cropée (celle qu’on garde)
  video_path text null,
  video_url text null,
  crop jsonb null,
  -- 10e frame + OCR
  first_frame_reference_path text null,
  first_frame_reference_url text null,
  video_text text null,
  -- Méta
  musique_url text null,
  musique_titre text null,
  duree_ms integer null,
  largeur integer null,
  hauteur integer null,
  statut text not null default 'brouillon'
    check (statut in ('brouillon', 'pret', 'archive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ugc_reactions_created_idx
  on public.ugc_reactions (created_at desc);

create unique index if not exists ugc_reactions_source_url_uidx
  on public.ugc_reactions (source_url);

alter table public.ugc_reactions enable row level security;

drop policy if exists ugc_reactions_admin on public.ugc_reactions;
create policy ugc_reactions_admin on public.ugc_reactions
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

grant select, insert, update, delete on public.ugc_reactions to authenticated;
grant all on public.ugc_reactions to service_role;

-- Admin : update storage (upsert crop / frame)
drop policy if exists medias_update_admin on storage.objects;
create policy medias_update_admin on storage.objects
  for update to authenticated
  using (bucket_id = 'medias' and public.is_admin())
  with check (bucket_id = 'medias' and public.is_admin());
