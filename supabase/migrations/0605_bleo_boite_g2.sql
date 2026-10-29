-- 0605 : BLEO, la règle des déclinaisons décidée par Adrien le 29/10.
--
--   * Génération 1 : même accroche mot pour mot (`accroche_attendue = 'identique'`).
--   * Génération 2 : accroche reformulée (même promesse), ouverte seulement si la
--     déclinaison de génération 1 fait plus de 10 000 vues EN MOYENNE sur au moins
--     2 passages mûrs (hors rappels). La spec ouvrait la génération 2 au verdict
--     (un passage à 10 000 vues ou r ≥ 2) : 14 ouvertures au 29/10 contre 3.
--
-- Les seuils vivent dans `reglages.bleo.boite` (`g2_vues_moyennes`,
-- `g2_min_passages`). Le guichet des podz (reste du lot L4) refusera une
-- génération 1 dont l'accroche diffère de son parent, et une génération 2 dont
-- l'accroche est identique.
--
-- AJOUT SEULEMENT : une vue redéfinie (colonne `accroche_attendue` en fin de
-- vue) et deux clés de réglage.

set lock_timeout = '5s';

update public.reglages
   set valeur = jsonb_set(jsonb_set(valeur, '{boite,g2_vues_moyennes}', '10000'), '{boite,g2_min_passages}', '2')
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
  enfants as (
    select parent, count(*) as n from (
      select c.parent_bleo_id as parent from public.contenus c
       where c.parent_bleo_id is not null and c.statut <> 'rejete'
      union all
      select pl.parent_contenu_id from public.pod_livraisons pl
       where pl.parent_contenu_id is not null and pl.statut = 'a_valider'
    ) z group by parent
  ),
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
  -- Génération 1 qui mérite une génération 2 : plus de g2_vues_moyennes vues en
  -- moyenne sur au moins g2_min_passages passages mûrs, hors rappels.
  g1_fortes as (
    select c.id, c.famille_id
      from public.contenus c
      join fam on fam.id = c.famille_id
      join public.passages p on p.contenu_id = c.id
      cross join reg
     where c.generation = 1 and c.statut = 'valide'
       and p.statut = 'publie' and not coalesce(p.est_rappel, false) and p.vues is not null
       and p.publie_at <= now() - make_interval(hours => (reg.valeur->'mesure'->>'maturite_heures')::int)
     group by c.id, c.famille_id, reg.valeur
    having count(*) >= (reg.valeur->'boite'->>'g2_min_passages')::int
       and avg(p.vues) > (reg.valeur->'boite'->>'g2_vues_moyennes')::numeric
  ),
  g2 as (
    select fam.label_id, fam.id as famille_id, 'g2'::text as sorte, g.id as parent_contenu_id,
           coalesce((select n from enfants e where e.parent = g.id), 0) as faites, fam.verdict_le
      from fam join g1_fortes g on g.famille_id = fam.id
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
                            order by (select count(*) from public.contenus c2
                                       where c2.famille_id = t.famille_id and c2.generation > 0) = 0 desc,
                                     t.verdict_le desc nulls last, t.sorte, t.parent_contenu_id) as rang,
         case t.sorte when 'g1' then 'identique' else 'reformulee' end as accroche_attendue
    from tout t
    join public.bleo_familles f on f.id = t.famille_id
    left join public.contenus pc on pc.id = t.parent_contenu_id
    join budget b on b.famille_id = t.famille_id
   where t.faites < (select (valeur->'boite'->>'declinaisons_par_parent')::int from reg);
comment on view public.bleo_boite is
  'BLEO (A9, règle du 29/10) : déclinaisons possibles de chaque label de la voie 1, rang 1 = la première. g1 = accroche identique ; g2 = accroche reformulée, ouverte si la génération 1 dépasse 10 000 vues en moyenne.';
