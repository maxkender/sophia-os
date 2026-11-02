-- 0621 : Réécriture native, étape 4 · le CTA mesurable (30/10, docs/cta.md).
--
-- A) Les fiches langue passent dans `bleo_fiches` (sorte `langue`), comme
--    décidé par la coordination BLEO le 29/10 (docs/bleo-chantier.md) : c'est
--    déjà la table versionnée des fiches langue et label. Les tables de 0619
--    étaient vides : on les retire.
-- B) `cta_formes` : la forme de chaque CTA publié (une des 7 formes fixes de
--    `_shared/formes_cta.ts`), classée une fois par texte par la fonction
--    `cta-formes` (Gemini). La slide du CTA, elle, est déjà connue : chaque
--    post marque sa slide d'appli (`position_sophia`), 13 458 sur 13 458 sur
--    45 jours. Pas de colonne à ajouter.
-- C) `cta_agregats()` : chaque forme, slide, place et voie de CTA, par label
--    et par appli, comparée À CONTENU ÉGAL : l'écart (en log) de chaque post à
--    la moyenne des posts du même contenu, seulement sur les contenus où la
--    dimension varie (un contenu qui a partout la même forme n'apprend rien).
--    Posts mûrs de la fenêtre de `reglages.bleo.mesure`, hors rappels.
-- D) `cta_stats` : les chiffres et les poids du tirage de chaque lundi ; la
--    fiche label qui les explique va dans `bleo_fiches` (sorte `label`).
-- E) Tâches planifiées : `cta-classer` toutes les 2 minutes tant qu'il reste
--    des CTA à classer, `cta-lundi` le lundi à 05 h 30 UTC.
--
-- Rien ici ne change un post : le tirage lira `cta_stats` à l'étape 5.
--
-- Retour arrière :
--   select cron.unschedule('cta-classer'); select cron.unschedule('cta-lundi');
--   drop function public.cta_agregats(), public.cta_a_faire(), public.cta_avancement();
--   drop view public.cta_a_classer, public.cta_ctas_publies;
--   drop table public.cta_stats, public.cta_formes;

set lock_timeout = '5s';

-- ---------------------------------------------------------------------------
-- A) Fiches langue : dans bleo_fiches
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from public.fiches_langue where btrim(contenu) <> '') then
    insert into public.bleo_fiches (sorte, cle, version, contenu, auteur, created_at)
    select 'langue', f.langue, 1, f.contenu, 'admin', f.updated_at
      from public.fiches_langue f
     where btrim(f.contenu) <> ''
    on conflict do nothing;
  end if;
end;
$$;

drop table if exists public.fiches_langue_versions;
drop table if exists public.fiches_langue;
drop function if exists public.fiches_langue_versionner();

-- ---------------------------------------------------------------------------
-- B) La forme de chaque CTA publié
-- ---------------------------------------------------------------------------
create table if not exists public.cta_formes (
  cta_hash   text primary key,
  forme      text not null check (forme in ('format_du_post', 'avant_apres', 'habitude_perso', 'ce_quils_font',
                                              'mention_breve', 'quand_tu', 'point_liste', 'autre')),
  cta_texte  text not null,
  classe_le  timestamptz not null default now()
);

comment on table public.cta_formes is
  'Forme de chaque texte de CTA publié (0621) : md5 du texte en minuscules, classé une fois par cta-formes (Gemini).';

alter table public.cta_formes enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'cta_formes'
                  and policyname = 'cta_formes admin') then
    create policy "cta_formes admin" on public.cta_formes
      for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
  end if;
end;
$$;
grant select, insert, update, delete on public.cta_formes to authenticated;
grant all on public.cta_formes to service_role;

-- Les posts publiés de la fenêtre BLEO, avec leur slide de CTA et son texte.
create or replace view public.cta_ctas_publies
  with (security_invoker = true)
as
  with reg as (
    select (valeur->'mesure'->>'maturite_heures')::int as maturite_h,
           (valeur->'mesure'->>'mediane_jours')::int as jours
      from public.reglages where cle = 'bleo'
  )
  select p.id as passage_id, p.contenu_id, p.compte_id, p.langue, p.vues, p.publie_at, p.voie_cta,
         coalesce(p.application_id, (select a.id from public.applications a where a.slug = 'sophia')) as application_id,
         jsonb_array_length(p.slides) as nb_slides,
         c.position as slide_cta,
         c.texte as cta_texte,
         md5(lower(btrim(c.texte))) as cta_hash,
         (select coalesce(s2->>'texte_overlay', '') from jsonb_array_elements(p.slides) s2
           where (s2->>'position')::int = c.position - 1 limit 1) as avant,
         p.publie_at <= now() - make_interval(hours => reg.maturite_h) as mur
    from public.passages p
   cross join reg
   cross join lateral (
     select (s->>'position')::int as position, coalesce(s->>'texte_overlay', '') as texte
       from jsonb_array_elements(p.slides) s
      where (s->>'position_sophia')::boolean
      limit 1) c
   where p.statut = 'publie' and not coalesce(p.est_rappel, false)
     and jsonb_typeof(p.slides) = 'array'
     and p.publie_at >= now() - make_interval(days => reg.jours);

comment on view public.cta_ctas_publies is
  'Posts publiés de la fenêtre reglages.bleo.mesure (hors rappels) : slide du CTA (marquée position_sophia), son texte et son hash (0621).';

-- Les textes de CTA pas encore classés (un par texte).
create or replace view public.cta_a_classer
  with (security_invoker = true)
as
  select distinct on (c.cta_hash) c.cta_hash, c.cta_texte, c.avant
    from public.cta_ctas_publies c
   where btrim(c.cta_texte) <> ''
     and not exists (select 1 from public.cta_formes f where f.cta_hash = c.cta_hash)
   order by c.cta_hash, c.publie_at desc;

-- ---------------------------------------------------------------------------
-- C) Les mesures à contenu égal
-- ---------------------------------------------------------------------------
create or replace function public.cta_agregats()
returns table (label text, application_id uuid, dimension text, valeur text, n integer, contenus integer,
               r_med numeric, effet numeric, percee numeric)
language sql
stable
set search_path to 'public'
as $$
  with reg as (
    select coalesce((valeur->'mesure'->>'r_plafond')::numeric, 20) as plafond from reglages where cle = 'bleo'
  ),
  -- Matérialisées : sans ça, le planificateur sous-estime les lignes et recalcule
  -- les médianes des comptes pour chaque post (plus de 60 s au lieu de quelques-unes).
  c as materialized (select * from cta_ctas_publies where mur and vues is not null),
  md as materialized (select compte_id, mediane from bleo_mediane_compte where mediane > 0),
  m as materialized (
    select c.*, least(c.vues / md.mediane, reg.plafond) as r,
           ln(greatest(least(c.vues / md.mediane, reg.plafond), 0.05)) as lr
      from c join md on md.compte_id = c.compte_id cross join reg
  ),
  -- À contenu égal : l'écart du post à la moyenne (en log) des posts du même contenu.
  x as materialized (
    select m.*, m.lr - avg(m.lr) over (partition by m.contenu_id) as rel,
           count(*) over (partition by m.contenu_id) as n_contenu,
           f.forme
      from m left join cta_formes f on f.cta_hash = m.cta_hash
  ),
  d as materialized (
    select x.contenu_id, x.application_id as appli, 'forme' as dim,
           coalesce(x.forme, 'non_classee') as val, x.r, x.rel from x where x.n_contenu >= 2
    union all
    select x.contenu_id, x.application_id, 'slide',
           case when x.slide_cta >= 8 then '8+' else x.slide_cta::text end, x.r, x.rel from x where x.n_contenu >= 2
    union all
    select x.contenu_id, x.application_id, 'place',
           case when x.slide_cta <= 3 then 'debut'
                when x.slide_cta = x.nb_slides then 'derniere'
                when x.slide_cta = x.nb_slides - 1 then 'avant_derniere'
                else 'milieu' end, x.r, x.rel from x where x.n_contenu >= 2
    union all
    select x.contenu_id, x.application_id, 'voie', coalesce(x.voie_cta, 'aucune'), x.r, x.rel from x where x.n_contenu >= 2
  ),
  -- Un contenu n'apprend quelque chose sur une dimension que si elle y varie.
  dv as (
    select d.dim, d.contenu_id from d group by d.dim, d.contenu_id having count(distinct d.val) >= 2
  ),
  dl as (
    select l.nom as lab, d.* from d
      join dv on dv.dim = d.dim and dv.contenu_id = d.contenu_id
      join contenu_labels cl on cl.contenu_id = d.contenu_id
      join labels l on l.id = cl.label_id
    union all
    select '*' as lab, d.* from d
      join dv on dv.dim = d.dim and dv.contenu_id = d.contenu_id
  )
  select dl.lab, dl.appli, dl.dim, dl.val, count(*)::int, count(distinct dl.contenu_id)::int,
         round(percentile_cont(0.5) within group (order by dl.r)::numeric, 3),
         round(exp(avg(dl.rel))::numeric, 3),
         round(avg((dl.r >= 3)::int)::numeric, 3)
    from dl
   group by dl.lab, dl.appli, dl.dim, dl.val;
$$;

comment on function public.cta_agregats() is
  'CTA par label et par appli (label * = tous) : forme, slide, place et voie, sur les contenus où elle varie. effet = moyenne géométrique de r ÷ celle des autres posts du même contenu (1,08 = +8 %) ; percee = part de r ≥ 3 (0621).';

-- Reste-t-il des CTA à classer ? La tâche planifiée n'appelle la fonction que si oui.
create or replace function public.cta_a_faire()
returns boolean
language sql
stable
set search_path to 'public'
as $$ select exists (select 1 from cta_a_classer) $$;

-- L'avancement du classement, pour l'écran.
create or replace function public.cta_avancement()
returns jsonb
language sql
stable
set search_path to 'public'
as $$
  select jsonb_build_object(
    'a_classer', (select count(*) from cta_a_classer),
    'classes', (select count(distinct c.cta_hash) from cta_ctas_publies c
                  join cta_formes f on f.cta_hash = c.cta_hash));
$$;

revoke all on function public.cta_agregats(), public.cta_a_faire(), public.cta_avancement() from public, anon;
grant execute on function public.cta_agregats(), public.cta_a_faire(), public.cta_avancement() to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- D) Les chiffres et les poids de chaque lundi
-- ---------------------------------------------------------------------------
create table if not exists public.cta_stats (
  semaine         date not null,
  label           text not null,
  application_id  uuid not null references public.applications (id) on delete cascade,
  dimension       text not null check (dimension in ('forme', 'slide', 'place', 'voie')),
  valeur          text not null,
  n               integer not null,
  contenus        integer,
  r_med           numeric,
  effet           numeric,
  percee          numeric,
  statut          text check (statut in ('prouvee', 'essai', 'a_eviter')),
  poids           numeric,
  primary key (semaine, label, application_id, dimension, valeur)
);

comment on table public.cta_stats is
  'CTA, chaque lundi (0621) : chiffres par label, appli et dimension ; pour les formes, statut et poids du tirage (lu à l''étape 5).';

alter table public.cta_stats enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'cta_stats'
                  and policyname = 'cta_stats admin') then
    create policy "cta_stats admin" on public.cta_stats
      for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
  end if;
end;
$$;
grant select, insert, update, delete on public.cta_stats to authenticated;
grant all on public.cta_stats to service_role;

-- ---------------------------------------------------------------------------
-- E) Tâches planifiées
-- ---------------------------------------------------------------------------
do $cron$
declare
  template text;
  base text;
  classer text;
  lundi text;
begin
  if exists (select 1 from cron.job where jobname = 'cta-classer') then
    perform cron.unschedule('cta-classer');
  end if;
  if exists (select 1 from cron.job where jobname = 'cta-lundi') then
    perform cron.unschedule('cta-lundi');
  end if;
  -- L'URL et l'en-tête x-cron-secret d'un cron existant, sans jamais écrire le
  -- secret ici (comme 0373).
  select c.command into template
    from cron.job c
   where position('x-cron-secret' in c.command) > 0
     and position('functions/v1/' in c.command) > 0
   order by case when c.jobname = 'recrues-check' then 0 when c.jobname = 'upwork-verifier' then 1 else 2 end
   limit 1;
  if template is null then
    raise notice 'cta : aucun cron modèle avec secret, à planifier à la main';
    return;
  end if;
  base := regexp_replace(template, 'functions/v1/[a-z0-9-]+', 'functions/v1/cta-formes', 'i');
  classer := regexp_replace(base, 'body\s*:=\s*''[^'']*''::jsonb', 'body := ''{"classer":{}}''::jsonb', 'i');
  -- Sans CTA à classer, aucun appel.
  classer := regexp_replace(classer, ';\s*$', '') || ' where public.cta_a_faire();';
  lundi := regexp_replace(base, 'body\s*:=\s*''[^'']*''::jsonb', 'body := ''{"lundi":{}}''::jsonb', 'i');
  if position('"classer"' in classer) = 0 or position('"lundi"' in lundi) = 0
     or position('functions/v1/cta-formes' in classer) = 0 then
    raise notice 'cta : réécriture de la commande échouée';
    return;
  end if;
  perform cron.schedule('cta-classer', '*/2 * * * *', classer);
  -- 05 h 30 UTC : 06 h 30 à Paris l'hiver, 07 h 30 l'été, après le calcul BLEO du lundi.
  perform cron.schedule('cta-lundi', '30 5 * * 1', lundi);
end
$cron$;

notify pgrst, 'reload schema';
