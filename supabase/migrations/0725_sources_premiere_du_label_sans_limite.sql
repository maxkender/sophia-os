-- 0725 : la première source d'un label ne connaît pas la limite de sources
-- neuves par jour (décision d'Adrien du 15/11).
--
-- `maj_sources_ajouter` limite à `reglages.bleo.sources.nouvelles_par_jour` (2)
-- les sources ajoutées lancées le même jour, pour ménager la base. Le 15/11,
-- @psychevaultt, première source du label neuf psych_art, a été renvoyée au
-- lendemain parce que @jco.mindset et @luvy_y avaient pris les deux places.
-- Un label neuf n'a rien à poster tant que sa première source n'est pas
-- importée : elle passe désormais hors limite (toujours une source à la fois :
-- si une mise à jour tourne, elle attend son tour comme avant).

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
      raise exception '0725 : % : bloc % trouvé % fois (attendu 1), rien n''est changé', p_fn, i, n;
    end if;
    d := replace(d, p_paires[2 * i - 1], p_paires[2 * i]);
  end loop;
  execute d;
end;
$function$;

select pg_temp.bleo_patcher('public.maj_sources_ajouter(uuid)'::regprocedure, array[
$a$  if v_lancees < v_npj$a$,
$b$  -- 0725 : la première source d'un label (aucune autre source dans ses labels) passe hors limite.
  if (v_lancees < v_npj
      or not exists (select 1 from compte_reference_labels crl
                       join compte_reference_labels crl2 on crl2.label_id = crl.label_id
                                                       and crl2.compte_reference_id <> crl.compte_reference_id
                      where crl.compte_reference_id = p_compte))$b$
]);

insert into supabase_migrations.schema_migrations (version, name, statements)
values (to_char(now() at time zone 'UTC', 'YYYYMMDDHH24MISS'), 'sources_premiere_du_label_sans_limite', array['voir 0725']);

-- @psychevaultt (première source de psych_art) part tout de suite.
select public.maj_sources_ajouter('335457a9-996b-45a3-ac1a-dd600ee7134a');
