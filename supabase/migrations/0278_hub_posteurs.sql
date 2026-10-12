-- 0278 : guichet du site (Sophia Culture Hub) → OS, pour les posters slideshow.
--
-- Le site recrute (formulaire public, acceptation à la main, contrat signé en
-- ligne) puis appelle la fonction `hub-posteurs` pour créer le poster ici
-- (voir docs/hub-posteurs.md). Cette migration lui donne :
--
--   - `hub_posteurs` : une ligne par candidature du site (`hub_id` = id de la
--     candidature côté site). Elle rend la création idempotente — le site
--     réessaie jusqu'à 3 fois, et le bouton « Retry » de sa fiche aussi : un
--     rejeu retrouve le poster au lieu d'en créer un second. Elle garde aussi
--     l'email PERSO du poster (son login OS est @sophia.com), dont le bot
--     Slack aura besoin pour le reconnaître quand il rejoint le workspace ;
--   - `hub_posts_semaine` : prévus / publiés / manqués d'une semaine par
--     poster, que le site lit chaque matin pour sa paie hebdomadaire ;
--   - `hub_stats_langues` : posters actifs par langue de publication.
--
-- Additive : une table neuve et deux fonctions, rien d'existant ne change.
-- Les deux fonctions ne sont exécutables que par le service (la fonction Edge).
-- Retour arrière : `drop function public.hub_posts_semaine(uuid[], date);
-- drop function public.hub_stats_langues(); drop table public.hub_posteurs;`

create table if not exists public.hub_posteurs (
  hub_id text primary key,
  -- `en_cours` : création réservée, appel à manage-users en route ;
  -- `cree` : poster créé, `profile_id` posé.
  statut text not null default 'en_cours',
  profile_id uuid references public.profiles(id) on delete cascade,
  compte_id uuid references public.comptes(id) on delete set null,
  manager_id uuid references public.profiles(id) on delete set null,
  email_os text,
  email_perso text,
  pays_code text,
  langue text,
  applications text[] not null default '{}',
  reserve_at timestamptz not null default now(),
  cree_at timestamptz,
  created_at timestamptz not null default now(),
  constraint hub_posteurs_hub_id_format check (hub_id ~ '^[0-9a-f-]{36}$'),
  constraint hub_posteurs_statut check (statut in ('en_cours', 'cree')),
  constraint hub_posteurs_cree_a_un_profil check (statut <> 'cree' or profile_id is not null)
);

create unique index if not exists hub_posteurs_profile_id_key
  on public.hub_posteurs (profile_id) where profile_id is not null;

comment on table public.hub_posteurs is
  'Posters créés depuis le site (Sophia Culture Hub) : une ligne par candidature, '
  'rend la création idempotente. Écrite par la fonction hub-posteurs uniquement.';

alter table public.hub_posteurs enable row level security;

drop policy if exists hub_posteurs_lecture_admin on public.hub_posteurs;
create policy hub_posteurs_lecture_admin on public.hub_posteurs
  for select using (public.is_admin());

-- Semaine d'un poster, comme `stats_recrutement_10j` (0225) mais bornée à une
-- semaine et sans les rappels (hors quota, `est_rappel`) :
--   prevus  = passages planifiés de la semaine (hors brouillon) ;
--   publies = ceux qui sont publiés ;
--   manques = planifiés AVANT aujourd'hui (Paris) et toujours pas publiés —
--             le jour même ne compte pas encore ;
--   is_active = profil actif et au moins un compte perso actif sorti du warmup.
create or replace function public.hub_posts_semaine(p_profile_ids uuid[], p_lundi date)
returns table (
  profile_id uuid,
  prevus integer,
  publies integer,
  manques integer,
  dernier_post_at timestamptz,
  is_active boolean
)
language sql
stable
security invoker
set search_path = public
as $$
  with ids as (
    select distinct unnest(p_profile_ids) as profile_id
  ),
  cpt as (
    select c.id, c.poster_id, c.is_active, c.warmup_ends_at
    from public.comptes c
    join ids on ids.profile_id = c.poster_id
    where c.type_compte = 'perso'
  ),
  sem as (
    select
      cpt.poster_id,
      count(*) as prevus,
      count(*) filter (where p.publie_at is not null) as publies,
      count(*) filter (
        where p.publie_at is null
          and p.date_publication_prevue < (timezone('Europe/Paris', now()))::date
      ) as manques
    from cpt
    join public.passages p on p.compte_id = cpt.id
    where p.date_publication_prevue between p_lundi and p_lundi + 6
      and p.statut::text <> 'brouillon'
      and not coalesce(p.est_rappel, false)
    group by cpt.poster_id
  ),
  der as (
    select cpt.poster_id, max(p.publie_at) as dernier
    from cpt
    join public.passages p on p.compte_id = cpt.id
    where p.publie_at is not null
    group by cpt.poster_id
  ),
  act as (
    select
      cpt.poster_id,
      bool_or(cpt.is_active and cpt.warmup_ends_at is not null and cpt.warmup_ends_at <= now()) as actif
    from cpt
    group by cpt.poster_id
  )
  select
    ids.profile_id,
    coalesce(sem.prevus, 0)::int,
    coalesce(sem.publies, 0)::int,
    coalesce(sem.manques, 0)::int,
    der.dernier,
    coalesce(pr.is_active, false) and coalesce(act.actif, false)
  from ids
  left join public.profiles pr on pr.id = ids.profile_id
  left join sem on sem.poster_id = ids.profile_id
  left join der on der.poster_id = ids.profile_id
  left join act on act.poster_id = ids.profile_id;
$$;

create or replace function public.hub_stats_langues()
returns table (langue text, actifs integer)
language sql
stable
security invoker
set search_path = public
as $$
  select c.langue, count(distinct c.poster_id)::int
  from public.comptes c
  join public.profiles p on p.id = c.poster_id
  where c.type_compte = 'perso'
    and c.is_active
    and p.is_active
  group by c.langue
  order by 2 desc, 1;
$$;

revoke all on function public.hub_posts_semaine(uuid[], date) from public, anon, authenticated;
revoke all on function public.hub_stats_langues() from public, anon, authenticated;
grant execute on function public.hub_posts_semaine(uuid[], date) to service_role;
grant execute on function public.hub_stats_langues() to service_role;
