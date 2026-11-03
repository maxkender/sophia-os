-- 0645 : BLEO, sur un compte à court de contenus jugés, tester un contenu neuf avant
-- de répéter un contenu déjà posté (D51).
--
-- Plan du 4/11 : 10 créneaux en repli « tout », c'est-à-dire un contenu déjà posté
-- sur le compte à moins de `meme_contenu_jours` (14 jours), parfois la veille. Ils
-- tombent tous sur des petits labels de remakes (Fathomly en, de ; mentalmaxxing fr, es ;
-- that_girl_study tr, es), qui ont peu de contenus jugés (12, 6 et 2) mais beaucoup
-- de contenus à juger (36, 56 et 27). Les podz produisent assez : 41, 38 et 21 contenus
-- en 7 jours. Ce qui bloque, c'est le jugement. La file `juger` d'un label est plafonnée
-- à `file_juger.part_max` (30 %) de ses créneaux : 1 test par jour pour Fathomly et
-- that_girl_study, 3 pour mentalmaxxing. Le contenu à juger ne venait qu'au dernier
-- repli (`hors_file`), après le repli qui répète un contenu.
--
-- Nouvel ordre des replis du tirage, pour un créneau de la file `valeur` :
--   0 tous les garde-fous ; 1 sans le budget du thème ; 2 sans la couverture ;
--   3 sans le même thème ;
--   4 `hors_file` (avant : 5) : un contenu à juger peut prendre le créneau, et le même
--     contenu reste interdit sur le compte à moins de `meme_contenu_jours` ;
--   5 `tout` (avant : 4) : un contenu déjà posté sur le compte peut revenir,
--     jamais le même jour (D47).
-- La file et la catégorie du créneau suivent l'état du contenu choisi (`a_juger` :
-- file `juger`), et non plus le niveau du repli.
--
-- Retour arrière : réappliquer la définition de `bleo_tirage` d'avant (0642), ou
-- inverser les cinq remplacements ci-dessous.

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
      raise exception '0645 : % : bloc % trouvé % fois (attendu 1), rien n''est changé', p_fn, i, n;
    end if;
    d := replace(d, p_paires[2 * i - 1], p_paires[2 * i]);
  end loop;
  execute d;
end;
$function$;

select pg_temp.bleo_patcher('public.bleo_tirage(date, text)'::regprocedure, array[
$a$             and (v.etat = 'juge' or (niveau >= 5 and v.etat = 'a_juger')) and v.valeur > 0$a$,
$b$             -- 0645 (D51) : un contenu à juger dès le repli 4 (hors_file), avant de répéter.
             and (v.etat = 'juge' or (niveau >= 4 and v.etat = 'a_juger')) and v.valeur > 0$b$,
$a$                                             and abs(h.jour - v_jour) < case when niveau >= 4 then 1 else v_j_contenu end)$a$,
$b$                                             and abs(h.jour - v_jour) < case when niveau >= 5 then 1 else v_j_contenu end)$b$,
$a$         set file = case when v_niveau >= 5 then 'juger' else 'valeur' end,$a$,
$b$         set file = case when v.etat = 'a_juger' then 'juger' else 'valeur' end,$b$,
$a$             categorie = case when v_niveau >= 5 then 'juger'$a$,
$b$             categorie = case when v.etat = 'a_juger' then 'juger'$b$,
$a$                                     when 3 then 'budget+couverture+famille' when 4 then 'tout'
                                     else 'hors_file' end$a$,
$b$                                     when 3 then 'budget+couverture+famille' when 4 then 'hors_file'
                                     else 'tout' end$b$
]);

comment on function public.bleo_tirage(date, text) is
  'BLEO : le plan du lendemain (A6 à A8). Replis d''un créneau valeur (0645, D51) : budget, couverture, même thème, puis un contenu à juger (hors_file), et seulement ensuite un contenu déjà posté sur le compte (tout, jamais le même jour).';
