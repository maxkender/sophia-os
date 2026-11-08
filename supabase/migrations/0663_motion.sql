-- 0663 : Motion, une page à part (/admin/motion), hors podz (demande d'Adrien du 6/11).
--
-- Une vidéo explicative en papier découpé (Remotion), refaite dans plusieurs
-- langues avec une voix ElevenLabs, des bruitages et des sous-titres, puis
-- postée sur UN compte MOTION par langue. Le modèle : la vidéo « Why is
-- Switzerland never at war? » (videos/suisse-guerre).
--
-- Qui fait quoi :
--   * la page /admin/motion : sujets, capture d'accueil Sophia (anglais),
--     script à relire et valider, vidéos à valider ou rejeter langue par langue ;
--   * le moteur : une session Claude Code (hors podz) réveillée par une tâche
--     planifiée. Il prend les tâches de `motion_taches` par la fonction Edge
--     `motion` (en-tête `x-motion-jeton`), écrit le script, rend les vidéos et
--     les dépose dans `medias/motion/<video>/<langue>/` ;
--   * la fonction `motion` : tout changement passe par elle (la page ne fait
--     que lire). À la validation d'une langue, elle pose un post vidéo sur le
--     compte MOTION de la langue, comme un post UGCV (0662) : compté comme un
--     post normal (paie, relances, vues).
--
--   motion_videos   : un sujet = une vidéo source (script anglais, langues visées).
--   motion_langues  : la vidéo dans une langue (script traduit, fichiers, statut).
--   motion_taches   : la file du moteur (script | produire | corriger).
--   motion_reglages : une seule ligne, l'empreinte du jeton du moteur.
--
-- Le label MOTION est un label manuel (`labels.manuel`, 0661) : jamais tiré
-- (File, BLEO, minuit, repli), posé à la main sur un compte par l'admin. Un
-- compte qui le porte passe `comptes.ugcv` (trigger 0661) : il ne reçoit aucun
-- slideshow, seulement ses posts vidéo.
--
-- Cycle d'une vidéo : brouillon → script_demande (tâche « script ») →
-- script_pret (relu, éditable) → production (tâche « produire ») → a_valider
-- (toutes les langues rendues) → termine (toutes distribuées) ; archive à part.
-- Cycle d'une langue : en_attente → en_cours → a_valider → distribuee
-- (post posé) ; rejetee (tâche « corriger » avec le commentaire) ; echec.
--
-- Additive. ✅ Appliquée le 2026-11-06 (MCP) : 4 tables, label MOTION (manuel), file vide.
-- Retour arrière : drop table motion_taches, motion_langues, motion_videos,
-- motion_reglages ; drop function motion_prendre_tache, motion_journaliser ;
-- delete from labels where slug = 'motion' (après l'avoir retiré des comptes).

-- 1. Label MOTION ---------------------------------------------------------------

insert into public.labels (nom, slug, manuel, genre)
select 'MOTION', 'motion', true, null
 where not exists (select 1 from public.labels where slug = 'motion');

-- 2. Tables ---------------------------------------------------------------------

create table if not exists public.motion_videos (
  id uuid primary key default gen_random_uuid(),
  sujet text not null,
  consigne text,
  -- Dossier du projet Remotion sous videos/ (ex. « suisse-guerre »).
  projet text,
  statut text not null default 'brouillon'
    check (statut in ('brouillon', 'script_demande', 'script_pret', 'production', 'a_valider', 'termine', 'archive')),
  -- Le script source (anglais) : scènes, repères, voix, outro, légende.
  script jsonb,
  langues text[] not null default '{fr,en,de,it}',
  -- Capture d'accueil Sophia en anglais (la carte du cours de ce sujet),
  -- fournie par l'admin, traduite par le moteur pour les autres langues.
  capture_chemin text,
  capture_url text,
  -- [{ at, message }], les plus récents à la fin (200 au plus).
  journal jsonb not null default '[]'::jsonb,
  erreur text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists motion_videos_created_idx on public.motion_videos (created_at desc);

create table if not exists public.motion_langues (
  id uuid primary key default gen_random_uuid(),
  video_id uuid not null references public.motion_videos (id) on delete cascade,
  langue text not null,
  statut text not null default 'en_attente'
    check (statut in ('en_attente', 'en_cours', 'a_valider', 'validee', 'rejetee', 'distribuee', 'echec')),
  -- Le script traduit (mêmes champs que le script source).
  script jsonb,
  legende text,
  -- La vidéo avec sous-titres (celle qui est postée) et la version sans.
  video_chemin text,
  video_url text,
  video_brute_chemin text,
  video_brute_url text,
  duree_s numeric,
  -- Le commentaire du dernier rejet, que le moteur corrige.
  commentaire text,
  compte_id uuid references public.comptes (id) on delete set null,
  post_id uuid references public.posts (id) on delete set null,
  validee_at timestamptz,
  distribuee_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (video_id, langue)
);

create table if not exists public.motion_taches (
  id uuid primary key default gen_random_uuid(),
  video_id uuid not null references public.motion_videos (id) on delete cascade,
  -- Vide : toutes les langues de la vidéo.
  langue text,
  type text not null check (type in ('script', 'produire', 'corriger')),
  statut text not null default 'en_attente'
    check (statut in ('en_attente', 'en_cours', 'faite', 'echec')),
  -- La demande de l'admin (consigne du script, commentaire d'un rejet).
  consigne text,
  resultat jsonb,
  erreur text,
  verrou_jusqua timestamptz,
  tentatives integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists motion_taches_file_idx
  on public.motion_taches (statut, created_at)
  where statut in ('en_attente', 'en_cours');

create table if not exists public.motion_reglages (
  id boolean primary key default true check (id),
  -- SHA-256 hexadécimal du jeton du moteur (le jeton n'est jamais stocké).
  jeton_hash text,
  updated_at timestamptz not null default now()
);
insert into public.motion_reglages (id) values (true) on conflict (id) do nothing;

alter table public.motion_videos enable row level security;
alter table public.motion_langues enable row level security;
alter table public.motion_taches enable row level security;
alter table public.motion_reglages enable row level security;

drop policy if exists motion_videos_admin on public.motion_videos;
create policy motion_videos_admin on public.motion_videos
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists motion_langues_admin on public.motion_langues;
create policy motion_langues_admin on public.motion_langues
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists motion_taches_admin on public.motion_taches;
create policy motion_taches_admin on public.motion_taches
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
-- Le jeton ne se lit pas : aucune politique, seule la fonction `motion` (service_role) y touche.

-- Le front ne fait que lire : tout changement passe par la fonction `motion`.
grant select on public.motion_videos, public.motion_langues, public.motion_taches to authenticated;
grant all on public.motion_videos, public.motion_langues, public.motion_taches, public.motion_reglages to service_role;

-- 3. File du moteur -------------------------------------------------------------

-- Prend la plus ancienne tâche libre (ou dont le verrou a expiré) et la verrouille
-- 3 heures : un rendu en 4 langues prend une bonne demi-heure.
create or replace function public.motion_prendre_tache()
returns setof public.motion_taches
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with prise as (
    select t.id
      from public.motion_taches t
     where t.statut = 'en_attente'
        or (t.statut = 'en_cours' and coalesce(t.verrou_jusqua, now() - interval '1 second') < now())
     order by t.created_at
     limit 1
     for update skip locked
  )
  update public.motion_taches t
     set statut = 'en_cours',
         verrou_jusqua = now() + interval '3 hours',
         tentatives = t.tentatives + 1,
         updated_at = now()
    from prise
   where t.id = prise.id
  returning t.*;
end;
$$;

-- Ajoute une ligne au journal d'une vidéo (200 lignes au plus, les plus récentes).
create or replace function public.motion_journaliser(p_video uuid, p_message text)
returns void
language sql
security definer
set search_path = public
as $$
  update public.motion_videos v
     set journal = (
           select coalesce(jsonb_agg(e order by n), '[]'::jsonb)
             from (
               select e, n
                 from jsonb_array_elements(
                        v.journal || jsonb_build_array(jsonb_build_object('at', now(), 'message', left(coalesce(p_message, ''), 2000)))
                      ) with ordinality as x(e, n)
                order by n desc
                limit 200
             ) dernieres
         ),
         updated_at = now()
   where v.id = p_video;
$$;

revoke all on function public.motion_prendre_tache() from public, anon, authenticated;
revoke all on function public.motion_journaliser(uuid, text) from public, anon, authenticated;
grant execute on function public.motion_prendre_tache() to service_role;
grant execute on function public.motion_journaliser(uuid, text) to service_role;

comment on column public.motion_videos.capture_url is
  'Capture d''accueil Sophia en anglais, fournie par l''admin, traduite par le moteur. 0663.';
