-- 0649 : la fiche d'une famille BLEO ne tombe plus en « statement timeout » (5/11).
--
-- Adrien : « canceling statement due to statement timeout à l'ouverture d'une famille ».
-- `bleo_contenus_ui` (security_invoker) cherche l'image de la slide 1 dans
-- `media_library` avec une jointure `ml.id = CASE … (e.value ->> 'media_id')::uuid … END`.
-- Pour un admin connecté, la RLS de `media_library` passe d'abord : l'expression de la
-- jointure n'est pas « leakproof », Postgres ne peut plus l'utiliser comme condition
-- d'index et relit toute la table (environ 32 000 médias) pour chaque contenu, en
-- évaluant la règle `media_dans_slides_du_poster(id)` ligne par ligne. Plus de 25 s
-- pour une famille, contre 8 s de délai pour `authenticated`.
--
-- L'identifiant du média est maintenant calculé dans une sous-requête à part (LIMIT 1,
-- donc jamais aplatie) : la jointure devient `ml.id = s.media_id`, une égalité de uuid
-- que l'index sert. Même résultat (108 contenus, mêmes URL, vérifié sur « hobbies that
-- will make you dangerously confident »), 56 ms au lieu de plus de 25 s. Le reste de
-- la vue est inchangé, recopié de la définition en prod.

create or replace view public.bleo_contenus_ui with (security_invoker = true) as
 SELECT c.id,
    c.titre,
    c.famille_id,
    c.generation,
    c.parent_bleo_id,
    c.type_bleo,
    c.classe_defaut,
    c.etat_bleo,
    c.verdict,
    c.statut::text AS statut,
    c.created_at,
    c.juge_le,
    c.pod,
    c.source_url,
    c.langue_source,
    s.n_passages,
    s.vues_max,
    s.vues_moyenne,
    round(s.r_median::numeric, 2) AS r_median,
    s.dernier_passage,
    round(v.valeur_max, 3) AS valeur_max,
    v.n_langues,
    round(s.r_moyen, 2) AS r_moyen,
    t.texte_slide1,
    split_part(t.texte_slide2, '
'::text, 1) AS texte_slide2,
    img.url AS image_slide1
   FROM contenus c
     LEFT JOIN LATERAL ( SELECT count(*) AS n_passages,
            max(p.vues) AS vues_max,
            round(avg(p.vues)) AS vues_moyenne,
            percentile_cont(0.5::double precision) WITHIN GROUP (ORDER BY (p.r::double precision)) AS r_median,
            max(p.publie_at) AS dernier_passage,
            avg(LEAST(p.r, ( SELECT ((reglages.valeur -> 'mesure'::text) ->> 'r_plafond'::text)::numeric AS "numeric"
                   FROM reglages
                  WHERE reglages.cle = 'bleo'::text))) FILTER (WHERE p.r IS NOT NULL) AS r_moyen
           FROM passages p
          WHERE p.contenu_id = c.id AND p.statut = 'publie'::passage_statut AND NOT COALESCE(p.est_rappel, false)) s ON true
     LEFT JOIN LATERAL ( SELECT max(bv.valeur) AS valeur_max,
            count(*) AS n_langues
           FROM bleo_valeurs bv
          WHERE bv.contenu_id = c.id AND bv.valeur > 0::numeric) v ON true
     LEFT JOIN LATERAL ( SELECT cl.slides_base AS sb
           FROM contenu_langues cl
          WHERE cl.contenu_id = c.id AND cl.slides_base IS NOT NULL AND jsonb_typeof(cl.slides_base) = 'array'::text
          ORDER BY (cl.langue = c.langue_source) DESC, cl.created_at
         LIMIT 1) base ON true
     LEFT JOIN LATERAL ( SELECT p.post_id
           FROM passages p
          WHERE base.sb IS NULL AND p.contenu_id = c.id AND p.statut = 'publie'::passage_statut AND p.post_id IS NOT NULL
          ORDER BY p.vues DESC NULLS LAST
         LIMIT 1) pub ON true
     LEFT JOIN LATERAL ( SELECT COALESCE(( SELECT e.value ->> 'texte_overlay'::text
                   FROM jsonb_array_elements(base.sb) e(value)
                  WHERE ((e.value ->> 'position'::text)::integer) = 1
                 LIMIT 1), ( SELECT ps.texte_overlay
                   FROM post_slides ps
                  WHERE ps.post_id = pub.post_id AND ps."position" = 1
                 LIMIT 1)) AS texte_slide1,
            COALESCE(( SELECT e.value ->> 'texte_overlay'::text
                   FROM jsonb_array_elements(base.sb) e(value)
                  WHERE ((e.value ->> 'position'::text)::integer) = 2
                 LIMIT 1), ( SELECT ps.texte_overlay
                   FROM post_slides ps
                  WHERE ps.post_id = pub.post_id AND ps."position" = 2
                 LIMIT 1)) AS texte_slide2) t ON true
     LEFT JOIN LATERAL ( SELECT COALESCE(ml.url, s.raw_url, s.reference_url) AS url
           FROM ( SELECT e.value ->> 'raw_url'::text AS raw_url,
                    e.value ->> 'reference_url'::text AS reference_url,
                        CASE
                            WHEN (e.value ->> 'media_id'::text) ~ '^[0-9a-f-]{36}$'::text THEN (e.value ->> 'media_id'::text)::uuid
                            ELSE NULL::uuid
                        END AS media_id
                   FROM jsonb_array_elements(
                        CASE
                            WHEN jsonb_typeof(c.structure_slides) = 'array'::text THEN c.structure_slides
                            ELSE '[]'::jsonb
                        END) e(value)
                  WHERE ((e.value ->> 'position'::text)::integer) = 1
                 LIMIT 1) s
             LEFT JOIN media_library ml ON ml.id = s.media_id) img ON true
  WHERE c.famille_id IS NOT NULL;
