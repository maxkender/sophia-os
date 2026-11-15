-- 0647 : BLEO, un remplaçant ne prend pas un contenu déjà prévu au plan des jours
-- suivants pour ce compte (D52).
--
-- Le plan du lendemain est tiré à 14 h. Un remplacement fait après 14 h (D49,
-- `bleo_remplacants`) ne voyait pas ce plan : le 4/11 à 15 h 42 et à 22 h 40, deux
-- comptes ont reçu en remplacement un contenu que le plan du 5/11 leur donnait déjà.
-- Ils l'ont donc posté deux jours de suite. Le tirage, lui, ne pouvait pas le savoir.
--
-- Le vivier du remplaçant exclut maintenant les contenus prévus pour ce compte dans
-- un plan suivi (dernier run fini sans erreur) des `meme_contenu_jours` qui suivent.
--
-- Retour arrière : réappliquer 0643.

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
      raise exception '0647 : % : bloc % trouvé % fois (attendu 1), rien n''est changé', p_fn, i, n;
    end if;
    d := replace(d, p_paires[2 * i - 1], p_paires[2 * i]);
  end loop;
  execute d;
end;
$function$;

select pg_temp.bleo_patcher('public.bleo_remplacants(uuid, date, uuid, uuid[], integer)'::regprocedure, array[
$a$  cand as materialized ($a$,
$b$  -- 0647 (D52) : les contenus déjà prévus pour ce compte dans les plans des jours suivants.
  planifies as materialized (
    select o.contenu_id
      from bleo_ombre_passages o
      join bleo_runs r on r.id = o.run_id
     where o.compte_id = p_compte and o.contenu_id is not null
       and r.jour_vise > p_jour and r.jour_vise < p_jour + v_j_contenu
       and r.fini_le is not null and r.erreur is null
  ),
  cand as materialized ($b$,
$a$       and not exists (select 1 from hist h where h.cid = c.id and abs(h.jour - p_jour) < v_j_contenu)
  ),$a$,
$b$       and not exists (select 1 from hist h where h.cid = c.id and abs(h.jour - p_jour) < v_j_contenu)
       and not exists (select 1 from planifies pf where pf.contenu_id = c.id)
  ),$b$
]);
