-- 0665 : UGC IA — démos et vidéos complètes.
--
-- Une démo (la vidéo de l'appli qu'on colle après la réaction) vit dans une
-- bibliothèque commune : importée de l'ordinateur, ou reprise de la partie
-- téléphone d'une source. On la monte dans la page (passages gardés, dans
-- l'ordre voulu, accélérés ou non) ; la page rend la vidéo et la fonction
-- `ugc-ia` la réencode en MP4 H.264.
--
-- Une vidéo complète (assemblage) = une réaction générée + une démo, muette,
-- avec le bandeau style Snapchat posé sur toute la durée. Rendue par la page
-- (dessin image par image : rien des métadonnées des vidéos d'origine ne
-- passe), réencodée par `ugc-ia`, puis envoyée à un compte UGCV en post vidéo
-- (CTA déjà incrusté).

create table if not exists public.ugc_ia_demos (
  id uuid primary key default gen_random_uuid(),
  nom text not null,
  -- Partie téléphone d'une source reprise comme démo (sinon vidéo importée).
  source_id uuid references public.ugc_ia_sources(id) on delete set null,
  brut_url text not null,
  -- Chemin de la vidéo importée (supprimée avec la démo) ; vide pour une partie
  -- téléphone, qui reste à sa source.
  brut_path text,
  brut_duree_s numeric,
  -- Le montage : passages gardés dans l'ordre [{ debut, fin }] (secondes de la
  -- vidéo brute) et la vitesse (1 = normale).
  passages jsonb not null default '[]'::jsonb,
  vitesse numeric not null default 1 check (vitesse > 0 and vitesse <= 4),
  -- La démo montée (MP4 H.264), vide tant qu'elle n'est pas montée.
  video_url text,
  video_path text,
  duree_s numeric,
  montage_statut text check (montage_statut in ('en_cours', 'echec')),
  montage_erreur text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists ugc_ia_demos_source_unique
  on public.ugc_ia_demos (source_id) where source_id is not null;

comment on table public.ugc_ia_demos is
  'UGC IA (0665) : bibliothèque des démos à coller après une réaction, avec leur montage (passages, vitesse).';

create table if not exists public.ugc_ia_assemblages (
  id uuid primary key default gen_random_uuid(),
  generation_id uuid not null references public.ugc_ia_generations(id) on delete cascade,
  demo_id uuid references public.ugc_ia_demos(id) on delete set null,
  bandeau_actif boolean not null default true,
  bandeau_texte text,
  bandeau_position numeric,
  video_url text,
  video_path text,
  duree_s numeric,
  statut text not null default 'en_cours' check (statut in ('en_cours', 'prete', 'echec')),
  erreur text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ugc_ia_assemblages_generation_idx on public.ugc_ia_assemblages (generation_id);

comment on table public.ugc_ia_assemblages is
  'UGC IA (0665) : vidéo complète = réaction générée + démo, muette, bandeau sur toute la durée, prête à envoyer en post UGCV.';

alter table public.ugc_ia_demos enable row level security;
alter table public.ugc_ia_assemblages enable row level security;

drop policy if exists ugc_ia_demos_admin on public.ugc_ia_demos;
create policy ugc_ia_demos_admin on public.ugc_ia_demos
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists ugc_ia_assemblages_admin on public.ugc_ia_assemblages;
create policy ugc_ia_assemblages_admin on public.ugc_ia_assemblages
  for all using (public.is_admin()) with check (public.is_admin());

-- Un post vidéo peut pointer vers la vidéo complète qu'il envoie.
alter table public.post_videos
  add column if not exists assemblage_id uuid references public.ugc_ia_assemblages(id) on delete set null;
