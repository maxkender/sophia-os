-- 0834 : la lecture du QG (22/11, Max). GET /api/qg/apps?from&to → fonction Edge `qg` → qg_apps(from, to).
-- Lecture seule : aucune écriture, rien d'autre que des agrégats (pas de nom, pas d'email, pas d'identifiant de posteur).
-- Par application (passages.application_id, l'appli du post et pas celle du compte) et par jour (heure de Paris) :
--   posts publiés, vues (total, médiane, nombre de posts mesurés), % de posts à 10 k vues ou plus,
--   comptes et posteurs qui ont posté pour l'appli ce jour-là, coût des posteurs ;
-- et le même découpage par label (contenu_labels → labels) et par pays (comptes.pays).
--
-- Coût d'un posteur : pour chaque semaine (lundi → dimanche), tarif de la semaine × nombre de ses comptes qui ont
-- publié cette semaine-là ; ce coût est réparti sur ses posts de la semaine, à parts égales, donc entre les
-- applications (et les jours, labels, pays) selon la part de ses posts. Tarif : Ruul → ruul_tarif (tarif Ruul du
-- posteur, sinon celui de sa zone) ; Upwork → tarif de sa zone (zones_paie_pays → zones_paie), sinon profiles.tarif_hebdo.
-- Les semaines au bord de la période sont comptées en entier puis réparties : seuls les jours demandés sont rendus.
-- Additif : une fonction nouvelle, réservée au service (la fonction Edge).

create or replace function public.qg_apps(p_from date, p_to date)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
with bornes as (
  select p_from as d1, p_to as d2,
         p_from - (extract(isodow from p_from)::int - 1) as s1,
         p_to + (7 - extract(isodow from p_to)::int) as s2
),
base0 as (
  select pa.id, pa.application_id, pa.compte_id, c.poster_id, c.pays,
         coalesce(l.nom, '(sans label)') as label,
         coalesce((pa.publie_at at time zone 'Europe/Paris')::date, pa.date_publication_prevue) as jour,
         pa.vues
    from public.passages pa
    join public.comptes c on c.id = pa.compte_id
    left join public.contenu_labels cl on cl.contenu_id = pa.contenu_id
    left join public.labels l on l.id = cl.label_id
    cross join bornes b
   where pa.statut = 'publie'
     and coalesce((pa.publie_at at time zone 'Europe/Paris')::date, pa.date_publication_prevue) between b.s1 and b.s2
),
-- La semaine (lundi) en colonne : la jointure avec `semaines` se fait sur des égalités simples (hash), pas sur une
-- expression recalculée à chaque ligne.
base as materialized (
  select b0.*, b0.jour - (extract(isodow from b0.jour)::int - 1) as semaine from base0 b0
),
semaines as (
  select poster_id, semaine,
         count(*) as posts, count(distinct compte_id) as comptes
    from base group by 1, 2
),
tarifs as materialized (
  select pr.id as poster_id,
         case when pr.canal_paie = 'ruul' then public.ruul_tarif(pr.id)
              else coalesce(public.paie_tarif_zone(pr.id), pr.tarif_hebdo) end as tarif
    from public.profiles pr
   where pr.id in (select distinct poster_id from semaines)
),
posts as materialized (
  select b.*, coalesce(t.tarif, 0) * s.comptes / s.posts::numeric as cout, t.tarif is null as sans_tarif
    from base b
    join semaines s on s.poster_id = b.poster_id and s.semaine = b.semaine
    left join tarifs t on t.poster_id = b.poster_id
   where b.jour between p_from and p_to
),
par_jour as (
  select jour, application_id, null::text as label, null::text as pays,
         count(*) as posts, sum(vues) as vues_total, count(vues) as vues_mesurees,
         percentile_cont(0.5) within group (order by vues) as vues_mediane,
         count(*) filter (where vues >= 10000) as posts_10k,
         count(distinct compte_id) as comptes_actifs, count(distinct poster_id) as posteurs_actifs,
         sum(cout) as cout
    from posts group by jour, application_id
),
par_label as (
  select jour, application_id, label, null::text as pays,
         count(*), sum(vues), count(vues), percentile_cont(0.5) within group (order by vues),
         count(*) filter (where vues >= 10000), count(distinct compte_id), count(distinct poster_id), sum(cout)
    from posts group by jour, application_id, label
),
par_pays as (
  select jour, application_id, null::text, pays,
         count(*), sum(vues), count(vues), percentile_cont(0.5) within group (order by vues),
         count(*) filter (where vues >= 10000), count(distinct compte_id), count(distinct poster_id), sum(cout)
    from posts group by jour, application_id, pays
),
lignes as (
  select 'jour' as niveau, * from par_jour
  union all select 'label', * from par_label
  union all select 'pays', * from par_pays
),
json_lignes as (
  select niveau, jour, application_id, label, pays,
         jsonb_strip_nulls(jsonb_build_object(
           'jour', jour, 'application_id', application_id, 'label', label, 'pays', pays,
           'posts', posts, 'vues_total', coalesce(vues_total, 0), 'vues_mediane', round(vues_mediane::numeric),
           'vues_mesurees', vues_mesurees,
           'pct_10k', case when vues_mesurees > 0 then round(100.0 * posts_10k / vues_mesurees, 1) end,
           'comptes_actifs', comptes_actifs, 'posteurs_actifs', posteurs_actifs,
           'cout_posteurs_usd', round(cout, 2))) as j
    from lignes
)
select jsonb_build_object(
  'from', p_from, 'to', p_to, 'fuseau', 'Europe/Paris', 'devise', 'USD', 'genere_at', now(),
  'applications', coalesce((select jsonb_agg(jsonb_build_object('application_id', a.id, 'slug', a.slug, 'nom', a.nom) order by a.slug)
                              from public.applications a), '[]'::jsonb),
  'jours', coalesce((select jsonb_agg(j order by jour, application_id) from json_lignes where niveau = 'jour'), '[]'::jsonb),
  'par_label', coalesce((select jsonb_agg(j order by jour, application_id, label) from json_lignes where niveau = 'label'), '[]'::jsonb),
  'par_pays', coalesce((select jsonb_agg(j order by jour, application_id, pays) from json_lignes where niveau = 'pays'), '[]'::jsonb),
  'controle', jsonb_build_object(
    'posts', (select count(*) from posts),
    'posts_sans_application', (select count(*) from posts where application_id is null),
    'posteurs_sans_tarif', (select count(distinct poster_id) from posts where sans_tarif),
    'cout_total_usd', (select round(coalesce(sum(cout), 0), 2) from posts))
);
$$;

revoke execute on function public.qg_apps(date, date) from public, anon, authenticated;
grant execute on function public.qg_apps(date, date) to service_role;
