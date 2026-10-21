-- 0290 : relecture automatique des posts publiés (« agent de relecture »).
--
-- POURQUOI. La file /admin/file-reviews se faisait à la main : 227 posts relus
-- du 11 au 18/09, plus rien depuis, pour 300 posts publiés par jour. Les
-- défauts relevés étaient presque tous de mise en forme du texte retapé par le
-- créateur (style, forme du paragraphe, titre / corps), et ils coûtent des vues.
-- Étude : Notion, Analyses → « Agent de relecture des posts ».
--
-- CE QUE FAIT LA RELECTURE (fonction `relecture-auto`) :
--   1. chaque nuit à 01:00 UTC (3 h à Paris l'été, 2 h l'hiver), les posts
--      slideshow publiés la veille entrent en file (`relecture_enfiler`) ;
--   2. un drain toutes les 2 minutes jusqu'à 05:58 UTC : Apify rapatrie les
--      slides publiées, Gemini mesure le texte de l'original et du publié sur
--      3 slides, des règles chiffrées jugent, un brouillon de review est écrit.
-- RIEN n'est envoyé au créateur : les résultats restent ici, à relire par
-- l'admin, jusqu'à ce que le mode copilote soit branché sur la file.

create table if not exists public.relectures_auto (
  id uuid primary key default gen_random_uuid(),
  passage_id uuid not null unique references public.passages (id) on delete cascade,
  post_id uuid references public.posts (id) on delete set null,
  compte_id uuid references public.comptes (id) on delete set null,
  poster_id uuid references auth.users (id) on delete set null,
  -- Jour de publication, heure de Paris.
  jour date not null,
  publie_url text not null,
  -- cron : file de la nuit · test : lot tiré à la main.
  origine text not null default 'cron' check (origine in ('cron', 'test')),
  -- a_scraper → scrape (run Apify en cours) → a_analyser → analyse → fait
  -- ignore : rien de comparable (publié en vidéo, original sans image brute…)
  -- echec : après 3 tentatives, ou post introuvable sur TikTok.
  statut text not null default 'a_scraper'
    check (statut in ('a_scraper', 'scrape', 'a_analyser', 'analyse', 'fait', 'ignore', 'echec')),
  tentatives integer not null default 0,
  reserve_at timestamptz,
  apify_run_id text,
  -- Ce que TikTok montre : images (liens Apify, dans l'ordre), son, légende.
  slides_publiees jsonb not null default '[]'::jsonb,
  musique_publiee_id text,
  legende text,
  -- Mesures et constats par slide comparée : [{position, original, publie, constats}].
  comparaisons jsonb not null default '[]'::jsonb,
  -- Défauts retenus pour le post : [{code, slides, confiance, detail, valeurs}].
  defauts jsonb not null default '[]'::jsonb,
  -- Brouillon de review (anglais) et remarques-types utilisées, au format de
  -- `reviews.remarques` pour que le compteur « 3× » par créateur suive.
  brouillon text,
  remarques jsonb not null default '[]'::jsonb,
  erreur text,
  created_at timestamptz not null default now(),
  analyse_at timestamptz,
  maj_at timestamptz not null default now()
);

comment on table public.relectures_auto is
  'Relecture automatique d''un post publié (mise en forme du texte comparée à l''original). Voir migration 0290 et docs/relecture-auto.md.';

create index if not exists relectures_auto_file_idx
  on public.relectures_auto (statut, created_at)
  where statut in ('a_scraper', 'scrape', 'a_analyser', 'analyse');

create index if not exists relectures_auto_poster_idx
  on public.relectures_auto (poster_id, jour desc);

alter table public.relectures_auto enable row level security;

drop policy if exists relectures_auto_admin_lecture on public.relectures_auto;
create policy relectures_auto_admin_lecture on public.relectures_auto
  for select using (public.is_admin());

grant select on public.relectures_auto to authenticated;
grant all on public.relectures_auto to service_role;

-- ---------------------------------------------------------------------------
-- Entrée en file : les slideshows publiés un jour donné (heure de Paris)
-- ---------------------------------------------------------------------------
-- Mêmes posts que la file de reviews : comptes slideshow (ni CM, ni UGC vidéo),
-- hors posts de test, avec un lien qui porte l'ID du post (résolu).
-- `p_limite` + `p_aleatoire` servent aux lots de test.
create or replace function public.relecture_enfiler(
  p_jour date,
  p_limite integer default null,
  p_aleatoire boolean default false,
  p_origine text default 'cron'
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer;
begin
  -- Réservé au cron (pas de JWT) et aux fonctions serveur (service_role) :
  -- la file déclenche des scrapes et des appels Gemini payants.
  if coalesce(auth.role(), '') in ('anon', 'authenticated') then
    raise exception 'relecture_enfiler : réservé au cron et aux fonctions serveur';
  end if;

  insert into public.relectures_auto (passage_id, post_id, compte_id, poster_id, jour, publie_url, origine)
  select p.id, p.post_id, p.compte_id, c.poster_id, p_jour, p.publie_url, p_origine
  from public.passages p
  join public.comptes c on c.id = p.compte_id
  left join public.posts po on po.id = p.post_id
  where p.statut = 'publie'
    and p.publie_at >= (p_jour::timestamp at time zone 'Europe/Paris')
    and p.publie_at < ((p_jour + 1)::timestamp at time zone 'Europe/Paris')
    and p.publie_url ~ '/(photo|video)/[0-9]+'
    and coalesce(c.type_compte, 'perso') <> 'cm'
    and not coalesce(c.ugc_ai_video, false)
    and not coalesce(po.est_test, false)
    and not exists (select 1 from public.relectures_auto r where r.passage_id = p.id)
  order by case when p_aleatoire then random() end, p.publie_at
  limit p_limite
  on conflict (passage_id) do nothing;
  get diagnostics n = row_count;
  return n;
end;
$$;

comment on function public.relecture_enfiler(date, integer, boolean, text) is
  'Met en file de relecture les slideshows publiés le jour p_jour (Paris). Cron de 01:00 UTC : la veille.';

-- ---------------------------------------------------------------------------
-- Réservation d'un lot par le drain
-- ---------------------------------------------------------------------------
-- Deux appels du drain peuvent se chevaucher (un passage dure jusqu'à 4 min,
-- le cron repasse toutes les 2) : SKIP LOCKED empêche de traiter deux fois la
-- même ligne. Une ligne restée en cours plus de 15 minutes (appel mort en
-- route) est reprise si `p_reprendre`.
create or replace function public.relecture_reserver(
  p_de text,
  p_vers text,
  p_n integer,
  p_reprendre boolean default true
)
returns setof public.relectures_auto
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(auth.role(), '') in ('anon', 'authenticated') then
    raise exception 'relecture_reserver : réservé aux fonctions serveur';
  end if;

  return query
  update public.relectures_auto r
     set statut = p_vers,
         reserve_at = now(),
         tentatives = r.tentatives + 1,
         maj_at = now()
   where r.id in (
     select x.id
       from public.relectures_auto x
      where x.statut = p_de
         or (p_reprendre and x.statut = p_vers and x.reserve_at < now() - interval '15 minutes')
      order by x.created_at
      limit p_n
      for update skip locked
   )
  returning r.*;
end;
$$;

-- Le garde-fou en tête de chaque fonction refuse anon et authenticated : pas
-- besoin de toucher aux droits par défaut sur les fonctions.
grant execute on function public.relecture_enfiler(date, integer, boolean, text) to service_role;
grant execute on function public.relecture_reserver(text, text, integer, boolean) to service_role;

-- ---------------------------------------------------------------------------
-- Crons : file à 01:00 UTC, drain toutes les 2 minutes de 01:00 à 05:58 UTC
-- ---------------------------------------------------------------------------
-- pg_cron tourne en UTC : 3 h à Paris l'été, 2 h l'hiver. Le secret de cron
-- n'a pas à vivre dans le dépôt : on recopie la commande d'un job existant en
-- changeant la fonction appelée.
do $$
declare
  cmd text;
begin
  select command into cmd from cron.job where jobname = 'resolution-publication-drain';
  if cmd is null then
    raise exception 'job modèle resolution-publication-drain introuvable — cron non posé';
  end if;
  cmd := replace(cmd, '/functions/v1/resolution-publication', '/functions/v1/relecture-auto');

  if exists (select 1 from cron.job where jobname = 'relecture-enfiler') then
    perform cron.unschedule('relecture-enfiler');
  end if;
  perform cron.schedule(
    'relecture-enfiler',
    '0 1 * * *',
    $cmd$select public.relecture_enfiler(((now() at time zone 'Europe/Paris')::date - 1))$cmd$
  );

  if exists (select 1 from cron.job where jobname = 'relecture-drain') then
    perform cron.unschedule('relecture-drain');
  end if;
  perform cron.schedule('relecture-drain', '*/2 1-5 * * *', cmd);
end;
$$;
