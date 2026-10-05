-- 0259 : les pods (voir Notion « Pods » et pods/page-blanche/README.md).
--
-- Un pod est un atelier de production hors de l'OS. Il ne touche ni à
-- l'assignation ni à la tierlist : il DÉPOSE des contenus finis (images déjà
-- rendues, une version par langue) dans une file de validation. Un admin
-- valide ; la validation crée un contenu NORMAL dans le label du pod, que la
-- tierlist diffuse comme les autres.
--
-- ✅ Appliquée le 2026-10-05 (MCP, par morceaux : les instructions qui émettent
-- un NOTICE — « if exists / if not exists » sur un objet absent — bloquent
-- l'outil MCP jusqu'au délai ; le SQL Editor n'a pas ce problème).
--
-- Additive : rien ne change pour le code en place. Un contenu `livre` n'existe
-- que par validation d'une livraison ; tant qu'il n'y en a pas, l'assignation
-- suit exactement le chemin d'avant.

-- ---------------------------------------------------------------------------
-- Pods
-- ---------------------------------------------------------------------------
create table if not exists public.pods (
  slug text primary key,
  nom text not null,
  label_id uuid references public.labels (id) on delete set null,
  actif boolean not null default true,
  -- SHA-256 (hex) du jeton de l'agent du pod. Le jeton lui-même n'est jamais en
  -- base : il vit dans l'environnement de l'agent.
  jeton_hash text,
  created_at timestamptz not null default now()
);

alter table public.pods enable row level security;
drop policy if exists pods_admin on public.pods;
create policy pods_admin on public.pods
  for all using (public.is_admin()) with check (public.is_admin());

insert into public.pods (slug, nom, label_id)
select 'page_blanche', 'Page blanche', l.id
from public.labels l
where l.slug = 'white-bg'
on conflict (slug) do nothing;

-- ---------------------------------------------------------------------------
-- Livraisons : la file de validation
-- ---------------------------------------------------------------------------
create table if not exists public.pod_livraisons (
  id uuid primary key default gen_random_uuid(),
  pod text not null references public.pods (slug) on delete cascade,
  -- Post d'origine (pour un contenu « transformé ») ; null pour un original.
  source_url text,
  source_id text,
  source_vues integer,
  titre text,
  langue_source text not null default 'fr',
  musique_url text,
  musique_titre text,
  -- { "fr": { "hashtags": "…", "slides": [ { "position": 1, "media_id": "…",
  --   "url": "…", "position_sophia": false } ] }, "de": {…} }
  decks jsonb not null,
  -- Texte de chaque slide (relecture, note de pertinence à la validation).
  transcription jsonb,
  statut text not null default 'a_valider'
    check (statut in ('a_valider', 'validee', 'rejetee', 'ecartee_note')),
  motif text,
  note_import numeric,
  tier text,
  contenu_id uuid references public.contenus (id) on delete set null,
  decide_par uuid references auth.users (id) on delete set null,
  decide_le timestamptz,
  created_at timestamptz not null default now(),
  unique (pod, source_id)
);

create index if not exists pod_livraisons_statut_idx on public.pod_livraisons (statut, created_at);

alter table public.pod_livraisons enable row level security;
drop policy if exists pod_livraisons_admin on public.pod_livraisons;
create policy pod_livraisons_admin on public.pod_livraisons
  for all using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- Contenus livrés
-- ---------------------------------------------------------------------------
-- `livre` : le deck de chaque langue est fait d'IMAGES FINIES (texte en dur),
-- rangées dans contenu_langues.slides[].media_id. L'assignation ne traduit pas,
-- ne place pas l'app et ne sert le contenu que dans les langues livrées.
alter table public.contenus
  add column if not exists livre boolean not null default false,
  add column if not exists pod text references public.pods (slug) on delete set null;

create index if not exists contenus_pod_idx on public.contenus (pod) where pod is not null;
