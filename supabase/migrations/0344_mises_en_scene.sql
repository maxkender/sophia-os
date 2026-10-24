-- 0344 : banque des captures d'applis et de leurs mises en scène (décision
--   d'Adrien, 23/10). Fonction Edge `mises-en-scene`, onglets Captures,
--   Intégrateurs et Mises en scène de la Bibliothèque (Admin → Bibliothèque).
--
--   Trois étages, tous rangés par SUPPORT (iphone, tablette, ordinateur) :
--   captures_app    : les vrais écrans de nos applis (micabo, Sophia, UnSwipe),
--                     par application et par support. Originaux d'abord ; les
--                     traductions (Nano Banana Pro) viendront plus tard.
--   integrateurs    : des photos de la bibliothèque (`media_library`) choisies
--                     pour recevoir l'écran d'un support (une main qui tient un
--                     iPhone, un iPad posé sur un bureau, un ordi ouvert…).
--   mises_en_scene  : le croisement d'une capture validée et d'un intégrateur
--                     validé du même support, fait par Nano Banana Pro (Fal).
--   depenses_fal    : journal des appels Fal, pour le budget par semaine
--                     glissante (reglages.mises_en_scene).
--
-- Accès : admin (tout), agent « Mises en scène » (en-tête x-agent-jeton,
-- empreinte SHA-256 dans reglages.mises_en_scene.jeton_hash, posée à part :
-- importe, propose des intégrateurs, met en scène, ne valide jamais), podz
-- (x-pod-jeton : lecture des seules images validées et compteur d'usage).
--
-- Exprès HORS de `media_library` : une mise en scène porte du texte d'appli et
-- ne doit jamais sortir dans les tirages de photos des labels.
-- Seules les lignes `validee` (par un humain) servent aux podz.
-- Stockage : medias/captures/<app>/<langue>/… et
--            medias/mises-en-scene/<app>/<langue>/…
-- Additive, idempotente.

create table if not exists public.captures_app (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.applications (id),
  -- parcours, notes, a-retenir, lecons, site…
  ecran text not null check (ecran ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(ecran) <= 40),
  support text not null check (support in ('iphone', 'tablette', 'ordinateur')),
  langue text not null check (langue ~ '^[a-z]{2}(-[A-Za-z0-9]{2,3})?$'),
  nature text not null check (nature in ('originale', 'traduite')),
  -- Une traduite pointe vers son originale ; une originale n'en a pas.
  originale_id uuid references public.captures_app (id) on delete cascade,
  storage_path text not null unique,
  url text not null,
  largeur integer,
  hauteur integer,
  statut text not null default 'a_valider' check (statut in ('a_valider', 'validee', 'rejetee')),
  motif_rejet text,
  -- Nouvelle capture du même écran, en attente : à sa validation, l'ancienne
  -- (remplace_id) reçoit remplacee_par et ses mises en scène sont à refaire.
  remplace_id uuid references public.captures_app (id) on delete set null,
  remplacee_par uuid references public.captures_app (id) on delete set null,
  decide_par uuid references auth.users (id),
  decide_le timestamptz,
  created_at timestamptz not null default now(),
  constraint captures_app_nature_originale check (
    (nature = 'originale' and originale_id is null)
    or (nature = 'traduite' and originale_id is not null)
  )
);

create index if not exists captures_app_filtre_idx
  on public.captures_app (application_id, support, langue, statut);
create index if not exists captures_app_originale_idx on public.captures_app (originale_id);

create table if not exists public.integrateurs (
  id uuid primary key default gen_random_uuid(),
  media_id uuid not null references public.media_library (id) on delete cascade,
  support text not null check (support in ('iphone', 'tablette', 'ordinateur')),
  -- Pourquoi cette photo (« main qui tient l'iPhone au-dessus d'un goûter »).
  note text,
  -- Proposé par l'agent : à valider ; choisi par un admin : validé d'emblée.
  statut text not null default 'a_valider' check (statut in ('a_valider', 'validee', 'rejetee')),
  motif_rejet text,
  decide_par uuid references auth.users (id),
  decide_le timestamptz,
  created_at timestamptz not null default now(),
  unique (media_id, support)
);

create table if not exists public.mises_en_scene (
  id uuid primary key default gen_random_uuid(),
  capture_id uuid not null references public.captures_app (id) on delete cascade,
  integrateur_id uuid not null references public.integrateurs (id) on delete cascade,
  -- La photo de l'intégrateur (recopiée : les podz filtrent sans jointure).
  scene_id uuid not null references public.media_library (id) on delete cascade,
  application_id uuid not null references public.applications (id),
  ecran text not null,
  langue text not null,
  support text not null check (support in ('iphone', 'tablette', 'ordinateur')),
  storage_path text not null unique,
  url text not null,
  largeur integer,
  hauteur integer,
  statut text not null default 'a_valider' check (statut in ('a_valider', 'validee', 'rejetee')),
  motif_rejet text,
  -- « Parfait ou rien » : un essai, une seule relance, sinon rejet.
  essai smallint not null default 1 check (essai in (1, 2)),
  relance_de uuid references public.mises_en_scene (id) on delete set null,
  prompt text,
  used_count integer not null default 0,
  decide_par uuid references auth.users (id),
  decide_le timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists mises_en_scene_filtre_idx
  on public.mises_en_scene (application_id, support, ecran, langue, statut);
-- Une seule mise en scène vivante par couple capture × intégrateur.
create unique index if not exists mises_en_scene_couple_idx
  on public.mises_en_scene (capture_id, integrateur_id) where statut <> 'rejetee';

create table if not exists public.depenses_fal (
  id uuid primary key default gen_random_uuid(),
  le timestamptz not null default now(),
  -- traduire_capture | mettre_en_scene
  action text not null,
  objet_id uuid,
  usd numeric(8, 3) not null,
  -- 'admin:<uuid>' ou 'agent:mises-en-scene'
  par text
);

create index if not exists depenses_fal_le_idx on public.depenses_fal (le);

-- Usage d'une mise en scène par un podz (compteur, sans course).
create or replace function public.utiliser_mise_en_scene(p_id uuid)
returns integer
language sql
security definer
set search_path = public
as $$
  update public.mises_en_scene
     set used_count = used_count + 1
   where id = p_id and statut = 'validee'
  returning used_count;
$$;

revoke all on function public.utiliser_mise_en_scene(uuid) from public, anon, authenticated;
grant execute on function public.utiliser_mise_en_scene(uuid) to service_role;

-- Budget Fal par semaine glissante. Prix d'une image Nano Banana Pro à
-- confirmer sur la facture Fal ; plafond fixé par Adrien à 5 $ (24/10).
insert into public.reglages (cle, valeur)
values ('mises_en_scene', '{"budget_fal_usd_semaine": 5, "prix_image_usd": 0.15}'::jsonb)
on conflict (cle) do nothing;

alter table public.captures_app enable row level security;
alter table public.integrateurs enable row level security;
alter table public.mises_en_scene enable row level security;
alter table public.depenses_fal enable row level security;

drop policy if exists captures_app_admin on public.captures_app;
create policy captures_app_admin on public.captures_app
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists integrateurs_admin on public.integrateurs;
create policy integrateurs_admin on public.integrateurs
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists mises_en_scene_admin on public.mises_en_scene;
create policy mises_en_scene_admin on public.mises_en_scene
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists depenses_fal_admin on public.depenses_fal;
create policy depenses_fal_admin on public.depenses_fal
  for select using (public.is_admin());
