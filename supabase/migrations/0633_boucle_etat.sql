-- 0633 : l'état de la boucle de correction par langue (13/11).
--
-- Un bandeau en tête de Relecture native et de Traduction & placement →
-- Langues dessine la boucle en quatre étapes (posts envoyés → relus →
-- corrections à trier → retenues, dans la traduction) avec les chiffres des
-- 7 derniers jours par langue, et la part de slides reprises de la dernière
-- semaine contre la précédente. Une seule fonction, admin (RLS invoker).
--
-- Retour arrière : drop function public.boucle_etat();

create or replace function public.boucle_etat()
returns jsonb
language sql
stable
security invoker
set search_path to 'public'
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'langue', g.langue,
    'relecteurs', g.relecteurs,
    'envoyes_7j', (select count(*) from relectures_posts r where lower(r.langue) = g.langue and r.envoye_le >= now() - interval '7 days'),
    'a_relire', (select count(*) from relectures_posts r where lower(r.langue) = g.langue and r.statut = 'a_faire'),
    'relus_7j', (select count(*) from relectures_posts r where lower(r.langue) = g.langue and r.fait_le >= now() - interval '7 days'),
    'duels_a_voter', (select count(*) from ab_traduction_duels d where lower(d.langue) = g.langue and d.statut = 'pret' and d.relecteurs_le is not null
                        and not exists (select 1 from ab_traduction_votes v where v.duel_id = d.id)),
    'proposees', (select count(*) from corrections_natives c where lower(c.langue) = g.langue and c.statut = 'proposee'),
    'retenues', (select count(*) from corrections_natives c where lower(c.langue) = g.langue and c.statut = 'retenue'),
    'retenues_7j', (select count(*) from corrections_natives c where lower(c.langue) = g.langue and c.statut = 'retenue' and c.decide_le >= now() - interval '7 days'),
    'reprises_pct', (select case when sum(jsonb_array_length(r.slides)) > 0
                              then round(100.0 * sum(jsonb_array_length(r.slides_corrigees)) / sum(jsonb_array_length(r.slides))) end
                       from relectures_posts r where lower(r.langue) = g.langue and r.statut = 'faite' and r.fait_le >= now() - interval '7 days'),
    'reprises_pct_avant', (select case when sum(jsonb_array_length(r.slides)) > 0
                                    then round(100.0 * sum(jsonb_array_length(r.slides_corrigees)) / sum(jsonb_array_length(r.slides))) end
                             from relectures_posts r where lower(r.langue) = g.langue and r.statut = 'faite'
                              and r.fait_le >= now() - interval '14 days' and r.fait_le < now() - interval '7 days')
  ) order by g.langue), '[]'::jsonb)
  from (select lower(r.langue) as langue, count(*) as relecteurs
          from relecteurs_natifs r where r.statut in ('invite', 'actif') group by lower(r.langue)) g;
$$;
grant execute on function public.boucle_etat() to authenticated, service_role;
notify pgrst, 'reload schema';
