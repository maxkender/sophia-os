-- 0670 : la performance d'un label (fermeture automatique, poids du choix de
-- label, page Répartition) ne compte que les posts mûrs des comptes actifs
-- (décision d'Adrien du 11/11).
--
-- beau_smart_girl a été fermé par la nuit du 9/11 à 0,744 (seuil 0,75), alors
-- qu'Adrien l'avait rouvert. La mesure comptait :
--   * les posts de comptes déjà désactivés (3 comptes beau_smart_girl, dont un à
--     0,09 et un à 0,18) : un compte arrêté ne dit plus rien du label ;
--   * les posts de la veille, qui n'ont pas fait leurs vues : un label qui reçoit
--     beaucoup de comptes neufs (46 % des posts de beau_smart_girl) est tiré vers
--     le bas.
-- Désormais, `publies` (dans `stats_choix_label` et `simulation_repartition`) ne
-- prend que les posts publiés il y a 3 à 15 jours, sur des comptes actifs. La
-- médiane de chaque langue et celle de la flotte suivent la même règle.
--
-- Effet au 11/11 (perf face à la flotte, avant → après) : beau_smart_girl
-- 0,724 → 0,734 ; weird_alpha 0,779 → 0,830 ; white_bg 0,864 → 0,825 ;
-- alpha_male_yellow 0,925 → 0,966 ; smart_girl 1,068 → 1,025 ; RH 1,107 → 1,174 ;
-- alpha_male 1,395 → 1,362 ; Fathomly 1,504 → 1,478 ; Kaja 0,599 → 0,683.
-- Le nombre de posts mesurés (seuil de 150 pour fermer, 30 pour sortir un label
-- 100 % podz du test) ne compte plus que ces posts-là.
--
-- Retour arrière : retirer les deux conditions ajoutées.

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
      raise exception '0670 : % : bloc % trouvé % fois (attendu 1), rien n''est changé', p_fn, i, n;
    end if;
    d := replace(d, p_paires[2 * i - 1], p_paires[2 * i]);
  end loop;
  execute d;
end;
$function$;

select pg_temp.bleo_patcher('public.stats_choix_label(uuid[],uuid,text,text,integer)'::regprocedure, array[
$a$      and pa.publie_at >= now() - interval '15 days'$a$,
$b$      and pa.publie_at >= now() - interval '15 days'
      -- 0670 : posts mûrs (3 jours) de comptes actifs seulement.
      and pa.publie_at <= now() - interval '3 days'
      and exists (select 1 from public.comptes co where co.id = pa.compte_id and co.is_active)$b$
]);

select pg_temp.bleo_patcher('public.simulation_repartition(uuid)'::regprocedure, array[
$a$      and pa.publie_at >= now() - interval '15 days'$a$,
$b$      and pa.publie_at >= now() - interval '15 days'
      -- 0670 : posts mûrs (3 jours) de comptes actifs seulement.
      and pa.publie_at <= now() - interval '3 days'
      and exists (select 1 from public.comptes co where co.id = pa.compte_id and co.is_active)$b$
]);
