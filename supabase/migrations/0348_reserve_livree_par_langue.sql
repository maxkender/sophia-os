-- 0348 : la réserve d'un label livré par un pod ne compte que dans les langues
-- que le pod a livrées.
--
-- LE TROU. Un contenu `livre` (0259) porte des IMAGES FINIES, texte cuit
-- dedans, une par langue livrée. `assurerDeckPourLangue` ne le traduit pas :
-- elle court-circuite vers `deckLivre`, qui ÉCHOUE FRANC s'il n'y a pas de
-- deck dans la langue du compte (`pods.ts`). Côté pool, l'assignation s'en
-- protège : `contenusLivresHorsLangue` / `contenusLivresHorsApplication`
-- retirent ces contenus AVANT le tirage.
--
-- Mais le CHOIX DU LABEL à la création d'un compte, lui, ne sait rien de tout
-- ça. `label_application_reserve` (0256) compte le stock par (label ×
-- application), sans dimension de langue : `mentalmaxxing` affiche 20 passages
-- restants pour UnSwipe, en croate comme en anglais, alors que ses 16 contenus
-- ne sont livrés qu'en de, en, es, fr, it, tr. Un compte croate qui tire ce
-- label pour seul label est un COMPTE MUET : son pool se vide au moment de
-- poster, le créneau reste vide, et rien ne le signale.
--
-- LE CORRECTIF. La réserve devient consciente de la langue, et seulement pour
-- la part LIVRÉE du stock :
--   * un contenu ordinaire est traduit à l'assignation : il compte dans toutes
--     les langues, rien ne change ;
--   * un contenu livré ne compte que dans les langues où son deck est prêt,
--     avec EXACTEMENT le test de `pods.ts` (Sophia lit `contenu_langues`, les
--     autres applications lisent le deck `pret` de leur variante dans
--     `contenu_langue_decks` ; un deck est prêt s'il a au moins une slide et
--     que toutes portent leur image).
-- Un label 100 % pod tombe donc à ZÉRO passage restant dans une langue qu'il
-- ne couvre pas, donc sous `JOURS_A_SEC`, donc DERRIÈRE tous les autres
-- candidats (écart « à sec » de `classerLabels`). Il reste choisissable en
-- dernier recours (`jamaisSansLabel`), comme un label fermé : une recrue ne
-- reste jamais sans label.
--
-- POURQUOI PAS UNE COLONNE `labels.langues`. Elle se lirait d'un coup d'œil,
-- mais il faudrait qu'un humain la tienne à jour, et elle mentirait le jour où
-- un pod livre une 7e langue sans que personne y pense. Ici il n'y a rien à
-- tenir : l'agent du pod livre un deck de plus, la langue s'ouvre toute seule
-- à la création suivante ; il retire un deck, elle se referme.
--
-- CE QUI NE CHANGE PAS :
--   * `p_langue` nul (la passe de fermeture de la nuit, `fermeture_labels.ts`)
--     rend la réserve d'avant, au passage près : aucune fermeture automatique
--     ne bouge ;
--   * `demande_jour` reste globale : c'est un débit de consommation, pas un
--     stock ;
--   * `label_application_reserve` n'est pas touchée : le tableau des pods
--     continue d'afficher le stock total du label.
--
-- Retour arrière : réappliquer 0287 (stats_choix_label) et 0307
-- (simulation_repartition), puis `drop view public.label_application_reserve_livre`
-- et `drop function public.deck_livre_pret(jsonb)`.

-- ---------------------------------------------------------------------------
-- 1. Le test « ce deck est servable », en SQL
-- ---------------------------------------------------------------------------

-- Miroir de `deckLivrePret` (`_shared/pods.ts`) : au moins une slide, et
-- toutes avec leur image. Une slide sans `media_id` (ou vide) rend le deck
-- inservable, donc la langue non couverte.
create or replace function public.deck_livre_pret(p_slides jsonb)
returns boolean
language sql
immutable
parallel safe
as $$
  select jsonb_typeof(p_slides) = 'array'
     and jsonb_array_length(p_slides) > 0
     and not exists (
       select 1 from jsonb_array_elements(p_slides) s
       where coalesce(s ->> 'media_id', '') = ''
     );
$$;

comment on function public.deck_livre_pret(jsonb) is
  'Un deck livré par un pod est-il servable : au moins une slide, toutes avec leur image. Miroir SQL de deckLivrePret (_shared/pods.ts).';

-- ---------------------------------------------------------------------------
-- 2. La part livrée de la réserve, et les langues où elle est servable
-- ---------------------------------------------------------------------------

-- Une ligne par (label × application) qui a du contenu LIVRÉ dans sa réserve :
--   * `restants_livres` : les passages restants de cette part livrée ;
--   * `restants_par_langue` : la part de ces passages servable dans chaque
--     langue livrée, en objet jsonb (langue -> passages).
-- Le périmètre est celui de `label_application_reserve` (0256), à la lettre :
-- mêmes jointures, mêmes filtres d'éligibilité, mêmes exclusions de slug. Un
-- label sans contenu livré n'a pas de ligne ici, et sa réserve ne bouge pas.
create or replace view public.label_application_reserve_livre as
with liens as (
  select l.id as label_id, la.application_id
  from public.labels l
  join public.label_applications la on la.label_id = l.id
  where lower(trim(l.slug)) <> all (array['hook', 'ugc-ai-video'])
),
livres as (
  -- Sophia : le stock sort de `contenu_tier_etat`, la pertinence par
  -- application vaut « oui » par défaut.
  select li.label_id, li.application_id, c.id as contenu_id, e.restants::numeric as restants
  from liens li
  join public.contenu_labels cl on cl.label_id = li.label_id
  join public.contenus c on c.id = cl.contenu_id
   and c.statut = 'valide'::contenu_statut and c.import_statut = 'done' and c.livre
  join public.contenu_tier_etat e on e.contenu_id = c.id
  left join public.contenu_pertinences cp on cp.contenu_id = c.id and cp.application_id = li.application_id
  where li.application_id = public.application_id_sophia() and coalesce(cp.eligible, true)
  union all
  -- Les autres applications ont leur propre état de tier, déjà filtré.
  select li.label_id, li.application_id, c.id, ea.restants::numeric
  from liens li
  join public.contenu_labels cl on cl.label_id = li.label_id
  join public.contenus c on c.id = cl.contenu_id
   and c.statut = 'valide'::contenu_statut and c.import_statut = 'done' and c.livre
  join public.contenu_application_tier_etat ea on ea.contenu_id = c.id and ea.application_id = li.application_id
  where li.application_id <> public.application_id_sophia() and ea.eligible
),
-- Les langues réellement servables, application par application, comme les
-- lit l'assignation : `contenu_langues` pour Sophia, le deck `pret` de la
-- variante pour les autres.
decks as (
  select cl.contenu_id, public.application_id_sophia() as application_id, lower(cl.langue) as langue
  from public.contenu_langues cl
  where public.deck_livre_pret(cl.slides)
  union all
  select d.contenu_id, a.id, lower(d.langue)
  from public.contenu_langue_decks d
  join public.applications a on a.slug = d.variante and a.id <> public.application_id_sophia()
  where d.statut = 'pret' and public.deck_livre_pret(d.slides)
),
par_langue as (
  select x.label_id, x.application_id, d.langue, sum(x.restants) as restants
  from livres x
  join decks d on d.contenu_id = x.contenu_id and d.application_id = x.application_id
  where d.langue is not null
  group by 1, 2, 3
),
totaux as (
  select label_id, application_id, sum(restants) as restants
  from livres
  group by 1, 2
)
select
  t.label_id,
  t.application_id,
  t.restants as restants_livres,
  coalesce(
    (select jsonb_object_agg(p.langue, p.restants)
       from par_langue p
      where p.label_id = t.label_id and p.application_id = t.application_id),
    '{}'::jsonb
  ) as restants_par_langue
from totaux t;

comment on view public.label_application_reserve_livre is
  'Part LIVRÉE par un pod de la réserve d''un label pour une application (même périmètre que label_application_reserve), et ce qui en est servable dans chaque langue livrée. Sert à rendre le choix de label conscient de la langue (0348).';

revoke all on public.label_application_reserve_livre from public;
grant select on public.label_application_reserve_livre to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. Le choix de label à la création (0287) devient conscient de la langue
-- ---------------------------------------------------------------------------

create or replace function public.stats_choix_label(
  p_labels uuid[],
  p_application uuid,
  p_langue text,
  p_pays text,
  p_recents integer
)
returns table (
  label_id uuid,
  comptes_langue integer,
  comptes_pays integer,
  comptes_total integer,
  passages_restants numeric,
  demande_jour numeric,
  passages integer,
  perf_label numeric,
  perf_flotte numeric,
  recents_langue integer,
  recence_langue integer,
  recents_pays integer,
  recence_pays integer
)
language sql
stable
set search_path = public
as $function$
  with app as (
    select coalesce(p_application, '00000000-0000-4000-8000-000000000001'::uuid) as id
  ),
  cible as (
    select
      lower(nullif(trim(coalesce(p_langue, '')), '')) as langue,
      coalesce(
        upper(nullif(trim(coalesce(p_pays, '')), '')),
        public.pays_defaut_langue(nullif(trim(coalesce(p_langue, '')), ''))
      ) as pays,
      greatest(coalesce(p_recents, 0), 0) as fenetre
  ),
  lab as (
    select distinct unnest(p_labels) as label_id
  ),
  liens as (
    select cl.label_id, lower(c.langue) as langue, upper(c.pays) as pays
    from compte_labels cl
    join comptes c on c.id = cl.compte_id
    where c.is_active and cl.label_id = any(p_labels)
  ),
  -- La réserve, amputée de ce que le pod n'a pas livré dans CETTE langue
  -- (0348). Sans langue (passe de fermeture de la nuit), la réserve d'avant.
  reserve as (
    select
      r.label_id,
      case
        when cible.langue is null then r.passages_restants
        else greatest(
          r.passages_restants
            - coalesce(lv.restants_livres, 0)
            + coalesce((lv.restants_par_langue ->> cible.langue)::numeric, 0),
          0
        )
      end as passages_restants,
      r.demande_jour
    from label_application_reserve r
    cross join app
    cross join cible
    left join label_application_reserve_livre lv
      on lv.label_id = r.label_id and lv.application_id = r.application_id
    where r.application_id = app.id and r.label_id = any(p_labels)
  ),
  publies as (
    select xl.label_id, pa.vues, lower(pa.langue) as langue
    from passages pa
    join contenu_labels xl on xl.contenu_id = pa.contenu_id
    cross join app
    where xl.label_id = any(p_labels)
      and pa.statut = 'publie'
      and pa.publie_at >= now() - interval '28 days'
      and pa.vues is not null
      and pa.langue is not null
      and coalesce(pa.application_id, '00000000-0000-4000-8000-000000000001'::uuid) = app.id
  ),
  mediane_langue as (
    select p.langue, percentile_cont(0.5) within group (order by p.vues) as med
    from publies p
    group by p.langue
  ),
  rapports as (
    select p.label_id, p.vues / m.med as rapport
    from publies p
    join mediane_langue m on m.langue = p.langue
    where m.med > 0
  ),
  perf as (
    select r.label_id, count(*) as n, percentile_cont(0.5) within group (order by r.rapport) as med
    from rapports r
    group by r.label_id
  ),
  flotte as (
    select percentile_cont(0.5) within group (order by r.rapport) as med from rapports r
  ),
  recents_langue as (
    select c.id, row_number() over (order by c.created_at desc, c.id desc) as rang
    from comptes c, cible
    where c.is_active
      and cible.langue is not null
      and lower(c.langue) = cible.langue
      and exists (select 1 from compte_labels x where x.compte_id = c.id and x.label_id = any(p_labels))
    order by c.created_at desc, c.id desc
    limit (select fenetre from cible)
  ),
  recents_pays as (
    select c.id, row_number() over (order by c.created_at desc, c.id desc) as rang
    from comptes c, cible
    where c.is_active
      and cible.pays is not null
      and upper(c.pays) = cible.pays
      and exists (select 1 from compte_labels x where x.compte_id = c.id and x.label_id = any(p_labels))
    order by c.created_at desc, c.id desc
    limit (select fenetre from cible)
  ),
  porteurs_langue as (
    select x.label_id, count(distinct r.id) as nb, max((select fenetre from cible) + 1 - r.rang) as recence
    from recents_langue r
    join compte_labels x on x.compte_id = r.id
    where x.label_id = any(p_labels)
    group by x.label_id
  ),
  porteurs_pays as (
    select x.label_id, count(distinct r.id) as nb, max((select fenetre from cible) + 1 - r.rang) as recence
    from recents_pays r
    join compte_labels x on x.compte_id = r.id
    where x.label_id = any(p_labels)
    group by x.label_id
  )
  select
    lab.label_id,
    (select count(*) from liens l, cible
      where l.label_id = lab.label_id and cible.langue is not null and l.langue = cible.langue)::integer,
    (select count(*) from liens l, cible
      where l.label_id = lab.label_id and cible.pays is not null and l.pays = cible.pays)::integer,
    (select count(*) from liens l where l.label_id = lab.label_id)::integer,
    coalesce(reserve.passages_restants, 0)::numeric,
    coalesce(reserve.demande_jour, 0)::numeric,
    coalesce(perf.n, 0)::integer,
    perf.med::numeric,
    (select med from flotte)::numeric,
    coalesce(pl.nb, 0)::integer,
    coalesce(pl.recence, 0)::integer,
    coalesce(pp.nb, 0)::integer,
    coalesce(pp.recence, 0)::integer
  from lab
  left join reserve on reserve.label_id = lab.label_id
  left join perf on perf.label_id = lab.label_id
  left join porteurs_langue pl on pl.label_id = lab.label_id
  left join porteurs_pays pp on pp.label_id = lab.label_id;
$function$;

comment on function public.stats_choix_label(uuid[], uuid, text, text, integer) is
  'Entrées du choix de label à la création : présence par langue/pays/flotte, réserve (consciente de la langue pour les contenus livrés, 0348), performance sur 28 jours, fenêtre anti-rafale.';

-- ---------------------------------------------------------------------------
-- 4. La projection de la page Répartition suit (0307)
-- ---------------------------------------------------------------------------
-- Même correctif, au même endroit : la page promet « les chiffres que le
-- moteur recevra ». Elle sort une ligne par marché (langue × pays), donc la
-- réserve y devient une colonne par marché, et un label 100 % pod n'apparaît
-- plus comme candidat crédible dans une langue qu'il ne couvre pas.
-- Seule la réserve change ; tout le reste est 0307 à l'identique.

create or replace function public.simulation_repartition(
  p_application uuid default '00000000-0000-4000-8000-000000000001'::uuid
)
returns table (
  langue text,
  pays text,
  label_id uuid,
  label_nom text,
  comptes_langue integer,
  comptes_pays integer,
  comptes_total integer,
  passages_restants numeric,
  demande_jour numeric,
  passages integer,
  perf_label numeric,
  perf_flotte numeric,
  recents_langue integer,
  recence_langue integer,
  recents_pays integer,
  recence_pays integer
)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_app uuid := coalesce(p_application, '00000000-0000-4000-8000-000000000001'::uuid);
  v_recents integer := 3;
  v_pool uuid[];
begin
  if not public.is_admin() then
    raise exception 'reserve aux administrateurs' using errcode = '42501';
  end if;

  select coalesce(array_agg(l.id), '{}'::uuid[]) into v_pool
  from public.labels l
  where coalesce(l.slug, '') not in ('hook', 'ugc-ai-video')
    and coalesce(lower(l.nom), '') not in ('hook', 'ugc ai video')
    and (
      exists (
        select 1 from public.label_applications la
        where la.label_id = l.id and la.application_id = v_app
      )
      -- Héritage : un label sans aucune ligne sert Sophia.
      or (
        v_app = '00000000-0000-4000-8000-000000000001'::uuid
        and not exists (select 1 from public.label_applications la where la.label_id = l.id)
      )
    );

  if array_length(v_pool, 1) is null then
    return;
  end if;

  return query
  with lab as materialized (
    select distinct unnest(v_pool) as label_id
  ),
  marches as materialized (
    select distinct
      co.langue as lg_brut, lower(co.langue) as lg,
      co.pays as py_brut, upper(co.pays) as py
    from public.comptes co
    where co.is_active
      and coalesce(co.type_compte, '') <> 'cm'
      and coalesce(co.ugc_ai_video, false) = false
      and co.langue is not null
  ),
  liens as materialized (
    select cl.label_id, lower(c.langue) as langue, upper(c.pays) as pays
    from public.compte_labels cl
    join public.comptes c on c.id = cl.compte_id
    where c.is_active and cl.label_id = any(v_pool)
  ),
  par_langue as materialized (
    select label_id, langue, count(*) as n from liens group by 1, 2
  ),
  par_pays as materialized (
    select label_id, pays, count(*) as n from liens where pays is not null group by 1, 2
  ),
  par_total as materialized (
    select label_id, count(*) as n from liens group by 1
  ),
  reserve as materialized (
    select r.label_id, r.passages_restants, r.demande_jour
    from public.label_application_reserve r
    where r.application_id = v_app and r.label_id = any(v_pool)
  ),
  -- La part livrée par un pod, et ses langues (0348). Matérialisée comme le
  -- reste : la page tient dans 8 secondes.
  livre as materialized (
    select lv.label_id, lv.restants_livres, lv.restants_par_langue
    from public.label_application_reserve_livre lv
    where lv.application_id = v_app and lv.label_id = any(v_pool)
  ),
  publies as materialized (
    select xl.label_id, pa.vues, lower(pa.langue) as langue
    from public.passages pa
    join public.contenu_labels xl on xl.contenu_id = pa.contenu_id
    where xl.label_id = any(v_pool)
      and pa.statut = 'publie'
      and pa.publie_at >= now() - interval '28 days'
      and pa.vues is not null
      and pa.langue is not null
      and coalesce(pa.application_id, '00000000-0000-4000-8000-000000000001'::uuid) = v_app
  ),
  mediane_langue as materialized (
    select p.langue, percentile_cont(0.5) within group (order by p.vues) as med
    from publies p group by p.langue
  ),
  rapports as materialized (
    select p.label_id, p.vues / m.med as rapport
    from publies p join mediane_langue m on m.langue = p.langue
    where m.med > 0
  ),
  perf as materialized (
    select r.label_id, count(*) as n,
           percentile_cont(0.5) within group (order by r.rapport) as med
    from rapports r group by r.label_id
  ),
  flotte as materialized (
    select percentile_cont(0.5) within group (order by r.rapport) as med from rapports r
  ),
  candidats as materialized (
    select c.id, lower(c.langue) as langue, upper(c.pays) as pays, c.created_at
    from public.comptes c
    where c.is_active
      and exists (
        select 1 from public.compte_labels x
        where x.compte_id = c.id and x.label_id = any(v_pool)
      )
  ),
  rang_langue as materialized (
    select id, langue,
           row_number() over (partition by langue order by created_at desc, id desc) as rang
    from candidats where langue is not null
  ),
  rang_pays as materialized (
    select id, pays,
           row_number() over (partition by pays order by created_at desc, id desc) as rang
    from candidats where pays is not null
  ),
  porteurs_langue as materialized (
    select r.langue, x.label_id, count(distinct r.id) as nb,
           max(v_recents + 1 - r.rang) as recence
    from rang_langue r join public.compte_labels x on x.compte_id = r.id
    where r.rang <= v_recents and x.label_id = any(v_pool)
    group by 1, 2
  ),
  porteurs_pays as materialized (
    select r.pays, x.label_id, count(distinct r.id) as nb,
           max(v_recents + 1 - r.rang) as recence
    from rang_pays r join public.compte_labels x on x.compte_id = r.id
    where r.rang <= v_recents and x.label_id = any(v_pool)
    group by 1, 2
  )
  select
    m.lg_brut,
    m.py_brut,
    lab.label_id,
    l.nom,
    coalesce(pl.n, 0)::integer,
    coalesce(pp.n, 0)::integer,
    coalesce(pt.n, 0)::integer,
    greatest(
      coalesce(res.passages_restants, 0)
        - coalesce(lv.restants_livres, 0)
        + coalesce((lv.restants_par_langue ->> m.lg)::numeric, 0),
      0
    )::numeric,
    coalesce(res.demande_jour, 0)::numeric,
    coalesce(perf.n, 0)::integer,
    perf.med::numeric,
    (select med from flotte)::numeric,
    coalesce(rl.nb, 0)::integer,
    coalesce(rl.recence, 0)::integer,
    coalesce(rp.nb, 0)::integer,
    coalesce(rp.recence, 0)::integer
  from marches m
  cross join lab
  join public.labels l on l.id = lab.label_id
  left join par_langue pl on pl.label_id = lab.label_id and pl.langue = m.lg
  left join par_pays pp on pp.label_id = lab.label_id and pp.pays = m.py
  left join par_total pt on pt.label_id = lab.label_id
  left join reserve res on res.label_id = lab.label_id
  left join livre lv on lv.label_id = lab.label_id
  left join perf on perf.label_id = lab.label_id
  left join porteurs_langue rl on rl.label_id = lab.label_id and rl.langue = m.lg
  left join porteurs_pays rp on rp.label_id = lab.label_id and rp.pays = m.py
  order by m.lg_brut, m.py_brut, l.nom;
end;
$$;

comment on function public.simulation_repartition(uuid) is
  'Entrées du choix de label (0287) pour tous les marchés (langue × pays) d''une application, en une seule passe (0307), réserve consciente de la langue pour les contenus livrés (0348). Lecture seule, admin uniquement : alimente la page Répartition. Ne choisit rien, le classement se fait côté front avec le miroir de choix_label_equilibre.ts.';

revoke all on function public.simulation_repartition(uuid) from public;
revoke execute on function public.simulation_repartition(uuid) from anon;
grant execute on function public.simulation_repartition(uuid) to authenticated;
