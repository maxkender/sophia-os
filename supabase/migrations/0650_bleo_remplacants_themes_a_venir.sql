-- 0650 : BLEO, un remplaçant évite aussi les thèmes et les photos déjà prévus au plan
-- des jours suivants pour ce compte (suite de D52).
--
-- 0647 a exclu du vivier d'un remplaçant les CONTENUS prévus pour le compte dans les
-- plans suivis à venir. Le rapport du 5/11 montre le même trou pour les THÈMES : un
-- remplacement fait après le tirage de 14 h (le 4/11) a mis un thème que le plan du
-- lendemain donnait aussi au compte (4 cas « même thème » non déclarés le 5/11).
--
-- L'historique du compte (`hist`) compte maintenant aussi les lignes des plans suivis
-- (dernier run fini sans erreur) des jours à venir : les garde-fous du remplaçant
-- (même contenu, même thème, même photo) les voient comme des passages, et les relâchent
-- dans le même ordre au besoin (le moins de garde-fous enfreints d'abord).
--
-- Retour arrière : réappliquer 0647.

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
      raise exception '0650 : % : bloc % trouvé % fois (attendu 1), rien n''est changé', p_fn, i, n;
    end if;
    d := replace(d, p_paires[2 * i - 1], p_paires[2 * i]);
  end loop;
  execute d;
end;
$function$;

select pg_temp.bleo_patcher('public.bleo_remplacants(uuid, date, uuid, uuid[], integer)'::regprocedure, array[
$a$     where p.compte_id = p_compte
       and abs(p.date_publication_prevue - p_jour) < greatest(v_j_contenu, v_j_famille, v_j_couverture)
  ),$a$,
$b$     where p.compte_id = p_compte
       and abs(p.date_publication_prevue - p_jour) < greatest(v_j_contenu, v_j_famille, v_j_couverture)
    union all
    -- 0650 : les lignes des plans suivis à venir pour ce compte comptent comme des passages.
    select o.contenu_id, public.bleo_theme_famille(c.famille_id), c.couverture_empreinte, r.jour_vise
      from bleo_ombre_passages o
      join bleo_runs r on r.id = o.run_id
      join contenus c on c.id = o.contenu_id
     where o.compte_id = p_compte
       and r.jour_vise > p_jour and r.jour_vise < p_jour + greatest(v_j_contenu, v_j_famille, v_j_couverture)
       and r.fini_le is not null and r.erreur is null
  ),$b$
]);
