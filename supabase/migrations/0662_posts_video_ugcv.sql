-- 0662 : posts vidéo des comptes UGCV, posés à la main par l'admin depuis la
-- page UGC IA, et comptés comme des posts normaux (paie, relances, planning,
-- vues).
--
-- Un post vidéo, c'est :
--   - un `posts` de type `video` (assigné, pipeline `done`), avec la légende
--     (`hashtags`), le son (`musique_*`) et le CTA (`video_cta_*`) ;
--   - ses vidéos, dans l'ordre où le poster les met bout à bout (`post_videos`) ;
--   - un `passages` sans contenu (`contenu_id` vide) : c'est lui que lisent la
--     paie, les relances, la résolution du lien et le relevé des vues. Pas de
--     contenu slideshow derrière, donc rien à rappeler, classer ou relire.
--
-- `post_type` gagne `video` ; la valeur n'est utilisée qu'après cette
-- migration (fonction `ugc-ia`), Postgres refuse de s'en servir dans la même
-- transaction.
--
-- ✅ Appliquée le 2026-11-06 (MCP) : `video` dans post_type, contenu_id
-- facultatif, post_videos et ses règles, suivi BLEO relu (61 jours, pas
-- d'alerte).

alter type public.post_type add value if not exists 'video';

-- Un passage vidéo n'a pas de contenu slideshow.
alter table public.passages alter column contenu_id drop not null;
comment on column public.passages.contenu_id is
  'Contenu slideshow du passage ; vide pour un post vidéo UGCV (0662), qui n''a ni slides ni contenu.';

-- Le CTA d'un post vidéo : un texte à poser comme sur la capture, ou rien s'il
-- est déjà incrusté dans la vidéo.
alter table public.posts
  add column if not exists video_cta_texte text,
  add column if not exists video_cta_incruste boolean not null default false,
  add column if not exists video_capture_url text;

comment on column public.posts.video_cta_texte is 'Post vidéo (0662) : texte du CTA que le poster pose sur la vidéo.';
comment on column public.posts.video_cta_incruste is 'Post vidéo (0662) : le CTA est déjà dans la vidéo, rien à ajouter.';
comment on column public.posts.video_capture_url is 'Post vidéo (0662) : capture d''exemple de la vidéo de référence, pour voir où mettre le CTA.';

create table if not exists public.post_videos (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  position integer not null check (position >= 1),
  url text not null,
  -- Chemin dans le bucket `medias` d'une vidéo importée pour ce post (supprimée
  -- avec lui) ; vide pour une vidéo de la page UGC IA, qui reste à sa source.
  chemin text,
  nom text,
  generation_id uuid references public.ugc_ia_generations(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (post_id, position)
);

comment on table public.post_videos is
  'Vidéos d''un post vidéo UGCV (0662), dans l''ordre où le poster les met bout à bout.';

alter table public.post_videos enable row level security;

drop policy if exists post_videos_admin on public.post_videos;
create policy post_videos_admin on public.post_videos
  for all using (public.is_admin()) with check (public.is_admin());

-- Qui voit le post voit ses vidéos (la sous-requête suit les règles de `posts`).
drop policy if exists post_videos_select on public.post_videos;
create policy post_videos_select on public.post_videos
  for select using (exists (select 1 from public.posts p where p.id = post_videos.post_id));

-- Le son de la vidéo de référence, relevé à l'import, proposé par défaut au post.
alter table public.ugc_ia_sources
  add column if not exists musique_url text,
  add column if not exists musique_titre text;

-- Suivi BLEO (0617) : les indicateurs de la flotte slideshow (r médian, part à
-- 10 k, vues par post, alerte de baisse) ne comptent pas les posts vidéo.
create or replace view public.bleo_suivi_jours with (security_invoker = true) as
 SELECT p.date_publication_prevue AS jour,
    count(*) AS assignes,
    count(*) FILTER (WHERE (p.statut = 'publie'::passage_statut)) AS publies,
    count(p.r) FILTER (WHERE (p.statut = 'publie'::passage_statut)) AS mesures,
    round((percentile_cont((0.5)::double precision) WITHIN GROUP (ORDER BY ((p.r)::double precision)) FILTER (WHERE (p.statut = 'publie'::passage_statut)))::numeric, 2) AS r_median,
    round(avg(((p.vues >= 10000))::integer) FILTER (WHERE ((p.statut = 'publie'::passage_statut) AND (p.vues IS NOT NULL))), 3) AS part_10k,
    round(avg(p.vues) FILTER (WHERE ((p.statut = 'publie'::passage_statut) AND (p.vues IS NOT NULL)))) AS vues_par_post,
    count(*) FILTER (WHERE (p.bras = 'bleo'::text)) AS plan_bleo,
    count(*) FILTER (WHERE (p.bras = 'temoin'::text)) AS tierlist
   FROM (passages p
     LEFT JOIN posts po ON ((po.id = p.post_id)))
  WHERE ((NOT COALESCE(p.est_rappel, false)) AND (NOT COALESCE(po.est_test, false))
    AND (p.contenu_id IS NOT NULL)
    AND ((p.date_publication_prevue >= (((now() AT TIME ZONE 'Europe/Paris'::text))::date - 60)) AND (p.date_publication_prevue <= ((now() AT TIME ZONE 'Europe/Paris'::text))::date)))
  GROUP BY p.date_publication_prevue;

create or replace function public.bleo_suivi_alerte()
 returns jsonb
 language plpgsql
 stable
 set search_path to 'public'
as $function$
declare
  reg jsonb;
  v_seuil numeric;
  v_recents integer;
  v_reference integer;
  v_fin date;
  v_r3 numeric;
  v_r14 numeric;
  v_baisse numeric;
begin
  select valeur->'suivi' into reg from reglages where cle = 'bleo';
  v_seuil := coalesce((reg->>'alerte_baisse')::numeric, 0.15);
  v_recents := coalesce((reg->>'jours_recents')::int, 3);
  v_reference := coalesce((reg->>'jours_reference')::int, 14);

  select max(jour) into v_fin
    from bleo_suivi_jours
   where publies >= 20 and mesures >= 0.5 * publies;
  if v_fin is null then
    return jsonb_build_object('alerte', false, 'jour_fin', null);
  end if;

  with base as (
    select p.date_publication_prevue as jour, p.r
      from passages p
      left join posts po on po.id = p.post_id
     where p.statut = 'publie' and p.r is not null
       and p.contenu_id is not null
       and not coalesce(p.est_rappel, false) and not coalesce(po.est_test, false)
       and p.date_publication_prevue between v_fin - (v_recents + v_reference - 1) and v_fin
  )
  select (select percentile_cont(0.5) within group (order by r) from base where jour > v_fin - v_recents),
         (select percentile_cont(0.5) within group (order by r) from base where jour <= v_fin - v_recents)
    into v_r3, v_r14;

  v_baisse := case when coalesce(v_r14, 0) > 0 then 1 - v_r3 / v_r14 end;
  return jsonb_build_object(
    'alerte', coalesce(v_baisse > v_seuil, false),
    'jour_fin', v_fin,
    'jours_recents', v_recents,
    'jours_reference', v_reference,
    'r_recent', round(v_r3, 2),
    'r_reference', round(v_r14, 2),
    'baisse', round(v_baisse, 3),
    'seuil', v_seuil);
end;
$function$;
