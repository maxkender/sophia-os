-- 0613 : BLEO, le texte des slides dans la fiche famille de l'OS (demandé par
-- Adrien le 29/10).
--
-- Le titre d'un contenu est la description TikTok du post source, souvent des
-- hashtags : dans une famille, on ne distinguait pas les contenus. La vue
-- `bleo_contenus_ui` gagne trois colonnes (en fin de vue) :
--
--   texte_slide1   le texte de la slide 1 (l'accroche telle qu'écrite) ;
--   texte_slide2   la première ligne de la slide 2 (ce qui distingue deux
--                  contenus de la même accroche) ;
--   image_slide1   l'image de la slide 1.
--
-- Le texte vient de `contenu_langues.slides_base` dans la langue source, sinon
-- dans une autre langue, sinon du post publié le plus vu.
--
-- AJOUT SEULEMENT : la vue est redéfinie avec les mêmes colonnes, plus trois.

set lock_timeout = '5s';

create or replace view public.bleo_contenus_ui
  with (security_invoker = true)
as
  select c.id, c.titre, c.famille_id, c.generation, c.parent_bleo_id, c.type_bleo, c.classe_defaut,
         c.etat_bleo, c.verdict, c.statut::text as statut, c.created_at, c.juge_le, c.pod,
         c.source_url, c.langue_source,
         s.n_passages, s.vues_max, s.vues_moyenne, round(s.r_median::numeric, 2) as r_median, s.dernier_passage,
         round(v.valeur_max, 3) as valeur_max, v.n_langues,
         round(s.r_moyen, 2) as r_moyen,
         t.texte_slide1,
         split_part(t.texte_slide2, E'\n', 1) as texte_slide2,
         img.url as image_slide1
    from public.contenus c
    left join lateral (
      select count(*) as n_passages, max(p.vues) as vues_max, round(avg(p.vues)) as vues_moyenne,
             percentile_cont(0.5) within group (order by p.r) as r_median, max(p.publie_at) as dernier_passage,
             avg(least(p.r, (select (valeur->'mesure'->>'r_plafond')::numeric from public.reglages where cle = 'bleo')))
               filter (where p.r is not null) as r_moyen
        from public.passages p
       where p.contenu_id = c.id and p.statut = 'publie' and not coalesce(p.est_rappel, false)
    ) s on true
    left join lateral (
      select max(bv.valeur) as valeur_max, count(*) as n_langues
        from public.bleo_valeurs bv
       where bv.contenu_id = c.id and bv.valeur > 0
    ) v on true
    left join lateral (
      -- Les slides de base : langue source d'abord, puis la plus ancienne autre langue.
      select cl.slides_base as sb
        from public.contenu_langues cl
       where cl.contenu_id = c.id and cl.slides_base is not null and jsonb_typeof(cl.slides_base) = 'array'
       order by (cl.langue = c.langue_source) desc, cl.created_at
       limit 1
    ) base on true
    left join lateral (
      -- Sinon, le post publié le plus vu.
      select p.post_id
        from public.passages p
       where base.sb is null and p.contenu_id = c.id and p.statut = 'publie' and p.post_id is not null
       order by p.vues desc nulls last
       limit 1
    ) pub on true
    left join lateral (
      select coalesce(
               (select e->>'texte_overlay' from jsonb_array_elements(base.sb) e where (e->>'position')::int = 1 limit 1),
               (select ps.texte_overlay from public.post_slides ps where ps.post_id = pub.post_id and ps.position = 1 limit 1)
             ) as texte_slide1,
             coalesce(
               (select e->>'texte_overlay' from jsonb_array_elements(base.sb) e where (e->>'position')::int = 2 limit 1),
               (select ps.texte_overlay from public.post_slides ps where ps.post_id = pub.post_id and ps.position = 2 limit 1)
             ) as texte_slide2
    ) t on true
    left join lateral (
      select coalesce(ml.url, e->>'raw_url', e->>'reference_url') as url
        from jsonb_array_elements(case when jsonb_typeof(c.structure_slides) = 'array' then c.structure_slides else '[]'::jsonb end) e
        left join public.media_library ml on ml.id = (case when e->>'media_id' ~ '^[0-9a-f-]{36}$' then (e->>'media_id')::uuid end)
       where (e->>'position')::int = 1
       limit 1
    ) img on true
   where c.famille_id is not null;
