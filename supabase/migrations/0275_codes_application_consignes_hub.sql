-- 0275 : codes promo par application, consignes posteur, posteurs venus du site.
--
-- TROIS CHOSES, UNE MIGRATION (elles arrivent ensemble avec la fonction Edge
-- `hub-posteurs`, voir docs/hub-posteurs.md) :
--
--   1. `codes_application` : les codes de rachat App Store d'une application
--      (usage unique, un par posteur). Un posteur qui promeut Unswipe doit
--      avoir l'appli pour la montrer : il tire SON code depuis sa page
--      (`mon_code_application`), un admin ou son recruteur peut le lui
--      attribuer (`attribuer_code_application`). Le tirage est atomique
--      (FOR UPDATE SKIP LOCKED) : deux posteurs qui cliquent en même temps ne
--      reçoivent jamais le même code. Un code n'est tiré QUE si le posteur sert
--      vraiment l'application (`poster_sert_application`, règle de
--      docs/multi-applications.md : répartition explicite, sinon labels).
--
--   2. Consignes de tournage : `contenus.deuxieme_telephone` (le post se filme
--      avec un second téléphone) et `contenus.exemple_url` (un TikTok à
--      regarder avant de poster). `profiles.deux_telephones` dit si le posteur
--      en a deux : l'assignation de minuit ne donne jamais un contenu « 2
--      téléphones » à un posteur qui n'en a qu'un (assignation_contenu.ts).
--      Les posteurs ne lisent pas `contenus` (admin-only, et c'est voulu) :
--      ils passent par `consignes_de_mes_posts`, qui ne rend que ces deux
--      champs, et seulement pour leurs propres posts.
--
--   3. Posteurs venus du site (sophia-culture.com, hors Upwork) :
--      `profiles.source`, `email_perso`, `pays`, `hub_id` (id de la candidature
--      côté Hub, unique : la création est idempotente).
--
-- Additive : aucune colonne existante ne change, aucune policy existante
-- n'est touchée. À appliquer via MCP — pas encore appliquée.
-- Retour arrière : `drop function` des 5 fonctions, `drop table
-- codes_application`, puis `alter table … drop column` des 7 colonnes.

-- ---------------------------------------------------------------------------
-- 1. Codes par application
-- ---------------------------------------------------------------------------

create table if not exists public.codes_application (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.applications (id) on delete cascade,
  code text not null unique,
  redeem_url text not null,
  statut text not null default 'disponible'
    check (statut in ('disponible', 'attribue', 'caduc')),
  profile_id uuid references public.profiles (id) on delete set null,
  attribue_le timestamptz,
  lot text,
  created_at timestamptz not null default now()
);

comment on table public.codes_application is
  'Codes de rachat App Store d''une application, usage unique, un par posteur (0275).';
comment on column public.codes_application.lot is
  'Étiquette du fichier importé (ex. « UnSwipe iOS – 2026-10-11 »), pour retrouver une fournée.';

create index if not exists codes_application_dispo_idx
  on public.codes_application (application_id, statut);
create index if not exists codes_application_profile_idx
  on public.codes_application (profile_id);

alter table public.codes_application enable row level security;

create policy codes_application_admin on public.codes_application
  for all using (public.is_admin()) with check (public.is_admin());

-- Un posteur voit son propre code ; un recruteur ceux de ses créateurs.
create policy codes_application_poster_select on public.codes_application
  for select using (
    profile_id = auth.uid()
    or (
      public.is_hiring_manager()
      and exists (
        select 1 from public.profiles pr
        where pr.id = codes_application.profile_id and pr.manager_id = auth.uid()
      )
    )
  );

-- ---------------------------------------------------------------------------
-- 2. Consignes posteur + posteurs du site
-- ---------------------------------------------------------------------------

alter table public.contenus
  add column if not exists deuxieme_telephone boolean not null default false,
  add column if not exists exemple_url text;

alter table public.contenus drop constraint if exists contenus_exemple_url_format;
alter table public.contenus add constraint contenus_exemple_url_format check (
  exemple_url is null
  or (exemple_url ~* '^https?://' and length(exemple_url) <= 500)
);

comment on column public.contenus.deuxieme_telephone is
  'Le post se filme avec un deuxième téléphone : jamais assigné à un posteur qui n''en a qu''un.';
comment on column public.contenus.exemple_url is
  'Un TikTok d''exemple que le posteur regarde avant de poster (bouton « Voir un exemple »).';

alter table public.pod_videos
  add column if not exists deuxieme_telephone boolean not null default false;
comment on column public.pod_videos.deuxieme_telephone is
  'La vidéo se filme avec un deuxième téléphone (badge côté posteur).';

alter table public.profiles
  add column if not exists deux_telephones boolean not null default false,
  add column if not exists source text,
  add column if not exists email_perso text,
  add column if not exists pays text,
  add column if not exists hub_id uuid;

alter table public.profiles drop constraint if exists profiles_source_valeurs;
alter table public.profiles add constraint profiles_source_valeurs check (
  source is null or source in ('upwork', 'site', 'micabo')
);
alter table public.profiles drop constraint if exists profiles_pays_format;
alter table public.profiles add constraint profiles_pays_format check (
  pays is null or pays ~ '^[A-Z]{2}$'
);
create unique index if not exists profiles_hub_id_idx on public.profiles (hub_id) where hub_id is not null;

comment on column public.profiles.deux_telephones is
  'Le posteur dispose de deux téléphones : peut recevoir les contenus « deuxieme_telephone ».';
comment on column public.profiles.source is
  'D''où vient le posteur : upwork (process HM), site (candidature sophia-culture.com, payé par le Hub), micabo.';
comment on column public.profiles.email_perso is
  'Email personnel (le login OS reste prenom+initiale@sophia.com). Posteurs du site.';
comment on column public.profiles.pays is
  'Pays de résidence, ISO 3166-1 alpha-2 (posteurs du site ; `nationalite` porte la LANGUE).';
comment on column public.profiles.hub_id is
  'Id de la candidature côté Hub (slideshow_applications.id). Unique : `creer_posteur` est idempotent.';

-- ---------------------------------------------------------------------------
-- 3. Fonctions
-- ---------------------------------------------------------------------------

-- Le posteur sert-il cette application ? Règle de docs/multi-applications.md :
-- une répartition explicite (`comptes.parts_applications`) n'autorise QUE ses
-- applications à part > 0 ; sans répartition, ce sont les labels du compte
-- (`label_applications`), et un label sans ligne sert Sophia.
create or replace function public.poster_sert_application(poster uuid, slug text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.comptes c
    join public.applications a on a.slug = poster_sert_application.slug and a.actif
    where c.poster_id = poster_sert_application.poster
      and c.is_active
      and (
        (c.parts_applications is not null
          and coalesce((c.parts_applications ->> a.slug)::numeric, 0) > 0)
        or (c.parts_applications is null and (
          exists (
            select 1
            from public.compte_labels cl
            join public.label_applications la on la.label_id = cl.label_id
            where cl.compte_id = c.id and la.application_id = a.id
          )
          or (a.slug = 'sophia' and not exists (
            select 1
            from public.compte_labels cl
            join public.label_applications la on la.label_id = cl.label_id
            where cl.compte_id = c.id
          ))
        ))
      )
  );
$$;

-- Tirage atomique d'un code pour `cible` sur l'application `slug`. Rend le
-- code déjà attribué s'il existe. Interne : les deux fonctions publiques
-- ci-dessous vérifient les droits avant de l'appeler.
create or replace function public.tirer_code_application(cible uuid, slug text)
returns table (code text, redeem_url text, attribue_le timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  app_id uuid;
  existant public.codes_application%rowtype;
  choisi public.codes_application%rowtype;
begin
  select id into app_id from public.applications a where a.slug = tirer_code_application.slug and a.actif;
  if app_id is null then
    raise exception 'Application inconnue ou inactive : %', slug;
  end if;

  select * into existant
  from public.codes_application ca
  where ca.application_id = app_id and ca.profile_id = cible and ca.statut = 'attribue'
  limit 1;
  if found then
    return query select existant.code, existant.redeem_url, existant.attribue_le;
    return;
  end if;

  if not public.poster_sert_application(cible, slug) then
    raise exception 'Ce posteur ne promeut pas % : aucun code à lui donner.', slug;
  end if;

  select * into choisi
  from public.codes_application ca
  where ca.application_id = app_id and ca.statut = 'disponible'
  order by ca.created_at
  limit 1
  for update skip locked;
  if not found then
    raise exception 'Plus aucun code % disponible : importe une nouvelle fournée dans Réglages.', slug;
  end if;

  update public.codes_application
     set statut = 'attribue', profile_id = cible, attribue_le = now()
   where id = choisi.id;

  return query select choisi.code, choisi.redeem_url, now()::timestamptz;
end;
$$;

revoke all on function public.tirer_code_application(uuid, text) from public;

-- Le posteur tire son propre code.
create or replace function public.mon_code_application(slug text)
returns table (code text, redeem_url text, attribue_le timestamptz)
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Connexion requise.';
  end if;
  return query select * from public.tirer_code_application(auth.uid(), slug);
end;
$$;

grant execute on function public.mon_code_application(text) to authenticated;

-- Un admin, ou le recruteur du posteur, lui attribue un code.
create or replace function public.attribuer_code_application(cible uuid, slug text)
returns table (code text, redeem_url text, attribue_le timestamptz)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not (
    public.is_admin()
    or (
      public.is_hiring_manager()
      and exists (select 1 from public.profiles pr where pr.id = cible and pr.manager_id = auth.uid())
    )
  ) then
    raise exception 'Réservé à l''admin ou au recruteur de ce posteur.';
  end if;
  return query select * from public.tirer_code_application(cible, slug);
end;
$$;

grant execute on function public.attribuer_code_application(uuid, text) to authenticated;

-- Consignes des posts d'un posteur (2e téléphone, lien d'exemple), sans lui
-- ouvrir `contenus`. Ne rend que SES posts : un id d'un autre compte est
-- simplement absent du résultat.
create or replace function public.consignes_de_mes_posts(post_ids uuid[])
returns table (post_id uuid, deuxieme_telephone boolean, exemple_url text)
language sql
stable
security definer
set search_path = public
as $$
  select p.post_id, c.deuxieme_telephone, c.exemple_url
  from public.passages p
  join public.contenus c on c.id = p.contenu_id
  join public.comptes k on k.id = p.compte_id
  where p.post_id = any (post_ids)
    and (k.poster_id = auth.uid() or public.is_admin());
$$;

grant execute on function public.consignes_de_mes_posts(uuid[]) to authenticated;

-- Les applications que le posteur connecté sert (slugs), pour n'afficher la
-- carte « Ton code » que si elle le concerne. Même règle que le tirage.
create or replace function public.mes_applications()
returns setof text
language sql
stable
security definer
set search_path = public
as $$
  select a.slug
  from public.applications a
  where a.actif and public.poster_sert_application(auth.uid(), a.slug)
  order by a.slug;
$$;

grant execute on function public.mes_applications() to authenticated;
