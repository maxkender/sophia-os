-- 0317 : nettoyage stickers d'un label, côté serveur.
--
-- POURQUOI. Le nettoyage (page Slideshows) était piloté par le navigateur : un
-- appel par slideshow, puis le retrait et le remplacement des posts du jour.
-- Fermer la page arrêtait tout, et la fermer pendant le retrait laissait des
-- posts du jour non remplacés, introuvables au scan suivant. Le scan
-- d'alpha_male (951 slideshows) a duré 18 minutes, onglet ouvert.
--
-- CE QUI CHANGE. Le clic crée une tâche ici ; le cron `nettoyage-stickers-drain`
-- (toutes les minutes, seulement quand une tâche tourne) appelle la fonction
-- `nettoyer-stickers`, qui avance par paquets jusqu'au bout, page fermée :
--   scan → a_confirmer (la liste des slideshows à jeter attend l'admin, qui
--   peut en repêcher) → retrait (retrait + remplacement des posts du jour)
--   → termine. Après coup, un slideshow jeté se repêche encore un par un.
-- L'avancement et le journal sont lus par la page (admin, lecture seule) ;
-- toutes les écritures passent par la fonction (service_role).

-- Échoue vite plutôt que de bloquer les écritures en attendant un verrou.
set lock_timeout = '10s';

create table if not exists public.nettoyages_stickers (
  id uuid primary key default gen_random_uuid(),
  label_id uuid references public.labels (id) on delete set null,
  label_nom text not null,
  -- scan → a_confirmer → retrait → termine · annule : arrêté par l'admin.
  statut text not null default 'scan'
    check (statut in ('scan', 'a_confirmer', 'retrait', 'termine', 'annule')),
  -- Lecture du label : slideshows valides, et ceux écartés d'office.
  total integer not null default 0,
  pods integer not null default 0,
  proteges integer not null default 0,
  sans_images integer not null default 0,
  cree_par uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  maj_at timestamptz not null default now(),
  scan_fini_at timestamptz,
  retrait_lance_at timestamptz,
  fini_at timestamptz
);

comment on table public.nettoyages_stickers is
  'Nettoyage stickers d''un label (scan OCR des stickers pub, retrait, remplacement des posts du jour), mené par le serveur. Voir migration 0317.';

create index if not exists nettoyages_stickers_label_idx
  on public.nettoyages_stickers (label_id, created_at desc);

-- `contenu_id` sans clé étrangère : la poser verrouille `contenus`, la table la
-- plus écrite (le premier essai de cette migration a expiré là-dessus). Un
-- contenu supprimé laisse une ligne orpheline, sans effet.
create table if not exists public.nettoyages_stickers_slideshows (
  nettoyage_id uuid not null references public.nettoyages_stickers (id) on delete cascade,
  contenu_id uuid not null,
  titre text,
  tier text,
  contenu_cree_at timestamptz,
  -- [{position, url}], puis après analyse [{position, url, sticker, erreur?}].
  slides jsonb not null default '[]'::jsonb,
  -- Scan : a_analyser → analyse (réservé) → propre | pub | erreur.
  -- Avant le retrait, l'admin peut repêcher : pub ⇄ repeche.
  -- Retrait : pub → retrait (réservé) → retire | garde (le serveur l'a laissé :
  -- plus valide, pod, tier A ou mieux — voir `raison`).
  -- Après le retrait : retire → repeche (remis en valide).
  statut text not null default 'a_analyser'
    check (statut in ('a_analyser', 'analyse', 'propre', 'pub', 'erreur', 'repeche', 'retrait', 'retire', 'garde')),
  tentatives integer not null default 0,
  reserve_at timestamptz,
  erreur text,
  raison text,
  -- Colonnes du contenu écrasées au retrait, remises au repêchage.
  avant jsonb,
  maj_at timestamptz not null default now(),
  primary key (nettoyage_id, contenu_id)
);

create index if not exists nettoyages_stickers_slideshows_file_idx
  on public.nettoyages_stickers_slideshows (nettoyage_id, statut);

-- Posts du jour pas encore publiés qui utilisaient un slideshow jeté. Pas de
-- clé étrangère vers posts : le remplacement supprime l'ancien post.
create table if not exists public.nettoyages_stickers_posts (
  nettoyage_id uuid not null references public.nettoyages_stickers (id) on delete cascade,
  post_id uuid not null,
  contenu_id uuid,
  -- a_remplacer → remplacement (réservé) → remplace | sans_remplacant | ignore | erreur
  statut text not null default 'a_remplacer'
    check (statut in ('a_remplacer', 'remplacement', 'remplace', 'sans_remplacant', 'ignore', 'erreur')),
  nouveau_post_id uuid,
  detail text,
  tentatives integer not null default 0,
  reserve_at timestamptz,
  maj_at timestamptz not null default now(),
  primary key (nettoyage_id, post_id)
);

create table if not exists public.nettoyages_stickers_journal (
  id bigint generated always as identity primary key,
  nettoyage_id uuid not null references public.nettoyages_stickers (id) on delete cascade,
  at timestamptz not null default now(),
  ligne text not null
);

create index if not exists nettoyages_stickers_journal_idx
  on public.nettoyages_stickers_journal (nettoyage_id, id);

alter table public.nettoyages_stickers enable row level security;
alter table public.nettoyages_stickers_slideshows enable row level security;
alter table public.nettoyages_stickers_posts enable row level security;
alter table public.nettoyages_stickers_journal enable row level security;

drop policy if exists nettoyages_stickers_admin_lecture on public.nettoyages_stickers;
create policy nettoyages_stickers_admin_lecture on public.nettoyages_stickers
  for select using (public.is_admin());
drop policy if exists nettoyages_stickers_slideshows_admin_lecture on public.nettoyages_stickers_slideshows;
create policy nettoyages_stickers_slideshows_admin_lecture on public.nettoyages_stickers_slideshows
  for select using (public.is_admin());
drop policy if exists nettoyages_stickers_posts_admin_lecture on public.nettoyages_stickers_posts;
create policy nettoyages_stickers_posts_admin_lecture on public.nettoyages_stickers_posts
  for select using (public.is_admin());
drop policy if exists nettoyages_stickers_journal_admin_lecture on public.nettoyages_stickers_journal;
create policy nettoyages_stickers_journal_admin_lecture on public.nettoyages_stickers_journal
  for select using (public.is_admin());

grant select on public.nettoyages_stickers, public.nettoyages_stickers_slideshows,
  public.nettoyages_stickers_posts, public.nettoyages_stickers_journal to authenticated;
grant all on public.nettoyages_stickers, public.nettoyages_stickers_slideshows,
  public.nettoyages_stickers_posts, public.nettoyages_stickers_journal to service_role;

-- ---------------------------------------------------------------------------
-- Réservations du drain
-- ---------------------------------------------------------------------------
-- Deux passages du drain se chevauchent (le cron repasse chaque minute, un
-- passage dure jusqu'à ~2 min) : SKIP LOCKED empêche de traiter deux fois la
-- même ligne. Une ligne restée réservée au-delà de `p_perime` (passage mort en
-- route) est reprise.
create or replace function public.nettoyage_stickers_reserver(
  p_nettoyage uuid,
  p_de text,
  p_vers text,
  p_n integer,
  p_perime interval default interval '4 minutes'
)
returns setof public.nettoyages_stickers_slideshows
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(auth.role(), '') in ('anon', 'authenticated') then
    raise exception 'nettoyage_stickers_reserver : réservé aux fonctions serveur';
  end if;

  return query
  update public.nettoyages_stickers_slideshows s
     set statut = p_vers,
         reserve_at = now(),
         tentatives = s.tentatives + 1,
         maj_at = now()
   where (s.nettoyage_id, s.contenu_id) in (
     select x.nettoyage_id, x.contenu_id
       from public.nettoyages_stickers_slideshows x
      where x.nettoyage_id = p_nettoyage
        and (x.statut = p_de or (x.statut = p_vers and x.reserve_at < now() - p_perime))
      order by x.contenu_cree_at desc nulls last, x.contenu_id
      limit p_n
      for update skip locked
   )
  returning s.*;
end;
$$;

create or replace function public.nettoyage_stickers_reserver_posts(
  p_nettoyage uuid,
  p_n integer,
  p_perime interval default interval '5 minutes'
)
returns setof public.nettoyages_stickers_posts
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(auth.role(), '') in ('anon', 'authenticated') then
    raise exception 'nettoyage_stickers_reserver_posts : réservé aux fonctions serveur';
  end if;

  return query
  update public.nettoyages_stickers_posts p
     set statut = 'remplacement',
         reserve_at = now(),
         tentatives = p.tentatives + 1,
         maj_at = now()
   where (p.nettoyage_id, p.post_id) in (
     select x.nettoyage_id, x.post_id
       from public.nettoyages_stickers_posts x
      where x.nettoyage_id = p_nettoyage
        and (x.statut = 'a_remplacer' or (x.statut = 'remplacement' and x.reserve_at < now() - p_perime))
      order by x.post_id
      limit p_n
      for update skip locked
   )
  returning p.*;
end;
$$;

grant execute on function public.nettoyage_stickers_reserver(uuid, text, text, integer, interval) to service_role;
grant execute on function public.nettoyage_stickers_reserver_posts(uuid, integer, interval) to service_role;

-- ---------------------------------------------------------------------------
-- Compteurs pour la page (admin) : slideshows et posts par statut
-- ---------------------------------------------------------------------------
-- PostgREST plafonne une réponse à 1 000 lignes : la page ne relit pas toutes
-- les lignes d'un label de 1 100 slideshows toutes les 3 secondes.
create or replace function public.nettoyage_stickers_compteurs(p_nettoyage uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select case when public.is_admin() or coalesce(auth.role(), '') = 'service_role' then
    jsonb_build_object(
      'slideshows', coalesce((
        select jsonb_object_agg(statut, n)
          from (select statut, count(*) n from public.nettoyages_stickers_slideshows
                 where nettoyage_id = p_nettoyage group by statut) s
      ), '{}'::jsonb),
      'posts', coalesce((
        select jsonb_object_agg(statut, n)
          from (select statut, count(*) n from public.nettoyages_stickers_posts
                 where nettoyage_id = p_nettoyage group by statut) p
      ), '{}'::jsonb)
    )
  end;
$$;

grant execute on function public.nettoyage_stickers_compteurs(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Cron : un passage du drain chaque minute, seulement quand une tâche tourne
-- ---------------------------------------------------------------------------
-- Le secret de cron n'a pas à vivre dans le dépôt : on recopie la commande
-- d'un job existant en changeant la fonction appelée, et on ne l'envoie que
-- s'il y a du travail (pas d'appel à vide toutes les minutes).
do $$
declare
  cmd text;
begin
  select command into cmd from cron.job where jobname = 'resolution-publication-drain';
  if cmd is null then
    raise exception 'job modèle resolution-publication-drain introuvable — cron non posé';
  end if;
  cmd := replace(cmd, '/functions/v1/resolution-publication', '/functions/v1/nettoyer-stickers');
  cmd := regexp_replace(cmd, ';\s*$', '')
    || ' where exists (select 1 from public.nettoyages_stickers where statut in (''scan'', ''retrait''))';

  if exists (select 1 from cron.job where jobname = 'nettoyage-stickers-drain') then
    perform cron.unschedule('nettoyage-stickers-drain');
  end if;
  perform cron.schedule('nettoyage-stickers-drain', '* * * * *', cmd);
end;
$$;
