-- 0256 : multi-applications par LABEL (Sophia + Unswipe) — étape EXPAND.
--
-- LE MODÈLE. Un compte porte des labels ; un label sert une ou plusieurs
-- applications (avec un « angle » par application, injecté dans les prompts de
-- pertinence et de placement). Les sources et les contenus ne sont plus
-- rattachés à une application : la pertinence se note par contenu × application,
-- le deck placé se stocke par contenu × langue × application, et chaque passage
-- dit quelle application il promeut. L'ELO, la tierlist et le classement restent
-- partagés.
--
-- PUREMENT ADDITIF. Rien n'est supprimé ni renommé ; les colonnes
-- `application_id` existantes restent en place (toujours Sophia) parce que des
-- bundles figés (manage-users, papier-cm), la persona, l'UGC vidéo et le
-- recrutement les lisent encore. Le code actuel continue de tourner à
-- l'identique sur ce schéma : à appliquer AVANT le merge du code multi-app.
--
-- À passer HORS des fenêtres du pipeline nocturne (21:50–23:15 UTC et
-- 03:55–04:15 UTC) : les ALTER sur passages/posts prennent un verrou bref.
--
-- PostgREST : `label_applications` et `contenu_pertinences` (clé composite sur
-- deux FK) créent des relations plusieurs-à-plusieurs labels↔applications et
-- contenus↔applications. Aucun embed ne les emprunte aujourd'hui ; tout futur
-- embed d'`applications` depuis labels, contenus ou passages doit nommer sa FK
-- (`applications!passages_application_id_fkey(...)`). Le partage d'un compte vit
-- volontairement dans une colonne jsonb de `comptes` : une table de jonction
-- comptes↔applications rendrait ambigu l'embed `comptes → applications(slug)`
-- utilisé par la persona (bundle manage-users figé) et la page Posters.

-- ---------------------------------------------------------------------------
-- 1. Applications : langues ciblées + interrupteur
-- ---------------------------------------------------------------------------
alter table public.applications
  add column if not exists langues text[];
alter table public.applications
  add column if not exists actif boolean not null default true;

comment on column public.applications.langues is
  'Langues de compte ciblées par l''application ; NULL = toutes. Un compte dont la langue n''est pas ciblée ne publie jamais pour cette application (sa part est reportée).';
comment on column public.applications.actif is
  'Interrupteur : une application inactive n''est ni notée à l''import ni choisie à l''assignation.';

-- ---------------------------------------------------------------------------
-- 2. Label × application (+ angle)
-- ---------------------------------------------------------------------------
create table if not exists public.label_applications (
  label_id uuid not null references public.labels (id) on delete cascade,
  application_id uuid not null references public.applications (id) on delete cascade,
  angle text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (label_id, application_id)
);

create index if not exists label_applications_application_idx
  on public.label_applications (application_id);

comment on table public.label_applications is
  'Applications servies par chaque label. RÈGLE : un label SANS aucune ligne sert Sophia (héritage) — un backfill oublié ne vide jamais le stock Sophia. angle = consigne injectée dans les prompts de pertinence et de placement de cette application pour les contenus du label.';

alter table public.label_applications enable row level security;

drop policy if exists label_applications_read on public.label_applications;
create policy label_applications_read on public.label_applications
  for select to authenticated using (true);

drop policy if exists label_applications_admin on public.label_applications;
create policy label_applications_admin on public.label_applications
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

grant select, insert, update, delete on public.label_applications to authenticated;
grant all on public.label_applications to service_role;
revoke all on public.label_applications from anon;

-- Chaque label existant sert l'application qui le possède aujourd'hui (Sophia,
-- ou micabo pour study_aes — purgé en 0257). Les labels système (Hook, UGC AI
-- VIDEO) ne servent aucune application.
insert into public.label_applications (label_id, application_id)
select l.id, l.application_id
from public.labels l
where lower(trim(l.slug)) not in ('hook', 'ugc-ai-video')
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- 3. Pertinence par contenu × application
-- ---------------------------------------------------------------------------
create table if not exists public.contenu_pertinences (
  contenu_id uuid not null references public.contenus (id) on delete cascade,
  application_id uuid not null references public.applications (id) on delete cascade,
  score integer not null check (score between 0 and 100),
  raison text,
  -- Note d'import (même formule que la porte ELO) calculée avec CE score.
  note numeric,
  -- Éligible au pool de cette application : note >= seuil d'import (ou import
  -- forcé). Sophia : seule une ligne EXPLICITEMENT non éligible exclut ; pas de
  -- ligne = éligible (stock historique, créations manuelles, variations).
  -- Autres applications : il FAUT une ligne éligible.
  eligible boolean not null default false,
  angles text,
  prompt_cle text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (contenu_id, application_id)
);

create index if not exists contenu_pertinences_application_idx
  on public.contenu_pertinences (application_id, eligible);

comment on table public.contenu_pertinences is
  'Pertinence d''un contenu pour une application. contenus.pertinence_score reste la pertinence de la PORTE d''import (max des applications servies — identique au score Sophia pour un contenu Sophia seul).';

alter table public.contenu_pertinences enable row level security;

drop policy if exists contenu_pertinences_admin on public.contenu_pertinences;
create policy contenu_pertinences_admin on public.contenu_pertinences
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

grant select, insert, update, delete on public.contenu_pertinences to authenticated;
grant all on public.contenu_pertinences to service_role;
revoke all on public.contenu_pertinences from anon;

-- ---------------------------------------------------------------------------
-- 4. Decks placés des applications autres que Sophia
-- ---------------------------------------------------------------------------
-- Le deck Sophia reste où il est (contenu_langues.slides) : on n'y touche pas.
-- Une ligne par (contenu × langue × variante) ; la cascade depuis
-- contenu_langues fait qu'un ré-import ou un forçage ELO remet aussi ces decks à
-- zéro, exactement comme le deck Sophia.
create table if not exists public.contenu_langue_decks (
  id uuid primary key default gen_random_uuid(),
  contenu_langue_id uuid not null references public.contenu_langues (id) on delete cascade,
  contenu_id uuid not null references public.contenus (id) on delete cascade,
  langue text not null,
  application_id uuid not null references public.applications (id) on delete cascade,
  -- Slug de l'application ; phase 2 : 'dual:sophia+unswipe'.
  variante text not null,
  statut text not null check (statut in ('pret', 'echec', 'ineligible')),
  raison text,
  slides jsonb not null default '[]'::jsonb,
  placement jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (contenu_langue_id, variante)
);

create index if not exists contenu_langue_decks_contenu_idx
  on public.contenu_langue_decks (contenu_id, application_id);

comment on table public.contenu_langue_decks is
  'Deck placé d''une application autre que Sophia, par contenu × langue. statut ineligible = ce contenu ne peut pas porter l''application (base polluée par une pub Sophia, etc.) ; echec = placement impossible (prompt manquant, modèle muet). L''assignation se replie alors sur un autre contenu ou sur Sophia.';

alter table public.contenu_langue_decks enable row level security;

drop policy if exists contenu_langue_decks_admin on public.contenu_langue_decks;
create policy contenu_langue_decks_admin on public.contenu_langue_decks
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

grant select, insert, update, delete on public.contenu_langue_decks to authenticated;
grant all on public.contenu_langue_decks to service_role;
revoke all on public.contenu_langue_decks from anon;

comment on column public.contenu_langues.slides_base is
  'Deck de CETTE langue sans aucun placement. Ligne source : OCR brut mis à l''abri avant la pub Sophia. Autres langues : traduction sans pub, écrite par le chemin des applications non-Sophia (base partagée de leurs placements).';

-- ---------------------------------------------------------------------------
-- 5. Application promue par chaque passage / post
-- ---------------------------------------------------------------------------
-- Défaut Sophia : tout l'historique est Sophia, et tout vieux code qui insère
-- sans la colonne reste juste.
alter table public.passages
  add column if not exists application_id uuid not null
    default public.application_id_sophia()
    references public.applications (id);
-- Repli : l'application que la répartition demandait, quand elle n'a pas pu
-- être servie (réserve vide, deck impossible…). NULL = pas de repli.
alter table public.passages
  add column if not exists application_visee_id uuid
    references public.applications (id);
alter table public.passages
  add column if not exists repli_motif text;

create index if not exists passages_replis_idx
  on public.passages (date_publication_prevue)
  where application_visee_id is not null;

comment on column public.passages.application_id is
  'Application promue par ce passage (slide de placement). Source de vérité de la répartition par compte et des stats par application.';
comment on column public.passages.application_visee_id is
  'Application demandée par la répartition quand elle n''a pas pu être servie (repli sur application_id). NULL = pas de repli.';

alter table public.posts
  add column if not exists application_id uuid not null
    default public.application_id_sophia()
    references public.applications (id);

comment on column public.posts.application_id is
  'Copie de passages.application_id au moment de la matérialisation (lecture directe par les pages posteur / admin).';

-- Un posteur peut mettre à jour ses posts/passages (statut, lien publié…) :
-- l'application promue, elle, ne se change qu'en admin ou côté serveur.
create or replace function public.garder_application_id()
returns trigger
language plpgsql
as $$
begin
  if new.application_id is distinct from old.application_id
     and coalesce(auth.role(), '') = 'authenticated'
     and not public.is_admin() then
    raise exception 'APPLICATION_NON_MODIFIABLE';
  end if;
  return new;
end;
$$;

drop trigger if exists passages_garder_application on public.passages;
create trigger passages_garder_application
  before update of application_id on public.passages
  for each row execute function public.garder_application_id();

drop trigger if exists posts_garder_application on public.posts;
create trigger posts_garder_application
  before update of application_id on public.posts
  for each row execute function public.garder_application_id();

-- ---------------------------------------------------------------------------
-- 6. Répartition par compte
-- ---------------------------------------------------------------------------
-- NE PAS confondre avec `comptes.repartition` (ancien mix recycle/remanié/
-- nouveau, toujours édité par CompteEditor).
alter table public.comptes
  add column if not exists parts_applications jsonb;

alter table public.comptes
  drop constraint if exists comptes_parts_applications_objet;
alter table public.comptes
  add constraint comptes_parts_applications_objet
  check (parts_applications is null or jsonb_typeof(parts_applications) = 'object');

comment on column public.comptes.parts_applications is
  'Part de chaque application dans les posts du compte, ex. {"sophia":70,"unswipe":30}. NULL = 100 % Sophia. Restreinte aux applications que les labels du compte servent, actives et ciblant sa langue ; tenue sur une fenêtre glissante de ses derniers posts.';

-- RLS comptes_update_hiring laisse un HM écrire toute colonne de ses comptes :
-- la répartition reste une décision admin.
create or replace function public.garder_parts_applications()
returns trigger
language plpgsql
as $$
begin
  if new.parts_applications is distinct from old.parts_applications
     and coalesce(auth.role(), '') = 'authenticated'
     and not public.is_admin() then
    raise exception 'PARTS_APPLICATIONS_ADMIN';
  end if;
  return new;
end;
$$;

drop trigger if exists comptes_garder_parts_applications on public.comptes;
create trigger comptes_garder_parts_applications
  before update of parts_applications on public.comptes
  for each row execute function public.garder_parts_applications();

-- ---------------------------------------------------------------------------
-- 7. Réserve par label × application
-- ---------------------------------------------------------------------------
-- label_reserve (0254) reste en place telle quelle pour la transition.
-- Les passages restants sont PARTAGÉS entre applications (tierlist commune) :
-- les réserves de deux applications sur un même label se recouvrent.
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

grant select on public.label_application_reserve to authenticated;
grant select on public.label_application_reserve to service_role;
revoke select on public.label_application_reserve from anon;

-- ---------------------------------------------------------------------------
-- 8. Stats posts : colonne application ajoutée EN FIN (create or replace view
--    ne peut qu'ajouter des colonnes à la fin).
-- ---------------------------------------------------------------------------
create or replace view public.stats_posts as
select
  p.id,
  p.compte_id,
  c.persona_nom,
  c.handle_tiktok,
  p.type,
  p.statut,
  p.date_publication_prevue,
  p.publie_at,
  p.publie_url,
  s.titre as sujet_titre,
  m.vues,
  m.likes,
  m.commentaires,
  m.partages,
  m.collecte_at,
  p.application_id
from public.posts p
join public.comptes c on c.id = p.compte_id
left join public.sujets s on s.id = p.sujet_id
left join lateral (
  select post_metrics.vues,
         post_metrics.likes,
         post_metrics.commentaires,
         post_metrics.partages,
         post_metrics.collecte_at
  from public.post_metrics
  where post_metrics.post_id = p.id
  order by post_metrics.collecte_at desc
  limit 1
) m on true
where public.is_admin() or c.poster_id = auth.uid();

notify pgrst, 'reload schema';
