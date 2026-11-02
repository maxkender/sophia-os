-- 0606 : BLEO, retour à la règle de la spec pour ouvrir la génération 2
-- (décision d'Adrien le 29/10, qui annule le seuil de 0605).
--
--   * Génération 2 ouverte au verdict de la génération 1 : un passage à
--     10 000 vues ou r ≥ 2 (`contenus.verdict = 'gagnant'`, posé par la nuit).
--   * L'accroche ne change pas de règle : identique en génération 1,
--     reformulée en génération 2 (`accroche_attendue`).
--   * Les générations 2 passent en tête de la boîte de leur label : c'est le
--     signal le plus fort (une déclinaison qui a déjà gagné).
--
-- AJOUT SEULEMENT : la vue est redéfinie avec les mêmes colonnes, et les deux
-- clés de 0605 sortent de `reglages.bleo.boite`.

set lock_timeout = '5s';

update public.reglages
   set valeur = valeur #- '{boite,g2_vues_moyennes}' #- '{boite,g2_min_passages}'
 where cle = 'bleo';

create or replace view public.bleo_boite
  with (security_invoker = true)
as
  with reg as (select valeur from public.reglages where cle = 'bleo'),
  fam as (
    select f.*
      from public.bleo_familles f
      join public.labels l on l.id = f.label_id
     where f.verdict = 'gagnante' and not f.close and l.voie = 1
  ),
  -- Déclinaisons déjà faites d'un parent : contenus (hors rejetés) et livraisons en attente.
  enfants as (
    select parent, count(*) as n from (
      select c.parent_bleo_id as parent from public.contenus c
       where c.parent_bleo_id is not null and c.statut <> 'rejete'
      union all
      select pl.parent_contenu_id from public.pod_livraisons pl
       where pl.parent_contenu_id is not null and pl.statut = 'a_valider'
    ) z group by parent
  ),
  -- Passages des 7 derniers jours (budget de famille, A8).
  sept as (
    select c.famille_id, cl.label_id
      from public.passages p
      join public.contenus c on c.id = p.contenu_id
      join public.contenu_labels cl on cl.contenu_id = p.contenu_id
     where p.date_publication_prevue between (now() at time zone 'Europe/Paris')::date - 6
                                         and (now() at time zone 'Europe/Paris')::date
       and not coalesce(p.est_rappel, false)
  ),
  budget as (
    select fam.id as famille_id,
           (select count(*) from sept s where s.famille_id = fam.id)
             >= greatest((reg.valeur->'garde_fous'->>'budget_plancher')::numeric,
                         (reg.valeur->'garde_fous'->>'budget_famille')::numeric
                           * (select count(*) from sept s where s.label_id = fam.label_id)) as au_budget
      from fam, reg
  ),
  g1 as (
    select fam.label_id, fam.id as famille_id, 'g1'::text as sorte, fam.racine_contenu_id as parent_contenu_id,
           coalesce((select n from enfants e where e.parent = fam.racine_contenu_id), 0) as faites, fam.verdict_le
      from fam
  ),
  g2 as (
    select fam.label_id, fam.id as famille_id, 'g2'::text as sorte, c.id as parent_contenu_id,
           coalesce((select n from enfants e where e.parent = c.id), 0) as faites, fam.verdict_le
      from fam
      join public.contenus c on c.famille_id = fam.id and c.generation = 1 and c.statut = 'valide'
                            and c.verdict = 'gagnant'
  ),
  tout as (
    select * from g1
    union all
    select * from g2 where (select (valeur->'boite'->>'generation_max')::int from reg) >= 2
  )
  select t.label_id, t.famille_id,
         coalesce(f.accroche_norm, pc.titre) as accroche,
         t.sorte, t.parent_contenu_id, t.faites, t.verdict_le,
         b.au_budget,
         row_number() over (partition by t.label_id
                            order by t.sorte = 'g2' desc,
                                     (select count(*) from public.contenus c2
                                       where c2.famille_id = t.famille_id and c2.generation > 0) = 0 desc,
                                     t.verdict_le desc nulls last, t.parent_contenu_id) as rang,
         case t.sorte when 'g1' then 'identique' else 'reformulee' end as accroche_attendue
    from tout t
    join public.bleo_familles f on f.id = t.famille_id
    left join public.contenus pc on pc.id = t.parent_contenu_id
    join budget b on b.famille_id = t.famille_id
   where t.faites < (select (valeur->'boite'->>'declinaisons_par_parent')::int from reg);
comment on view public.bleo_boite is
  'BLEO (A9) : déclinaisons possibles de chaque label de la voie 1, rang 1 = la première. g2 (accroche reformulée, génération 1 gagnante) en tête, puis g1 (accroche identique), familles jamais déclinées d''abord.';
