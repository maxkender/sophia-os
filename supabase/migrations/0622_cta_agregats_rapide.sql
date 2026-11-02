-- 0622 : `cta_agregats()` en 2 s au lieu de 12 (30/10).
--
-- L'API (PostgREST) coupe toute requête au bout de 8 s (statement_timeout du
-- rôle authenticator) : le calcul du lundi aurait échoué. Deux causes, vues
-- au plan d'exécution :
--   * le planificateur estimait 4 lignes là où il y en a 43 732, et joignait
--     les posts aux contenus qui varient par une boucle imbriquée (44 millions
--     de comparaisons) : la jointure est maintenant une étape matérialisée,
--     faite par hachage ;
--   * la vue rendait aussi la slide d'avant de chaque post (pour le
--     classement), calculée pour rien ici : on ne lit que les colonnes utiles.
-- Même résultat, même signature.

create or replace function public.cta_agregats()
returns table (label text, application_id uuid, dimension text, valeur text, n integer, contenus integer,
               r_med numeric, effet numeric, percee numeric)
language sql
stable
set search_path to 'public'
as $$
  with reg as (
    select coalesce((valeur->'mesure'->>'r_plafond')::numeric, 20) as plafond from reglages where cle = 'bleo'
  ),
  -- Matérialisées : le planificateur sous-estime les lignes de ces étapes.
  c as materialized (
    select contenu_id, compte_id, vues, voie_cta, application_id, nb_slides, slide_cta, cta_hash
      from cta_ctas_publies where mur and vues is not null
  ),
  md as materialized (select compte_id, mediane from bleo_mediane_compte where mediane > 0),
  m as materialized (
    select c.*, least(c.vues / md.mediane, reg.plafond) as r,
           ln(greatest(least(c.vues / md.mediane, reg.plafond), 0.05)) as lr
      from c join md on md.compte_id = c.compte_id cross join reg
  ),
  -- À contenu égal : l'écart du post à la moyenne (en log) des posts du même contenu.
  x as materialized (
    select m.*, m.lr - avg(m.lr) over (partition by m.contenu_id) as rel,
           count(*) over (partition by m.contenu_id) as n_contenu,
           f.forme
      from m left join cta_formes f on f.cta_hash = m.cta_hash
  ),
  d as materialized (
    select x.contenu_id, x.application_id as appli, 'forme' as dim,
           coalesce(x.forme, 'non_classee') as val, x.r, x.rel from x where x.n_contenu >= 2
    union all
    select x.contenu_id, x.application_id, 'slide',
           case when x.slide_cta >= 8 then '8+' else x.slide_cta::text end, x.r, x.rel from x where x.n_contenu >= 2
    union all
    select x.contenu_id, x.application_id, 'place',
           case when x.slide_cta <= 3 then 'debut'
                when x.slide_cta = x.nb_slides then 'derniere'
                when x.slide_cta = x.nb_slides - 1 then 'avant_derniere'
                else 'milieu' end, x.r, x.rel from x where x.n_contenu >= 2
    union all
    select x.contenu_id, x.application_id, 'voie', coalesce(x.voie_cta, 'aucune'), x.r, x.rel from x where x.n_contenu >= 2
  ),
  -- Un contenu n'apprend quelque chose sur une dimension que si elle y varie.
  dv as materialized (
    select d.dim, d.contenu_id from d group by d.dim, d.contenu_id having count(distinct d.val) >= 2
  ),
  dd as materialized (
    select d.* from d join dv on dv.dim = d.dim and dv.contenu_id = d.contenu_id
  ),
  dl as (
    select l.nom as lab, dd.* from dd
      join contenu_labels cl on cl.contenu_id = dd.contenu_id
      join labels l on l.id = cl.label_id
    union all
    select '*' as lab, dd.* from dd
  )
  select dl.lab, dl.appli, dl.dim, dl.val, count(*)::int, count(distinct dl.contenu_id)::int,
         round(percentile_cont(0.5) within group (order by dl.r)::numeric, 3),
         round(exp(avg(dl.rel))::numeric, 3),
         round(avg((dl.r >= 3)::int)::numeric, 3)
    from dl
   group by dl.lab, dl.appli, dl.dim, dl.val;
$$;

comment on function public.cta_agregats() is
  'CTA par label et par appli (label * = tous) : forme, slide, place et voie, sur les contenus où elle varie. effet = moyenne géométrique de r ÷ celle des autres posts du même contenu (1,08 = +8 %) ; percee = part de r ≥ 3 (0621, accélérée en 0622).';
