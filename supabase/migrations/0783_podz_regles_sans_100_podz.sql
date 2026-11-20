-- 0783 : les règles d'un podz ne s'éteignent plus quand son label reçoit une
-- source ou un deuxième podz (étape 5 du chantier « clarifier les podz »,
-- décisions d'Adrien du 20/11 : un label nourri par un podz peut aussi avoir des
-- sources ; un label peut avoir plusieurs podz, qui se partagent les langues).
--
-- LE PROBLÈME. Tout lisait la vue `labels_100_podz` (0650), qui exige : UN SEUL
-- podz, AUCUNE source active, aucun contenu venu d'ailleurs. Ajouter une source
-- à Fathomly, ou un deuxième podz à un label, sortait donc le label de la vue,
-- et d'un coup, sans rien dire :
--   * son podz repassait en « voie 1 » (guichet, boîte, jauge de BLEO) ;
--   * son rythme n'était plus calculé (`bleo_rythme_remakes`) ;
--   * plus de commande de rattrapage par langue (`bleo_rattrapage_manques`) ;
--   * plus de soupape (`bleo_ouvrir_langues_podz`) ;
--   * ses posts pouvaient repasser deux fois dans une même langue (0720).
--
-- LA RÈGLE. Deux questions, deux réponses :
--   1. COMMENT LE PODZ TRAVAILLE (images finies, langue par langue) ne dépend
--      que du podz. Nouvelle vue `podz_images_finies` : une ligne par podz qui
--      a une liste de langues, avec SES contenus. La voie, le rythme, le
--      rattrapage, la soupape et l'étalement par langue la lisent.
--   2. QUI NOURRIT LE LABEL décide de l'attribution des comptes, comme avant :
--      un label nourri seulement par des podz (`labels_100_podz`) ne suit pas
--      la règle de réserve et se remplit langue par langue ; un label qui a
--      aussi une source redevient un label ordinaire pour l'attribution (ses
--      contenus importés servent toutes les langues, sa réserve compte).
--      `labels_100_podz` accepte maintenant PLUSIEURS podz sur un label, et
--      les langues servies sont celles de tous ses podz réunis.
--
-- RIEN NE CHANGE AUJOURD'HUI. Vérifié le 20/11 dans une transaction annulée,
-- sur toute la base : mêmes lignes avant et après pour la vue
-- `labels_100_podz`, la voie de chaque label, les langues servies
-- (`langues_declarees_podz`), le rattrapage (288 commandes pour Fathomly, entre
-- autres), le rythme des remakes, les podz regardés par la soupape et les
-- contenus de l'étalement. Le choix de label et la simulation de répartition ne
-- sont pas modifiés : ils ne lisent que la vue et les langues servies, toutes
-- deux identiques (les rejouer en entier dépasse le délai de l'outil).
-- Les deux cas nouveaux y ont été essayés :
--   * une source ajoutée à Fathomly : son podz garde voie 2, rythme, rattrapage
--     (288 avant, 288 après) et soupape ; pour l'attribution, le label redevient
--     un label ordinaire ;
--   * un deuxième podz (suédois) sur le label Kaja : une seule ligne dans
--     `labels_100_podz`, voie 2, le suédois est servi.
--
-- ✅ Appliquée le 2026-11-20 (MCP). Vérifié après : la vue, la voie, le
-- rattrapage, le rythme et les langues servies répondent ; les quatre fonctions
-- lisent `podz_images_finies`.
--
-- HORS CHAMP (inchangé, à savoir avant de mêler source et podz sur un label) :
-- les empreintes de couverture et la relecture automatique exemptent les
-- contenus des labels nourris seulement par des podz ; sur un label qui a aussi
-- une source, les contenus du podz suivent la règle commune.
--
-- Retour arrière : réappliquer la vue `labels_100_podz` et `voie(labels)` de
-- 0650, `langues_declarees_podz` de 0654, puis dans `bleo_rattrapage_manques`,
-- `bleo_rythme_remakes`, `bleo_ouvrir_langues_podz` et `bleo_tirage` remettre
-- `labels_100_podz` à la place de `podz_images_finies` (blocs marqués 0783) ;
-- `drop view public.podz_images_finies`.

set lock_timeout = '5s';

-- 1. Comment le podz travaille : un podz en images finies, son label, SES contenus.
create or replace view public.podz_images_finies
with (security_invoker = true) as
select l.id as label_id,
       l.slug as label,
       p.slug as pod,
       p.actif as pod_actif,
       coalesce(n.valides, 0) as valides,
       coalesce(n.livres, 0) as livres,
       (case when coalesce(n.valides, 0) > 0 and n.livres = n.valides then 2 else 1 end)::smallint as voie
from public.pods p
join public.labels l on l.id = p.label_id
left join lateral (
  select count(*)::integer as valides,
         count(*) filter (where c.livre)::integer as livres
  from public.contenu_labels xl
  join public.contenus c on c.id = xl.contenu_id
  where xl.label_id = l.id
    and c.pod = p.slug
    and c.statut = 'valide'::contenu_statut and c.import_statut = 'done'
) n on true
where p.langues is not null;

comment on view public.podz_images_finies is
  'Les podz en images finies (0783) : une ligne par podz qui a une liste de langues, avec son label et SES contenus validés. voie = 2 dès qu''il a un contenu validé et que tous sont livrés. Ne dépend ni des sources du label ni de ses autres podz. Lue par la voie de BLEO, le rythme des remakes, le rattrapage par langue, la soupape et l''étalement par langue.';

revoke all on public.podz_images_finies from public, anon;
grant select on public.podz_images_finies to authenticated, service_role, sophia_hm_lecture;

-- 2. Qui nourrit le label : seulement des podz (un ou plusieurs), aucune source.
create or replace view public.labels_100_podz
with (security_invoker = true) as
select l.id as label_id,
       l.slug as label,
       p.pod,
       p.pod_actif,
       coalesce(n.valides, 0) as valides,
       coalesce(n.livres, 0) as livres,
       (case when coalesce(n.valides, 0) > 0 and n.livres = n.valides then 2 else 1 end)::smallint as voie
from public.labels l
join lateral (
  -- Plusieurs podz possibles : le premier par ordre alphabétique nomme la ligne.
  select min(p0.slug) as pod, bool_or(p0.actif) as pod_actif
  from public.pods p0 where p0.label_id = l.id
) p on p.pod is not null
left join lateral (
  select count(*)::integer as valides,
         count(*) filter (where c.livre)::integer as livres
  from public.contenu_labels xl
  join public.contenus c on c.id = xl.contenu_id
  where xl.label_id = l.id
    and c.statut = 'valide'::contenu_statut and c.import_statut = 'done'
) n on true
where not exists (
        select 1
        from public.contenu_labels xl
        join public.contenus c on c.id = xl.contenu_id
        where xl.label_id = l.id
          and c.statut = 'valide'::contenu_statut and c.import_statut = 'done'
          and not exists (select 1 from public.pods p3 where p3.label_id = l.id and p3.slug = c.pod))
  and not exists (
        select 1
        from public.compte_reference_labels crl
        join public.comptes_reference r on r.id = crl.compte_reference_id
        where crl.label_id = l.id and r.is_active);

comment on view public.labels_100_podz is
  'Les labels nourris SEULEMENT par des podz (0650, 0783) : un ou plusieurs podz, tous ses contenus validés viennent d''eux, aucune source active. Une ligne par label (pod = le premier de ses podz). Décide de l''attribution des comptes (pas de règle de réserve, remplissage langue par langue). Ce que fait le podz (voie, rythme, rattrapage, soupape) se lit dans podz_images_finies.';

-- 3. La voie d'un label : 2 quand il a un podz en images finies qui livre, et aucun podz en texte + banque.
create or replace function public.voie(public.labels)
returns smallint
language sql
stable
set search_path to 'public'
as $function$
  select case
    when exists (select 1 from public.podz_images_finies v where v.label_id = $1.id and v.voie = 2)
     and not exists (select 1 from public.pods p where p.label_id = $1.id and p.langues is null)
    then 2::smallint else 1::smallint end;
$function$;

-- 4. Les langues servies d'un label nourri seulement par des podz : celles de TOUS ses podz actifs.
create or replace function public.langues_declarees_podz()
returns table(label_id uuid, langue text)
language sql
stable
set search_path to 'public'
as $function$
  with d as (
    select distinct v.label_id, lower(x.langue) as langue
    from labels_100_podz v
    join pods p on p.label_id = v.label_id and p.actif and p.langues is not null and cardinality(p.langues) > 0
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
  'Langues servies des labels nourris seulement par des podz en images finies (0654, 0783) : les langues ouvertes de tous leurs podz actifs (`pods.langues`), variantes de compte comprises. Lue par le choix de label.';

-- 5. Ce que fait le podz : rythme, rattrapage, soupape, étalement lisent `podz_images_finies`.
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
      raise exception '0783 : % : bloc % trouvé % fois (attendu 1), rien n''est changé', p_fn, i, n;
    end if;
    d := replace(d, p_paires[2 * i - 1], p_paires[2 * i]);
  end loop;
  execute d;
end;
$function$;

select pg_temp.fonction_patcher('public.bleo_rattrapage_manques()'::regprocedure, array[
  $a$from labels_100_podz v$a$, $b$from podz_images_finies v /* 0783 */$b$]);

select pg_temp.fonction_patcher('public.bleo_rythme_remakes(text)'::regprocedure, array[
  $a$from labels_100_podz v$a$, $b$from podz_images_finies v /* 0783 */$b$]);

select pg_temp.fonction_patcher('public.bleo_ouvrir_langues_podz(boolean)'::regprocedure, array[
  $a$join labels_100_podz z on z.label_id = p.label_id$a$,
  $b$join podz_images_finies z on z.pod = p.slug /* 0783 */$b$]);

select pg_temp.fonction_patcher('public.bleo_tirage(date, text)'::regprocedure, array[
  $a$  select distinct xl.contenu_id from contenu_labels xl join labels_100_podz z on z.label_id = xl.label_id;$a$,
  $b$  select distinct xl.contenu_id from contenu_labels xl join labels_100_podz z on z.label_id = xl.label_id
  union
  -- 0783 : et les contenus livrés d'un podz en images finies, même si son label a aussi une source.
  select c.id from contenus c join podz_images_finies f on f.pod = c.pod where c.livre;$b$]);
