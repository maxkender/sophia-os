-- 0617 : BLEO, le suivi avant/après la bascule (décision d'Adrien le 29/10 :
-- pas d'A/B, un suivi avant/après et une alerte à la place).
--
--   bleo_suivi_jours     une ligne par jour de publication (60 jours) : posts
--                        publiés, r médian (passages mûrs, 72 h), part à
--                        10 000 vues, vues par post, et la part des passages
--                        servis par le plan BLEO (`bras = 'bleo'`) ou rendus à
--                        la tierlist (`temoin`). Hors rappels et posts de test.
--   bleo_suivi_alerte()  le r médian des 3 derniers jours mesurés contre celui
--                        des 14 jours d'avant ; `alerte` quand la baisse dépasse
--                        `reglages.bleo.suivi.alerte_baisse` (15 %). Un jour est
--                        « mesuré » quand la moitié au moins de ses posts publiés
--                        ont un r (il faut 72 h).
--
-- AJOUT SEULEMENT : une vue, une fonction de lecture, une clé de réglage.

set lock_timeout = '5s';

update public.reglages
   set valeur = valeur || jsonb_build_object('suivi', '{"alerte_baisse": 0.15, "jours_recents": 3, "jours_reference": 14}'::jsonb)
 where cle = 'bleo' and not (valeur ? 'suivi');

create or replace view public.bleo_suivi_jours
  with (security_invoker = true)
as
  select p.date_publication_prevue as jour,
         count(*) as assignes,
         count(*) filter (where p.statut = 'publie') as publies,
         count(p.r) filter (where p.statut = 'publie') as mesures,
         round((percentile_cont(0.5) within group (order by p.r) filter (where p.statut = 'publie'))::numeric, 2) as r_median,
         round(avg((p.vues >= 10000)::int) filter (where p.statut = 'publie' and p.vues is not null), 3) as part_10k,
         round(avg(p.vues) filter (where p.statut = 'publie' and p.vues is not null)) as vues_par_post,
         count(*) filter (where p.bras = 'bleo') as plan_bleo,
         count(*) filter (where p.bras = 'temoin') as tierlist
    from public.passages p
    left join public.posts po on po.id = p.post_id
   where not coalesce(p.est_rappel, false)
     and not coalesce(po.est_test, false)
     and p.date_publication_prevue between (now() at time zone 'Europe/Paris')::date - 60
                                       and (now() at time zone 'Europe/Paris')::date
   group by p.date_publication_prevue;

grant select on public.bleo_suivi_jours to authenticated, service_role;

comment on view public.bleo_suivi_jours is
  'BLEO : suivi avant/après la bascule, une ligne par jour de publication (r médian des passages mûrs, part à 10 000 vues, vues par post, part du plan BLEO). Hors rappels et posts de test.';

create or replace function public.bleo_suivi_alerte()
returns jsonb
language plpgsql
stable
security invoker
set search_path to 'public'
as $$
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
$$;

grant execute on function public.bleo_suivi_alerte() to authenticated, service_role;

comment on function public.bleo_suivi_alerte() is
  'BLEO : r médian des 3 derniers jours mesurés contre les 14 jours d''avant ; alerte au-delà de reglages.bleo.suivi.alerte_baisse.';
