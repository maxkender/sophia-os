-- 0655 : UGC IA, une page à part (/admin/ugc-ia), hors podz (demande d'Adrien du 5/11).
--
-- Une réaction TikTok qui marche est refaite par un persona synthétique avec
-- Higgsfield Genjutsu (transfert de mouvement, API directe : secret
-- HIGGSFIELD_API_KEY = « KEY_ID:KEY_SECRET »). Pour l'instant :
--   * un seul persona, Sophie (reprise du pod Réactions UGC, même image) ;
--   * les vidéos restent dans la bibliothèque de la page (pas de calendrier,
--     pas de compte TikTok associé : ça viendra persona par persona).
--
--   ugc_ia_personas : les visages synthétiques (jamais une personne réelle).
--   ugc_ia_videos   : une vidéo = une source TikTok, le passage coupé, la
--                     génération Genjutsu et son résultat.
--
-- Cycle d'une vidéo : importee (source téléchargée) → coupee (passage prêt)
-- → en_cours (Genjutsu lancé) → prete | echec (relançable).
--
-- Additive. Retour arrière : drop table ugc_ia_videos, ugc_ia_personas.

create table public.ugc_ia_personas (
  id uuid primary key default gen_random_uuid(),
  nom text not null,
  description text not null default '',
  image_url text not null,
  image_path text,
  actif boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.ugc_ia_videos (
  id uuid primary key default gen_random_uuid(),
  persona_id uuid not null references public.ugc_ia_personas (id) on delete restrict,
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
  prompt text,
  resolution text not null default '720p' check (resolution in ('480p', '720p', '1080p')),
  higgsfield_request_id text,
  statut text not null default 'importee'
    check (statut in ('importee', 'coupee', 'en_cours', 'prete', 'echec')),
  erreur text,
  video_path text,
  video_url text,
  lancee_le timestamptz,
  generee_le timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index ugc_ia_videos_created_idx on public.ugc_ia_videos (created_at desc);

alter table public.ugc_ia_personas enable row level security;
alter table public.ugc_ia_videos enable row level security;
create policy ugc_ia_personas_admin on public.ugc_ia_personas
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy ugc_ia_videos_admin on public.ugc_ia_videos
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
-- Le front ne fait que lire : tout changement passe par la fonction `ugc-ia`.
grant select on public.ugc_ia_personas, public.ugc_ia_videos to authenticated;
grant all on public.ugc_ia_personas, public.ugc_ia_videos to service_role;

-- Sophie : le persona validé du pod Réactions UGC (compte EN), même image.
insert into public.ugc_ia_personas (nom, description, image_url, image_path)
select 'Sophie', p.description, split_part(p.image_url, '?', 1), p.image_path
from public.pod_personas p
where p.pod = 'reactions_ugc'
  and p.compte_id = '7873ed1f-d795-449c-8797-85c4e142bae5'
  and p.statut = 'valide';
