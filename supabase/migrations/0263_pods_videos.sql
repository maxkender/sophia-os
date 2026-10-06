-- 0263 : pod 3 « Réactions UGC » — vidéos par COMPTE (et non plus par label).
--
--   pod_personas : 1 compte = 1 persona synthétique (créé par l'agent du pod,
--                  validé par un admin). Jamais le visage d'une vraie personne.
--   pod_demos    : la démo de l'appli (Sophia) par langue, fournie par l'équipe.
--   pod_videos   : une réaction refaite pour UN compte, validée : le poster la
--                  publie avec la démo de sa langue et les textes à coller.
--   pod_livraisons.type 'video' : une réaction source déclinée sur N comptes.
--
-- Le pod ne choisit pas la date : à la validation, l'OS pose chaque vidéo sur
-- le premier jour libre du compte (à partir de demain).
-- ✅ Appliquée le 2026-10-06 (MCP). Additive.

alter table public.pod_livraisons drop constraint pod_livraisons_type_check;
alter table public.pod_livraisons add constraint pod_livraisons_type_check
  check (type in ('nouveau', 'langues', 'original', 'video'));

create table public.pod_personas (
  id uuid primary key default gen_random_uuid(),
  pod text not null references public.pods (slug) on delete cascade,
  compte_id uuid not null references public.comptes (id) on delete cascade,
  image_url text not null,
  image_path text not null,
  description text not null default '',
  statut text not null default 'a_valider' check (statut in ('a_valider', 'valide', 'rejete')),
  motif text,
  decide_le timestamptz,
  created_at timestamptz not null default now(),
  unique (pod, compte_id)
);
alter table public.pod_personas enable row level security;
create policy pod_personas_admin on public.pod_personas
  for all using (public.is_admin()) with check (public.is_admin());

create table public.pod_demos (
  id uuid primary key default gen_random_uuid(),
  application text not null default 'sophia',
  langue text not null,
  video_url text not null,
  video_path text not null,
  created_at timestamptz not null default now(),
  unique (application, langue)
);
alter table public.pod_demos enable row level security;
create policy pod_demos_admin on public.pod_demos
  for all using (public.is_admin()) with check (public.is_admin());

create table public.pod_videos (
  id uuid primary key default gen_random_uuid(),
  livraison_id uuid references public.pod_livraisons (id) on delete set null,
  pod text not null,
  compte_id uuid not null references public.comptes (id) on delete cascade,
  langue text not null,
  date_publication_prevue date not null,
  reaction_url text not null,
  demo_url text not null,
  texte_ecran text not null default '',
  legende text not null default '',
  musique_titre text,
  musique_url text,
  statut text not null default 'a_publier' check (statut in ('a_publier', 'publie', 'annule')),
  tiktok_url text,
  publie_le timestamptz,
  created_at timestamptz not null default now()
);
create index pod_videos_compte_jour_idx on public.pod_videos (compte_id, date_publication_prevue);
alter table public.pod_videos enable row level security;
create policy pod_videos_admin on public.pod_videos
  for all using (public.is_admin()) with check (public.is_admin());
-- Le poster voit les vidéos de SES comptes et les marque publiées.
create policy pod_videos_poster_select on public.pod_videos
  for select to authenticated
  using (exists (select 1 from public.comptes c where c.id = pod_videos.compte_id and c.poster_id = auth.uid()));
create policy pod_videos_poster_update on public.pod_videos
  for update to authenticated
  using (exists (select 1 from public.comptes c where c.id = pod_videos.compte_id and c.poster_id = auth.uid()))
  with check (exists (select 1 from public.comptes c where c.id = pod_videos.compte_id and c.poster_id = auth.uid()));
grant select, update on public.pod_videos to authenticated;
grant select, insert, update, delete on public.pod_personas, public.pod_demos to authenticated;
grant all on public.pod_personas, public.pod_demos, public.pod_videos to service_role;
