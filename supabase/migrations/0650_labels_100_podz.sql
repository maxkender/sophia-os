-- 0650 : une seule définition d'un label « 100 % podz », dans une seule vue.
--
-- LA DÉFINITION (décision d'Adrien du 5/11). Un label est 100 % podz quand il
-- n'est fourni QUE par son podz :
--   * un podz et un seul le nourrit (`pods.label_id`) ;
--   * tous ses contenus validés viennent de ce podz (`contenus.pod`) : aucun
--     import, aucune création manuelle, aucun contenu d'un autre podz ;
--   * aucune source active ne l'alimente (`compte_reference_labels` →
--     `comptes_reference.is_active`) : sinon des imports arrivent.
-- Un label qui n'a encore aucun contenu validé, mais un podz et aucune source,
-- est déjà 100 % podz (Kaja à sa création).
--
-- AVANT, QUATRE DÉFINITIONS. Le 5/11 elles donnaient la même liste (white_bg,
-- Fathomly, that_girl_study, Kaja, mentalmaxxing), mais rien ne les tenait
-- ensemble :
--   1. `labels.voie = 2`, posée à la main (0601, 0647) : BLEO (boîte, jauge,
--      type déclaré au guichet, badge de l'OS) ;
--   2. `pod_seul` de `stats_choix_label` et `simulation_repartition` (0352) :
--      tous les contenus validés sont LIVRÉS (`bool_and(c.livre)`) ; un label
--      sans contenu n'en était pas ;
--   3. la fonction `empreintes` : aucun contenu validé du label sans `pod` ;
--   4. le chef des podz : « les labels nourris uniquement par les podz ».
-- Désormais, tous lisent `labels_100_podz`.
--
-- LA VOIE DE BLEO EN DÉCOULE. La voie dit comment le podz travaille, pas qui
-- nourrit le label : voie 2 = label 100 % podz dont le podz livre des slides
-- finies (remakes : au moins un contenu validé, tous livrés) ; voie 1 = tout le
-- reste, boîte et full tests. Un label d'originaux qui deviendrait 100 % podz
-- (RH le jour où sa source s'arrête) garde donc sa boîte. La colonne
-- `labels.voie`, tenue à la main, est supprimée. Elle est remplacée par la
-- fonction `public.voie(labels)`, lue :
--   * en SQL comme une colonne (`l.voie`, notation d'attribut de PostgreSQL) ;
--   * par l'API comme une colonne calculée (`select=id,voie`, PostgREST) : le
--     guichet des podz (`labels.select("voie")`) et l'OS continuent de la lire
--     sans changement, y compris avec leur bundle déjà déployé.
-- Les trois vues BLEO qui lisaient la colonne lisent la vue.
--
-- LE CHOIX DE LABEL (0352, 0353). `pod_seul` = le label est dans la vue. Un
-- label 100 % podz d'ORIGINAUX (contenus non livrés, que l'OS traduit dans
-- toutes les langues) sert toutes les langues : `livre_langue` vaut vrai pour
-- lui. Sans ce correctif, il serait « à sec » partout, faute de deck livré. Un
-- label qui n'a encore aucun contenu reste à sec, comme avant.
--
-- Vérifié avant application (5/11) : la vue rend les 5 labels ci-dessus, tous
-- en voie 2 ; `bleo_boite`, `bleo_jauge`, `bleo_familles_ui` et les colonnes
-- pod de `stats_choix_label` / `simulation_repartition` rendent les mêmes
-- lignes qu'avant.
--
-- Retour arrière : recréer `labels.voie` (`smallint not null default 1`, puis
-- `update labels set voie = 2 where id in (select label_id from
-- labels_100_podz where voie = 2)`), supprimer la fonction `voie(labels)`,
-- réappliquer les trois vues de 0642 et les deux fonctions de 0353.

-- 1. La définition.
create or replace view public.labels_100_podz
with (security_invoker = true) as
select l.id as label_id,
       l.slug as label,
       p.slug as pod,
       p.actif as pod_actif,
       coalesce(n.valides, 0) as valides,
       coalesce(n.livres, 0) as livres,
       (case when coalesce(n.valides, 0) > 0 and n.livres = n.valides then 2 else 1 end)::smallint as voie
from public.labels l
join public.pods p on p.label_id = l.id
left join lateral (
  select count(*)::integer as valides,
         count(*) filter (where c.livre)::integer as livres
  from public.contenu_labels xl
  join public.contenus c on c.id = xl.contenu_id
  where xl.label_id = l.id
    and c.statut = 'valide'::contenu_statut and c.import_statut = 'done'
) n on true
where not exists (
        select 1 from public.pods p2
        where p2.label_id = l.id and p2.slug <> p.slug)
  and not exists (
        select 1
        from public.contenu_labels xl
        join public.contenus c on c.id = xl.contenu_id
        where xl.label_id = l.id
          and c.statut = 'valide'::contenu_statut and c.import_statut = 'done'
          and c.pod is distinct from p.slug)
  and not exists (
        select 1
        from public.compte_reference_labels crl
        join public.comptes_reference r on r.id = crl.compte_reference_id
        where crl.label_id = l.id and r.is_active);

comment on view public.labels_100_podz is
  'LA définition d''un label 100 % podz (0650) : un seul podz le nourrit, tous ses contenus validés viennent de ce podz, aucune source active. voie = 2 quand le podz livre des slides finies (au moins un contenu validé, tous livrés), sinon 1. Lue par le choix de label, la page Répartition, BLEO (voie), les empreintes et le chef des podz.';

revoke all on public.labels_100_podz from public, anon, authenticated;
grant select on public.labels_100_podz to authenticated, service_role, sophia_hm_lecture;

-- 2. Les vues BLEO lisent la vue, plus la colonne.
create or replace function pg_temp.vue_patcher(p_vue regclass, p_paires text[])
returns void
language plpgsql
as $function$
declare
  d text;
  i integer;
  n integer;
begin
  d := pg_get_viewdef(p_vue);
  for i in 1 .. array_length(p_paires, 1) / 2 loop
    n := (length(d) - length(replace(d, p_paires[2 * i - 1], ''))) / length(p_paires[2 * i - 1]);
    if n <> 1 then
      raise exception '0650 : % : bloc % trouvé % fois (attendu 1), rien n''est changé', p_vue, i, n;
    end if;
    d := replace(d, p_paires[2 * i - 1], p_paires[2 * i]);
  end loop;
  -- create or replace remplace aussi les options : security_invoker est remis.
  execute format('create or replace view %s with (security_invoker = true) as %s', p_vue, d);
end;
$function$;

select pg_temp.vue_patcher('public.bleo_boite'::regclass, array[
  $a$(l.voie = 1)$a$,
  $b$(NOT (l.id IN ( SELECT v.label_id FROM public.labels_100_podz v WHERE (v.voie = 2))))$b$
]);

select pg_temp.vue_patcher('public.bleo_jauge'::regclass, array[
  $a$(lab.voie = 1)$a$,
  $b$(NOT (lab.id IN ( SELECT v.label_id FROM public.labels_100_podz v WHERE (v.voie = 2))))$b$
]);

select pg_temp.vue_patcher('public.bleo_familles_ui'::regclass, array[
  $a$    l.voie,$a$,
  $b$    (CASE WHEN (l.id IN ( SELECT v.label_id FROM public.labels_100_podz v WHERE (v.voie = 2))) THEN 2 ELSE 1 END)::smallint AS voie,$b$
]);

-- 3. La colonne tenue à la main disparaît ; la voie se calcule.
alter table public.labels drop column voie;

create or replace function public.voie(public.labels)
returns smallint
language sql
stable
set search_path = public
as $function$
  select coalesce((select v.voie from public.labels_100_podz v where v.label_id = $1.id), 1::smallint);
$function$;

comment on function public.voie(public.labels) is
  'Voie BLEO d''un label (0650), calculée depuis labels_100_podz : 2 pour un label 100 % podz dont le podz livre des slides finies, 1 sinon. Se lit comme une colonne : l.voie en SQL, select=voie dans l''API (colonne calculée PostgREST).';

-- 4. Le choix de label (moteur et page Répartition) lit la vue.
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
      raise exception '0650 : % : bloc % trouvé % fois (attendu 1), rien n''est changé', p_fn, i, n;
    end if;
    d := replace(d, p_paires[2 * i - 1], p_paires[2 * i]);
  end loop;
  execute d;
end;
$function$;

select pg_temp.fonction_patcher('public.stats_choix_label(uuid[], uuid, text, text, integer)'::regprocedure, array[
$a$  pod as (
    select xl.label_id, bool_and(c.livre) as seul
    from contenu_labels xl
    join contenus c on c.id = xl.contenu_id
     and c.statut = 'valide'::contenu_statut and c.import_statut = 'done'
    where xl.label_id = any(p_labels)
    group by xl.label_id
  ),$a$,
$b$  -- 0650 : la définition unique (vue labels_100_podz). `originaux` : le
  -- podz écrit des originaux que l'OS traduit, le label sert toutes les langues.
  pod as (
    select v.label_id, true as seul, v.valides > v.livres as originaux
    from labels_100_podz v
    where v.label_id = any(p_labels)
  ),$b$,
$a$        or exists (select 1 from servies s where s.label_id = lab.label_id and s.langue = cb.langue)
      from cible cb),$a$,
$b$        or exists (select 1 from servies s where s.label_id = lab.label_id and s.langue = cb.langue)
        or coalesce(pod.originaux, false)
      from cible cb),$b$
]);

select pg_temp.fonction_patcher('public.simulation_repartition(uuid)'::regprocedure, array[
$a$  pod as materialized (
    select xl.label_id, bool_and(c.livre) as seul
    from public.contenu_labels xl
    join public.contenus c on c.id = xl.contenu_id
     and c.statut = 'valide'::contenu_statut and c.import_statut = 'done'
    where xl.label_id = any(v_pool)
    group by xl.label_id
  ),$a$,
$b$  -- 0650 : la définition unique (vue labels_100_podz), comme le moteur.
  pod as materialized (
    select v.label_id, true as seul, v.valides > v.livres as originaux
    from public.labels_100_podz v
    where v.label_id = any(v_pool)
  ),$b$,
$a$    exists (select 1 from servies s where s.label_id = lab.label_id and s.langue = m.lg),$a$,
$b$    exists (select 1 from servies s where s.label_id = lab.label_id and s.langue = m.lg)
      or coalesce(pod.originaux, false),$b$
]);

comment on function public.stats_choix_label(uuid[], uuid, text, text, integer) is
  'Entrées du choix de label à la création : présence par langue/pays/flotte, réserve (consciente de la langue pour les contenus livrés, 0348), performance sur 15 jours (0353), fenêtre anti-rafale, remplissage des labels 100 % podz (0352 ; définition unique labels_100_podz, 0650).';

-- 5. L'API relit le schéma : `voie` y devient une colonne calculée.
notify pgrst, 'reload schema';
