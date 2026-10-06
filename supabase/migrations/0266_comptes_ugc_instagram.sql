-- 0266 : comptes du pod 3 « Réactions UGC » — TikTok + Instagram, vidéos uniquement.
--
--   comptes.handle_instagram  : le @ Instagram du compte (stocké sans '@',
--                               comme handle_tiktok).
--   comptes.videos_uniquement : posé à la validation du persona (pods →
--                               deciderPersona). L'assignation slideshow de
--                               minuit saute ces comptes.
--   pod_videos.instagram_url  : le lien du Reel. La vidéo ne passe 'publie'
--                               qu'une fois les DEUX liens posés (TikTok + Reel).
-- Additive.

alter table public.comptes add column handle_instagram text;
alter table public.comptes add column videos_uniquement boolean not null default false;
comment on column public.comptes.videos_uniquement is
  'Compte du pod 3 : ne publie que les vidéos du pod (une par jour, TikTok + Instagram), jamais de slideshow.';

-- Les comptes qui ont déjà un persona validé sont des comptes du pod 3.
update public.comptes c
   set videos_uniquement = true
 where exists (
   select 1 from public.pod_personas p
    where p.compte_id = c.id and p.statut = 'valide'
 );

alter table public.pod_videos add column instagram_url text;

-- Même principe que maj_mon_handle (0116, 0200) : le poster met à jour le @
-- Instagram d'UN de ses comptes, sans ouvrir l'écriture de la table.
create function public.maj_mon_handle_instagram(nouveau text, cible uuid default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.comptes
     set handle_instagram = nullif(trim(both from replace(nouveau, '@', '')), '')
   where poster_id = auth.uid()
     and (
       (cible is null and type_compte = 'perso')
       or id = cible
     );
end;
$$;

grant execute on function public.maj_mon_handle_instagram(text, uuid) to authenticated;

-- Vues de réserve par label (0254, 0256) : un compte « vidéos uniquement » ne
-- tire rien du pool de slideshows, il sort donc de la demande, exactement
-- comme les comptes ugc_ai_video. Définitions recopiées à l'identique, seul le
-- filtre `not co.videos_uniquement` est ajouté.
create or replace view public.label_reserve as
with stock as (
  select
    cl.label_id,
    count(distinct c.id)            as contenus_prets,
    coalesce(sum(e.restants), 0)    as passages_restants
  from public.contenu_labels cl
  join public.contenus c
    on c.id = cl.contenu_id
   and c.statut = 'valide'
   and c.import_statut = 'done'
  join public.contenu_tier_etat e on e.contenu_id = c.id
  group by cl.label_id
),
demande as (
  select
    cl.label_id,
    count(*) as comptes,
    -- Même plafond que le moteur : posts_par_jour est borné à [1, 3] par
    -- compte avant d'être consommé (`listerComptesSousQuota`).
    sum(
      least(3, greatest(1, coalesce(co.posts_par_jour, 1)))::numeric
      / nullif(n.nb_labels, 0)
    ) as demande_jour
  from public.compte_labels cl
  join public.comptes co
    on co.id = cl.compte_id
   and co.is_active
   and coalesce(co.type_compte, '') <> 'cm'
   and coalesce(co.ugc_ai_video, false) = false
   and not co.videos_uniquement
   and co.warmup_ends_at is not null
   and co.warmup_ends_at <= now()
  join lateral (
    select count(*) as nb_labels
    from public.compte_labels x
    where x.compte_id = co.id
  ) n on true
  group by cl.label_id
)
select
  l.id                                  as label_id,
  l.nom,
  l.slug,
  l.application_id,
  coalesce(s.contenus_prets, 0)         as contenus_prets,
  coalesce(s.passages_restants, 0)      as passages_restants,
  coalesce(d.comptes, 0)                as comptes,
  round(coalesce(d.demande_jour, 0), 2) as demande_jour,
  case
    when coalesce(d.demande_jour, 0) > 0
      then round(coalesce(s.passages_restants, 0)::numeric / d.demande_jour, 1)
    else null
  end                                   as reserve_jours
from public.labels l
left join stock s   on s.label_id = l.id
left join demande d on d.label_id = l.id;

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
