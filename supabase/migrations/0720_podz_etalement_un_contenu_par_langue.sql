-- 0720 : labels 100 % podz, jamais le même post recraché dans une langue
-- (décision d'Adrien du 14/11).
--
-- Mesure du 14/11 (45 jours) : un même contenu white_bg posté une 2e fois dans
-- la même langue, sur un autre compte, fait 1 704 vues de moyenne contre 4 827
-- la 1re fois (−65 %), 1 113 la 3e (−77 %). Ailleurs, la récolte ne perd que
-- 25 % au 2e passage. 32 % des posts white_bg étaient des 2e ou 3e passages.
--
-- La règle (ordre de priorité, pas d'interdiction de comptes) :
--   1. étaler d'abord : un compte par langue (le choix de label remplit déjà
--      un label 100 % podz langue par langue, dans les langues où l'on recrute) ;
--   2. un 2e compte dans une langue reçoit des contenus DIFFÉRENTS, jamais ceux
--      que l'autre compte de la langue a déjà postés ou va poster ; le podz
--      produit donc pour chaque compte.
--
-- 1. LE TIRAGE (`bleo_tirage`) : un contenu d'un label 100 % podz déjà assigné
--    ou publié dans une langue par un compte n'est plus proposé aux autres
--    comptes de cette langue (tests et récolte) ; dans le même plan, un tel
--    contenu choisi pour un compte n'est plus servi à un autre compte de sa
--    langue. Le même compte peut toujours le reposter plus tard (fatigue BLEO).
-- 2. LE RYTHME DES REMAKES (`bleo_rythme_remakes`, voie 2) : le stock d'un
--    compte exclut ce que l'autre compte de sa langue a pris, et la
--    consommation se compte par langue (deux comptes dans une langue mangent
--    deux fois plus) : le rythme du podz monte d'autant.
--
-- Hors champ : les remplacements de la journée et le repli de minuit (rares).
-- Retour arrière : retirer les blocs marqués « 0720 ».

create or replace function pg_temp.bleo_patcher(p_fn regprocedure, p_paires text[])
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
      raise exception '0720 : % : bloc % trouvé % fois (attendu 1), rien n''est changé', p_fn, i, n;
    end if;
    d := replace(d, p_paires[2 * i - 1], p_paires[2 * i]);
  end loop;
  execute d;
end;
$function$;

-- 1. Le tirage.
select pg_temp.bleo_patcher('public.bleo_tirage'::regproc::regprocedure, array[
$a1$create temp table bt_pool on commit drop as$a1$,
$b1$-- 0720 : les contenus des labels 100 % podz, et les langues où un compte les a déjà pris.
  create temp table bt_cent on commit drop as
  select distinct xl.contenu_id from contenu_labels xl join labels_100_podz z on z.label_id = xl.label_id;
  alter table bt_cent add primary key (contenu_id);
  create temp table bt_pris on commit drop as
  select distinct p.contenu_id, lower(p.langue) as langue, p.compte_id
    from passages p join bt_cent b on b.contenu_id = p.contenu_id
   where p.statut in ('assigne', 'valide_par_poster', 'publie') and not coalesce(p.est_rappel, false);
  create index on bt_pris (contenu_id, langue);

  create temp table bt_pool on commit drop as$b1$,

$a2$and abs(p.date_publication_prevue - v_jour) < 7);
  create index on bt_pool (compte_id, application_id);$a2$,
$b2$and abs(p.date_publication_prevue - v_jour) < 7)
     -- 0720 : un contenu 100 % podz déjà pris par un autre compte de la langue n'est plus proposé.
     and not exists (select 1 from bt_pris pr
                      where pr.contenu_id = c.id and pr.langue = lower(kk.langue) and pr.compte_id <> sq.compte_id);
  create index on bt_pool (compte_id, application_id);$b2$,

$a3$and (v.etat = 'juge' or (niveau >= 4 and v.etat = 'a_juger')) and v.valeur > 0$a3$,
$b3$and (v.etat = 'juge' or (niveau >= 4 and v.etat = 'a_juger')) and v.valeur > 0
             -- 0720 : dans le même plan, un contenu 100 % podz ne va qu'à un compte par langue.
             and not exists (select 1 from bt_cent b
                               join bt_creneaux s2 on s2.contenu_id = b.contenu_id
                               join bt_comptes k2 on k2.compte_id = s2.compte_id
                              where b.contenu_id = v.contenu_id and k2.langue = rk.langue
                                and s2.compte_id <> rk.compte_id)$b3$
]);

-- 2. Le rythme des remakes.
select pg_temp.bleo_patcher('public.bleo_rythme_remakes(text)'::regprocedure, array[
$c1$    where not exists (select 1 from passages pa where pa.compte_id = k.compte_id and pa.contenu_id = c.id)$c1$,
$d1$    where not exists (select 1 from passages pa where pa.compte_id = k.compte_id and pa.contenu_id = c.id)
      -- 0720 : ni ce qu'un autre compte de la langue a déjà pris.
      and not exists (select 1 from passages pa
                       where pa.contenu_id = c.id and lower(pa.langue) = lower(k.langue)
                         and pa.statut in ('assigne', 'valide_par_poster', 'publie')
                         and not coalesce(pa.est_rappel, false))$d1$,

$c2$    from cpt k left join stock s on s.compte_id = k.compte_id$c2$,
$d2$    -- 0720 : la consommation de la langue (tous les comptes du label qui la parlent).
    from (select k0.*, sum(k0.p) over (partition by k0.label_id, lower(k0.langue)) as p_langue from cpt k0) k
    left join stock s on s.compte_id = k.compte_id$d2$,

$c3$           (coalesce(s.neufs, 0) + coalesce(s.commandes, 0)) / nullif(k.p, 0) as jours,
           coalesce(s.neufs, 0) / nullif(k.p, 0) as jours_sans_cmd$c3$,
$d3$           (coalesce(s.neufs, 0) + coalesce(s.commandes, 0)) / nullif(k.p_langue, 0) as jours,
           coalesce(s.neufs, 0) / nullif(k.p_langue, 0) as jours_sans_cmd$d3$,

$c4$           (select max(pc.p) from pc where pc.label_id = v.label_id) as p,$c4$,
$d4$           (select max(pc.p_langue) from pc where pc.label_id = v.label_id) as p,$d4$
]);

insert into supabase_migrations.schema_migrations (version, name, statements)
values (to_char(now() at time zone 'UTC', 'YYYYMMDDHH24MISS'), 'podz_etalement_un_contenu_par_langue', array['voir 0720']);
