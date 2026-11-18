-- 0746 : Bible des comptes, complément (Max, 18/11).
-- 1. « Autre app / idée » : un compte qui ne va dans aucune app actuelle (mode, langues, wellness…), avec l'app
--    imaginée en texte libre (bible_comptes.autre_app). « Non trié » = ni app, ni app en attente, ni label, ni idée.
-- 2. Les miniatures des comptes déjà importés deviennent cliquables : bible_importes rend aussi le lien TikTok
--    du post de chaque slide (slides_posts, même ordre que slides).
-- Additif : une colonne, une fonction recréée (même signature, un champ en plus).

alter table public.bible_comptes add column if not exists autre_app text;

create or replace function public.bible_importes()
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $$
  select coalesce(jsonb_agg(x order by x->>'handle'), '[]'::jsonb) from (
    select jsonb_build_object(
      'compte_reference_id', r.id,
      'handle', public.bible_handle(r.handle_tiktok),
      'langue', r.langue,
      'niche', r.niche,
      'actif', r.is_active,
      'application_id', r.application_id,
      'ajoute_at', r.created_at,
      'labels', coalesce((select jsonb_agg(jsonb_build_object('id', l.id, 'nom', l.nom) order by l.nom)
                            from public.compte_reference_labels crl join public.labels l on l.id = crl.label_id
                           where crl.compte_reference_id = r.id), '[]'::jsonb),
      'slides', coalesce((select jsonb_agg(s.url order by s.vues desc nulls last) from (
                            select c.structure_slides -> 0 ->> 'raw_url' as url, c.vues_source as vues
                              from public.contenus c
                             where c.compte_reference_id = r.id and c.parent_id is null
                               and c.structure_slides -> 0 ->> 'raw_url' like 'https://%/storage/v1/object/public/medias/%'
                             order by c.vues_source desc nulls last limit 3) s), '[]'::jsonb),
      'slides_posts', coalesce((select jsonb_agg(s.post order by s.vues desc nulls last) from (
                            select c.source_url as post, c.vues_source as vues
                              from public.contenus c
                             where c.compte_reference_id = r.id and c.parent_id is null
                               and c.structure_slides -> 0 ->> 'raw_url' like 'https://%/storage/v1/object/public/medias/%'
                             order by c.vues_source desc nulls last limit 3) s), '[]'::jsonb),
      'posts', (select count(*) from public.contenus c where c.compte_reference_id = r.id and c.parent_id is null),
      'vues_mediane', (select percentile_cont(0.5) within group (order by c.vues_source)::int
                         from public.contenus c where c.compte_reference_id = r.id and c.parent_id is null and c.vues_source is not null),
      'bible_id', (select b.id from public.bible_comptes b
                    where b.compte_reference_id = r.id or b.handle = public.bible_handle(r.handle_tiktok) limit 1)) x
      from public.comptes_reference r
     where public.is_admin_strict()) t;
$$;
