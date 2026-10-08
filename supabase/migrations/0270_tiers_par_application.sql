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
--     l'application (`contenu_pertinences.note`, mêmes seuils que `tierImport` ;
--     la note d'une ligne FORCÉE est planchée au seuil par le code, comme la
--     note Sophia forcée). La ligne naît à la première écriture
--     (requalification, repêchage D, changement manuel). Un oubli de seed ne
--     peut donc jamais vider une réserve.
--   - Budget et mesure PAR APPLICATION : chaque vue ne compte que les passages
--     de son application. Rappels J+7 exclus partout (inchangé).
--
-- SEULE MODIFICATION CÔTÉ SOPHIA (partie B) : `contenu_tier_etat` ne compte plus
-- que les passages `application_id = Sophia`, et `label_application_reserve`
-- lit les restants propres à chaque application. Au 2026-10-08 : 0 passage
-- non-Sophia sur 9 956 → résultats IDENTIQUES (EXCEPT ALL 0/0 sur 4 537 lignes
-- et sur les 8 lignes de réserve, mesuré en SELECT). La partie B le REVÉRIFIE
-- dans la transaction, AVANT de remplacer quoi que ce soit, et annule tout au
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
--     de `if [not] exists`, pas de `raise notice` : les créations
--     conditionnelles passent par `to_regclass` dans des blocs DO) : l'outil ne
--     se fige pas.
--   - ou SQL Editor (une exécution par partie), puis insérer la trace :
--       insert into supabase_migrations.schema_migrations (version, name)
--       values (to_char(now() at time zone 'utc', 'YYYYMMDDHH24MISS'), '0270a_tiers_application_table');
--     (idem pour 0270b, une seconde plus tard).
-- PAS de BEGIN/COMMIT explicites (convention 0257) : chaque exécution d'un bloc
-- est UNE transaction ; une erreur, et rien n'est appliqué. La preuve de la
-- partie B ne dépend PAS du niveau d'isolation : chaque comparaison avant/après
-- est UNE instruction, donc UN instantané.
--
-- REJOUABLE : chaque partie peut être réexécutée telle quelle (appel MCP qui a
-- expiré côté client après le COMMIT, doute sur ce qui est passé). A ne recrée
-- ni la table, ni son index, ni sa policy s'ils existent ; B ne recrée pas les
-- deux vues par application si elles existent, refait sa preuve (alors
-- comparée à elle-même : 0 écart) et réinstalle les mêmes définitions. Pour
-- savoir ce qui est passé : `select to_regclass('public.contenu_tiers_application'),
-- to_regclass('public.contenu_application_tier_etat'),
-- to_regclass('public.contenu_application_a_requalifier')` (trois noms = A et B
-- passées), et `schema_migrations`.
--
-- Hors des fenêtres nocturnes (21:50–23:15 UTC, 03:55–04:15 UTC).
-- VERROUS.
--   - A : verrou bref sur `contenus` et `applications` (FK), relâché à son
--     COMMIT (millisecondes).
--   - B ne verrouille AUCUNE table en écriture. La preuve (≈ 2 s mesurés au
--     calme, davantage sous charge) tourne AVANT tout remplacement, sur des
--     copies temporaires : elle ne prend que des verrous de lecture et ne
--     bloque personne. Les deux `create or replace view` (verrou exclusif sur
--     `contenu_tier_etat` et `label_application_reserve`) viennent À LA FIN,
--     suivis seulement d'un contrôle de catalogue : verrou tenu quelques
--     millisecondes. Pour l'obtenir, B attend au plus 2 s par vue
--     (`lock_timeout`) la fin des lectures en cours ; pendant cette attente,
--     les nouvelles lectures de la vue attendent derrière elle (au pire ≈ 4 s,
--     sous le statement_timeout de 8 s d'authenticated). Si l'attente dépasse
--     2 s, B échoue sans rien appliquer : la rejouer. Conseillé : pages admin
--     Pilotage et Réserve fermées pendant B.
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
--
-- DROITS : EXECUTE reste ouvert à PUBLIC (donc à anon), comme
-- application_id_sophia() et is_admin(), et EXPRÈS. Les fonctions appelées par
-- une vue sont vérifiées avec les droits de CELUI QUI LIT la vue, pas de son
-- propriétaire (vérifié : « permission denied for function tier_initial_note »
-- sur label_application_reserve dès que PUBLIC perd EXECUTE). Les retirer à
-- PUBLIC casserait la lecture de label_application_reserve pour les lecteurs
-- directs qui n'ont pas d'EXECUTE nominatif (sophia_hm_lecture,
-- supabase_read_only_user…). Sans risque : fonctions pures, sans accès aux
-- données.
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
  'Tier d''entrée d''une application (hors Sophia) depuis SA note d''import, pour une ligne ÉLIGIBLE (le seuil d''import est déjà appliqué par contenu_pertinences.eligible ; la note d''une ligne forcée est planchée au seuil par le code, comme la note Sophia forcée) : >= 70 A, >= 60 B, sinon C (C aussi pour une ligne forcée pas encore notée). Mêmes seuils que tierImport (tierlist.ts) — miroir : tierInitialDepuisNote, synchro testée. S et S+ ne s''atteignent que par requalification.';

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

-- Table, index et policy : créés seulement s'ils manquent (A rejouable).
do $table$
begin
  if to_regclass('public.contenu_tiers_application') is null then
    execute $ddl$
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
      )
    $ddl$;
  end if;
  if to_regclass('public.contenu_tiers_application_app_idx') is null then
    execute $ddl$
      create index contenu_tiers_application_app_idx
        on public.contenu_tiers_application (application_id, tier)
    $ddl$;
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'contenu_tiers_application'
      and policyname = 'contenu_tiers_application_admin'
  ) then
    execute $ddl$
      create policy contenu_tiers_application_admin
        on public.contenu_tiers_application
        for all to authenticated
        using (public.is_admin())
        with check (public.is_admin())
    $ddl$;
  end if;
end
$table$;

comment on table public.contenu_tiers_application is
  'Tier tierlist d''un contenu pour une application AUTRE que Sophia (Sophia : contenus.tier & co). Ligne absente = tier d''entrée paresseux, déduit de contenu_pertinences.note (voir contenu_application_tier_etat). Écrite à la première requalification, au repêchage D ou par l''admin, jamais à l''import.';
comment on column public.contenu_tiers_application.tier_cycle is
  'Cycle de requalification de CETTE application. Les passages de l''application sont estampillés avec ce numéro (passages.tier_cycle). 0 = cycle d''entrée.';

alter table public.contenu_tiers_application enable row level security;

grant select, insert, update, delete on public.contenu_tiers_application to authenticated;
grant all on public.contenu_tiers_application to service_role;
revoke all on public.contenu_tiers_application from anon;

notify pgrst, 'reload schema';

reset lock_timeout;

-- ===========================================================================
-- PARTIE B — VUES (Sophia filtrée + vues par application + réserve), avec
-- preuve d'invariance Sophia AVANT remplacement. À exécuter APRÈS la partie A,
-- d'un bloc.
-- ===========================================================================

set lock_timeout = '5s';
-- La preuve évalue 8 vues entières. Elle ne bloque personne (aucun verrou
-- exclusif pendant qu'elle tourne) : mieux vaut la laisser finir sous charge
-- que l'annuler à 2 min.
set statement_timeout = '5min';

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

-- B.1 — Copies TEMPORAIRES « AVANT » des définitions EN PROD.
-- Lues dans le catalogue (pg_get_viewdef) et non recopiées du dépôt : la preuve
-- porte sur ce qui tourne vraiment. Les trois vues qui lisent
-- contenu_tier_etat sont rebranchées sur la copie, pour garder la sémantique
-- d'AVANT de bout en bout. Temporaires : supprimées en fin de partie (et par
-- le rollback en cas d'échec).
do $copies_avant$
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
$copies_avant$;

-- B.2 — Vues PAR APPLICATION (hors Sophia), créées si elles manquent (B
-- rejouable : une vue déjà là n'est pas remplacée, donc pas verrouillée).
-- NOUVEAUX objets : personne ne les lit avant le COMMIT.
--
-- Sémantique DEFINER, comme contenu_tier_etat : lues par
-- label_application_reserve (definer) et par l'Edge (service_role) sans
-- dépendre des RLS du lecteur. (Une vue security_invoker lue DEPUIS une vue
-- definer vérifie quand même ses tables avec les droits de l'utilisateur
-- courant : pour un admin, RLS de contenu_pertinences, contenu_tiers_application
-- et passages évaluée ligne à ligne ; pour un non-admin, stock à 0 sans
-- erreur.)
--
-- LIGNES RÉSERVÉES : la vue expose `note` et `eligible` de
-- contenu_pertinences (table réservée à l'admin par RLS). Un utilisateur
-- connecté NON admin (posteur, via PostgREST : rôle `authenticated`) n'y voit
-- AUCUNE ligne. Le service (Edge, rôle `service_role`), l'admin et les
-- lectures directes (postgres, rôles de lecture) voient tout. Filtre sans
-- colonne, évalué une fois par requête (one-time filter + InitPlan) : il
-- n'empêche aucun index. Il vaut aussi à travers label_application_reserve et
-- contenu_application_a_requalifier (current_user y reste le lecteur) : un
-- non-admin y lit un stock non-Sophia à 0 — aucun écran non-admin ne les lit.
do $vues_app$
begin
  if to_regclass('public.contenu_application_tier_etat') is null then
    execute $v$
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
          -- Lignes réservées : pas de posteur (voir l'en-tête de B.2).
          and (current_user not in ('authenticated', 'anon') or (select public.is_admin()))
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
      ) p on true
    $v$;
  end if;
  if to_regclass('public.contenu_application_a_requalifier') is null then
    execute $v$
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
        and e.publies >= e.passages_prevus
    $v$;
  end if;
end
$vues_app$;

comment on view public.contenu_application_tier_etat is
  'Avancement du cycle tierlist par contenu × application (hors Sophia), sur les SEULS passages de cette application (rappels exclus). Une ligne par ligne non-Sophia de contenu_pertinences. Tier : ligne de contenu_tiers_application si elle existe (materialise), sinon tier d''entrée tier_initial_note(note) pour une ligne éligible, D / 0 sinon (cycle 0). Mêmes colonnes que contenu_tier_etat, puis application_id (2e), eligible, materialise, note. Sémantique definer (comme contenu_tier_etat) ; aucune ligne pour un utilisateur connecté non admin (note et éligibilité viennent d''une table réservée à l''admin).';
comment on view public.contenu_application_a_requalifier is
  'Dégrossissage de contenu_application_tier_etat : cycles TERMINÉS seulement (mêmes deux gardes que contenu_a_requalifier / deciderRequalif). La décision reste en TypeScript. Lire application par application (keyset sur contenu_id, unique à application fixée).';

revoke all on public.contenu_application_tier_etat from anon, authenticated;
revoke all on public.contenu_application_a_requalifier from anon, authenticated;
grant select on public.contenu_application_tier_etat to authenticated, service_role;
grant select on public.contenu_application_a_requalifier to authenticated, service_role;

-- B.3 — NOUVELLES définitions, d'abord en TEMPORAIRE. Ce sont elles qui seront
-- installées en B.5, telles quelles (texte relu dans le catalogue) : ce qui est
-- prouvé est ce qui est installé.

-- contenu_tier_etat : définition 0247 À L'IDENTIQUE + UNE ligne de filtre.
create temp view _0270_cte_apres as
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

-- label_application_reserve : définition 0266 à l'identique, sauf le CTE
-- `stock`, scindé : volet Sophia = texte d'avant restreint à Sophia (sur la
-- contenu_tier_etat d'APRÈS) ; volet autres = vue par application.
create temp view _0270_lar_apres as
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
  join pg_temp._0270_cte_apres e on e.contenu_id = c.id
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

-- Copies « APRÈS » des deux vues qui lisent contenu_tier_etat sans changer
-- (contenu_a_requalifier, label_reserve) : même texte de catalogue, rebranché
-- sur la contenu_tier_etat d'APRÈS.
do $copies_apres$
declare
  v_def text;
  v_nom text;
begin
  foreach v_nom in array array['contenu_a_requalifier', 'label_reserve'] loop
    v_def := regexp_replace(pg_get_viewdef(('public.' || v_nom)::regclass, true), ';\s*$', '');
    v_def := regexp_replace(v_def, '(\mpublic\.)?\mcontenu_tier_etat\M', 'pg_temp._0270_cte_apres', 'g');
    execute format('create temp view %I as %s', '_0270_' || v_nom || '_apres', v_def);
  end loop;
end
$copies_apres$;

-- B.4 — PREUVE D'INVARIANCE SOPHIA, AVANT tout remplacement : copies
-- « avant » contre définitions « après », toutes temporaires. Aucune vue
-- publique n'est lue ni verrouillée ici. Chaque comparaison est UNE
-- instruction (avant et après lus dans le même instantané, now() identique) :
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
         n as materialized (select * from pg_temp._0270_cte_apres)
    select (select count(*) from (select * from a except all select * from n) x)
         + (select count(*) from (select * from n except all select * from a) y)
  );
  e_car := (
    with a as materialized (select * from pg_temp._0270_contenu_a_requalifier_avant),
         n as materialized (select * from pg_temp._0270_contenu_a_requalifier_apres)
    select (select count(*) from (select * from a except all select * from n) x)
         + (select count(*) from (select * from n except all select * from a) y)
  );
  e_lr := (
    with a as materialized (select * from pg_temp._0270_label_reserve_avant),
         n as materialized (select * from pg_temp._0270_label_reserve_apres)
    select (select count(*) from (select * from a except all select * from n) x)
         + (select count(*) from (select * from n except all select * from a) y)
  );
  e_lar := (
    with a as materialized (
           select * from pg_temp._0270_label_application_reserve_avant
           where application_id = '00000000-0000-4000-8000-000000000001'::uuid
         ),
         n as materialized (
           select * from pg_temp._0270_lar_apres
           where application_id = '00000000-0000-4000-8000-000000000001'::uuid
         )
    select (select count(*) from (select * from a except all select * from n) x)
         + (select count(*) from (select * from n except all select * from a) y)
  );
  if e_cte + e_car + e_lr + e_lar > 0 then
    select count(*) into non_sophia
    from public.passages
    where application_id <> '00000000-0000-4000-8000-000000000001'::uuid
      and est_rappel = false;
    raise exception
      '0270b annulée — invariance Sophia rompue (lignes en écart) : contenu_tier_etat %, contenu_a_requalifier %, label_reserve %, label_application_reserve (Sophia) %. Passages non-Sophia (hors rappels) en base : %. Rien n''est appliqué ; ne rien forcer, décision du propriétaire requise.',
      e_cte, e_car, e_lr, e_lar, non_sophia;
  end if;
end
$preuve$;

-- B.5 — INSTALLATION, en dernier : seul moment où les deux vues Sophia sont
-- verrouillées (quelques millisecondes après obtention du verrou). Attente du
-- verrou bornée à 2 s par vue : au-delà, B échoue sans rien appliquer (la
-- rejouer). Définitions relues dans le catalogue depuis les vues temporaires
-- prouvées ; label_application_reserve est rebranchée sur
-- public.contenu_tier_etat (une seule référence, contrôlée). Contrôle final :
-- les définitions installées sont, au texte près, celles qui ont été prouvées.
set lock_timeout = '2s';

do $installation$
declare
  v_def text;
  v_n int;
  v_attendu text;
begin
  v_def := regexp_replace(pg_get_viewdef('pg_temp._0270_cte_apres'::regclass, true), ';\s*$', '');
  execute 'create or replace view public.contenu_tier_etat as ' || v_def;

  v_def := regexp_replace(pg_get_viewdef('pg_temp._0270_lar_apres'::regclass, true), ';\s*$', '');
  select count(*) into v_n
  from regexp_matches(v_def, '(\mpg_temp(_\d+)?\.)?\m_0270_cte_apres\M', 'g');
  if v_n <> 1 then
    raise exception '0270b annulée : la réserve d''après référence la contenu_tier_etat d''après % fois (1 attendue)', v_n;
  end if;
  v_def := regexp_replace(v_def, '(\mpg_temp(_\d+)?\.)?\m_0270_cte_apres\M', 'public.contenu_tier_etat', 'g');
  execute 'create or replace view public.label_application_reserve as ' || v_def;

  if pg_get_viewdef('public.contenu_tier_etat'::regclass, true)
     is distinct from pg_get_viewdef('pg_temp._0270_cte_apres'::regclass, true) then
    raise exception '0270b annulée : contenu_tier_etat installée ≠ définition prouvée';
  end if;
  v_attendu := regexp_replace(
    pg_get_viewdef('pg_temp._0270_lar_apres'::regclass, true),
    '(\mpg_temp(_\d+)?\.)?\m_0270_cte_apres\M', '§cte§', 'g');
  if regexp_replace(
       pg_get_viewdef('public.label_application_reserve'::regclass, true),
       '(\mpublic\.)?\mcontenu_tier_etat\M', '§cte§', 'g')
     is distinct from v_attendu then
    raise exception '0270b annulée : label_application_reserve installée ≠ définition prouvée';
  end if;
end
$installation$;

comment on view public.contenu_tier_etat is
  'Avancement du cycle tierlist SOPHIA par contenu (contenus.tier & co) : passages Sophia publiés, en vol (réservés 2 jours), restants, mesurés / introuvables / en attente de mesure, m, max et nb >= 150k. Les passages des autres applications ne consomment pas ce budget et n''entrent pas dans m (0270) : voir contenu_application_tier_etat.';

comment on view public.label_application_reserve is
  'Réserve de passages par label × application. Stock : contenus valides du label éligibles pour l''application (Sophia : sauf refus explicite ; autres : éligibilité explicite), avec les passages restants de CETTE application (Sophia : contenu_tier_etat ; autres : contenu_application_tier_etat, 0270). Les réserves de deux applications ne se recouvrent plus. Demande : quota des comptes × part effective de l''application ÷ nombre de leurs labels qui la servent.';

drop view pg_temp._0270_label_reserve_apres;
drop view pg_temp._0270_contenu_a_requalifier_apres;
drop view pg_temp._0270_lar_apres;
drop view pg_temp._0270_cte_apres;
drop view pg_temp._0270_label_application_reserve_avant;
drop view pg_temp._0270_label_reserve_avant;
drop view pg_temp._0270_contenu_a_requalifier_avant;
drop view pg_temp._0270_cte_avant;

notify pgrst, 'reload schema';

reset statement_timeout;
reset lock_timeout;
