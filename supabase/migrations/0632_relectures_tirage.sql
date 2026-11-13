-- 0632 : la relecture simple tire ses posts au sort (13/11).
--
-- 0631 envoyait les 15 posts les plus vus des 14 derniers jours. Décision
-- d'Adrien : les vues ne disent rien de la langue, et un hit est déjà la
-- version qui a marché ; l'échantillon doit ressembler à ce qu'on publie.
-- Désormais : tirage au sort parmi les publiés des 14 derniers jours, un
-- passage par contenu (au hasard), au plus 3 par label (au hasard), jamais
-- deux fois au même relecteur. Même signature, même appel du cron.
--
-- Retour arrière : rejouer la fonction de 0631.

set lock_timeout = '5s';

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
