-- 0721 : l'étalement langue par langue vaut aussi pour un label 100 % podz de
-- la voie 1 (Plony).
--
-- Le 14/11 à 14 h 08, daniela.inspira969 (es) a reçu Plony alors
-- qu'alvaro.crecimiento355 était déjà en espagnol. `stats_choix_label` ne
-- connaissait les langues servies que par les decks livrés (voie 2) ou les
-- langues déclarées par le podz ; un podz de la voie 1 ne déclare rien (l'OS
-- traduit), son niveau de remplissage était vide et la règle « une langue où il
-- a déjà un compte attend que les langues vides soient servies » ne jouait pas.
-- Désormais, un tel label sert toutes les langues où l'on recrute.

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
      raise exception '0721 : % : bloc % trouvé % fois (attendu 1), rien n''est changé', p_fn, i, n;
    end if;
    d := replace(d, p_paires[2 * i - 1], p_paires[2 * i]);
  end loop;
  execute d;
end;
$function$;

select pg_temp.bleo_patcher('public.stats_choix_label(uuid[],uuid,text,text,integer)'::regprocedure, array[
$a$    from servies s
    join recrutent r on r.langue = s.langue$a$,
$b$    -- 0721 : un label 100 % podz de la voie 1 (originaux traduits par l'OS) sert toutes les langues où l'on recrute.
    from (select servies.label_id, servies.langue from servies
          union
          select p.label_id, r2.langue from pod p cross join recrutent r2 where p.originaux) s
    join recrutent r on r.langue = s.langue$b$
]);

insert into supabase_migrations.schema_migrations (version, name, statements)
values (to_char(now() at time zone 'UTC', 'YYYYMMDDHH24MISS'), 'etalement_podz_voie1', array['voir 0721']);
