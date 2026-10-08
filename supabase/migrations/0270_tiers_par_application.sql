-- 0270 : tiers, budget de passages et vues PAR APPLICATION.
--
-- DÉCISION DU PROPRIÉTAIRE (2026-10-08) : « je ne veux plus de tiers mergés,
-- je veux des tiers différents par application ».
--
-- LE MODÈLE.
--   - Sophia GARDE `contenus.tier / passages_prevus / tier_cycle / tier_maj_at /
--     tier_rapport`. Aucune donnée Sophia n'est migrée, aucune colonne renommée.
--   - Les autres applications ont une table dédiée `contenu_tiers_application`.
--     Tier d'entrée PARESSEUX : tant qu'aucune ligne n'est écrite, la vue
--     `contenu_application_tier_etat` le déduit de la note d'import de
--     l'application (`contenu_pertinences.note`, mêmes seuils que `tierImport`).
--     La ligne naît à la première écriture (requalification, repêchage D,
--     changement manuel). Un oubli de seed ne peut donc jamais vider une réserve.
--   - Budget et mesure PAR APPLICATION : chaque vue ne compte que les passages
--     de son application. Rappels J+7 exclus partout (inchangé).
--
-- SEULE MODIFICATION CÔTÉ SOPHIA (partie B) : `contenu_tier_etat` ne compte plus
-- que les passages `application_id = Sophia`, et `label_application_reserve`
-- lit les restants propres à chaque application. Au 2026-10-08 : 0 passage
-- non-Sophia sur 9 956 → résultats IDENTIQUES (EXCEPT ALL 0/0 sur 4 537 lignes
-- et sur les 8 lignes de réserve, mesuré en SELECT). La partie B le REVÉRIFIE
-- dans la transaction, en un seul instantané par comparaison, et annule tout au
-- moindre écart.
--
-- ORDRE (docs/multi-applications.md § 3) : le CODE est mergé et déployé AVANT
-- (il sonde 0270 et, sans elle, ne sert aucune autre application), puis A,
-- puis B. Aucune application non-Sophia active (B refuse sinon).
--
-- COMMENT L'APPLIQUER. Deux exécutions, chacune d'un bloc :
--   - MCP `apply_migration` (recommandé, trace dans schema_migrations) :
--     PARTIE A sous le nom `0270a_tiers_application_table`, puis PARTIE B sous
--     le nom `0270b_tiers_application_vues`. Le script n'émet AUCUN NOTICE (pas
--     de `if [not] exists`, pas de `raise notice`) : l'outil ne se fige pas.
--   - ou SQL Editor (une exécution par partie), puis insérer la trace :
--       insert into supabase_migrations.schema_migrations (version, name)
--       values (to_char(now() at time zone 'utc', 'YYYYMMDDHH24MISS'), '0270a_tiers_application_table');
--     (idem pour 0270b, une seconde plus tard).
-- PAS de BEGIN/COMMIT explicites (convention 0257) : chaque exécution d'un bloc
-- est UNE transaction ; une erreur, et rien n'est appliqué. La preuve de la
-- partie B ne dépend PAS du niveau d'isolation : chaque comparaison avant/après
-- est UNE instruction, donc UN instantané.
--
-- Hors des fenêtres nocturnes (21:50–23:15 UTC, 03:55–04:15 UTC).
-- Verrous : A prend un verrou bref sur `contenus` (FK), relâché à son COMMIT
-- (millisecondes). B ne verrouille AUCUNE table en écriture ; elle tient un
-- verrou exclusif sur les vues `contenu_tier_etat` et
-- `label_application_reserve` pendant la preuve (≈ 1 s mesuré) : les lectures
-- de ces vues attendent ce temps-là, rien n'échoue.
--
-- PostgREST : `contenu_tiers_application` (clé composite sur deux FK) crée une
-- nouvelle relation plusieurs-à-plusieurs contenus↔applications, comme
-- `contenu_pertinences` (0256). Aucun embed ne l'emprunte ; tout futur embed
-- d'`applications` depuis `contenus` (ou l'inverse) doit nommer sa FK.
--
-- Retour arrière : docs/sql/0270_retour_arriere.sql (désactiver d'abord toute
-- application non-Sophia).

-- ===========================================================================
-- PARTIE A — ADDITIVE (fonctions, table). Ne touche à aucun objet Sophia.
-- ===========================================================================

set lock_timeout = '5s';

do $garde_a$
begin
  if not exists (
    select 1 from public.applications
    where id = '00000000-0000-4000-8000-000000000001'::uuid and slug = 'sophia'
  ) then
    raise exception '0270a : l''application Sophia n''a pas l''identifiant attendu (…0001)';
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'passages' and column_name = 'application_id'
  ) then
    raise exception '0270a : migration 0256 absente (passages.application_id)';
  end if;
  if to_regclass('public.contenu_pertinences') is null then
    raise exception '0270a : migration 0256 absente (contenu_pertinences)';
  end if;
end
$garde_a$;

-- Fonctions pures (miroirs de tierInitialDepuisNote / PASSAGES_PAR_TIER).
create or replace function public.tier_initial_note(p_note numeric)
returns text
language sql
immutable
parallel safe
as $$
  select case
    when p_note >= 70 then 'A'
    when p_note >= 60 then 'B'
    else 'C'
  end
$$;

comment on function public.tier_initial_note(numeric) is
  'Tier d''entrée d''une application (hors Sophia) depuis SA note d''import, pour une ligne ÉLIGIBLE (le seuil d''import est déjà appliqué par contenu_pertinences.eligible) : >= 70 A, >= 60 B, sinon C (C aussi pour une ligne forcée sans note). Mêmes seuils que tierImport (tierlist.ts) — miroir : tierInitialDepuisNote, synchro testée. S et S+ ne s''atteignent que par requalification.';

create or replace function public.passages_du_tier(p_tier text)
returns integer
language sql
immutable
parallel safe
as $$
  select case p_tier
    when 'S+' then 16
    when 'S'  then 8
    when 'A'  then 4
    when 'B'  then 2
    when 'C'  then 1
    else 0
  end
$$;

comment on function public.passages_du_tier(text) is
  'Passages à effectuer par rang (D 0 · C 1 · B 2 · A 4 · S 8 · S+ 16). Miroir de PASSAGES_PAR_TIER (tierlist.ts), synchro testée.';

create table public.contenu_tiers_application (
  contenu_id uuid not null references public.contenus (id) on delete cascade,
  application_id uuid not null references public.applications (id) on delete cascade,
  tier text not null default 'D',
  passages_prevus integer not null default 0,
  tier_cycle integer not null default 0,
  tier_maj_at timestamptz,
  tier_rapport jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (contenu_id, application_id),
  constraint contenu_tiers_application_tier_check
    check (tier in ('D', 'C', 'B', 'A', 'S', 'S+')),
  constraint contenu_tiers_application_passages_check
    check (passages_prevus >= 0),
  constraint contenu_tiers_application_cycle_check
    check (tier_cycle >= 0),
  -- Sophia vit dans contenus.* et nulle part ailleurs : jamais de double vérité.
  constraint contenu_tiers_application_hors_sophia
    check (application_id <> '00000000-0000-4000-8000-000000000001'::uuid)
);

create index contenu_tiers_application_app_idx
  on public.contenu_tiers_application (application_id, tier);

comment on table public.contenu_tiers_application is
  'Tier tierlist d''un contenu pour une application AUTRE que Sophia (Sophia : contenus.tier & co). Ligne absente = tier d''entrée paresseux, déduit de contenu_pertinences.note (voir contenu_application_tier_etat). Écrite à la première requalification, au repêchage D ou par l''admin, jamais à l''import.';
comment on column public.contenu_tiers_application.tier_cycle is
  'Cycle de requalification de CETTE application. Les passages de l''application sont estampillés avec ce numéro (passages.tier_cycle). 0 = cycle d''entrée.';

alter table public.contenu_tiers_application enable row level security;

create policy contenu_tiers_application_admin
  on public.contenu_tiers_application
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

grant select, insert, update, delete on public.contenu_tiers_application to authenticated;
grant all on public.contenu_tiers_application to service_role;
revoke all on public.contenu_tiers_application from anon;

notify pgrst, 'reload schema';

reset lock_timeout;

-- ===========================================================================
-- PARTIE B — VUES (Sophia filtrée + vues par application + réserve), avec
-- preuve d'invariance Sophia. À exécuter APRÈS la partie A, d'un bloc.
-- ===========================================================================

set lock_timeout = '5s';

do $garde_b$
begin
  if not exists (
    select 1 from public.applications
    where id = '00000000-0000-4000-8000-000000000001'::uuid and slug = 'sophia'
  ) then
    raise exception '0270b : l''application Sophia n''a pas l''identifiant attendu (…0001)';
  end if;
  if to_regclass('public.contenu_tiers_application') is null
     or to_regprocedure('public.tier_initial_note(numeric)') is null
     or to_regprocedure('public.passages_du_tier(text)') is null then
    raise exception '0270b : appliquer d''abord la partie A (0270a)';
  end if;
  -- L'ancien code (avant le merge) lirait contenu_tier_etat pour la réserve
  -- d'une autre application : filtrée sur Sophia, elle ne décompterait plus
  -- AUCUN de ses passages. On refuse donc tant qu'une autre application est
  -- active : le code qui sonde 0270 doit être déployé et l'application éteinte.
  if exists (
    select 1 from public.applications
    where actif and id <> '00000000-0000-4000-8000-000000000001'::uuid
  ) then
    raise exception '0270b : désactiver d''abord toute application non-Sophia (l''ancien code ne compterait plus son budget)';
  end if;
end
$garde_b$;

-- B.1 — Copies TEMPORAIRES des définitions EN PROD, avant tout changement.
-- Lues dans le catalogue (pg_get_viewdef) et non recopiées du dépôt : la preuve
-- porte sur ce qui tourne vraiment. Les trois vues qui lisent
-- contenu_tier_etat sont rebranchées sur la copie, pour garder la sémantique
-- d'AVANT de bout en bout. Supprimées en fin de partie (et par le rollback en
-- cas d'échec).
do $copies$
declare
  v_def text;
  v_nom text;
  v_n int;
begin
  v_def := regexp_replace(pg_get_viewdef('public.contenu_tier_etat'::regclass, true), ';\s*$', '');
  execute 'create temp view _0270_cte_avant as ' || v_def;

  foreach v_nom in array array['contenu_a_requalifier', 'label_reserve', 'label_application_reserve'] loop
    v_def := regexp_replace(pg_get_viewdef(('public.' || v_nom)::regclass, true), ';\s*$', '');
    select count(*) into v_n
    from regexp_matches(v_def, '(\mpublic\.)?\mcontenu_tier_etat\M', 'g');
    if v_n <> 1 then
      raise exception '0270b : % référence contenu_tier_etat % fois (1 attendue) — définition inattendue, rien n''est appliqué', v_nom, v_n;
    end if;
    v_def := regexp_replace(v_def, '(\mpublic\.)?\mcontenu_tier_etat\M', 'pg_temp._0270_cte_avant', 'g');
    execute format('create temp view %I as %s', '_0270_' || v_nom || '_avant', v_def);
  end loop;
end
$copies$;

-- B.2 — Vues PAR APPLICATION (hors Sophia). Sémantique DEFINER, comme
-- contenu_tier_etat : lues par label_application_reserve (definer) et par
-- l'Edge (service_role) sans dépendre des RLS du lecteur. (Une vue
-- security_invoker lue DEPUIS une vue definer vérifie quand même ses tables
-- avec les droits de l'utilisateur courant : pour un admin, RLS de
-- contenu_pertinences, contenu_tiers_application et passages évaluée ligne à
-- ligne ; pour un non-admin, stock à 0 sans erreur.)
create view public.contenu_application_tier_etat as
select
  b.contenu_id,
  b.application_id,
  b.tier,
  b.passages_prevus,
  b.tier_cycle,
  b.tier_maj_at,
  coalesce(p.publies, 0)                 as publies,
  coalesce(p.en_vol, 0)                  as en_vol,
  greatest(
    b.passages_prevus - coalesce(p.publies, 0) - coalesce(p.en_vol, 0),
    0
  )                                      as restants,
  p.moyenne_vues                         as moyenne_vues,
  p.max_vues                             as max_vues,
  coalesce(p.nb_150k, 0)                 as nb_150k,
  p.dernier_publie_at                    as dernier_publie_at,
  coalesce(p.mesures, 0)                 as mesures,
  coalesce(p.introuvables, 0)            as introuvables,
  coalesce(p.en_attente_mesure, 0)       as en_attente_mesure,
  b.eligible,
  b.materialise,
  b.note
from (
  select
    cp.contenu_id,
    cp.application_id,
    cp.eligible,
    cp.note,
    (t.contenu_id is not null)           as materialise,
    case
      when t.contenu_id is not null then t.tier
      when cp.eligible then public.tier_initial_note(cp.note)
      else 'D'
    end                                  as tier,
    case
      when t.contenu_id is not null then t.passages_prevus
      when cp.eligible then public.passages_du_tier(public.tier_initial_note(cp.note))
      else 0
    end                                  as passages_prevus,
    coalesce(t.tier_cycle, 0)            as tier_cycle,
    t.tier_maj_at
  from public.contenu_pertinences cp
  left join public.contenu_tiers_application t
    on t.contenu_id = cp.contenu_id
   and t.application_id = cp.application_id
  where cp.application_id <> '00000000-0000-4000-8000-000000000001'::uuid
) b
left join lateral (
  select
    count(*) filter (where s.statut = 'publie')                    as publies,
    count(*) filter (
      where s.statut <> 'publie'
        and coalesce(s.date_publication_prevue, current_date)
            >= ((now() at time zone 'Europe/Paris')::date - 2)
    )                                                              as en_vol,
    avg(s.vues) filter (where s.statut = 'publie' and s.vues is not null)  as moyenne_vues,
    max(s.vues) filter (where s.statut = 'publie')                 as max_vues,
    count(*) filter (where s.statut = 'publie' and s.vues >= 150000) as nb_150k,
    count(*) filter (where s.statut = 'publie' and s.vues is not null) as mesures,
    count(*) filter (
      where s.statut = 'publie'
        and s.vues is null
        and s.resolution_statut = 'introuvable'
    )                                                              as introuvables,
    count(*) filter (
      where s.statut = 'publie'
        and s.vues is null
        and coalesce(s.resolution_statut, 'a_resoudre') <> 'introuvable'
    )                                                              as en_attente_mesure,
    coalesce(
      max(s.publie_at) filter (where s.statut = 'publie'),
      max((s.date_publication_prevue::timestamp) at time zone 'Europe/Paris')
        filter (where s.statut = 'publie')
    )                                                              as dernier_publie_at
  from public.passages s
  where s.contenu_id = b.contenu_id
    and s.application_id = b.application_id
    and s.tier_cycle = b.tier_cycle
    and s.est_rappel = false
) p on true;

comment on view public.contenu_application_tier_etat is
  'Avancement du cycle tierlist par contenu × application (hors Sophia), sur les SEULS passages de cette application (rappels exclus). Une ligne par ligne non-Sophia de contenu_pertinences. Tier : ligne de contenu_tiers_application si elle existe (materialise), sinon tier d''entrée tier_initial_note(note) pour une ligne éligible, D / 0 sinon (cycle 0). Mêmes colonnes que contenu_tier_etat, puis application_id (2e), eligible, materialise, note. Sémantique definer (comme contenu_tier_etat).';

create view public.contenu_application_a_requalifier as
select
  e.contenu_id,
  e.application_id,
  e.tier,
  e.passages_prevus,
  e.tier_cycle,
  e.tier_maj_at,
  e.publies,
  e.en_vol,
  e.restants,
  e.moyenne_vues,
  e.max_vues,
  e.nb_150k,
  e.dernier_publie_at,
  e.mesures,
  e.introuvables,
  e.en_attente_mesure,
  e.eligible,
  e.materialise,
  e.note
from public.contenu_application_tier_etat e
where e.passages_prevus > 0
  and e.publies >= e.passages_prevus;

comment on view public.contenu_application_a_requalifier is
  'Dégrossissage de contenu_application_tier_etat : cycles TERMINÉS seulement (mêmes deux gardes que contenu_a_requalifier / deciderRequalif). La décision reste en TypeScript. Lire application par application (keyset sur contenu_id, unique à application fixée).';

revoke all on public.contenu_application_tier_etat from anon, authenticated;
revoke all on public.contenu_application_a_requalifier from anon, authenticated;
grant select on public.contenu_application_tier_etat to authenticated, service_role;
grant select on public.contenu_application_a_requalifier to authenticated, service_role;

-- B.3 — Vue Sophia : définition 0247 À L'IDENTIQUE + UNE ligne de filtre.
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
  p.dernier_publie_at                    as dernier_publie_at,
  coalesce(p.mesures, 0)                 as mesures,
  coalesce(p.introuvables, 0)            as introuvables,
  coalesce(p.en_attente_mesure, 0)       as en_attente_mesure
from public.contenus c
left join lateral (
  select
    count(*) filter (where s.statut = 'publie')                    as publies,
    count(*) filter (
      where s.statut <> 'publie'
        and coalesce(s.date_publication_prevue, current_date)
            >= ((now() at time zone 'Europe/Paris')::date - 2)
    )                                                              as en_vol,
    avg(s.vues) filter (where s.statut = 'publie' and s.vues is not null)  as moyenne_vues,
    max(s.vues) filter (where s.statut = 'publie')                 as max_vues,
    count(*) filter (where s.statut = 'publie' and s.vues >= 150000) as nb_150k,
    count(*) filter (where s.statut = 'publie' and s.vues is not null) as mesures,
    count(*) filter (
      where s.statut = 'publie'
        and s.vues is null
        and s.resolution_statut = 'introuvable'
    )                                                              as introuvables,
    count(*) filter (
      where s.statut = 'publie'
        and s.vues is null
        and coalesce(s.resolution_statut, 'a_resoudre') <> 'introuvable'
    )                                                              as en_attente_mesure,
    coalesce(
      max(s.publie_at) filter (where s.statut = 'publie'),
      max((s.date_publication_prevue::timestamp) at time zone 'Europe/Paris')
        filter (where s.statut = 'publie')
    )                                                              as dernier_publie_at
  from public.passages s
  where s.contenu_id = c.id
    and s.tier_cycle = c.tier_cycle
    and s.est_rappel = false
    -- 0270 : budget et mesure SOPHIA seulement. Constante, et non
    -- application_id_sophia() (fonction STABLE avec SELECT, non inlinable,
    -- évaluée par ligne). Garde-fou : B vérifie que …0001 est bien `sophia`.
    and s.application_id = '00000000-0000-4000-8000-000000000001'::uuid
) p on true;

comment on view public.contenu_tier_etat is
  'Avancement du cycle tierlist SOPHIA par contenu (contenus.tier & co) : passages Sophia publiés, en vol (réservés 2 jours), restants, mesurés / introuvables / en attente de mesure, m, max et nb >= 150k. Les passages des autres applications ne consomment pas ce budget et n''entrent pas dans m (0270) : voir contenu_application_tier_etat.';

-- B.4 — Réserve label × application : restants PROPRES à chaque application.
-- Définition 0266 à l'identique, sauf le CTE `stock`, scindé : volet Sophia =
-- texte d'avant restreint à Sophia ; volet autres = vue par application.
create or replace view public.label_application_reserve as
with liens as (
  -- Règle d'héritage : un label sans ligne sert Sophia.
  select l.id as label_id,
         coalesce(la.application_id, public.application_id_sophia()) as application_id
  from public.labels l
  left join public.label_applications la on la.label_id = l.id
  where lower(trim(l.slug)) not in ('hook', 'ugc-ai-video')
),
stock as (
  -- Sophia : restants SOPHIA (contenu_tier_etat), sauf refus explicite.
  select
    li.label_id,
    li.application_id,
    count(distinct c.id)         as contenus_prets,
    coalesce(sum(e.restants), 0) as passages_restants
  from liens li
  join public.contenu_labels cl on cl.label_id = li.label_id
  join public.contenus c
    on c.id = cl.contenu_id
   and c.statut = 'valide'
   and c.import_statut = 'done'
  join public.contenu_tier_etat e on e.contenu_id = c.id
  left join public.contenu_pertinences cp
    on cp.contenu_id = c.id
   and cp.application_id = li.application_id
  where li.application_id = public.application_id_sophia()
    and coalesce(cp.eligible, true)
  group by li.label_id, li.application_id
  union all
  -- Autres applications : LEURS restants, contenus explicitement éligibles.
  select
    li.label_id,
    li.application_id,
    count(distinct c.id)          as contenus_prets,
    coalesce(sum(ea.restants), 0) as passages_restants
  from liens li
  join public.contenu_labels cl on cl.label_id = li.label_id
  join public.contenus c
    on c.id = cl.contenu_id
   and c.statut = 'valide'
   and c.import_statut = 'done'
  join public.contenu_application_tier_etat ea
    on ea.contenu_id = c.id
   and ea.application_id = li.application_id
  where li.application_id <> public.application_id_sophia()
    and ea.eligible
  group by li.label_id, li.application_id
),
comptes_ok as (
  select co.*
  from public.comptes co
  where co.is_active
    and coalesce(co.type_compte, '') <> 'cm'
    and coalesce(co.ugc_ai_video, false) = false
    and not co.videos_uniquement
    and co.warmup_ends_at is not null
    and co.warmup_ends_at <= now()
),
compte_apps as (
  -- Applications éligibles par compte : servies par ses labels, actives, sa
  -- langue ciblée ; un compte UGC reste sur Sophia.
  select distinct co.id as compte_id, li.application_id
  from comptes_ok co
  join public.compte_labels cl on cl.compte_id = co.id
  join liens li on li.label_id = cl.label_id
  join public.applications a on a.id = li.application_id
  where a.actif
    and (a.langues is null or co.langue = any (a.langues))
    and (not coalesce(co.ugc_ai, false) or a.id = public.application_id_sophia())
),
parts_brutes as (
  select
    ca.compte_id,
    ca.application_id,
    case
      when co.parts_applications is null
        then case when ca.application_id = public.application_id_sophia() then 100 else 0 end
      else greatest(coalesce((co.parts_applications ->> a.slug)::numeric, 0), 0)
    end as p
  from compte_apps ca
  join comptes_ok co on co.id = ca.compte_id
  join public.applications a on a.id = ca.application_id
),
totaux as (
  select compte_id,
         sum(p) as total,
         count(*) as nb,
         bool_or(application_id = public.application_id_sophia()) as sophia_ok
  from parts_brutes
  group by compte_id
),
parts as (
  -- Même règle que partsEffectives (multi_app.ts).
  select
    pb.compte_id,
    pb.application_id,
    case
      when t.total > 0 then pb.p / t.total
      when t.sophia_ok then case when pb.application_id = public.application_id_sophia() then 1 else 0 end
      else 1.0 / t.nb
    end as part
  from parts_brutes pb
  join totaux t on t.compte_id = pb.compte_id
),
labels_app_compte as (
  select cl.compte_id, li.application_id, count(*) as nb
  from public.compte_labels cl
  join liens li on li.label_id = cl.label_id
  group by cl.compte_id, li.application_id
),
demande as (
  select
    li.label_id,
    li.application_id,
    count(*) as comptes,
    sum(
      least(3, greatest(1, coalesce(co.posts_par_jour, 1)))::numeric
      * pa.part
      / nullif(lac.nb, 0)
    ) as demande_jour
  from liens li
  join public.compte_labels cl on cl.label_id = li.label_id
  join comptes_ok co on co.id = cl.compte_id
  join parts pa on pa.compte_id = co.id and pa.application_id = li.application_id
  join labels_app_compte lac on lac.compte_id = co.id and lac.application_id = li.application_id
  where pa.part > 0
  group by li.label_id, li.application_id
)
select
  l.id                                  as label_id,
  l.nom,
  l.slug,
  li.application_id,
  a.slug                                as application_slug,
  coalesce(s.contenus_prets, 0)         as contenus_prets,
  coalesce(s.passages_restants, 0)      as passages_restants,
  coalesce(d.comptes, 0)                as comptes,
  round(coalesce(d.demande_jour, 0), 2) as demande_jour,
  case
    when coalesce(d.demande_jour, 0) > 0
      then round(coalesce(s.passages_restants, 0)::numeric / d.demande_jour, 1)
    else null
  end                                   as reserve_jours
from liens li
join public.labels l on l.id = li.label_id
join public.applications a on a.id = li.application_id
left join stock s
  on s.label_id = li.label_id and s.application_id = li.application_id
left join demande d
  on d.label_id = li.label_id and d.application_id = li.application_id;

comment on view public.label_application_reserve is
  'Réserve de passages par label × application. Stock : contenus valides du label éligibles pour l''application (Sophia : sauf refus explicite ; autres : éligibilité explicite), avec les passages restants de CETTE application (Sophia : contenu_tier_etat ; autres : contenu_application_tier_etat, 0270). Les réserves de deux applications ne se recouvrent plus. Demande : quota des comptes × part effective de l''application ÷ nombre de leurs labels qui la servent.';

-- B.5 — PREUVE D'INVARIANCE SOPHIA. Chaque comparaison est UNE instruction
-- (copie d'avant et vue d'après lues dans le même instantané, now() identique) :
-- un passage publié pendant la migration ne peut pas créer de faux écart.
-- label_application_reserve : lignes Sophia seulement (les lignes d'une autre
-- application DOIVENT changer : elles passent aux restants de l'application).
do $preuve$
declare
  e_cte bigint;
  e_car bigint;
  e_lr  bigint;
  e_lar bigint;
  non_sophia bigint;
begin
  e_cte := (
    with a as materialized (select * from pg_temp._0270_cte_avant),
         n as materialized (select * from public.contenu_tier_etat)
    select (select count(*) from (select * from a except all select * from n) x)
         + (select count(*) from (select * from n except all select * from a) y)
  );
  e_car := (
    with a as materialized (select * from pg_temp._0270_contenu_a_requalifier_avant),
         n as materialized (select * from public.contenu_a_requalifier)
    select (select count(*) from (select * from a except all select * from n) x)
         + (select count(*) from (select * from n except all select * from a) y)
  );
  e_lr := (
    with a as materialized (select * from pg_temp._0270_label_reserve_avant),
         n as materialized (select * from public.label_reserve)
    select (select count(*) from (select * from a except all select * from n) x)
         + (select count(*) from (select * from n except all select * from a) y)
  );
  e_lar := (
    with a as materialized (
           select * from pg_temp._0270_label_application_reserve_avant
           where application_id = '00000000-0000-4000-8000-000000000001'::uuid
         ),
         n as materialized (
           select * from public.label_application_reserve
           where application_id = '00000000-0000-4000-8000-000000000001'::uuid
         )
    select (select count(*) from (select * from a except all select * from n) x)
         + (select count(*) from (select * from n except all select * from a) y)
  );
  if e_cte + e_car + e_lr + e_lar > 0 then
    select count(*) into non_sophia
    from public.passages
    where application_id <> '00000000-0000-4000-8000-000000000001'::uuid;
    raise exception
      '0270b annulée — invariance Sophia rompue (lignes en écart) : contenu_tier_etat %, contenu_a_requalifier %, label_reserve %, label_application_reserve (Sophia) %. Passages non-Sophia en base : %. Rien n''est appliqué ; ne rien forcer, décision du propriétaire requise.',
      e_cte, e_car, e_lr, e_lar, non_sophia;
  end if;
end
$preuve$;

drop view pg_temp._0270_label_application_reserve_avant;
drop view pg_temp._0270_label_reserve_avant;
drop view pg_temp._0270_contenu_a_requalifier_avant;
drop view pg_temp._0270_cte_avant;

notify pgrst, 'reload schema';

reset lock_timeout;
