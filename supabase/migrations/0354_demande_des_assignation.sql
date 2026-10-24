-- 0354 : un compte consomme le stock de son label DÈS SON ASSIGNATION.
--
-- Décision d'Adrien du 24/10. La demande d'un label (posts par jour que ses
-- comptes vont consommer) ne comptait que les comptes sortis de warmup
-- (`warmup_ends_at <= now()`). Un compte créé aujourd'hui, ou encore en
-- warmup, n'existait pas pour la réserve : le 24/10, 61 comptes actifs sur la
-- flotte étaient invisibles (30 sans warmup démarré, 31 en warmup).
-- Conséquence : la réserve en jours était trop optimiste (alpha_male 33 jours
-- sur le papier, 19 en réalité ; RH 5,3 au lieu de 4,5), et le moteur pouvait
-- donner plusieurs comptes de suite à un label qui n'aurait pas de quoi les
-- nourrir à la sortie de leur warmup.
--
-- Maintenant tout compte actif compte, warmup ou non. Seuls les filtres de
-- fond restent : actif, pas un compte CM, pas un compte UGC vidéo, pas un
-- compte « vidéos uniquement ». Les deux vues gardent exactement leurs
-- colonnes (create or replace) ; tout ce qui les lit suit : le choix de
-- label (stats_choix_label), la page Répartition (simulation_repartition), le
-- runway des podz (pods_tableau), les badges de réserve.
--
-- Retour arrière : réappliquer les vues avec le filtre
-- `co.warmup_ends_at IS NOT NULL AND co.warmup_ends_at <= now()`.

create or replace view public.label_reserve as
with stock as (
  select cl.label_id,
    count(distinct c.id) as contenus_prets,
    coalesce(sum(e.restants), 0::numeric) as passages_restants
  from contenu_labels cl
    join contenus c on c.id = cl.contenu_id and c.statut = 'valide'::contenu_statut and c.import_statut = 'done'::text
    join contenu_tier_etat e on e.contenu_id = c.id
  group by cl.label_id
), demande as (
  select cl.label_id,
    count(*) as comptes,
    sum(least(3, greatest(1, coalesce(co.posts_par_jour, 1)))::numeric / nullif(n.nb_labels, 0)::numeric) as demande_jour
  from compte_labels cl
    -- 0354 : plus de filtre de warmup, le compte compte dès son assignation.
    join comptes co on co.id = cl.compte_id and co.is_active and coalesce(co.type_compte, ''::text) <> 'cm'::text
      and coalesce(co.ugc_ai_video, false) = false and not co.videos_uniquement
    join lateral (
      select count(*) as nb_labels
      from compte_labels x
      where x.compte_id = co.id
    ) n on true
  group by cl.label_id
)
select l.id as label_id,
  l.nom,
  l.slug,
  l.application_id,
  coalesce(s.contenus_prets, 0::bigint) as contenus_prets,
  coalesce(s.passages_restants, 0::numeric) as passages_restants,
  coalesce(d.comptes, 0::bigint) as comptes,
  round(coalesce(d.demande_jour, 0::numeric), 2) as demande_jour,
  case
    when coalesce(d.demande_jour, 0::numeric) > 0::numeric then round(coalesce(s.passages_restants, 0::numeric) / d.demande_jour, 1)
    else null::numeric
  end as reserve_jours
from labels l
  left join stock s on s.label_id = l.id
  left join demande d on d.label_id = l.id;

create or replace view public.label_application_reserve as
with liens as (
  select l_1.id as label_id,
    la.application_id
  from labels l_1
    join label_applications la on la.label_id = l_1.id
  where lower(trim(both from l_1.slug)) <> all (array['hook'::text, 'ugc-ai-video'::text])
), stock as (
  select li_1.label_id,
    li_1.application_id,
    count(distinct c.id) as contenus_prets,
    coalesce(sum(e.restants), 0::numeric) as passages_restants
  from liens li_1
    join contenu_labels cl on cl.label_id = li_1.label_id
    join contenus c on c.id = cl.contenu_id and c.statut = 'valide'::contenu_statut and c.import_statut = 'done'::text
    join contenu_tier_etat e on e.contenu_id = c.id
    left join contenu_pertinences cp on cp.contenu_id = c.id and cp.application_id = li_1.application_id
  where li_1.application_id = application_id_sophia() and coalesce(cp.eligible, true)
  group by li_1.label_id, li_1.application_id
  union all
  select li_1.label_id,
    li_1.application_id,
    count(distinct c.id) as contenus_prets,
    coalesce(sum(ea.restants), 0::numeric) as passages_restants
  from liens li_1
    join contenu_labels cl on cl.label_id = li_1.label_id
    join contenus c on c.id = cl.contenu_id and c.statut = 'valide'::contenu_statut and c.import_statut = 'done'::text
    join contenu_application_tier_etat ea on ea.contenu_id = c.id and ea.application_id = li_1.application_id
  where li_1.application_id <> application_id_sophia() and ea.eligible
  group by li_1.label_id, li_1.application_id
), comptes_ok as (
  select co.id,
    co.poster_id,
    co.compte_reference_id,
    co.langue,
    co.persona_nom,
    co.persona_bio,
    co.avatar_url,
    co.avatar_source,
    co.handle_tiktok,
    co.style_profile,
    co.demarre_le,
    co.is_active,
    co.created_at,
    co.repartition,
    co.posts_par_jour,
    co.warmup_started_at,
    co.warmup_ends_at,
    co.ugc_ai,
    co.ugc_persona_id,
    co.ugc_ai_video,
    co.type_compte,
    co.application_id,
    co.classement,
    co.classement_calcule,
    co.classement_verrou,
    co.classement_maj_at,
    co.classement_rapport,
    co.surveillance_skip_jusqu,
    co.non_renouveler,
    co.non_renouveler_at,
    co.non_renouveler_par,
    co.non_renouveler_hm_demande,
    co.non_renouveler_hm_demande_at,
    co.parts_applications,
    co.handle_instagram,
    co.videos_uniquement
  from comptes co
  -- 0354 : plus de filtre de warmup, le compte compte dès son assignation.
  where co.is_active and coalesce(co.type_compte, ''::text) <> 'cm'::text and coalesce(co.ugc_ai_video, false) = false
    and not co.videos_uniquement
), compte_apps as (
  select distinct co.id as compte_id,
    li_1.application_id
  from comptes_ok co
    join compte_labels cl on cl.compte_id = co.id
    join liens li_1 on li_1.label_id = cl.label_id
    join applications a_1 on a_1.id = li_1.application_id
  where a_1.actif and (a_1.langues is null or (co.langue = any (a_1.langues))) and (not coalesce(co.ugc_ai, false) or a_1.id = application_id_sophia())
), parts_brutes as (
  select ca.compte_id,
    ca.application_id,
    case
      when co.parts_applications is null then
        case
          when ca.application_id = application_id_sophia() then 100
          else 0
        end::numeric
      else greatest(coalesce((co.parts_applications ->> a_1.slug)::numeric, 0::numeric), 0::numeric)
    end as p
  from compte_apps ca
    join comptes_ok co on co.id = ca.compte_id
    join applications a_1 on a_1.id = ca.application_id
), totaux as (
  select parts_brutes.compte_id,
    sum(parts_brutes.p) as total,
    count(*) as nb,
    bool_or(parts_brutes.application_id = application_id_sophia()) as sophia_ok
  from parts_brutes
  group by parts_brutes.compte_id
), parts as (
  select pb.compte_id,
    pb.application_id,
    case
      when t.total > 0::numeric then pb.p / t.total
      when t.sophia_ok then
        case
          when pb.application_id = application_id_sophia() then 1
          else 0
        end::numeric
      else 1.0 / t.nb::numeric
    end as part
  from parts_brutes pb
    join totaux t on t.compte_id = pb.compte_id
), labels_app_compte as (
  select cl.compte_id,
    li_1.application_id,
    count(*) as nb
  from compte_labels cl
    join liens li_1 on li_1.label_id = cl.label_id
  group by cl.compte_id, li_1.application_id
), demande as (
  select li_1.label_id,
    li_1.application_id,
    count(*) as comptes,
    sum(least(3, greatest(1, coalesce(co.posts_par_jour, 1)))::numeric * pa.part / nullif(lac.nb, 0)::numeric) as demande_jour
  from liens li_1
    join compte_labels cl on cl.label_id = li_1.label_id
    join comptes_ok co on co.id = cl.compte_id
    join parts pa on pa.compte_id = co.id and pa.application_id = li_1.application_id
    join labels_app_compte lac on lac.compte_id = co.id and lac.application_id = li_1.application_id
  where pa.part > 0::numeric
  group by li_1.label_id, li_1.application_id
)
select l.id as label_id,
  l.nom,
  l.slug,
  li.application_id,
  a.slug as application_slug,
  coalesce(s.contenus_prets, 0::bigint) as contenus_prets,
  coalesce(s.passages_restants, 0::numeric) as passages_restants,
  coalesce(d.comptes, 0::bigint) as comptes,
  round(coalesce(d.demande_jour, 0::numeric), 2) as demande_jour,
  case
    when coalesce(d.demande_jour, 0::numeric) > 0::numeric then round(coalesce(s.passages_restants, 0::numeric) / d.demande_jour, 1)
    else null::numeric
  end as reserve_jours
from liens li
  join labels l on l.id = li.label_id
  join applications a on a.id = li.application_id
  left join stock s on s.label_id = li.label_id and s.application_id = li.application_id
  left join demande d on d.label_id = li.label_id and d.application_id = li.application_id;
