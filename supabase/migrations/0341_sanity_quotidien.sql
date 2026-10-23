-- 0341 : le sanity check du matin, une fonction SQL lue par la tâche planifiée
-- « Sanity du matin » (analyse/sanity/AGENT.md), qui poste dans #a-os-sanity.
--
-- `select public.sanity_quotidien();` rend en JSON, pour la veille (date de
-- Paris, ou `p_jour`) :
--   - `fraicheur` : dernier relevé de vues, posts mûrs (3 à 10 jours) sans vues ;
--   - `hier` : posts par application, rappels, comptes ayant posté contre
--     comptes attendus (actifs, hors warm-up, hors CM), posts prévus non
--     publiés, nouveaux comptes, part d'originaux, âge des contenus postés
--     (≤ 7 j, ≤ 21 j, > 45 j) ;
--   - `percees` : les posts du jour mûr (veille − 2, relevés à J+2) à 10 k et
--     50 k vues, le taux, la référence des 14 jours d'avant, le top 5, la
--     série des 7 derniers jours mûrs ;
--   - `stock` : contenus Sophia valides par âge (passages restants, rangs,
--     originaux, sources ≥ 200 k), imports et originaux des 7 derniers jours
--     avec les vues de la source, réserve par label (vue `label_reserve`) ;
--   - `comptes` : comptes suspects (règle de analyse/requetes/08 : moitié des
--     posts de la semaine sous 200 vues, ou médiane effondrée), posts à moins
--     de 50 vues, comptes silencieux depuis 3 jours, nouveaux, en warm-up ;
--   - `langues_7j`, `labels_7j` : r médian et % à 10 k sur 7 jours mûrs, avec
--     la semaine d'avant ; `pods_7j`.
--
-- Les chiffres sont fixes et testables à la main ; le modèle ne fait que les
-- lire, les comparer aux seuils de analyse/sanity/AGENT.md et écrire.
-- Méthode : analyse/AGENT.md (maturité J+2, r = vues / médiane du compte,
-- rappels exclus des comparaisons).
--
-- Garde : comme `pods_tableau` (0324), un utilisateur connecté doit être
-- admin ; le rôle de service et le connecteur MCP passent.
-- Retour arrière : `drop function public.sanity_quotidien(date);`

create or replace function public.sanity_quotidien(p_jour date default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_jour date := coalesce(p_jour, (now() at time zone 'Europe/Paris')::date - 1);
  v_resultat jsonb;
begin
  if auth.uid() is not null and not public.is_admin() then
    raise exception 'sanity_quotidien : réservé aux admins' using errcode = '42501';
  end if;

  with
  params as (
    select v_jour::date as jour, (v_jour::date - 2) as mur, (v_jour::date + 1) as auj
  ),
  pub as (
    select pa.id, pa.compte_id, pa.contenu_id, pa.publie_at,
      (pa.publie_at at time zone 'Europe/Paris')::date as jour,
      pa.vues, pa.langue, coalesce(pa.est_rappel, false) as rappel, pa.publie_url, pa.stats_maj_at,
      coalesce(a.slug, 'sophia') as app, c.created_at as contenu_cree, c.titre,
      (c.pod is not null or c.creation_mode = 'manuel') as original
    from passages pa
    join contenus c on c.id = pa.contenu_id
    left join applications a on a.id = pa.application_id
    where pa.statut = 'publie'
      and pa.publie_at >= (((select auj from params) - 60)::timestamp at time zone 'Europe/Paris')
  ),
  lab as (
    select cl.contenu_id, min(l.nom) as label from contenu_labels cl join labels l on l.id = cl.label_id group by 1
  ),
  med as (
    select p.compte_id, percentile_cont(0.5) within group (order by p.vues) as m
    from pub p, params pr
    where p.vues is not null and not p.rappel and p.jour between pr.mur - 45 and pr.mur
    group by p.compte_id having count(*) >= 5
  ),
  fraicheur as (
    select (select max(stats_maj_at) from passages where statut = 'publie') as dernier_releve_at,
      count(*) as murs, count(*) filter (where p.vues is null) as sans_vues
    from pub p, params pr where p.jour between pr.auj - 10 and pr.mur
  ),
  hier as (
    select count(*) as posts, count(*) filter (where p.rappel) as rappels,
      count(distinct p.compte_id) as comptes_ayant_poste,
      round(100.0 * count(*) filter (where p.original) / nullif(count(*), 0), 1) as originaux_pct,
      round(100.0 * count(*) filter (where p.contenu_cree > ((pr.jour - 7)::timestamp at time zone 'Europe/Paris')) / nullif(count(*), 0)) as le7j_pct,
      round(100.0 * count(*) filter (where p.contenu_cree > ((pr.jour - 21)::timestamp at time zone 'Europe/Paris')) / nullif(count(*), 0)) as le21j_pct,
      round(100.0 * count(*) filter (where p.contenu_cree <= ((pr.jour - 45)::timestamp at time zone 'Europe/Paris')) / nullif(count(*), 0)) as plus45j_pct
    from pub p, params pr where p.jour = pr.jour
  ),
  attendus as (
    select co.id from comptes co, params pr
    where co.is_active and coalesce(co.type_compte, 'perso') <> 'cm' and coalesce(co.ugc_ai_video, false) = false
      and co.warmup_ends_at is not null and co.warmup_ends_at <= (pr.jour::timestamp at time zone 'Europe/Paris')
  ),
  mur as (
    select p.* from pub p, params pr where p.jour = pr.mur and not p.rappel
  ),
  percees as (
    select count(*) as posts, count(vues) as releves,
      count(*) filter (where vues >= 10000) as n_10k, count(*) filter (where vues >= 50000) as n_50k,
      round(100.0 * count(*) filter (where vues >= 10000) / nullif(count(vues), 0), 1) as taux_10k_pct,
      max(vues) as max_vues
    from mur
  ),
  ref14 as (
    select round(count(*) / 14.0) as posts_jour,
      round(count(*) filter (where p.vues >= 10000) / 14.0, 1) as n_10k_jour,
      round(count(*) filter (where p.vues >= 50000) / 14.0, 1) as n_50k_jour,
      round(100.0 * count(*) filter (where p.vues >= 10000) / nullif(count(p.vues), 0), 1) as taux_10k_pct
    from pub p, params pr where p.jour between pr.mur - 14 and pr.mur - 1 and not p.rappel
  ),
  etat as (
    select c.id, c.created_at, c.tier, (c.pod is not null or c.creation_mode = 'manuel') as original, c.vues_source, e.restants
    from contenus c
    join contenu_tier_etat e on e.contenu_id = c.id
    left join applications a on a.id = c.application_id
    where coalesce(a.slug, 'sophia') = 'sophia' and c.statut::text = 'valide' and c.import_statut = 'done'
  ),
  imports7 as (
    select count(*) as total,
      count(*) filter (where y.orig) as originaux, count(*) filter (where not y.orig) as imports,
      count(*) filter (where y.statut = 'valide') as valides, count(*) filter (where y.statut = 'rejete') as rejetes,
      count(*) filter (where not y.orig and y.vues_source >= 200000) as src_200k,
      count(*) filter (where not y.orig and y.vues_source >= 50000 and y.vues_source < 200000) as src_50_200k,
      count(*) filter (where not y.orig and coalesce(y.vues_source, 0) < 50000) as src_moins50k
    from (
      select c.statut::text as statut, c.vues_source, (c.pod is not null or c.creation_mode = 'manuel') as orig
      from contenus c left join applications a on a.id = c.application_id
      where coalesce(a.slug, 'sophia') = 'sophia' and c.created_at > now() - interval '7 days'
    ) y
  ),
  sante as (
    select p.compte_id, co.handle_tiktok, co.langue, co.pays, (co.created_at > now() - interval '14 days') as nouveau,
      count(*) filter (where p.jour between pr.mur - 6 and pr.mur and p.vues is not null) as n7,
      count(*) filter (where p.jour between pr.mur - 6 and pr.mur and p.vues < 200) as sous200_7,
      percentile_cont(0.5) within group (order by p.vues) filter (where p.jour between pr.mur - 6 and pr.mur and p.vues is not null) as med7,
      percentile_cont(0.5) within group (order by p.vues) filter (where p.jour between pr.mur - 34 and pr.mur - 7 and p.vues is not null) as med_avant,
      count(*) filter (where p.jour between pr.mur - 13 and pr.mur and p.vues < 50) as sous50_14
    from pub p join comptes co on co.id = p.compte_id, params pr
    where co.is_active
    group by p.compte_id, co.handle_tiktok, co.langue, co.pays, co.created_at
  ),
  l7 as (
    select p.langue, count(*) as posts, percentile_cont(0.5) within group (order by p.vues) as vues_med,
      round(100.0 * count(*) filter (where p.vues >= 10000) / count(*), 1) as pct_10k,
      round((percentile_cont(0.5) within group (order by p.vues / nullif(med.m, 0)))::numeric, 2) as r_med
    from pub p left join med on med.compte_id = p.compte_id, params pr
    where p.jour between pr.mur - 6 and pr.mur and not p.rappel and p.vues is not null
    group by p.langue having count(*) >= 20
  ),
  lprec as (
    select p.langue, round(100.0 * count(*) filter (where p.vues >= 10000) / count(*), 1) as pct_10k,
      round((percentile_cont(0.5) within group (order by p.vues / nullif(med.m, 0)))::numeric, 2) as r_med
    from pub p left join med on med.compte_id = p.compte_id, params pr
    where p.jour between pr.mur - 13 and pr.mur - 7 and not p.rappel and p.vues is not null
    group by p.langue
  ),
  lb7 as (
    select coalesce(lab.label, '?') as label, count(*) as posts, percentile_cont(0.5) within group (order by p.vues) as vues_med,
      round(100.0 * count(*) filter (where p.vues >= 10000) / count(*), 1) as pct_10k
    from pub p left join lab on lab.contenu_id = p.contenu_id, params pr
    where p.jour between pr.mur - 6 and pr.mur and not p.rappel and p.vues is not null and p.app = 'sophia'
    group by 1
  ),
  lbprec as (
    select coalesce(lab.label, '?') as label, round(100.0 * count(*) filter (where p.vues >= 10000) / count(*), 1) as pct_10k
    from pub p left join lab on lab.contenu_id = p.contenu_id, params pr
    where p.jour between pr.mur - 13 and pr.mur - 7 and not p.rappel and p.vues is not null and p.app = 'sophia'
    group by 1
  ),
  pods7 as (
    select count(*) as posts, count(*) filter (where p.vues >= 10000) as n_10k, count(*) filter (where p.vues >= 50000) as n_50k,
      round(100.0 * count(*) filter (where p.vues >= 10000) / nullif(count(*), 0), 1) as pct_10k
    from pub p, params pr where p.original and p.jour between pr.mur - 6 and pr.mur and not p.rappel and p.vues is not null
  )
  select jsonb_build_object(
    'jour', pr.jour, 'jour_mur', pr.mur, 'genere_at', now(),
    'fraicheur', jsonb_build_object(
      'dernier_releve_at', f.dernier_releve_at,
      'heures_depuis_releve', round(extract(epoch from (now() - f.dernier_releve_at)) / 3600, 1),
      'posts_murs', f.murs, 'posts_murs_sans_vues', f.sans_vues,
      'sans_vues_pct', round(100.0 * f.sans_vues / nullif(f.murs, 0), 1)),
    'hier', jsonb_build_object(
      'posts', h.posts, 'rappels', h.rappels,
      'par_app', (select jsonb_object_agg(app, n) from (select p.app, count(*) as n from pub p where p.jour = pr.jour group by p.app) x),
      'comptes_ayant_poste', h.comptes_ayant_poste,
      'comptes_attendus', (select count(*) from attendus),
      'comptes_sans_post', (select count(*) from attendus a where not exists (select 1 from pub p where p.compte_id = a.id and p.jour = pr.jour)),
      'non_publies_prevus', (select count(*) from passages x where x.statut = 'assigne' and x.date_publication_prevue = pr.jour),
      'nouveaux_comptes', (select count(*) from comptes co where (co.created_at at time zone 'Europe/Paris')::date = pr.jour),
      'originaux_pct', h.originaux_pct,
      'stock_pct', jsonb_build_object('le7j', h.le7j_pct, 'le21j', h.le21j_pct, 'plus45j', h.plus45j_pct)),
    'percees', jsonb_build_object(
      'posts', pc.posts, 'releves', pc.releves, 'releves_pct', round(100.0 * pc.releves / nullif(pc.posts, 0)),
      'n_10k', pc.n_10k, 'n_50k', pc.n_50k, 'taux_10k_pct', pc.taux_10k_pct, 'max_vues', pc.max_vues,
      'ref_14j', jsonb_build_object('posts_jour', r.posts_jour, 'n_10k_jour', r.n_10k_jour, 'n_50k_jour', r.n_50k_jour, 'taux_10k_pct', r.taux_10k_pct),
      'top', (select jsonb_agg(jsonb_build_object('compte', co.handle_tiktok, 'langue', m.langue, 'pays', co.pays, 'label', lab.label,
                  'app', m.app, 'vues', m.vues, 'titre', left(regexp_replace(coalesce(m.titre, ''), '\s+', ' ', 'g'), 80), 'url', m.publie_url, 'original', m.original) order by m.vues desc)
              from (select * from mur where vues is not null order by vues desc limit 5) m
              join comptes co on co.id = m.compte_id left join lab on lab.contenu_id = m.contenu_id),
      'serie_7j', (select jsonb_agg(jsonb_build_object('jour', s.jour, 'posts', s.n, 'releves', s.rl, 'n_10k', s.k, 'n_50k', s.k5) order by s.jour)
                   from (select p.jour, count(*) as n, count(p.vues) as rl, count(*) filter (where p.vues >= 10000) as k, count(*) filter (where p.vues >= 50000) as k5
                         from pub p where p.jour between pr.mur - 6 and pr.mur and not p.rappel group by p.jour) s)),
    'stock', jsonb_build_object(
      'par_age', (select jsonb_agg(jsonb_build_object('age', x.age, 'contenus', x.n, 'passages_restants', x.rest, 'a_plus', x.ap, 'b', x.b, 'originaux', x.o, 'src_200k', x.s2) order by x.age)
                  from (select case when e.created_at > now() - interval '7 days' then '1 ≤ 7 j' when e.created_at > now() - interval '21 days' then '2 8-21 j'
                                    when e.created_at > now() - interval '45 days' then '3 22-45 j' else '4 > 45 j' end as age,
                               count(*) as n, sum(e.restants) as rest, count(*) filter (where e.tier in ('A', 'S', 'S+')) as ap, count(*) filter (where e.tier = 'B') as b,
                               count(*) filter (where e.original) as o, count(*) filter (where e.vues_source >= 200000) as s2
                        from etat e group by 1) x),
      'imports_7j', (select to_jsonb(i) from imports7 i),
      'reserve_labels', (select jsonb_agg(jsonb_build_object('label', lr.nom, 'app', coalesce(a.slug, 'sophia'), 'contenus_prets', lr.contenus_prets,
                            'passages_restants', lr.passages_restants, 'demande_jour', lr.demande_jour, 'reserve_jours', lr.reserve_jours) order by lr.reserve_jours nulls last)
                         from label_reserve lr left join applications a on a.id = lr.application_id where lr.comptes > 0)),
    'comptes', jsonb_build_object(
      'suspects', (select jsonb_agg(jsonb_build_object('compte', s.handle_tiktok, 'langue', s.langue, 'pays', s.pays, 'nouveau', s.nouveau, 'n7', s.n7, 'sous200_7', s.sous200_7,
                      'med7', s.med7::int, 'med_avant', s.med_avant::int, 'ratio', round((s.med7 / nullif(s.med_avant, 0))::numeric, 2)) order by s.med7 / nullif(s.med_avant, 0) nulls first)
                   from (select * from sante where n7 >= 3 and (sous200_7 * 2 >= n7 or (med_avant >= 1000 and med7 < 0.3 * med_avant)) limit 15) s),
      'sous50_14j', (select jsonb_agg(jsonb_build_object('compte', s.handle_tiktok, 'langue', s.langue, 'sous50', s.sous50_14) order by s.sous50_14 desc)
                     from (select * from sante where sous50_14 >= 3 limit 10) s),
      'silencieux_3j', (select jsonb_build_object('n', count(*), 'comptes', jsonb_agg(co.handle_tiktok order by co.handle_tiktok) filter (where rn <= 10))
                        from (select co.*, row_number() over (order by co.handle_tiktok) as rn
                              from comptes co
                              where co.is_active and coalesce(co.type_compte, 'perso') <> 'cm' and coalesce(co.ugc_ai_video, false) = false
                                and co.warmup_ends_at is not null and co.warmup_ends_at <= now() - interval '3 days'
                                and not exists (select 1 from pub p where p.compte_id = co.id and p.jour >= pr.auj - 3)) co),
      'nouveaux_7j', (select count(*) from comptes co where co.created_at > now() - interval '7 days'),
      'warmup_en_cours', (select count(*) from comptes co where co.is_active and co.warmup_ends_at > now())),
    'langues_7j', (select jsonb_agg(jsonb_build_object('langue', l.langue, 'posts', l.posts, 'vues_med', l.vues_med::int, 'pct_10k', l.pct_10k, 'r_med', l.r_med,
                      'pct_10k_prec', lp.pct_10k, 'r_med_prec', lp.r_med) order by l.posts desc)
                   from l7 l left join lprec lp on lp.langue = l.langue),
    'labels_7j', (select jsonb_agg(jsonb_build_object('label', l.label, 'posts', l.posts, 'part_pct', round(100.0 * l.posts / nullif(t.total, 0), 1), 'vues_med', l.vues_med::int,
                     'pct_10k', l.pct_10k, 'pct_10k_prec', lp.pct_10k) order by l.posts desc)
                  from lb7 l left join lbprec lp on lp.label = l.label, (select sum(posts) as total from lb7) t),
    'pods_7j', (select to_jsonb(q) from pods7 q)
  )
  from params pr, fraicheur f, hier h, percees pc, ref14 r
  into v_resultat;

  return v_resultat;
end
$$;

revoke all on function public.sanity_quotidien(date) from public, anon;
grant execute on function public.sanity_quotidien(date) to authenticated, service_role;
