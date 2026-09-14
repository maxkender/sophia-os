-- ---------------------------------------------------------------------------
-- Tracking des publications : ce qui est EN LIGNE, pas ce qui est COCHÉ.
--
-- Le produit ne comptait que la déclaration du créateur (`passages.publie_at`,
-- posé au clic sur « publié »). Deux erreurs symétriques en découlent :
--
--   · faux positif INACTIF — le créateur publie mais ne coche jamais. Vu en
--     prod : un compte à 13 800 vues et 1 100 likes relevés sur son profil,
--     compté 0/8 publiés, donc INACTIF et proposé au non-renouvellement.
--   · faux négatif — le créateur coche sans publier. La résolution le sait
--     déjà (`resolution_statut = 'introuvable'`), mais le classement comptait
--     quand même le créneau comme publié.
--
-- Le premier se répare dans `metriques` (le scrape de profil du soir apparie
-- les créneaux jamais déclarés) ; le second ici, en cessant de compter ce que
-- TikTok a démenti.
-- ---------------------------------------------------------------------------

alter table public.passages
  add column if not exists publication_non_declaree boolean not null default false;

comment on column public.passages.publication_non_declaree is
  'Créneau retrouvé en ligne alors que le créateur ne l''a jamais coché « publié ». Compte comme publié partout ; sert à lui rappeler de déclarer.';

-- ---------------------------------------------------------------------------
-- Le trigger de mise en file ne doit pas défaire une résolution déjà faite
-- ---------------------------------------------------------------------------
-- Le rattrapage pose `publie_at` ET `resolution_statut = 'resolu'` dans le même
-- UPDATE. Sans ce garde-fou, le trigger (BEFORE UPDATE OF publie_at) remettait
-- le créneau en file « à résoudre » et effaçait le détail qu'on venait d'écrire.
create or replace function public.passages_file_resolution()
returns trigger
language plpgsql
as $$
begin
  if new.publie_at is not null
     and (tg_op = 'INSERT' or old.publie_at is null)
     and new.resolution_statut is distinct from 'resolu'
  then
    new.resolution_statut := 'a_resoudre';
    new.resolution_tentatives := 0;
    -- 5 minutes : TikTok n'expose pas un post neuf sur le profil dans la seconde.
    new.resolution_prochaine_at := now() + interval '5 minutes';
    new.resolution_at := null;
    new.resolution_detail := null;
  end if;
  return new;
end;
$$;

comment on function public.passages_file_resolution() is
  'Met un créneau en file de résolution au moment où il est déclaré publié — sauf s''il arrive déjà résolu (rattrapage du profil).';

-- ---------------------------------------------------------------------------
-- Stats de qualification : postés = publiés non démentis
-- ---------------------------------------------------------------------------
--   prevus     : les N derniers créneaux ÉCHUS (hors brouillon, hors rappel).
--   postes     : parmi eux, ceux publiés — déclarés ou rattrapés — dont TikTok
--                n'a pas démenti la publication (`introuvable` exclu).
--   infirmes   : déclarés publiés, jamais retrouvés sur TikTok. Comptés nulle
--                part, remontés pour que la règle affichée l'explique.
--   non_declares : publiés sans avoir été cochés (rattrapés sur le profil).
--
-- La signature change (deux colonnes en plus) : drop + create, pas replace.
-- ---------------------------------------------------------------------------
drop function if exists public.classement_comptes_etat(integer);

create function public.classement_comptes_etat(p_fenetre integer default 10)
returns table (
  compte_id uuid,
  prevus integer,
  postes integer,
  moyenne_vues double precision,
  mesures integer,
  infirmes integer,
  non_declares integer
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
      p.resolution_statut,
      coalesce(p.publication_non_declaree, false) as non_declare,
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
      count(*) filter (
        where c.publie_at is not null
          and coalesce(c.resolution_statut, '') <> 'introuvable'
      )::int as postes,
      count(*) filter (
        where c.publie_at is not null
          and c.resolution_statut = 'introuvable'
      )::int as infirmes,
      count(*) filter (where c.publie_at is not null and c.non_declare)::int as non_declares
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
      and coalesce(p.resolution_statut, '') <> 'introuvable'
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
    coalesce(m.mesures, 0),
    coalesce(pp.infirmes, 0),
    coalesce(pp.non_declares, 0)
  from comptes_suivis cs
  left join prevus_postes pp on pp.compte_id = cs.id
  left join moyennes m on m.compte_id = cs.id;
end;
$$;

revoke all on function public.classement_comptes_etat(integer) from public, anon;
grant execute on function public.classement_comptes_etat(integer) to authenticated, service_role;

comment on function public.classement_comptes_etat(integer) is
  'Prévus / postés (publications non démenties par TikTok) sur les N derniers créneaux échus + moyenne de vues, par compte suivi (hors CM et UGC AI VIDEO).';
