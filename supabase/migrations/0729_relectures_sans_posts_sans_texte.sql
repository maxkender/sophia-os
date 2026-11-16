-- 0729 : la relecture simple ne tire plus de posts sans texte (15/11).
--
-- Ticket du 14/11 (Annapaola, it) : les posts dont le texte est dans l'image
-- (white_bg / page blanche, remakes comme Fathomly) ont un `texte_overlay`
-- vide sur chaque slide. Le tirage (0632) les prenait quand même, et le
-- relecteur recevait un deck où chaque slide affiche « (slide without text) ».
-- 5 relectures sur 75 envoyées le 14/11.
--
--  - `relecture_deck_lisible(slides)` : un deck est relisible quand au moins
--    la moitié de ses slides portent un texte (`texte_overlay` non vide). Un
--    deck où seule la slide d'appli a du texte ne l'est pas.
--  - `relectures_envoyer_interne` : même tirage qu'en 0632, mais seulement
--    parmi les passages au deck relisible (le deck figé est le même : les
--    slides du post, sinon celles du passage). Même signature, même cron.
--  - Nettoyage : les relectures encore « a_faire » dont le deck figé n'est pas
--    relisible sont supprimées (le relecteur ne peut rien en faire). Les
--    relectures déjà faites restent.
--
-- Retour arrière : rejouer la fonction de 0632 ;
--   drop function public.relecture_deck_lisible(jsonb).
-- Les relectures supprimées ne reviennent pas (elles étaient vides).

set lock_timeout = '5s';

create or replace function public.relecture_deck_lisible(p_slides jsonb)
returns boolean
language sql
immutable
set search_path to 'public'
as $$
  select coalesce(jsonb_typeof(p_slides) = 'array', false)
     and jsonb_array_length(p_slides) > 0
     and (select count(*) filter (where btrim(coalesce(s ->> 'texte_overlay', '')) <> '') * 2
            from jsonb_array_elements(p_slides) s) >= jsonb_array_length(p_slides);
$$;
grant execute on function public.relecture_deck_lisible(jsonb) to service_role;

create or replace function public.relectures_envoyer_interne(p_langue text, p_n integer default 15, p_jours integer default 14)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_langue text := lower(btrim(p_langue));
  v_n integer := greatest(coalesce(p_n, 15), 1);
  v_total integer := 0;
  v_inseres integer;
  rel record;
begin
  for rel in
    select r.id from public.relecteurs_natifs r
     where lower(r.langue) = v_langue and r.statut in ('invite', 'actif')
  loop
    with candidats as (
      select p.id as passage_id, p.post_id, p.contenu_id, p.vues, p.publie_at,
             (select l.nom from public.contenu_labels cl join public.labels l on l.id = cl.label_id
               where cl.contenu_id = p.contenu_id and l.nom not in ('Hook', 'UGC AI VIDEO')
               order by l.nom limit 1) as label,
             row_number() over (partition by p.contenu_id order by random()) as rn_contenu
        from public.passages p
       where lower(p.langue) = v_langue
         and p.statut = 'publie'
         and p.post_id is not null
         and p.publie_at >= now() - make_interval(days => greatest(coalesce(p_jours, 14), 1))
         and not exists (select 1 from public.relectures_posts r where r.passage_id = p.id and r.relecteur_id = rel.id)
         and public.relecture_deck_lisible(
               coalesce(nullif((select jsonb_agg(jsonb_build_object('texte_overlay', ps.texte_overlay))
                                  from public.post_slides ps where ps.post_id = p.post_id), '[]'::jsonb),
                        p.slides, '[]'::jsonb))
    ), par_label as (
      select c.*, row_number() over (partition by coalesce(c.label, '') order by random()) as rn_label
        from candidats c where c.rn_contenu = 1
    ), choisis as (
      select * from par_label where rn_label <= 3
       order by random()
       limit v_n
    )
    insert into public.relectures_posts (langue, relecteur_id, passage_id, post_id, contenu_id, label, vues, publie_at, slides, slides_source)
    select v_langue, rel.id, c.passage_id, c.post_id, c.contenu_id, c.label, c.vues, c.publie_at,
           coalesce(nullif((select jsonb_agg(jsonb_build_object('position', ps.position, 'texte_overlay', ps.texte_overlay, 'position_sophia', ps.position_sophia) order by ps.position)
                             from public.post_slides ps where ps.post_id = c.post_id), '[]'::jsonb),
                    (select p.slides from public.passages p where p.id = c.passage_id), '[]'::jsonb),
           coalesce((select coalesce(nullif(s.slides_base, '[]'::jsonb), s.slides)
                       from public.contenu_langues s join public.contenus co on co.id = s.contenu_id
                      where s.contenu_id = c.contenu_id and s.langue = co.langue_source limit 1), '[]'::jsonb)
      from choisis c;
    get diagnostics v_inseres = row_count;
    v_total := v_total + v_inseres;
  end loop;
  return v_total;
end;
$$;
revoke all on function public.relectures_envoyer_interne(text, integer, integer) from public, authenticated;
grant execute on function public.relectures_envoyer_interne(text, integer, integer) to service_role;

-- Nettoyage : les relectures à faire qui n'ont rien à relire.
delete from public.relectures_posts
 where statut = 'a_faire'
   and not public.relecture_deck_lisible(slides);
