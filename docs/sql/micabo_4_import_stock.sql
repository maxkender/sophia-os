-- Migration micabo → Sophia, étape 4 : STOCK d'une ou plusieurs sources.
--
-- Où : base Sophia (mbikecieskoobeizixig), après dépôt des lots dans
-- `migration_micabo.lots` par la fonction temporaire `reprise-micabo` :
-- `<cle>_contenus` (source, label cible, contenus, langues, médias) et
-- `<cle>_passages` (passages publiés, hors posts de test).
-- Une seule transaction : tout ou rien. Refuse de tourner si un contenu, un
-- média ou une source existe déjà.
--
-- Décisions (2026-10-09 / 10) :
--  - la source est recréée (même id, même état actif) et porte le label cible ;
--    le trigger de Sophia propage ce label à ses contenus et à leurs images ;
--  - contenus validés seulement, même id, rang SOPHIA neutre (D / 0, comme un
--    import « hors Sophia ») ; pertinence micabo éligible quelle que soit la
--    note ; tier micabo ET cycle micabo en cours conservés
--    (`contenu_tiers_application`, cycle 1 = cycle micabo en cours) ;
--  - decks : un deck micabo est servi tel quel (variante `micabo`, `pret`) s'il
--    cite micabo sur UNE slide hors couverture, marquée slide pub. Une autre
--    slide qui cite micabo entre parenthèses perd la parenthèse ; s'il en reste
--    une mention, ou si la slide pub ne cite pas micabo, le deck est
--    `ineligible`. Un deck source sans pub ni mention est une base propre :
--    Sophia cuira les langues manquantes. Sinon les langues micabo manquantes
--    (fr / tr / de / es) sont `ineligible` ;
--  - passages publiés recopiés (application micabo, cycle 1 s'ils sont du
--    cycle micabo en cours, reposts bonus → rappels hors cycle), puis passés
--    `resolu` : aucune file Apify ;
--  - images : lignes `media_library` sous `micabo/<chemin>` + file de copie
--    `migration_micabo.images` (la fonction copie les fichiers ensuite).

begin;

create or replace function pg_temp.cite_micabo(t text) returns boolean
language sql immutable as $$ select coalesce(t, '') ~* 'micabo' $$;

-- Deck micabo normalisé : {statut: pret | double_mention | sans_mention, slides, pub}.
create or replace function pg_temp.deck_micabo(deck jsonb) returns jsonb
language plpgsql as $$
declare
  pub int;
  s jsonb;
  sortie jsonb := '[]'::jsonb;
  t text;
  reste int;
begin
  select min((x ->> 'position')::int) into pub
  from jsonb_array_elements(deck) x
  where (x ->> 'position')::int >= 2 and pg_temp.cite_micabo(x ->> 'texte_overlay');
  if pub is null then
    return jsonb_build_object('statut', 'sans_mention');
  end if;
  for s in select x from jsonb_array_elements(deck) x order by (x ->> 'position')::int loop
    t := s ->> 'texte_overlay';
    if (s ->> 'position')::int <> pub and pg_temp.cite_micabo(t) then
      t := regexp_replace(t, '\s*\([^()]*micabo[^()]*\)', '', 'gi');
    end if;
    sortie := sortie || jsonb_build_array(
      (s - 'concurrent_laisse')
      || jsonb_build_object('texte_overlay', t, 'position_sophia', (s ->> 'position')::int = pub));
  end loop;
  select count(*) into reste from jsonb_array_elements(sortie) x
  where not (x ->> 'position_sophia')::boolean and pg_temp.cite_micabo(x ->> 'texte_overlay');
  if reste > 0 then
    return jsonb_build_object('statut', 'double_mention');
  end if;
  return jsonb_build_object('statut', 'pret', 'slides', sortie, 'pub', pub);
end $$;

-- Le deck sans sa slide pub (texte vidé, plus de marque) : la case « Sophia ».
create or replace function pg_temp.sans_pub(deck jsonb, pub int) returns jsonb
language sql immutable as $$
  select coalesce(jsonb_agg(
    x || jsonb_build_object(
      'texte_overlay', case when (x ->> 'position')::int = pub then '' else x ->> 'texte_overlay' end,
      'position_sophia', false)
    order by (x ->> 'position')::int), '[]'::jsonb)
  from jsonb_array_elements(deck) x
$$;

-- Lots déposés -----------------------------------------------------------------
create temp table t_lots on commit drop as
select l.lot, l.donnees from migration_micabo.lots l where l.lot like '%\_contenus';

create temp table t_sources on commit drop as
select (l.donnees -> 'source' ->> 'id')::uuid as id,
       l.donnees -> 'source' as s,
       l.donnees ->> 'label_cible' as label_cible
from t_lots l;

create temp table t_contenus on commit drop as
select (c ->> 'id')::uuid as id, c, (l.donnees -> 'source' ->> 'id')::uuid as source_id
from t_lots l, jsonb_array_elements(l.donnees -> 'contenus') c;

create temp table t_medias on commit drop as
select distinct on ((m ->> 'id')::uuid) (m ->> 'id')::uuid as id, m
from t_lots l, jsonb_array_elements(l.donnees -> 'medias') m;

create temp table t_passages on commit drop as
select (p ->> 'id')::uuid as id, p
from migration_micabo.lots l, jsonb_array_elements(l.donnees -> 'passages') p
where l.lot like '%\_passages';

-- Garde-fous -------------------------------------------------------------------
do $garde$
declare n int;
begin
  if (select count(*) from t_sources) = 0 then raise exception 'aucun lot de contenus déposé'; end if;
  select count(*) into n from t_sources s left join public.labels l on l.slug = s.label_cible where l.id is null;
  if n > 0 then raise exception '% label(s) cible introuvable(s)', n; end if;
  if not exists (select 1 from public.applications where id = '00000000-0000-4000-8000-000000000002') then
    raise exception 'application micabo absente';
  end if;
  select count(*) into n from public.comptes_reference r join t_sources s
    on r.id = s.id or lower(r.handle_tiktok) = lower(s.s ->> 'handle_tiktok');
  if n > 0 then raise exception '% source(s) déjà dans Sophia', n; end if;
  select count(*) into n from public.contenus c join t_contenus t
    on c.id = t.id or (c.source_url is not null and c.source_url = t.c ->> 'source_url');
  if n > 0 then raise exception '% contenu(s) déjà dans Sophia', n; end if;
  select count(*) into n from public.media_library m join t_medias t
    on m.id = t.id or m.storage_path = 'micabo/' || (t.m ->> 'storage_path');
  if n > 0 then raise exception '% média(s) déjà dans Sophia', n; end if;
end
$garde$;

-- 1. Sources (labels posés en dernier, pour que la propagation voie tout) -------
insert into public.comptes_reference (
  id, handle_tiktok, niche, langue, is_active, dernier_scrape_at, created_at,
  style_profile, bio, avatar_url, avatar_media_id, genre, parent_id,
  ordre_assignation, ordre_par_langue
)
select s.id, s.s ->> 'handle_tiktok', s.s ->> 'niche', coalesce(s.s ->> 'langue', 'fr'),
  coalesce((s.s ->> 'is_active')::boolean, true), (s.s ->> 'dernier_scrape_at')::timestamptz,
  coalesce((s.s ->> 'created_at')::timestamptz, now()),
  s.s ->> 'style_profile', s.s ->> 'bio', s.s ->> 'avatar_url', null, s.s ->> 'genre', null,
  (s.s ->> 'ordre_assignation')::int, s.s -> 'ordre_par_langue'
from t_sources s;

-- 2. Contenus (rang Sophia neutre) ---------------------------------------------
insert into public.contenus (
  id, titre, structure_slides, compte_reference_id, sujet_id, source_url, langue_source,
  musique_url, musique_titre, musique_plateforme, vues_source, pertinence_score,
  pertinence_raison, statut, import_statut, parent_id, profondeur, created_at,
  import_tentatives, variation_langue, import_elo_rapport, import_elo_force_seuil,
  ugc_compatible, creation_mode, hook_contenu_id
)
select t.id, coalesce(t.c ->> 'titre', ''), coalesce(t.c -> 'structure_slides', '[]'::jsonb),
  t.source_id, null, t.c ->> 'source_url', coalesce(t.c ->> 'langue_source', 'fr'),
  t.c ->> 'musique_url', t.c ->> 'musique_titre', t.c ->> 'musique_plateforme',
  (t.c ->> 'vues_source')::int, (t.c ->> 'pertinence_score')::int, t.c ->> 'pertinence_raison',
  'valide', 'done', (t.c ->> 'parent_id')::uuid, coalesce((t.c ->> 'profondeur')::int, 0),
  coalesce((t.c ->> 'created_at')::timestamptz, now()), coalesce((t.c ->> 'import_tentatives')::int, 0),
  t.c ->> 'variation_langue', t.c -> 'import_elo_rapport',
  coalesce((t.c ->> 'import_elo_force_seuil')::boolean, false),
  coalesce((t.c ->> 'ugc_compatible')::boolean, false),
  case when t.c ->> 'creation_mode' = 'manuel' then 'manuel' else 'import' end,
  (t.c ->> 'hook_contenu_id')::uuid
from t_contenus t;

-- 3. Médias + file de copie ----------------------------------------------------
insert into public.media_library (
  id, compte_id, compte_reference_id, storage_path, url, source, tags, langue,
  visage_identifiable, used_count, created_at, verifie_le, texte_restant, contenu_id,
  upscale_le, visage_premier_plan, ugc_face_regen, caption, caption_statut,
  caption_modele, caption_le, est_hook
)
select t.id, null,
  case when (t.m ->> 'compte_reference_id')::uuid in (select id from t_sources)
       then (t.m ->> 'compte_reference_id')::uuid end,
  'micabo/' || (t.m ->> 'storage_path'),
  'https://mbikecieskoobeizixig.supabase.co/storage/v1/object/public/medias/micabo/' || (t.m ->> 'storage_path'),
  coalesce(t.m ->> 'source', 'nettoye_reference')::public.media_source,
  coalesce((select array_agg(x) from jsonb_array_elements_text(t.m -> 'tags') x), '{}'),
  t.m ->> 'langue', (t.m ->> 'visage_identifiable')::boolean,
  coalesce((t.m ->> 'used_count')::int, 0), coalesce((t.m ->> 'created_at')::timestamptz, now()),
  (t.m ->> 'verifie_le')::timestamptz, coalesce((t.m ->> 'texte_restant')::boolean, false),
  case when (t.m ->> 'contenu_id')::uuid in (select id from t_contenus) then (t.m ->> 'contenu_id')::uuid end,
  (t.m ->> 'upscale_le')::timestamptz, (t.m ->> 'visage_premier_plan')::boolean,
  coalesce((t.m ->> 'ugc_face_regen')::boolean, false), t.m ->> 'caption',
  t.m ->> 'caption_statut', t.m ->> 'caption_modele', (t.m ->> 'caption_le')::timestamptz,
  coalesce((t.m ->> 'est_hook')::boolean, false)
from t_medias t;

insert into migration_micabo.images (media_id, url_source, storage_path)
select t.id,
  'https://qkmiwnmiwsvwkttldqgb.supabase.co/storage/v1/object/public/medias/' || (t.m ->> 'storage_path'),
  'micabo/' || (t.m ->> 'storage_path')
from t_medias t
on conflict (media_id) do nothing;

-- 4. Langues et decks ----------------------------------------------------------
-- Classement de chaque ligne calculé à la création : le connecteur Supabase
-- bloque tout UPDATE sans WHERE.
create temp table t_langues on commit drop as
select g.*, case
    when jsonb_array_length(g.slides) = 0 then 'vide'
    when g.d ->> 'statut' = 'pret' then 'pret'
    when g.d ->> 'statut' = 'double_mention' then 'double_mention'
    when g.marque then 'pub_sans_micabo'
    else 'propre' end as verdict
from (
  select (cl ->> 'id')::uuid as id, (cl ->> 'contenu_id')::uuid as contenu_id, cl ->> 'langue' as langue,
    coalesce(cl -> 'slides', '[]'::jsonb) as slides, cl,
    (cl ->> 'langue') = (t.c ->> 'langue_source') as est_source,
    exists (select 1 from jsonb_array_elements(coalesce(cl -> 'slides', '[]'::jsonb)) x
            where (x ->> 'position_sophia')::boolean) as marque,
    pg_temp.deck_micabo(coalesce(cl -> 'slides', '[]'::jsonb)) as d
  from t_lots l, jsonb_array_elements(l.donnees -> 'langues') cl
  join t_contenus t on t.id = (cl ->> 'contenu_id')::uuid
) g;

insert into public.contenu_langues (
  id, contenu_id, langue, slides, slides_base, score, nb_passages, score_maj_at, created_at, hashtags
)
select g.id, g.contenu_id, g.langue,
  case
    when not g.est_source then '[]'::jsonb
    when g.verdict = 'pret' then pg_temp.sans_pub(g.d -> 'slides', (g.d ->> 'pub')::int)
    when g.verdict = 'pub_sans_micabo' then pg_temp.sans_pub(g.slides,
      (select min((x ->> 'position')::int) from jsonb_array_elements(g.slides) x where (x ->> 'position_sophia')::boolean))
    else g.slides end,
  case when not g.est_source and g.verdict = 'propre' then g.slides end,
  coalesce((g.cl ->> 'score')::float8, 50), coalesce((g.cl ->> 'nb_passages')::int, 0),
  (g.cl ->> 'score_maj_at')::timestamptz, coalesce((g.cl ->> 'created_at')::timestamptz, now()),
  g.cl ->> 'hashtags'
from t_langues g;

insert into public.contenu_langue_decks (contenu_langue_id, contenu_id, langue, application_id, variante, statut, raison, slides, placement)
select g.id, g.contenu_id, g.langue, '00000000-0000-4000-8000-000000000002', 'micabo',
  case when g.verdict = 'pret' then 'pret' else 'ineligible' end,
  case g.verdict
    when 'pret' then null
    when 'double_mention' then 'reprise micabo-os : micabo cité sur deux slides'
    when 'pub_sans_micabo' then 'reprise micabo-os : slide pub sans mention micabo' end,
  case when g.verdict = 'pret' then g.d -> 'slides' else '[]'::jsonb end,
  case when g.verdict = 'pret'
    then jsonb_build_object('source', 'reprise micabo-os', 'position', (g.d ->> 'pub')::int) end
from t_langues g
where g.verdict in ('pret', 'double_mention', 'pub_sans_micabo');

-- Langues micabo sans deck servable, sur un contenu dont la base n'est pas propre.
create temp table t_manquantes on commit drop as
select t.id as contenu_id, lg.langue
from t_contenus t
cross join (values ('fr'), ('tr'), ('de'), ('es')) lg(langue)
where not exists (select 1 from t_langues g where g.contenu_id = t.id and g.est_source and g.verdict = 'propre')
  and not exists (select 1 from t_langues g where g.contenu_id = t.id and g.langue = lg.langue
                  and g.verdict in ('pret', 'double_mention', 'pub_sans_micabo', 'propre'));

insert into public.contenu_langues (contenu_id, langue, slides)
select m.contenu_id, m.langue, '[]'::jsonb from t_manquantes m
on conflict (contenu_id, langue) do nothing;

insert into public.contenu_langue_decks (contenu_langue_id, contenu_id, langue, application_id, variante, statut, raison, slides)
select cl.id, m.contenu_id, m.langue, '00000000-0000-4000-8000-000000000002', 'micabo', 'ineligible',
  'reprise micabo-os : pas de deck micabo dans cette langue, base non propre', '[]'::jsonb
from t_manquantes m
join public.contenu_langues cl on cl.contenu_id = m.contenu_id and cl.langue = m.langue
on conflict (contenu_langue_id, variante) do nothing;

-- 5. Pertinence et tiers micabo ------------------------------------------------
insert into public.contenu_pertinences (contenu_id, application_id, score, raison, note, eligible, prompt_cle)
select t.id, '00000000-0000-4000-8000-000000000002',
  greatest(0, least(100, coalesce((t.c ->> 'pertinence_score')::int, 0))),
  t.c ->> 'pertinence_raison', (t.c ->> 'tier_note_import')::numeric, true, 'pertinence_micabo'
from t_contenus t;

insert into public.contenu_tiers_application (contenu_id, application_id, tier, passages_prevus, tier_cycle, tier_maj_at, tier_rapport)
select t.id, '00000000-0000-4000-8000-000000000002',
  coalesce(nullif(t.c ->> 'tier', ''), 'C'),
  greatest(0, coalesce((t.c ->> 'passages_cible')::int, 0)),
  1,
  (t.c ->> 'tier_maj_at')::timestamptz,
  jsonb_build_object('reprise', 'micabo-os', 'le', now(), 'tier_micabo', t.c ->> 'tier',
    'passages_cible_micabo', t.c ->> 'passages_cible', 'tier_maj_at_micabo', t.c ->> 'tier_maj_at')
from t_contenus t;

-- 6. Passages publiés ----------------------------------------------------------
create temp table t_passages_ok on commit drop as
select tp.id, tp.p, t.c
from t_passages tp
join t_contenus t on t.id = (tp.p ->> 'contenu_id')::uuid
where exists (select 1 from public.comptes k where k.id = (tp.p ->> 'compte_id')::uuid);

insert into public.passages (
  id, contenu_id, compte_id, langue, date_publication_prevue, statut, slides,
  musique_url, musique_titre, musique_plateforme, hashtags, publie_at, publie_url,
  vues, likes, commentaires, partages, stats_maj_at, post_id, created_at, elo_maj_at,
  visuels_resolution, tier_cycle, est_rappel, rappel_rang, application_id
)
select x.id, (x.p ->> 'contenu_id')::uuid, (x.p ->> 'compte_id')::uuid, x.p ->> 'langue',
  (x.p ->> 'date_publication_prevue')::date, 'publie', coalesce(x.p -> 'slides', '[]'::jsonb),
  x.p ->> 'musique_url', x.p ->> 'musique_titre', x.p ->> 'musique_plateforme', x.p ->> 'hashtags',
  (x.p ->> 'publie_at')::timestamptz, x.p ->> 'publie_url',
  (x.p ->> 'vues')::int, (x.p ->> 'likes')::int, (x.p ->> 'commentaires')::int, (x.p ->> 'partages')::int,
  (x.p ->> 'stats_maj_at')::timestamptz, null,
  coalesce((x.p ->> 'created_at')::timestamptz, now()), (x.p ->> 'elo_maj_at')::timestamptz,
  x.p -> 'visuels_resolution',
  case when not coalesce((x.p ->> 'bonus_repost')::boolean, false)
        and (x.c ->> 'tier_maj_at') is not null
        and (x.p ->> 'created_at')::timestamptz >= (x.c ->> 'tier_maj_at')::timestamptz
       then 1 else 0 end,
  coalesce((x.p ->> 'bonus_repost')::boolean, false),
  case when coalesce((x.p ->> 'bonus_repost')::boolean, false) then 1 else 0 end,
  '00000000-0000-4000-8000-000000000002'
from t_passages_ok x;

-- Le trigger de résolution vient de les mettre en file Apify : déjà mesurés.
update public.passages p
set resolution_statut = 'resolu', resolution_tentatives = 0, resolution_prochaine_at = null,
    resolution_at = coalesce(p.stats_maj_at, p.publie_at, now()),
    resolution_detail = 'reprise micabo-os'
from t_passages_ok x
where p.id = x.id;

-- 7. Labels : posés sur la source, propagés aux contenus et images par trigger.
insert into public.compte_reference_labels (compte_reference_id, label_id)
select s.id, l.id from t_sources s join public.labels l on l.slug = s.label_cible
on conflict do nothing;

commit;

-- Bilan.
select
  (select count(*) from public.comptes_reference r where r.id in (select (l.donnees -> 'source' ->> 'id')::uuid from migration_micabo.lots l where l.lot like '%\_contenus')) as sources,
  (select count(*) from public.contenus c join migration_micabo.lots l on l.lot like '%\_contenus'
     and c.compte_reference_id = (l.donnees -> 'source' ->> 'id')::uuid) as contenus,
  (select count(*) from migration_micabo.images) as images_en_file,
  (select json_object_agg(statut, n) from (select d.statut, count(*) n from public.contenu_langue_decks d
     join public.contenus c on c.id = d.contenu_id
     join migration_micabo.lots l on l.lot like '%\_contenus' and c.compte_reference_id = (l.donnees -> 'source' ->> 'id')::uuid
     where d.variante = 'micabo' group by 1) z) as decks_micabo,
  (select count(*) from public.passages p join public.contenus c on c.id = p.contenu_id
     join migration_micabo.lots l on l.lot like '%\_contenus' and c.compte_reference_id = (l.donnees -> 'source' ->> 'id')::uuid) as passages,
  (select count(*) from public.passages p join public.contenus c on c.id = p.contenu_id
     join migration_micabo.lots l on l.lot like '%\_contenus' and c.compte_reference_id = (l.donnees -> 'source' ->> 'id')::uuid
     where p.resolution_statut = 'a_resoudre') as passages_en_file_apify;
