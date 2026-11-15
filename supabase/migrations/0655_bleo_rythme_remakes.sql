-- 0655 : BLEO, lot 4 : le rythme des podz de remakes, calculé sur les comptes
-- qui postent (décisions d'Adrien du 5/11).
--
-- Jusqu'ici, le `par_jour` d'un podz de remakes était tenu à la main dans
-- `pods/rythme.json` par le chef, avec des règles pensées pour l'objectif de
-- 30 % (« le rythme ne baisse jamais », +1 quand un podz perce…). Résultat au
-- 5/11 : la page blanche livrait 12 posts par jour, Fathomly 9, alors que
-- chacun de leurs comptes n'en poste que 2 du label, et que leur file à juger
-- n'en teste qu'une demi à deux et demie par jour (40 à 65 contenus attendent
-- leur test). Kaja, à l'inverse, livrait 2 par jour pour des comptes qui n'ont
-- plus que 2 jours de posts neufs.
--
-- Désormais, le rythme d'un podz de remakes est ce que mangent ses comptes
-- (`bleo_rythme_remakes`) :
--   * CONSOMMATION : un post livré sert toutes les langues ; chaque compte du
--     label en poste p par jour (ses `posts_par_jour` partagés entre ses
--     labels). Il faut donc p posts neufs par jour, p du compte qui en poste le
--     plus.
--   * STOCK : pour chaque compte, les posts du label qu'il n'a jamais publiés,
--     servis dans sa langue (commandes de rattrapage ouvertes comprises), en
--     jours de sa consommation. Le compte le plus juste décide.
--   * RÈGLE : sous la cible (10 jours), on rattrape l'écart en 7 jours
--     (p + écart × p / 7) ; au-dessus, on descend jusqu'à p / 2 à deux fois la
--     cible. Jamais moins que les tests que BLEO peut faire quand sa file à
--     juger n'a plus 7 jours d'avance ; entre 1 et 12 par jour.
--   * RATTRAPAGE (lot 3) : en plus, chaque jour, de quoi nourrir les comptes
--     des langues à rattraper : p + leur écart à la cible / 7, au plus les
--     commandes ouvertes.
-- Les seuils sont des réglages (`reglages.bleo.rythme_remakes`). Le guichet
-- (`pods/index.ts`, action `boite`) rend ce rythme aux podz de remakes à la
-- place de celui de `pods/rythme.json`, qui ne garde pour eux que la pause.
--
-- Vérifié avant application (5/11) : page blanche 2 par jour + 3 rattrapages
-- (12 avant) ; Fathomly 2 + 3 (9 avant) ; yasmine 3 (6 avant) ; Kaja 5 (2
-- avant). La voie 1 ne change pas (fonction et réglage neufs, rien d'autre).
--
-- Retour arrière : le guichet retombe sur `pods/rythme.json` si la fonction
-- manque (`drop function public.bleo_rythme_remakes(text)`).

set lock_timeout = '5s';

update public.reglages
   set valeur = jsonb_set(valeur, '{rythme_remakes}', jsonb_build_object(
     'stock_cible_jours', 10,
     'horizon_jours', 7,
     'avance_tests_jours', 7,
     'plancher', 1,
     'plafond', 12
   ), true)
 where cle = 'bleo' and not (valeur ? 'rythme_remakes');

create or replace function public.bleo_rythme_remakes(p_pod text default null)
returns table(
  pod text,
  label text,
  par_jour integer,
  rattrapage_du_jour integer,
  consommation numeric,
  stock_jours numeric,
  compte_le_plus_juste text,
  tests_par_jour numeric,
  avance_tests_jours numeric,
  commandes integer,
  comptes jsonb
)
language sql
stable
set search_path to 'public'
as $function$
  with prm as (
    select coalesce((r.valeur->'rythme_remakes'->>'stock_cible_jours')::numeric, 10) as cible,
           greatest(coalesce((r.valeur->'rythme_remakes'->>'horizon_jours')::numeric, 7), 1) as horizon,
           coalesce((r.valeur->'rythme_remakes'->>'avance_tests_jours')::numeric, 7) as avance_min,
           coalesce((r.valeur->'rythme_remakes'->>'plancher')::integer, 1) as plancher,
           coalesce((r.valeur->'rythme_remakes'->>'plafond')::integer, 12) as plafond,
           greatest(coalesce((r.valeur->'file_juger'->>'passages_test')::integer, 2), 1) as passages_test
    from reglages r where r.cle = 'bleo'
  ),
  v as (
    select v.pod, v.label, v.label_id, l.nom
    from labels_100_podz v
    join pods p on p.slug = v.pod and p.actif and p.langues is not null
    join labels l on l.id = v.label_id
    where v.voie = 2 and (p_pod is null or v.pod = p_pod)
  ),
  servies as (
    select d.label_id, d.langue from public.langues_declarees_podz() d
  ),
  -- Les comptes actifs du label dans une langue que le podz sert.
  cpt as (
    select v.pod, v.label_id, c.id as compte_id, c.handle_tiktok as handle, c.langue,
           coalesce(c.posts_par_jour, 2)::numeric
             / greatest((select count(*) from compte_labels x where x.compte_id = c.id), 1) as p
    from v
    join compte_labels cl on cl.label_id = v.label_id
    join comptes c on c.id = cl.compte_id and c.is_active and c.langue is not null
    where exists (select 1 from servies s where s.label_id = v.label_id and s.langue = lower(c.langue))
  ),
  -- Les posts du label jamais publiés par le compte : servis dans sa langue, ou
  -- commandés en rattrapage dans cette langue.
  stock as (
    select k.compte_id,
           count(*) filter (where public.bleo_deck_sert(c.id, k.langue)) as neufs,
           count(*) filter (where not public.bleo_deck_sert(c.id, k.langue)
                              and exists (select 1 from bleo_commandes_langue bc, unnest(bc.langues) l
                                          where bc.contenu_id = c.id and bc.statut = 'a_faire'
                                            and (lower(l) = lower(k.langue) or lower(l) = split_part(lower(k.langue), '-', 1)))) as commandes
    from cpt k
    join contenu_labels xl on xl.label_id = k.label_id
    join contenus c on c.id = xl.contenu_id and c.statut = 'valide'::contenu_statut and c.livre
    where not exists (select 1 from passages pa where pa.compte_id = k.compte_id and pa.contenu_id = c.id)
    group by k.compte_id
  ),
  pc as (
    select k.*, coalesce(s.neufs, 0) as neufs, coalesce(s.commandes, 0) as cmd,
           (coalesce(s.neufs, 0) + coalesce(s.commandes, 0)) / nullif(k.p, 0) as jours,
           coalesce(s.neufs, 0) / nullif(k.p, 0) as jours_sans_cmd
    from cpt k left join stock s on s.compte_id = k.compte_id
  ),
  -- Ce que la file à juger du label teste par jour (7 derniers plans) et son avance.
  tests as (
    select v.label_id,
           avg((r.resume->'labels_file_juger'->v.nom->>'capacite')::numeric) / (select passages_test from prm) as par_jour
    from v
    join bleo_runs r on r.fini_le is not null and r.erreur is null and r.jour_vise > current_date - 7
    group by v.label_id
  ),
  lab as (
    select v.pod, v.label, v.label_id,
           (select max(pc.p) from pc where pc.label_id = v.label_id) as p,
           (select min(pc.jours) from pc where pc.label_id = v.label_id) as s,
           (select pc.handle || ' (' || pc.langue || ')' from pc where pc.label_id = v.label_id
             order by pc.jours, pc.handle limit 1) as plus_juste,
           t.par_jour as tests,
           (select count(*) from bleo_familles f where f.label_id = v.label_id and f.verdict = 'en_attente')
             / nullif(t.par_jour, 0) as avance,
           (select count(*) from bleo_commandes_langue bc where bc.pod = v.pod and bc.statut = 'a_faire')::integer as cmd,
           (select max(pc.p + greatest(0, (select cible from prm) - pc.jours_sans_cmd) * pc.p / (select horizon from prm))
              from pc where pc.label_id = v.label_id and pc.cmd > 0) as besoin_rattrapage
    from v left join tests t on t.label_id = v.label_id
  )
  select lab.pod, lab.label,
         least(prm.plafond, greatest(
           prm.plancher,
           ceil(case
             when lab.s is null then 0
             when lab.s < prm.cible then lab.p + (prm.cible - lab.s) * lab.p / prm.horizon
             else lab.p * greatest(0.5, 1 - 0.5 * (lab.s - prm.cible) / nullif(prm.cible, 0))
           end - 1e-9)::integer,
           case when lab.avance < prm.avance_min then ceil(lab.tests - 1e-9)::integer else 0 end
         ))::integer as par_jour,
         least(lab.cmd, ceil(coalesce(lab.besoin_rattrapage, 0) - 1e-9)::integer)::integer as rattrapage_du_jour,
         round(lab.p, 2) as consommation,
         round(lab.s, 1) as stock_jours,
         lab.plus_juste,
         round(lab.tests, 2) as tests_par_jour,
         round(lab.avance, 1) as avance_tests_jours,
         lab.cmd,
         coalesce((select jsonb_agg(jsonb_build_object('compte', pc.handle, 'langue', pc.langue, 'par_jour', round(pc.p, 2),
                                                       'neufs', pc.neufs, 'commandes', pc.cmd, 'jours', round(pc.jours, 1))
                                    order by pc.jours, pc.handle)
                   from pc where pc.label_id = lab.label_id), '[]'::jsonb)
  from lab cross join prm
  order by lab.pod;
$function$;

comment on function public.bleo_rythme_remakes(text) is
  'BLEO lot 4 (0655) : rythme des podz de remakes, calculé sur ce que mangent leurs comptes (posts par jour, stock de posts jamais publiés du compte le plus juste, file à juger) ; rattrapage du jour. Réglages : reglages.bleo.rythme_remakes. Lu par l''action `boite` des podz et par le chef.';

revoke execute on function public.bleo_rythme_remakes(text) from public, anon;
