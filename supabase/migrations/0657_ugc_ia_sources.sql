-- 0657 : UGC IA, une source pour plusieurs personas (demande d'Adrien du 5/11).
--
-- Jusqu'ici (0656) une vidéo = une source TikTok ET un persona. Désormais :
--   ugc_ia_sources     : la réaction de référence (TikTok téléchargé, passage
--                        coupé) et son CTA : le premier écran (image) et son
--                        texte, lu par OCR à l'import puis corrigeable à la main.
--   ugc_ia_generations : une vidéo Genjutsu = une source + un persona + une
--                        qualité + un prompt. On peut générer une source pour
--                        plusieurs personas cochés, et refaire une génération
--                        (autre qualité, autre prompt) : c'est une ligne de plus.
--                        Le passage utilisé est recopié (début, fin).
--
-- Une seule génération en cours par source et par persona (index unique) :
-- un double clic ne lance pas deux générations facturées.
--
-- Personas : Claude les ajoute directement en base (skill `ugc-ia`), avec
-- l'URL publique d'une image ; `image_path` vide = image pas encore copiée
-- dans le stockage de l'OS (la fonction `ugc-ia` la rapatrie).
--
-- Reprise : les 4 vidéos de 0656 deviennent 4 sources (même id, mêmes
-- fichiers) et leurs 4 générations ; puis ugc_ia_videos disparaît.
--
-- ✅ Appliquée le 2026-11-05 (MCP) : 4 sources et 4 générations reprises.
--
-- Retour arrière : recréer ugc_ia_videos (0656) depuis sources ⋈ générations,
-- puis drop table ugc_ia_generations, ugc_ia_sources.

set lock_timeout = '5s';

create table public.ugc_ia_sources (
  id uuid primary key default gen_random_uuid(),
  source_url text not null,
  source_texte text,
  source_vues bigint,
  source_duree_s numeric,
  brut_path text,
  brut_url text,
  debut_s numeric,
  fin_s numeric,
  coupe_path text,
  coupe_url text,
  cta_texte text,
  cta_image_path text,
  cta_image_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index ugc_ia_sources_created_idx on public.ugc_ia_sources (created_at desc);

create table public.ugc_ia_generations (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.ugc_ia_sources (id) on delete cascade,
  persona_id uuid not null references public.ugc_ia_personas (id) on delete restrict,
  debut_s numeric,
  fin_s numeric,
  prompt text,
  resolution text not null default '720p' check (resolution in ('480p', '720p', '1080p')),
  higgsfield_request_id text,
  statut text not null default 'en_cours' check (statut in ('en_cours', 'prete', 'echec')),
  erreur text,
  video_path text,
  video_url text,
  lancee_le timestamptz not null default now(),
  generee_le timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index ugc_ia_generations_source_idx on public.ugc_ia_generations (source_id, created_at desc);
create unique index ugc_ia_generations_une_en_cours
  on public.ugc_ia_generations (source_id, persona_id) where statut = 'en_cours';

alter table public.ugc_ia_sources enable row level security;
alter table public.ugc_ia_generations enable row level security;
create policy ugc_ia_sources_admin on public.ugc_ia_sources
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy ugc_ia_generations_admin on public.ugc_ia_generations
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
-- Le front ne fait que lire : tout changement passe par la fonction `ugc-ia`.
grant select on public.ugc_ia_sources, public.ugc_ia_generations to authenticated;
grant all on public.ugc_ia_sources, public.ugc_ia_generations to service_role;

-- Reprise des vidéos de 0656.
insert into public.ugc_ia_sources (
  id, source_url, source_texte, source_vues, source_duree_s, brut_path, brut_url,
  debut_s, fin_s, coupe_path, coupe_url, created_at, updated_at
)
select id, source_url, source_texte, source_vues, source_duree_s, brut_path, brut_url,
  debut_s, fin_s, coupe_path, coupe_url, created_at, updated_at
from public.ugc_ia_videos;

insert into public.ugc_ia_generations (
  source_id, persona_id, debut_s, fin_s, prompt, resolution, higgsfield_request_id,
  statut, erreur, video_path, video_url, lancee_le, generee_le, created_at, updated_at
)
select id, persona_id, debut_s, fin_s, prompt, resolution, higgsfield_request_id,
  statut, erreur, video_path, video_url, lancee_le, generee_le, coalesce(lancee_le, created_at), updated_at
from public.ugc_ia_videos
where statut in ('en_cours', 'prete', 'echec') and lancee_le is not null;

do $$
begin
  if (select count(*) from public.ugc_ia_sources) <> (select count(*) from public.ugc_ia_videos) then
    raise exception 'reprise UGC IA incomplète : sources';
  end if;
  if (select count(*) from public.ugc_ia_generations)
     <> (select count(*) from public.ugc_ia_videos where statut in ('en_cours', 'prete', 'echec') and lancee_le is not null) then
    raise exception 'reprise UGC IA incomplète : générations';
  end if;
end $$;

drop table public.ugc_ia_videos;
