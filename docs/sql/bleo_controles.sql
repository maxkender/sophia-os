-- BLEO : contrôles à rejouer sur la base (lecture seule, sauf mention).
-- Chaque requête rend une ligne de booléens ou de chiffres à comparer.

-- 1. Les copies SQL des règles TypeScript (multi_app.ts, pods.ts).
--    Tout doit être vrai (13 colonnes, 29/10 : 13/13).
with recursive sim(i, fenetre) as (
  select 0, '{}'::text[]
  union all
  select i + 1, fenetre || public.bleo_choisir_app('{"sophia":70,"unswipe":30}'::jsonb, fenetre)
    from sim where i < 30
),
f as (select fenetre from sim where i = 30)
select
 public.bleo_parts_effectives(null, array['sophia','unswipe']) = '{"sophia":100}'::jsonb as t1_defaut_sophia,
 public.bleo_parts_effectives(null, array['unswipe','micabo']) = '{"micabo":50,"unswipe":50}'::jsonb as t2_egal_sans_sophia,
 public.bleo_parts_effectives('{"unswipe":100}'::jsonb, array['sophia']) = '{}'::jsonb as t3_explicite_ineligible,
 public.bleo_parts_effectives('{"sophia":70,"micabo":30}'::jsonb, array['sophia']) = '{"sophia":100}'::jsonb as t4_report,
 public.bleo_parts_effectives('{"sophia":"70","unswipe":0}'::jsonb, array['sophia','unswipe']) = '{"sophia":100}'::jsonb as t5_chaine_et_zero,
 public.bleo_choisir_app('{"sophia":50,"unswipe":50}'::jsonb, '{}') = 'sophia' as t6_egalite_sophia,
 public.bleo_choisir_app('{"micabo":50,"unswipe":50}'::jsonb, '{}') = 'micabo' as t7_egalite_alpha,
 (select bool_and((select count(*) from unnest(fenetre[k:k+9]) a where a = 'sophia') = 7)
    from f, generate_series(1, 21) k) as t8_toute_fenetre_7_3,
 public.bleo_langues_livre('pt-BR') = array['pt-BR','pt'] as t9_repli_base,
 public.bleo_langues_livre('pt') = array['pt'] as t10_exacte,
 public.bleo_deck_livre_pret('[{"media_id":"a"},{"media_id":"b"}]') as t11_pret,
 not public.bleo_deck_livre_pret('[{"media_id":"a"},{"media_id":""}]') as t12_image_manquante,
 not public.bleo_deck_livre_pret('[]') as t13_vide;

-- 2. A5 recalculée sans le code de la nuit, sur un échantillon (valeurs de
--    départ du 28/10 en dur ici, exprès) : `stockee` = `recalculee`.
with ech as (select * from bleo_valeurs where n_r between 2 and 6 and n_post between 1 and 3
              order by md5(contenu_id::text || langue) limit 4),
calc as (
  select e.contenu_id, e.langue, e.valeur as stockee, c.classe_defaut, c.created_at,
    (select count(*) from passages p where p.contenu_id = e.contenu_id and p.statut = 'publie'
        and not coalesce(p.est_rappel, false) and p.r is not null and p.publie_at <= now() - interval '72 hours') as n_r,
    (select sum(least(p.r, 20)) from passages p where p.contenu_id = e.contenu_id and p.statut = 'publie'
        and not coalesce(p.est_rappel, false) and p.r is not null and p.publie_at <= now() - interval '72 hours') as somme_r,
    (select count(*) from passages p where p.contenu_id = e.contenu_id and p.langue = e.langue
        and p.statut in ('assigne', 'valide_par_poster', 'publie')) as n_post,
    (select count(*) from passages p join contenus c2 on c2.id = p.contenu_id
      where c2.famille_id = c.famille_id and p.contenu_id <> e.contenu_id and p.langue = e.langue
        and p.statut in ('assigne', 'valide_par_poster', 'publie')) as n_acc
  from ech e join contenus c on c.id = e.contenu_id)
select contenu_id, langue, round(stockee, 4) as stockee,
  round(((2 * (case classe_defaut when 'import' then 2.0 when 'podz' then 2.7 when 'livre' then 4.0
                                  when 'accroche_gagnante' then 3.2 else 1.5 end) + somme_r) / (2 + n_r))
        * power(0.6, n_post) * power(0.75, n_acc)
        * (case when created_at < now() - interval '45 days' then 0.7 else 1 end), 4) as recalculee
from calc;

-- 3. Rejouer un tirage (écrit un run et son plan dans les tables BLEO) puis
--    comparer deux runs du même jour : `differents` = 0.
--   select public.bleo_tirage('2026-10-30'::date, 'ombre');
--   with a as (select compte_id, creneau, contenu_id from bleo_ombre_passages where run_id = '<run 1>'),
--        b as (select compte_id, creneau, contenu_id from bleo_ombre_passages where run_id = '<run 2>')
--   select count(*) filter (where a.contenu_id = b.contenu_id) as identiques,
--          count(*) filter (where a.contenu_id <> b.contenu_id) as differents
--     from a join b using (compte_id, creneau);

-- 4. Les derniers plans et rapports.
select jour_vise, demarre_le at time zone 'Europe/Paris' as demarre, fini_le is not null as fini,
       resume - 'labels_file_juger' - 'rapport' as plan, resume->'rapport' as rapport, erreur
  from bleo_runs order by demarre_le desc limit 5;
