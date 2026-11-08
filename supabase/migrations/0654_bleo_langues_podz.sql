-- 0654 : BLEO, lot 3 : les langues des podz de remakes (décisions d'Adrien du
-- 5/11).
--
-- Jusqu'ici, l'attribution des comptes croyait qu'un label 100 % podz servait
-- les langues où son podz avait DÉJÀ livré (les decks en réserve). Une langue
-- neuve restait donc fermée, même si le podz sait la faire. À l'inverse, le
-- podz livrait toutes ses langues, qu'il y ait un compte pour les poster ou
-- non (that_girl_study : 7 langues livrées, des comptes dans 2). Désormais :
--
--   1. LA DÉCLARATION. Chaque podz de remakes déclare les langues qu'il sait
--      faire (`pods.langues`) : c'est la liste `LANGUES` de son atelier, que
--      ses outils envoient à l'OS (action `langues` ou `boite`, `pods/index.ts`).
--      Nulle (podz d'originaux, que l'OS traduit) : rien ne change.
--   2. L'ATTRIBUTION lit cette liste (`langues_declarees_podz`) au lieu des
--      langues déjà livrées : `stats_choix_label` et `simulation_repartition`.
--      Une langue de base déclarée sert aussi les variantes de compte (« es »
--      sert « es-419 »), comme dans la réserve (`label_application_reserve_livre`).
--   3. LA LIVRAISON. `pod_langues` donne au podz ses langues à livrer : les
--      langues déclarées où son label a un compte actif (ou une variante de
--      compte qu'il ne déclare pas à part). Ses outils ne livrent qu'elles.
--   4. LE RATTRAPAGE. Quand une langue a des comptes mais pas les posts du
--      label, l'OS commande au podz les contenus des familles gagnantes qui y
--      manquent (`bleo_commandes_langue`, chaque nuit à 5 h 55 :
--      `bleo_commandes_rattrapage`). Le podz les lit dans `npm run boite`
--      (`bleo_rattrapage_du_pod`, dans l'ordre : le meilleur contenu de chaque
--      famille d'abord, les familles qui ont fait le plus de vues d'abord) et
--      les livre par le circuit « nouvelles langues » existant. Une commande
--      se ferme toute seule quand ses langues ont leur deck.
--
-- Vérifié avant application, dans une transaction annulée : la simulation de
-- répartition (Sophia et micabo, 714 lignes) et le choix de label rendent les
-- mêmes lignes pour tous les labels hors remakes ; pour les remakes, seul
-- change white_bg en hongrois (servi, déclaré par la page blanche, aucun deck).
-- Langues à livrer : Fathomly en, de, it, pt-BR, es-419 (plus fr, es, pt) ;
-- that_girl_study es, tr (plus le français source) ; Kaja et page blanche,
-- toutes leurs langues. Rattrapage : 32 commandes page blanche (hu, et tr pour
-- 10), 12 Fathomly (it, es-419) ; un second passage n'en crée aucune.
-- Une langue déclarée ne vaut que pour un label qui a une réserve dans
-- l'application (un label sans contenu reste à sec, comme avant).
--
-- Retour arrière : remettre le CTE `servies` d'origine dans les deux fonctions
-- (les langues de `restants_par_langue`), supprimer le cron
-- `bleo-rattrapage` ; la colonne et les commandes peuvent rester.

set lock_timeout = '5s';

-- 1. La déclaration.
alter table public.pods add column if not exists langues text[];

comment on column public.pods.langues is
  'Langues que le podz sait livrer (0654), déclarées par ses outils (`LANGUES` de son atelier). Nulle : podz d''originaux, l''OS traduit dans toutes les langues. L''attribution des comptes et le rattrapage la lisent pour les labels 100 % podz de remakes.';

-- Les listes des ateliers au 5/11 ; le podz les tient ensuite à jour lui-même.
update public.pods set langues = array['en', 'fr', 'es', 'de', 'it', 'pt', 'pt-BR', 'es-419'] where slug = 'remakes_fathom';
update public.pods set langues = array['en', 'fr', 'de'] where slug = 'remakes_kaja';
update public.pods set langues = array['fr', 'en', 'es', 'de', 'it', 'pt', 'tr'] where slug = 'remakes_yasmine';
update public.pods set langues = array['en', 'fr', 'de', 'es', 'it', 'tr'] where slug = 'remakes_mentalapp';
-- Page blanche : ses langues livrées, plus le hongrois, où white_bg a un
-- compte sans aucun post (police Inter : alphabet latin complet).
update public.pods set langues = array['fr', 'en', 'es', 'de', 'it', 'tr', 'hu'] where slug = 'page_blanche';

-- 2. Les langues servies d'un label 100 % podz de remakes, en minuscules comme
-- les langues de compte du choix de label : les langues déclarées par son
-- podz actif, et les variantes de compte d'une langue de base déclarée.
create or replace function public.langues_declarees_podz()
returns table(label_id uuid, langue text)
language sql
stable
set search_path to 'public'
as $function$
  with d as (
    select v.label_id, lower(x.langue) as langue
    from labels_100_podz v
    join pods p on p.slug = v.pod and p.actif and p.langues is not null and cardinality(p.langues) > 0
    cross join lateral unnest(p.langues) as x(langue)
    where v.voie = 2
  )
  select d.label_id, d.langue from d
  union
  select d.label_id, lower(c.langue)
  from d
  join (select distinct langue from comptes where langue like '%-%') c
    on split_part(lower(c.langue), '-', 1) = d.langue;
$function$;

comment on function public.langues_declarees_podz() is
  'BLEO lot 3 (0654) : langues servies des labels 100 % podz de remakes, d''après la déclaration de leur podz actif (`pods.langues`), variantes de compte comprises. Lue par le choix de label.';

-- 3. Les langues d'un podz : déclarées, comptes actifs du label par langue, et
-- langues à livrer (null pour un podz sans déclaration : il livre comme avant).
create or replace function public.pod_langues(p_pod text)
returns jsonb
language sql
stable
set search_path to 'public'
as $function$
  with p as (
    select slug, label_id, langues from pods where slug = p_pod
  ),
  decl as (
    select x.langue, x.n from p cross join lateral unnest(p.langues) with ordinality as x(langue, n)
  ),
  comptes_l as (
    select c.langue, count(*)::integer as n
    from p
    join compte_labels cl on cl.label_id = p.label_id
    join comptes c on c.id = cl.compte_id and c.is_active and c.langue is not null
    group by c.langue
  )
  select jsonb_build_object(
    'declarees', (select to_jsonb(langues) from p),
    'comptes', coalesce((select jsonb_object_agg(langue, n) from comptes_l), '{}'::jsonb),
    'a_livrer', case when (select langues from p) is null then null else coalesce((
      select jsonb_agg(d.langue order by d.n)
      from decl d
      where exists (
        select 1 from comptes_l c
        where lower(c.langue) = lower(d.langue)
           or (split_part(lower(c.langue), '-', 1) = lower(d.langue)
               and not exists (select 1 from decl d2 where lower(d2.langue) = lower(c.langue)))
      )
    ), '[]'::jsonb) end
  );
$function$;

comment on function public.pod_langues(text) is
  'BLEO lot 3 (0654) : langues d''un podz : déclarées (`pods.langues`), comptes actifs de son label par langue, et `a_livrer` (les déclarées qui ont un compte, ou une variante de compte non déclarée à part). Lue par l''action `langues` et `boite` des podz.';

-- 4. Le choix de label lit les langues déclarées.
create or replace function pg_temp.fonction_patcher(p_fn regprocedure, p_paires text[])
returns void
language plpgsql
as $function$
declare
  d text;
  i integer;
  n integer;
begin
  d := pg_get_functiondef(p_fn);
  for i in 1 .. array_length(p_paires, 1) / 2 loop
    n := (length(d) - length(replace(d, p_paires[2 * i - 1], ''))) / length(p_paires[2 * i - 1]);
    if n <> 1 then
      raise exception '0654 : % : bloc % trouvé % fois (attendu 1), rien n''est changé', p_fn, i, n;
    end if;
    d := replace(d, p_paires[2 * i - 1], p_paires[2 * i]);
  end loop;
  execute d;
end;
$function$;

select pg_temp.fonction_patcher('public.stats_choix_label(uuid[], uuid, text, text, integer)'::regprocedure, array[
$a$  servies as (
    select lv.label_id, k.langue
    from livre lv
    cross join lateral jsonb_object_keys(lv.restants_par_langue) as k(langue)
  ),$a$,
$b$  -- 0654 : un label 100 % podz de remakes sert les langues que son podz
  -- déclare (`pods.langues`), déjà livrées ou non, s'il a une réserve pour
  -- cette application ; sans déclaration, comme avant, les langues de ses decks.
  servies as (
    with d as materialized (select * from public.langues_declarees_podz())
    select lv.label_id, k.langue
    from livre lv
    cross join lateral jsonb_object_keys(lv.restants_par_langue) as k(langue)
    where not exists (select 1 from d where d.label_id = lv.label_id)
    union
    select d.label_id, d.langue
    from d
    where d.label_id in (select lv2.label_id from livre lv2)
  ),$b$
]);

select pg_temp.fonction_patcher('public.simulation_repartition(uuid)'::regprocedure, array[
$a$  servies as materialized (
    select lv.label_id, k.langue
    from livre lv
    cross join lateral jsonb_object_keys(lv.restants_par_langue) as k(langue)
  ),$a$,
$b$  -- 0654 : les langues déclarées par le podz, comme le moteur.
  servies as materialized (
    with d as materialized (select * from public.langues_declarees_podz())
    select lv.label_id, k.langue
    from livre lv
    cross join lateral jsonb_object_keys(lv.restants_par_langue) as k(langue)
    where not exists (select 1 from d where d.label_id = lv.label_id)
    union
    select d.label_id, d.langue
    from d
    where d.label_id in (select lv2.label_id from livre lv2)
  ),$b$
]);

-- 5. Le rattrapage.
create unique index if not exists bleo_commandes_langue_ouverte
  on public.bleo_commandes_langue (contenu_id) where statut = 'a_faire';

-- Un deck sert une langue de compte s'il est dans cette langue, ou dans sa
-- langue de base (« pt » sert « pt-BR »), comme dans la réserve.
create or replace function public.bleo_deck_sert(p_contenu uuid, p_langue text)
returns boolean
language sql
stable
set search_path to 'public'
as $function$
  select exists (
    select 1 from contenu_langues cl
    where cl.contenu_id = p_contenu
      and public.deck_livre_pret(cl.slides)
      and (lower(cl.langue) = lower(p_langue) or lower(cl.langue) = split_part(lower(p_langue), '-', 1))
  );
$function$;

-- Ce qui manque aujourd'hui : pour chaque podz de remakes actif qui déclare
-- ses langues, ses langues à livrer (comme `pod_langues`) où un contenu valide
-- d'une famille gagnante de son label n'a pas de deck.
create or replace function public.bleo_rattrapage_manques()
returns table(pod text, label_id uuid, contenu_id uuid, langue text)
language sql
stable
set search_path to 'public'
as $function$
  with decl as (
    select v.pod, v.label_id, x.langue
    from labels_100_podz v
    join pods p on p.slug = v.pod and p.actif and p.langues is not null
    cross join lateral unnest(p.langues) as x(langue)
    where v.voie = 2
  ),
  comptes_l as (
    select distinct cl.label_id, lower(c.langue) as lg
    from (select distinct label_id from decl) d
    join compte_labels cl on cl.label_id = d.label_id
    join comptes c on c.id = cl.compte_id and c.is_active and c.langue is not null
  ),
  utiles as (
    select d.* from decl d
    where exists (
      select 1 from comptes_l c
      where c.label_id = d.label_id
        and (c.lg = lower(d.langue)
             or (split_part(c.lg, '-', 1) = lower(d.langue)
                 and not exists (select 1 from decl d2 where d2.label_id = d.label_id and lower(d2.langue) = c.lg)))
    )
  ),
  gagnants as (
    select distinct u.pod, u.label_id, c.id
    from (select distinct pod, label_id from utiles) u
    join contenu_labels xl on xl.label_id = u.label_id
    join contenus c on c.id = xl.contenu_id
     and c.statut = 'valide'::contenu_statut and c.import_statut = 'done' and c.livre
    join bleo_familles f on f.id = c.famille_id and f.verdict = 'gagnante'
  )
  select g.pod, g.label_id, g.id, u.langue
  from gagnants g
  join utiles u on u.label_id = g.label_id and u.pod = g.pod
  where not public.bleo_deck_sert(g.id, u.langue);
$function$;

-- Chaque nuit : ferme les commandes livrées, met à jour les autres, en crée
-- pour ce qui manque. `p_forcer` : hors de 5 h à Paris (essai, migration).
create or replace function public.bleo_commandes_rattrapage(p_forcer boolean default false)
returns jsonb
language plpgsql
set search_path to 'public'
as $function$
declare
  n_livrees integer := 0;
  n_annulees integer := 0;
  n_maj integer := 0;
  n_neuves integer := 0;
begin
  if auth.uid() is not null and not public.is_admin() then
    raise exception 'bleo : réservé aux admins' using errcode = '42501';
  end if;
  if not p_forcer and extract(hour from now() at time zone 'Europe/Paris') <> 5 then
    return jsonb_build_object('ignore', 'hors heure');
  end if;

  drop table if exists pg_temp.br_manques;
  create temp table br_manques on commit drop as
    select m.contenu_id, min(m.pod) as pod, array_agg(distinct m.langue order by m.langue) as langues
    from public.bleo_rattrapage_manques() m
    group by m.contenu_id;

  -- Livrées : chacune de leurs langues a maintenant un deck.
  update bleo_commandes_langue c
     set statut = 'livree', livree_le = now()
   where c.statut = 'a_faire'
     and not exists (select 1 from unnest(c.langues) x(langue) where not public.bleo_deck_sert(c.contenu_id, x.langue));
  get diagnostics n_livrees = row_count;

  -- Toujours à faire : les langues qui manquent aujourd'hui.
  update bleo_commandes_langue c
     set langues = m.langues
    from br_manques m
   where c.statut = 'a_faire' and c.contenu_id = m.contenu_id and c.langues is distinct from m.langues;
  get diagnostics n_maj = row_count;

  -- Plus rien à rattraper (compte parti, langue retirée, contenu sorti) : annulées.
  update bleo_commandes_langue c
     set statut = 'annulee'
   where c.statut = 'a_faire'
     and not exists (select 1 from br_manques m where m.contenu_id = c.contenu_id);
  get diagnostics n_annulees = row_count;

  insert into bleo_commandes_langue (contenu_id, pod, langues)
  select m.contenu_id, m.pod, m.langues
  from br_manques m
  where not exists (select 1 from bleo_commandes_langue c where c.contenu_id = m.contenu_id and c.statut = 'a_faire');
  get diagnostics n_neuves = row_count;

  return jsonb_build_object(
    'livrees', n_livrees, 'mises_a_jour', n_maj, 'annulees', n_annulees, 'neuves', n_neuves,
    'ouvertes', coalesce((select jsonb_object_agg(pod, n) from (
      select pod, count(*) as n from bleo_commandes_langue where statut = 'a_faire' group by pod) x), '{}'::jsonb)
  );
end;
$function$;

comment on function public.bleo_commandes_rattrapage(boolean) is
  'BLEO lot 3 (0654) : commandes de rattrapage des podz de remakes, chaque nuit à 5 h 55 (cron `bleo-rattrapage`) : un contenu d''une famille gagnante qui manque dans une langue où son label a des comptes. Ferme les commandes livrées, met à jour ou annule les autres.';

-- Les commandes ouvertes d'un podz, dans l'ordre où les faire, avec ce qui
-- manque à cette heure (une langue livrée depuis la nuit n'y est plus).
create or replace function public.bleo_rattrapage_du_pod(p_pod text)
returns jsonb
language sql
stable
set search_path to 'public'
as $function$
  with c as (
    select k.contenu_id,
           (select pl.source_id from pod_livraisons pl
             where pl.contenu_id = k.contenu_id and pl.type in ('nouveau', 'original')
             order by pl.created_at limit 1) as source_id,
           array(select x.langue from unnest(k.langues) x(langue)
                  where not public.bleo_deck_sert(k.contenu_id, x.langue)) as langues
    from bleo_commandes_langue k
    where k.pod = p_pod and k.statut = 'a_faire'
  ),
  v as (
    select c.*, ct.titre, ct.famille_id, f.accroche_norm,
           (select max(p.vues) from passages p join contenus c2 on c2.id = p.contenu_id
             where c2.famille_id = ct.famille_id) as vues_famille,
           (select max(p.vues) from passages p where p.contenu_id = c.contenu_id) as vues_contenu
    from c
    join contenus ct on ct.id = c.contenu_id
    left join bleo_familles f on f.id = ct.famille_id
    where cardinality(c.langues) > 0
  ),
  r as (
    select v.*, row_number() over (partition by v.famille_id order by v.vues_contenu desc nulls last, v.contenu_id) as k
    from v
  ),
  o as (
    select r.*, row_number() over (order by r.k, r.vues_famille desc nulls last, r.vues_contenu desc nulls last, r.contenu_id) as rang
    from r
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'rang', o.rang,
    'contenu_id', o.contenu_id,
    'source_id', o.source_id,
    'titre', o.titre,
    'accroche', o.accroche_norm,
    'langues', to_jsonb(o.langues),
    'vues_famille', o.vues_famille,
    'en_attente', exists (select 1 from pod_livraisons pl
                           where pl.pod = p_pod and pl.source_id = o.source_id || '~langues' and pl.statut = 'a_valider')
  ) order by o.rang), '[]'::jsonb)
  from o;
$function$;

revoke execute on function public.langues_declarees_podz() from public, anon;
revoke execute on function public.pod_langues(text) from public, anon;
revoke execute on function public.bleo_deck_sert(uuid, text) from public, anon;
revoke execute on function public.bleo_rattrapage_manques() from public, anon;
revoke execute on function public.bleo_commandes_rattrapage(boolean) from public, anon;
revoke execute on function public.bleo_rattrapage_du_pod(text) from public, anon;

-- Chaque nuit à 5 h 55 à Paris (deux horaires UTC, la fonction garde l'heure de Paris).
select cron.unschedule('bleo-rattrapage') where exists (select 1 from cron.job where jobname = 'bleo-rattrapage');
select cron.schedule('bleo-rattrapage', '55 3,4 * * *', 'select public.bleo_commandes_rattrapage()');

-- 6. Les premières commandes, tout de suite.
select public.bleo_commandes_rattrapage(true);
