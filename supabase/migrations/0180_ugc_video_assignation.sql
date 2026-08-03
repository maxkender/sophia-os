-- Assignation UGC AI VIDEO : posts vidéo (reaction → NB → Kling → concat utilisation).

create table if not exists public.ugc_video_posts (
  id uuid primary key default gen_random_uuid(),
  compte_id uuid not null references public.comptes (id) on delete cascade,
  date_publication_prevue date not null,
  reaction_id uuid not null references public.ugc_reactions (id) on delete restrict,
  utilisation_id uuid not null references public.ugc_utilisations (id) on delete restrict,
  label_id uuid null references public.labels (id) on delete set null,
  -- Étape 1 : photo de référence (Nano Banana)
  image_ref_path text null,
  image_ref_url text null,
  -- Étape 2 : vidéo Kling motion-control
  video_kling_path text null,
  video_kling_url text null,
  -- Étape 3 : concat Kling + utilisation
  video_finale_path text null,
  video_finale_url text null,
  -- Étape 4 : légende traduite (langue créateur)
  caption text null,
  video_text_source text null,
  statut text not null default 'pending'
    check (statut in ('pending', 'running', 'pret', 'echec')),
  pipeline_erreur text null,
  est_test boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ugc_video_posts_compte_jour_idx
  on public.ugc_video_posts (compte_id, date_publication_prevue);

create index if not exists ugc_video_posts_reaction_idx
  on public.ugc_video_posts (compte_id, reaction_id);

create index if not exists ugc_video_posts_statut_idx
  on public.ugc_video_posts (statut)
  where statut in ('pending', 'running');

comment on table public.ugc_video_posts is
  'Assignation UGC AI VIDEO : reaction (même label) → NB → Kling → concat utilisation + caption.';

alter table public.ugc_video_posts enable row level security;

drop policy if exists ugc_video_posts_admin on public.ugc_video_posts;
create policy ugc_video_posts_admin on public.ugc_video_posts
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Créateur voit ses propres posts vidéo (calendrier / identité).
drop policy if exists ugc_video_posts_poster_select on public.ugc_video_posts;
create policy ugc_video_posts_poster_select on public.ugc_video_posts
  for select to authenticated
  using (
    exists (
      select 1 from public.comptes c
      where c.id = ugc_video_posts.compte_id
        and c.poster_id = auth.uid()
    )
  );

grant select, insert, update, delete on public.ugc_video_posts to authenticated;
grant all on public.ugc_video_posts to service_role;

-- Prompts éditables (Settings / Prompts).
insert into public.prompts (cle, contenu) values
(
  'ugc_video_face_ref',
  $p$Figure 1 is the base photo. Figures 2+ are reference photos of one same person.
Keep EVERYTHING in Figure 1 identical: exact body pose, hands, framing, camera
angle, background, lighting and color grade.
Replace ONLY the head and face with the person shown in the reference photos —
same facial features, same hairstyle, same skin tone as the references.
Blend the new head naturally onto the existing body and match the scene lighting.
Photorealistic, keep the amateur phone-photo look.$p$
),
(
  'ugc_video_kling_negative',
  $p$identity change, different face, face morphing, warping, distortion, extra fingers, deformed hands, model look, glamour, studio lighting, soft flattering light, airbrushed skin, dewy, glossy, creamy bokeh, watermark, text, logo, cartoon, 3D render$p$
),
(
  'ugc_video_kling_prompt',
  $p$Same person as in the reference image, natural reaction, amateur vertical phone video, casual lighting.$p$
),
(
  'ugc_video_caption',
  $p$Tu rédiges la légende TikTok d'une vidéo UGC en DEUX parties collées :
1) une réaction « waouh regarde ce que je viens de trouver » (le visage parle, pas besoin de décrire la scène),
2) une démo d'utilisation d'une appli (la suite de la vidéo).

Règles STRICTES :
- Écris UNIQUEMENT dans la langue cible indiquée.
- Ne mentionne JAMAIS Sophia, ni aucun nom de marque interne.
- Oriente clairement vers l'appli / le truc montré dans la partie utilisation (curiosité + CTA soft).
- Ton casual, téléphone, authentique. 1 à 3 phrases max + hashtags légers optionnels.
- Pas de guillemets autour de la légende. Sortie = texte prêt à coller.$p$
)
on conflict (cle) do nothing;
