-- ---------------------------------------------------------------------------
-- Classement des comptes — remplace l'ELO de compte (`comptes.score`).
--
-- Cinq cases : inactif < mauvaises_vues < passable < bien < star.
-- Requalification chaque nuit, à la fin du drain de relevé des vues
-- (`rattrapage-elo`), sur les 10 derniers posts du compte.
--
-- L'ELO de compte disparaît : plus de `comptes.score`, plus d'EWMA de forme,
-- plus de pénalité par jour sans post. L'ELO par langue (`contenu_langues.score`)
-- reste tel quel — il ne servait déjà plus qu'à l'historique et au cold-start
-- d'import depuis la tierlist (0237).
-- ---------------------------------------------------------------------------

do $$ begin
  create type public.compte_classement as enum (
    'inactif', 'mauvaises_vues', 'passable', 'bien', 'star'
  );
exception when duplicate_object then null;
end $$;

-- ---------------------------------------------------------------------------
-- 1) État du classement + file de surveillance, sur le compte
-- ---------------------------------------------------------------------------
alter table public.comptes
  add column if not exists classement public.compte_classement not null default 'passable',
  -- Dernière valeur CALCULÉE : reste visible quand un admin pose un verrou manuel.
  add column if not exists classement_calcule public.compte_classement,
  -- Verrou manuel : la requalification de la nuit ne réécrit pas `classement`.
  add column if not exists classement_verrou boolean not null default false,
  add column if not exists classement_maj_at timestamptz,
  -- { prevus, postes, moyenne_vues, mesures, regle } — ce qui a produit la case.
  add column if not exists classement_rapport jsonb not null default '{}'::jsonb,
  -- Skip admin : la ligne sort de la file de surveillance jusqu'à cette date.
  add column if not exists surveillance_skip_jusqu timestamptz,
  -- Liste « ne pas renouveler » + checklist de la demande au HM.
  add column if not exists non_renouveler boolean not null default false,
  add column if not exists non_renouveler_at timestamptz,
  -- SANS clé étrangère vers `profiles`, volontairement : `comptes.poster_id`
  -- y pointe déjà, et un second chemin rend les embeds PostgREST
  -- `comptes → profiles(...)` ambigus — 300 Multiple Choices sur toutes les
  -- requêtes du produit qui les utilisent (voir 0240).
  add column if not exists non_renouveler_par uuid,
  add column if not exists non_renouveler_hm_demande boolean not null default false,
  add column if not exists non_renouveler_hm_demande_at timestamptz;

comment on column public.comptes.classement is
  'Case du compte : inactif < mauvaises_vues < passable < bien < star. Requalifié après le relevé des vues de la nuit.';
comment on column public.comptes.classement_verrou is
  'true = case posée à la main par un admin ; la requalification auto ne l''écrase pas (classement_calcule garde la valeur calculée).';
comment on column public.comptes.surveillance_skip_jusqu is
  'Skip admin dans la file de surveillance — la ligne revient après cette date si le compte est toujours flagué.';
comment on column public.comptes.non_renouveler is
  'Compte proposé au non-renouvellement. Aucun effet technique : les assignations continuent jusqu''à désactivation manuelle.';

create index if not exists comptes_classement_idx
  on public.comptes (classement)
  where is_active;

-- ---------------------------------------------------------------------------
-- 2) Historique des changements de case
-- ---------------------------------------------------------------------------
create table if not exists public.compte_classement_historique (
  id uuid primary key default gen_random_uuid(),
  compte_id uuid not null references public.comptes (id) on delete cascade,
  avant public.compte_classement,
  apres public.compte_classement not null,
  -- 'auto' = requalification de la nuit ; 'manuel' = admin ; 'deverrouillage' = retour à l'auto.
  source text not null default 'auto'
    check (source in ('auto', 'manuel', 'deverrouillage')),
  regle text,
  rapport jsonb not null default '{}'::jsonb,
  par uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists compte_classement_historique_compte_idx
  on public.compte_classement_historique (compte_id, created_at desc);

alter table public.compte_classement_historique enable row level security;

create policy classement_histo_select on public.compte_classement_historique
  for select using (
    public.is_admin()
    or exists (
      select 1 from public.comptes c
      where c.id = compte_id and c.poster_id = auth.uid()
    )
  );
create policy classement_histo_admin on public.compte_classement_historique
  for all using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- 3) Nudges — message interne à un créateur, choisi parmi les modèles
-- ---------------------------------------------------------------------------
create table if not exists public.compte_nudges (
  id uuid primary key default gen_random_uuid(),
  compte_id uuid not null references public.comptes (id) on delete cascade,
  -- Identifiant du modèle dans `reglages.nudges` (trace de ce qui a été choisi).
  modele_id text,
  titre text not null,
  corps text not null,
  -- Case du compte au moment de l'envoi — pour relire l'historique.
  classement public.compte_classement,
  envoye_par uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  lu_at timestamptz
);

create index if not exists compte_nudges_compte_idx
  on public.compte_nudges (compte_id, created_at desc);
create index if not exists compte_nudges_non_lus_idx
  on public.compte_nudges (compte_id) where lu_at is null;

alter table public.compte_nudges enable row level security;

-- Le créateur lit les nudges de ses comptes (c'est sa boîte de réception).
create policy nudges_select on public.compte_nudges
  for select using (
    public.is_admin()
    or exists (
      select 1 from public.comptes c
      where c.id = compte_id and c.poster_id = auth.uid()
    )
  );
-- ... et peut seulement les marquer lus.
create policy nudges_lu on public.compte_nudges
  for update using (
    exists (
      select 1 from public.comptes c
      where c.id = compte_id and c.poster_id = auth.uid()
    )
  ) with check (
    exists (
      select 1 from public.comptes c
      where c.id = compte_id and c.poster_id = auth.uid()
    )
  );
create policy nudges_admin on public.compte_nudges
  for all using (public.is_admin()) with check (public.is_admin());

-- Une policy RLS ne sait pas restreindre une COLONNE : le grant par colonne
-- garantit qu'un créateur ne peut écrire que l'accusé de lecture, et pas
-- réécrire le message reçu. Les admins déposent les nudges par insert.
revoke update on public.compte_nudges from authenticated;
grant update (lu_at) on public.compte_nudges to authenticated;

-- ---------------------------------------------------------------------------
-- 4) Réglages : seuils du classement + modèles de nudge
-- ---------------------------------------------------------------------------
insert into public.reglages (cle, valeur)
values (
  'classement_comptes',
  jsonb_build_object(
    'fenetre', 10,
    'min_echantillon', 3,
    'ratio_inactif', 6,
    'ratio_bien', 8,
    'ratio_star', 9,
    'vues_mauvaises', 600,
    'vues_bien', 1000,
    'vues_star', 10000,
    'trial_heures', 80,
    'trial_alerte_heures', 30,
    'skip_jours', 7
  )
)
on conflict (cle) do nothing;

insert into public.reglages (cle, valeur)
values (
  'nudges',
  jsonb_build_object(
    'modeles',
    jsonb_build_array(
      jsonb_build_object(
        'id', 'regularite',
        'titre', 'On perd le rythme',
        'corps',
        'Tu as raté plusieurs posts prévus ces derniers jours. Le calendrier est déjà prêt : '
        || 'poste ce qui t''attend, même en retard, ça compte.'
      ),
      jsonb_build_object(
        'id', 'vues_basses',
        'titre', 'Les vues ne décollent pas',
        'corps',
        'Tes derniers posts font peu de vues. Vérifie l''heure de publication, la première slide '
        || 'et le son utilisé — et dis-nous si quelque chose te bloque.'
      ),
      jsonb_build_object(
        'id', 'fin_essai',
        'titre', 'Fin de période d''essai',
        'corps',
        'Ta période d''essai se termine bientôt. C''est le moment de publier tout ce qui est prévu : '
        || 'c''est ce qu''on regarde pour la suite.'
      ),
      jsonb_build_object(
        'id', 'bravo',
        'titre', 'Continue comme ça',
        'corps', 'Bon rythme et bonnes vues sur tes derniers posts — garde cette régularité.'
      )
    )
  )
)
on conflict (cle) do nothing;

-- ---------------------------------------------------------------------------
-- 5) Stats de qualification — une passe SQL pour tous les comptes
--
--   prevus  : les N derniers passages ÉCHUS (hors brouillon, hors rappel J+7).
--             Le jour en cours ne compte pas : le créateur a encore le temps.
--   postes  : parmi ces prévus, ceux réellement publiés.
--   moyenne : moyenne des vues des N derniers posts publiés ET mesurés
--             (fenêtre différente : « les 10 derniers posts postés »).
--
-- Appelée par la requalification (service_role) et par la page de surveillance
-- (admin). `auth.uid() is null` = appel service_role ; anon est révoqué.
-- ---------------------------------------------------------------------------
create or replace function public.classement_comptes_etat(p_fenetre integer default 10)
returns table (
  compte_id uuid,
  prevus integer,
  postes integer,
  moyenne_vues double precision,
  mesures integer
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  n integer := greatest(1, least(coalesce(p_fenetre, 10), 100));
begin
  if not (public.is_admin() or auth.uid() is null) then
    raise exception 'forbidden';
  end if;

  return query
  with comptes_suivis as (
    select c.id
    from public.comptes c
    where c.is_active
      -- CM (vidéo papier → papier_posts) et UGC AI VIDEO (→ ugc_video_posts)
      -- ne passent pas par `passages` : hors classement.
      and c.type_compte <> 'cm'
      and c.ugc_ai_video = false
  ),
  -- Les N derniers créneaux échus (hier et avant), hors rappels J+7.
  creneaux as (
    select
      p.compte_id,
      p.publie_at,
      row_number() over (
        partition by p.compte_id
        order by p.date_publication_prevue desc, p.id desc
      ) as rn
    from public.passages p
    join comptes_suivis cs on cs.id = p.compte_id
    where p.statut::text <> 'brouillon'
      and coalesce(p.est_rappel, false) = false
      and p.date_publication_prevue is not null
      and p.date_publication_prevue < (timezone('Europe/Paris', now()))::date
  ),
  prevus_postes as (
    select
      c.compte_id,
      count(*)::int as prevus,
      count(*) filter (where c.publie_at is not null)::int as postes
    from creneaux c
    where c.rn <= n
    group by c.compte_id
  ),
  -- Les N derniers posts réellement publiés, mesure de vues présente.
  derniers_mesures as (
    select
      p.compte_id,
      p.vues,
      row_number() over (
        partition by p.compte_id
        order by p.publie_at desc, p.id desc
      ) as rn
    from public.passages p
    join comptes_suivis cs on cs.id = p.compte_id
    where p.publie_at is not null
      and p.vues is not null
      and coalesce(p.est_rappel, false) = false
  ),
  moyennes as (
    select
      d.compte_id,
      avg(d.vues)::float8 as moyenne_vues,
      count(*)::int as mesures
    from derniers_mesures d
    where d.rn <= n
    group by d.compte_id
  )
  select
    cs.id,
    coalesce(pp.prevus, 0),
    coalesce(pp.postes, 0),
    m.moyenne_vues,
    coalesce(m.mesures, 0)
  from comptes_suivis cs
  left join prevus_postes pp on pp.compte_id = cs.id
  left join moyennes m on m.compte_id = cs.id;
end;
$$;

revoke all on function public.classement_comptes_etat(integer) from public, anon;
grant execute on function public.classement_comptes_etat(integer) to authenticated, service_role;

comment on function public.classement_comptes_etat(integer) is
  'Prévus / postés sur les N derniers créneaux échus + moyenne de vues des N derniers posts publiés, par compte suivi (hors CM et UGC AI VIDEO).';

-- ---------------------------------------------------------------------------
-- 6) Vue Analytics : l'ELO de compte cède la place au classement
-- ---------------------------------------------------------------------------
drop view if exists public.stats_comptes cascade;
create view public.stats_comptes
with (security_invoker = off) as
  select
    c.id as compte_id,
    c.persona_nom,
    c.handle_tiktok,
    c.langue,
    c.is_active,
    c.classement,
    c.classement_maj_at,
    p.prenom as poster_prenom,
    p.nom as poster_nom,
    count(sp.id) as posts_total,
    count(sp.id) filter (where sp.publie_at is not null) as posts_publies,
    count(sp.id) filter (where sp.publie_at is not null and sp.publie_url is null)
      as posts_sans_lien,
    count(sp.id) filter (where sp.statut = 'assigne') as posts_en_attente,
    coalesce(
      (select cm.vues from public.compte_metrics cm
        where cm.compte_id = c.id order by cm.collecte_at desc limit 1),
      sum(sp.vues), 0
    ) as vues_totales,
    coalesce(
      (select cm.likes from public.compte_metrics cm
        where cm.compte_id = c.id order by cm.collecte_at desc limit 1),
      sum(sp.likes), 0
    ) as likes_totaux,
    coalesce(round(avg(sp.vues) filter (where sp.vues is not null)), 0) as vues_moyennes
  from public.comptes c
  left join public.profiles p on p.id = c.poster_id
  left join public.stats_posts sp on sp.compte_id = c.id
  where (public.is_admin() or c.poster_id = auth.uid())
    and c.warmup_ends_at is not null
    and c.warmup_ends_at <= now()
  group by
    c.id, c.persona_nom, c.handle_tiktok, c.langue, c.is_active, c.classement,
    c.classement_maj_at, p.prenom, p.nom;

grant select on public.stats_comptes to authenticated;

-- ---------------------------------------------------------------------------
-- 7) Fin de l'ELO de compte
-- ---------------------------------------------------------------------------
alter table public.comptes
  drop column if exists score,
  drop column if exists score_maj_at;
