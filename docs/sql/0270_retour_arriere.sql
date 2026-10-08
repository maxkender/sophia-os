-- RETOUR ARRIÈRE de la migration 0270 (tiers par application).
--
-- HORS de supabase/migrations EXPRÈS : un `supabase db reset` ne doit jamais
-- le jouer. À exécuter à la main (SQL Editor, d'un bloc : une transaction),
-- hors des fenêtres nocturnes (21:50–23:15 UTC, 03:55–04:15 UTC).
--
-- PRÉALABLE : désactiver TOUTE application non-Sophia (Pilotage → carte
-- Applications). Sans les vues par application, le code ne sert plus aucune
-- autre application (sa sonde 0270 répond « absent »). Le script refuse sinon.
--
-- Ce qu'il fait, dans l'ordre :
--   1. remet `label_application_reserve` telle que 0266 l'a définie (copie à
--      l'identique), avec son commentaire d'origine (0256) — elle cesse de
--      dépendre des vues par application ;
--   2. supprime les deux vues par application.
--
-- Ce qu'il NE fait PAS, exprès : remettre `contenu_tier_etat` sans son filtre
-- Sophia (0247). Le filtre `application_id = Sophia` est NEUTRE tant qu'aucun
-- passage non-Sophia n'existe (résultats identiques, prouvé par 0270b) et
-- PROTÈGE Sophia dès qu'il en existe un : sans lui, les passages Unswipe
-- reviendraient dans les restants, le `m` et les cycles terminés de Sophia —
-- le budget fusionné que le propriétaire a refusé (« un post Unswipe ne
-- consomme jamais le budget Sophia »). Le garder rend aussi le retour arrière
-- rattrapable : réappliquer ensuite la partie B de 0270 compare une
-- contenu_tier_etat filtrée à elle-même, et sa preuve passe même avec des
-- passages non-Sophia en base (testé : 30 passages non-Sophia, retour
-- arrière, puis B rejouée sans écart).
--
-- CONSÉQUENCE pour un CODE revenu en arrière (antérieur à 0270) : il lit
-- contenu_tier_etat filtrée pour la réserve d'une autre application, donc
-- sans décompter ses passages. Ne JAMAIS réactiver une application non-Sophia
-- avec un tel code.
--
-- La table `contenu_tiers_application` et les deux fonctions restent : les
-- supprimer PERD les tiers des autres applications (voir la fin, en
-- commentaire).

set lock_timeout = '2s';

do $garde_retour$
begin
  if exists (
    select 1 from public.applications
    where actif and id <> '00000000-0000-4000-8000-000000000001'::uuid
  ) then
    raise exception 'retour arrière 0270 : désactiver d''abord toute application non-Sophia';
  end if;
end
$garde_retour$;

-- 1. label_application_reserve — 0266 à l'identique.
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
  where (li.application_id = public.application_id_sophia() and coalesce(cp.eligible, true))
     or (li.application_id <> public.application_id_sophia() and coalesce(cp.eligible, false))
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
  'Réserve de passages par label × application. Stock : contenus valides du label éligibles pour l''application (Sophia : sauf refus explicite ; autres : éligibilité explicite). Demande : quota des comptes × part effective de l''application ÷ nombre de leurs labels qui la servent. Les passages restants sont partagés entre applications : les réserves se recouvrent.';

-- 2. Vues par application.
drop view public.contenu_application_a_requalifier;
drop view public.contenu_application_tier_etat;

-- contenu_tier_etat : INCHANGÉE (filtre Sophia gardé, voir l'en-tête).

-- 3. FACULTATIF, et IRRÉVERSIBLE : perd les tiers, budgets et cycles des
--    applications non-Sophia. À ne décommenter que sur décision explicite.
-- drop table public.contenu_tiers_application;
-- drop function public.passages_du_tier(text);
-- drop function public.tier_initial_note(numeric);

notify pgrst, 'reload schema';

reset lock_timeout;
