-- 0609 : BLEO, la boîte avec le post parent complet (D37, demandé par Adrien le 29/10).
--
-- `bleo_boite` ne rend que l'accroche et des identifiants : un podz ne voit ni
-- la tournure du post ni ses images. `bleo_boite_posts(label, limite)` rend
-- les lignes de la boîte dans l'ordre, chacune avec le post parent tel que
-- posté :
--
--   post        le meilleur passage publié du parent (dans sa langue source
--               s'il y en a un, sinon le plus vu) : langue, vues, r, lien
--               TikTok, et ses slides dans l'ordre (texte posé, image, slide
--               d'appli, slide TikTok d'inspiration) ;
--   passages    ses 3 passages les plus vus (langue, vues, r, lien) ;
--   parent      titre, langue source, génération, lien source.
--
-- La section BLEO de la page Pods l'affiche ligne par ligne. L'action `boite`
-- du guichet des podz (L4) n'aura qu'à l'appeler.
--
-- AJOUT SEULEMENT : une fonction de lecture, en `security invoker` (les tables
-- lues restent réservées aux admins et au service).

set lock_timeout = '5s';

create or replace function public.bleo_boite_posts(p_label_id uuid, p_limite integer default 50)
returns jsonb
language sql
stable
security invoker
set search_path to 'public'
as $$
  with b as (
    select *
      from bleo_boite
     where label_id = p_label_id
     order by rang
     limit greatest(1, least(coalesce(p_limite, 50), 300))
  ),
  pub as (
    select b.parent_contenu_id, p.id, p.post_id, p.langue, p.vues, p.r, p.publie_url,
           row_number() over (partition by b.parent_contenu_id
                              order by (p.post_id is not null) desc, (p.langue = c.langue_source) desc,
                                       p.vues desc nulls last, p.id) as rang_post,
           row_number() over (partition by b.parent_contenu_id order by p.vues desc nulls last, p.id) as rang_vues
      from b
      join contenus c on c.id = b.parent_contenu_id
      join passages p on p.contenu_id = b.parent_contenu_id
     where p.statut = 'publie' and not coalesce(p.est_rappel, false) and p.vues is not null
  )
  select coalesce(jsonb_agg(ligne order by rang), '[]'::jsonb)
    from (
      select b.rang,
             jsonb_build_object(
               'rang', b.rang,
               'sorte', b.sorte,
               'accroche_attendue', b.accroche_attendue,
               'accroche', b.accroche,
               'famille_id', b.famille_id,
               'parent_contenu_id', b.parent_contenu_id,
               'faites', b.faites,
               'au_budget', b.au_budget,
               'verdict_le', b.verdict_le,
               'parent', (
                 select jsonb_build_object('titre', c.titre, 'langue_source', c.langue_source,
                                           'generation', c.generation, 'source_url', c.source_url)
                   from contenus c where c.id = b.parent_contenu_id
               ),
               'post', (
                 select jsonb_build_object(
                          'langue', m.langue, 'vues', m.vues, 'r', round(m.r, 2), 'url', m.publie_url,
                          'slides', (
                            select coalesce(jsonb_agg(jsonb_build_object(
                                     'position', s.position,
                                     'texte', s.texte_overlay,
                                     'appli', coalesce(s.position_sophia, false),
                                     'image', ml.url,
                                     'inspiration', s.reference_url
                                   ) order by s.position), '[]'::jsonb)
                              from post_slides s
                              left join media_library ml on ml.id = s.media_id
                             where s.post_id = m.post_id
                          ))
                   from pub m
                  where m.parent_contenu_id = b.parent_contenu_id and m.rang_post = 1 and m.post_id is not null
               ),
               'passages', (
                 select coalesce(jsonb_agg(jsonb_build_object('langue', m.langue, 'vues', m.vues, 'r', round(m.r, 2),
                                                              'url', m.publie_url) order by m.rang_vues), '[]'::jsonb)
                   from pub m
                  where m.parent_contenu_id = b.parent_contenu_id and m.rang_vues <= 3
               )
             ) as ligne
        from b
    ) z;
$$;
comment on function public.bleo_boite_posts(uuid, integer) is
  'BLEO (A9, D37) : la boîte d''un label dans l''ordre, chaque ligne avec le post parent tel que posté (slides, texte, images, slide d''appli) et ses meilleurs passages.';

grant execute on function public.bleo_boite_posts(uuid, integer) to authenticated, service_role;
