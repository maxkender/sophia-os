-- 0716 : les podz, en clair (demande d'Adrien du 14/11).
--
-- « C'est trop flou : qui décide de quoi, pourquoi le rythme ne baisse pas
-- quand ça ne marche pas, et on n'a pas de suivi de la vie d'un podz. »
--
-- 1. LE RYTHME SUIT LES RÉSULTATS (voie 1). Jusqu'ici, le chef montait un
--    podz de 1 quand sa boîte tenait plus de 6 semaines, et ne le baissait
--    qu'après 14 jours de boîte sous 1 semaine : le stock décidait, pas les
--    vues. `bleo_rythme_resultats()` donne, pour chaque podz d'originaux, ses
--    verdicts sur les livraisons validées des 21 derniers jours (full tests et
--    déclinaisons à part), son taux de gagnants face à la flotte des podz, et
--    le changement de rythme à appliquer :
--      * moins de 10 verdicts : 0 (pas assez de recul) ;
--      * taux < 0,5 × flotte : −1 (jamais sous 1 par jour) ;
--      * file à juger du label pleine (≥ 90 % de ses créneaux sur 7 jours) :
--        0, monter ne servirait à rien, ses livraisons attendraient ;
--      * taux ≥ 1,25 × flotte : +2 ;
--      * taux ≥ flotte : +1 ;
--      * sinon : 0.
--    Le chef l'applique chaque matin à `pods/rythme.json` (pods/chef/AGENT.md).
--    Les seuils sont dans `reglages.bleo.podz.rythme_resultats`.
--    La voie 2 garde son rythme calculé sur la consommation des comptes
--    (`bleo_rythme_remakes`, 0655).
--
-- 2. LA FICHE DE CHAQUE PODZ. `pods_fiches()` rend, pour chaque podz actif :
--    sa voie, son label, s'il est 100 % podz, ses comptes par langue, ses
--    posts publiés sur 15 jours, ses livraisons du jour (full tests,
--    déclinaisons, remakes, à valider, rejetées), sa boîte (familles,
--    semaines, part de full tests), ses verdicts sur 21 jours et la
--    proposition de rythme. Lue par Pilotage → Pods (une fiche en tête de
--    chaque podz).
--
-- 3. LE DÉMARRAGE D'UN PODZ NEUF : 4 comptes d'office (réglage
--    `choix_labels.test_pod_comptes`, 3 avant). Le choix de label (code,
--    `_shared/choix_label_equilibre.ts`) donne désormais la priorité à un label
--    de podz en test qui n'a pas encore ses comptes, dans une langue où il n'en
--    a aucun : chaque compte de test arrive dans une langue différente. Il est
--    jugé à 30 posts mesurés, comme avant.
--
-- Additive : deux fonctions en lecture, deux clés de réglage. Retour arrière :
-- supprimer les deux fonctions, remettre `test_pod_comptes` à 3.

-- 1. Réglages.
update public.reglages
   set valeur = jsonb_set(
         valeur,
         '{podz,rythme_resultats}',
         '{"fenetre_jours": 21, "min_verdicts": 10, "seuil_haut": 1.25, "seuil_bas": 0.5, "file_pleine": 0.9}'::jsonb,
         true)
 where cle = 'bleo'
   and valeur ? 'podz';

update public.reglages
   set valeur = jsonb_set(valeur, '{test_pod_comptes}', '4'::jsonb, true)
 where cle = 'choix_labels';

-- 2. Le rythme par les résultats (voie 1).
create or replace function public.bleo_rythme_resultats()
returns table (
  pod text,
  label text,
  verdicts integer,
  gagnants integer,
  taux numeric,
  taux_flotte numeric,
  full_tests_juges integer,
  full_tests_gagnants integer,
  declinaisons_jugees integer,
  declinaisons_gagnantes integer,
  en_attente integer,
  file_utilise integer,
  file_capacite integer,
  changement integer,
  raison text
)
language sql
stable
security definer
set search_path to 'public'
as $function$
  with cfg as (
    select coalesce((r.valeur->'podz'->'rythme_resultats'->>'fenetre_jours')::int, 21) as fenetre,
           coalesce((r.valeur->'podz'->'rythme_resultats'->>'min_verdicts')::int, 10) as min_verdicts,
           coalesce((r.valeur->'podz'->'rythme_resultats'->>'seuil_haut')::numeric, 1.25) as haut,
           coalesce((r.valeur->'podz'->'rythme_resultats'->>'seuil_bas')::numeric, 0.5) as bas,
           coalesce((r.valeur->'podz'->'rythme_resultats'->>'file_pleine')::numeric, 0.9) as file_pleine
      from (select (select valeur from reglages where cle = 'bleo') as valeur) r
  ),
  liv as (
    select pl.pod, pl.type_bleo, c.verdict
      from pod_livraisons pl
      join contenus c on c.id = pl.contenu_id
      cross join cfg
     where pl.statut = 'validee'
       and pl.type_bleo in ('full_test', 'declinaison')
       and pl.created_at >= now() - make_interval(days => cfg.fenetre)
  ),
  par_pod as (
    select p.slug as pod, l.nom as label,
           count(*) filter (where v.verdict = 'gagnant')::int as g,
           count(*) filter (where v.verdict = 'non_gagnant')::int as ng,
           count(*) filter (where v.type_bleo = 'full_test' and v.verdict in ('gagnant', 'non_gagnant'))::int as ft_j,
           count(*) filter (where v.type_bleo = 'full_test' and v.verdict = 'gagnant')::int as ft_g,
           count(*) filter (where v.type_bleo = 'declinaison' and v.verdict in ('gagnant', 'non_gagnant'))::int as d_j,
           count(*) filter (where v.type_bleo = 'declinaison' and v.verdict = 'gagnant')::int as d_g,
           count(v.pod) filter (where v.verdict is distinct from 'gagnant' and v.verdict is distinct from 'non_gagnant')::int as attente
      from pods p
      join labels l on l.id = p.label_id
      left join liv v on v.pod = p.slug
     where p.actif
       and p.langues is null          -- voie 1 : les podz de remakes déclarent leurs langues
     group by 1, 2
  ),
  flotte as (
    select sum(g)::numeric / nullif(sum(g + ng), 0) as taux from par_pod
  ),
  file as (
    select f.key as label,
           sum((f.value->>'utilise')::int)::int as u,
           sum((f.value->>'capacite')::int)::int as c
      from bleo_runs r, jsonb_each(r.resume->'labels_file_juger') f
     where r.fini_le is not null and r.erreur is null and r.jour_vise > current_date - 7
     group by 1
  ),
  calc as (
    select pp.*, fl.taux as tf, fi.u, fi.c,
           case when pp.g + pp.ng > 0 then pp.g::numeric / (pp.g + pp.ng) end as t,
           coalesce(fi.u::numeric / nullif(fi.c, 0), 0) as remplissage,
           cfg.*
      from par_pod pp
      cross join flotte fl
      cross join cfg
      left join file fi on fi.label = pp.label
  )
  select pod, label, g + ng, g, round(t, 3), round(tf, 3), ft_j, ft_g, d_j, d_g, attente, u, c,
         case
           when g + ng < min_verdicts or tf is null then 0
           when t < bas * tf then -1
           when remplissage >= file_pleine then 0
           when t >= haut * tf then 2
           when t >= tf then 1
           else 0
         end,
         case
           when g + ng < min_verdicts or tf is null then 'pas assez de verdicts (' || (g + ng) || ' sur ' || min_verdicts || ')'
           when t < bas * tf then 'taux de gagnants bien sous la flotte'
           when remplissage >= file_pleine then 'file à juger du label pleine : monter ne servirait à rien'
           when t >= haut * tf then 'taux de gagnants nettement au-dessus de la flotte'
           when t >= tf then 'taux de gagnants au-dessus de la flotte'
           else 'dans la moyenne'
         end
    from calc
   order by pod;
$function$;

comment on function public.bleo_rythme_resultats() is
  'Podz voie 1 (0716) : verdicts des livraisons validées sur 21 jours, taux de gagnants face à la flotte des podz, changement de rythme à appliquer (−1, 0, +1, +2) et sa raison. Seuils : reglages.bleo.podz.rythme_resultats.';

revoke all on function public.bleo_rythme_resultats() from public, anon;
grant execute on function public.bleo_rythme_resultats() to authenticated, service_role;

-- 3. La fiche de chaque podz.
create or replace function public.pods_fiches()
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v jsonb;
begin
  if auth.uid() is not null and not public.is_admin() then
    raise exception 'pods : réservé aux admins' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(f order by f->>'slug'), '[]'::jsonb) into v
    from (
      select jsonb_build_object(
        'slug', p.slug,
        'nom', p.nom,
        'label', l.nom,
        'voie', case when p.langues is not null then 2 else 1 end,
        'cent_podz', exists (select 1 from labels_100_podz z where z.label_id = p.label_id),
        'langues_pod', to_jsonb(p.langues),
        'comptes', (select count(*) from compte_labels cl join comptes c on c.id = cl.compte_id
                     where cl.label_id = p.label_id and c.is_active),
        'comptes_par_langue', coalesce((select jsonb_object_agg(lg, n) from (
                     select c.langue as lg, count(*) as n
                       from compte_labels cl join comptes c on c.id = cl.compte_id
                      where cl.label_id = p.label_id and c.is_active
                      group by 1) z), '{}'::jsonb),
        'publies_15j', (select count(*) from passages pa join contenu_labels x on x.contenu_id = pa.contenu_id
                         where x.label_id = p.label_id and pa.statut = 'publie'
                           and pa.publie_at >= now() - interval '15 days'),
        'aujourdhui', (select jsonb_build_object(
                         'full_test', count(*) filter (where pl.type_bleo = 'full_test'),
                         'declinaison', count(*) filter (where pl.type_bleo = 'declinaison'),
                         'remake', count(*) filter (where pl.type_bleo is null),
                         'a_valider', count(*) filter (where pl.statut = 'a_valider'),
                         'rejetees', count(*) filter (where pl.statut = 'rejetee'))
                         from pod_livraisons pl
                        where pl.pod = p.slug
                          and pl.created_at >= (date_trunc('day', now() at time zone 'Europe/Paris') at time zone 'Europe/Paris')),
        'boite', case when j.pod is null then null else jsonb_build_object(
                   'familles', j.familles_en_boite,
                   'semaines', j.semaines,
                   'part_full_test', j.part_full_test,
                   'livre_par_jour', j.par_jour) end,
        'resultats', (select to_jsonb(r) - 'pod' - 'label' from public.bleo_rythme_resultats() r where r.pod = p.slug)
      ) as f
        from pods p
        join labels l on l.id = p.label_id
        left join bleo_jauge j on j.pod = p.slug
       where p.actif
    ) s;
  return v;
end;
$function$;

comment on function public.pods_fiches() is
  'Pilotage → Pods (0716) : la fiche de chaque podz actif (voie, label, comptes par langue, livraisons du jour, boîte, verdicts sur 21 jours, proposition de rythme).';

revoke all on function public.pods_fiches() from public, anon;
grant execute on function public.pods_fiches() to authenticated, service_role;
