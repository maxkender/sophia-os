-- Tierlist — remplace l'ELO par langue comme moteur de placement des posts.
--
-- Un contenu porte désormais UN rang unique (D, C, B, A, S, S+), langue-agnostique,
-- et un nombre de passages à effectuer avant requalification :
--   D 0 · C 1 · B 2 · A 4 · S 8 · S+ 16
--
-- L'ELO reste utilisé pour le SEUL premier placement à l'import (note /100 de la
-- langue source, 30 % pertinence + 70 % vues) — voir _shared/import_contenu.ts.
-- L'ELO de compte (`comptes.score`) n'est pas touché : il mesure la forme du compte.
--
-- N'altère ni posts, ni passages publiés, ni médias existants.

-- ---------------------------------------------------------------------------
-- 1) Colonnes tierlist sur les contenus
-- ---------------------------------------------------------------------------
alter table public.contenus
  add column if not exists tier text not null default 'D',
  -- Nombre de passages à effectuer sur le cycle courant (dérivé du tier).
  add column if not exists passages_prevus integer not null default 0,
  -- Incrémenté à chaque requalification : borne la fenêtre de mesure de `m`.
  add column if not exists tier_cycle integer not null default 0,
  add column if not exists tier_maj_at timestamptz,
  -- Trace lisible de la dernière requalification (m, max, règle appliquée).
  add column if not exists tier_rapport jsonb;

do $$ begin
  alter table public.contenus
    add constraint contenus_tier_check check (tier in ('D', 'C', 'B', 'A', 'S', 'S+'));
exception when duplicate_object then null;
end $$;

do $$ begin
  alter table public.contenus
    add constraint contenus_passages_prevus_check check (passages_prevus >= 0);
exception when duplicate_object then null;
end $$;

comment on column public.contenus.tier is
  'Rang tierlist (D<C<B<A<S<S+). Unique par contenu, toutes langues confondues.';
comment on column public.contenus.passages_prevus is
  'Passages à effectuer sur le cycle courant avant requalification (D 0 · C 1 · B 2 · A 4 · S 8 · S+ 16).';
comment on column public.contenus.tier_cycle is
  'Cycle de requalification courant. Les passages sont estampillés avec ce numéro.';

create index if not exists contenus_tier_idx
  on public.contenus (tier, passages_prevus desc);

-- ---------------------------------------------------------------------------
-- 2) Colonnes tierlist sur les passages
-- ---------------------------------------------------------------------------
alter table public.passages
  -- Cycle du contenu au moment de l'assignation (fenêtre de calcul de `m`).
  add column if not exists tier_cycle integer not null default 0,
  -- Rappel J+7 d'un passage > 50k vues : ne consomme pas de passage prévu,
  -- ne compte pas dans `m`, s'ajoute au quota du jour.
  add column if not exists est_rappel boolean not null default false,
  -- 1 = premier rappel, 2 = rappel du rappel… plafonné (voir tierlist.ts).
  add column if not exists rappel_rang integer not null default 0,
  add column if not exists rappel_source_id uuid references public.passages (id) on delete set null;

comment on column public.passages.est_rappel is
  'Rappel automatique J+7 (passage source > 50k vues) — hors quota, hors calcul de m.';

create index if not exists passages_tier_cycle_idx
  on public.passages (contenu_id, tier_cycle) where est_rappel = false;
create index if not exists passages_rappel_source_idx
  on public.passages (rappel_source_id) where rappel_source_id is not null;

-- ---------------------------------------------------------------------------
-- 3) Remix débloqués par un S+ — file lue par le moteur de remix (branché plus tard)
-- ---------------------------------------------------------------------------
create table if not exists public.remix_debloques (
  id uuid primary key default gen_random_uuid(),
  contenu_id uuid not null references public.contenus (id) on delete cascade,
  -- Cycle qui a débloqué les remix (un seul déblocage par cycle).
  tier_cycle integer not null,
  -- 3 remix par requalification passée / restée en S+.
  nb integer not null default 3 check (nb > 0),
  -- Tier d'entrée des remix produits.
  tier_cible text not null default 'A',
  statut text not null default 'en_attente'
    check (statut in ('en_attente', 'consomme', 'annule')),
  consomme_at timestamptz,
  created_at timestamptz not null default now(),
  unique (contenu_id, tier_cycle)
);

create index if not exists remix_debloques_statut_idx
  on public.remix_debloques (statut, created_at);

alter table public.remix_debloques enable row level security;

drop policy if exists remix_debloques_admin on public.remix_debloques;
create policy remix_debloques_admin
  on public.remix_debloques
  for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

grant select, insert, update, delete on public.remix_debloques to authenticated;
grant all on public.remix_debloques to service_role;

-- ---------------------------------------------------------------------------
-- 4) Réglages tierlist (éditables Pilotage)
-- ---------------------------------------------------------------------------
insert into public.reglages (cle, valeur) values
  ('tierlist', '{
    "recul_jours": 1,
    "rappel_vues": 50000,
    "rappel_jours": 7,
    "rappel_max": 3,
    "remix_par_requalif": 3,
    "repechage_passages": 1
  }'::jsonb)
on conflict (cle) do nothing;

-- Le gate d'import passe à 30 % pertinence / 70 % vues (plus de notion de langue).
update public.reglages
set valeur = coalesce(valeur, '{}'::jsonb) || jsonb_build_object(
      'elo_poids_vues', 0.7,
      'elo_seuil_import', 55
    ),
    updated_at = now()
where cle = 'scoring';

-- ---------------------------------------------------------------------------
-- 5) État tierlist calculé — passages publiés / en vol / restants sur le cycle
-- ---------------------------------------------------------------------------
-- `en_vol` ignore les passages assignés jamais publiés au-delà de la fenêtre de
-- réservation : un passage non publié n'est PAS consommé, il retourne au pool.
create or replace view public.contenu_tier_etat as
select
  c.id                                   as contenu_id,
  c.tier,
  c.passages_prevus,
  c.tier_cycle,
  c.tier_maj_at,
  coalesce(p.publies, 0)                 as publies,
  coalesce(p.en_vol, 0)                  as en_vol,
  greatest(
    c.passages_prevus - coalesce(p.publies, 0) - coalesce(p.en_vol, 0),
    0
  )                                      as restants,
  p.moyenne_vues                         as moyenne_vues,
  p.max_vues                             as max_vues,
  coalesce(p.nb_150k, 0)                 as nb_150k,
  p.dernier_publie_at                    as dernier_publie_at
from public.contenus c
left join lateral (
  select
    count(*) filter (where s.statut = 'publie')                    as publies,
    count(*) filter (
      where s.statut <> 'publie'
        and coalesce(s.date_publication_prevue, current_date)
            >= ((now() at time zone 'Europe/Paris')::date - 7)
    )                                                              as en_vol,
    avg(s.vues) filter (where s.statut = 'publie' and s.vues is not null)  as moyenne_vues,
    max(s.vues) filter (where s.statut = 'publie')                 as max_vues,
    count(*) filter (where s.statut = 'publie' and s.vues >= 150000) as nb_150k,
    max(s.publie_at) filter (where s.statut = 'publie')            as dernier_publie_at
  from public.passages s
  where s.contenu_id = c.id
    and s.tier_cycle = c.tier_cycle
    and s.est_rappel = false
) p on true;

comment on view public.contenu_tier_etat is
  'Avancement du cycle tierlist par contenu : passages publiés, en vol, restants, moyenne (m) et max de vues.';

grant select on public.contenu_tier_etat to authenticated;
grant select on public.contenu_tier_etat to service_role;

-- ---------------------------------------------------------------------------
-- 6) Migration des contenus existants : ELO de la langue source → tier
-- ---------------------------------------------------------------------------
--   < 55 : D · 55–65 : C · 65–75 : B · 75–85 : A · 85–89 : S · ≥ 89 : S+
-- Les passages déjà publiés appartiennent au cycle 0 mais ne comptent pas :
-- le compteur repart plein (cycle 1), première requalification après les
-- nouveaux passages.
do $tier$
declare
  n_migres integer;
begin
  with source as (
    select
      c.id,
      coalesce(
        (select cl.score
           from public.contenu_langues cl
          where cl.contenu_id = c.id
            and cl.langue = c.langue_source
          limit 1),
        (select max(cl2.score) from public.contenu_langues cl2 where cl2.contenu_id = c.id),
        0
      ) as elo
    from public.contenus c
  ),
  calcul as (
    select
      id,
      case
        when elo >= 89 then 'S+'
        when elo >= 85 then 'S'
        when elo >= 75 then 'A'
        when elo >= 65 then 'B'
        when elo >= 55 then 'C'
        else 'D'
      end as tier
    from source
  )
  update public.contenus c
  set tier = k.tier,
      passages_prevus = case k.tier
        when 'S+' then 16
        when 'S'  then 8
        when 'A'  then 4
        when 'B'  then 2
        when 'C'  then 1
        else 0
      end,
      -- Cycle 1 : les passages historiques (cycle 0) sont hors fenêtre de mesure.
      tier_cycle = 1,
      tier_maj_at = now()
  from calcul k
  where c.id = k.id
    and c.tier_maj_at is null;

  get diagnostics n_migres = row_count;
  raise notice 'tierlist: % contenu(s) requalifiés depuis l''ELO de la langue source', n_migres;
end
$tier$;
