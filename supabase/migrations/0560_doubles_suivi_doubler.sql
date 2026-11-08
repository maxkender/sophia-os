-- 0560 : « 2e comptes proposés » ne montre que les offres dont la décision est toujours Doubler
-- (les 20 Doubler pré-cochés du 07/11 sont repassés en « Pas maintenant »). Additif : une fonction modifiée.
do $p$
declare
  d text := pg_get_functiondef('public.doubles_suivi(date)'::regprocedure);
  avant text := 'where m.type = ''double'' and m.semaine >= v_depuis';
begin
  if position('0560' in d) > 0 then return; end if;
  if position(avant in d) = 0 then raise exception '0560 : filtre introuvable'; end if;
  d := replace(d, avant, avant || ' and coalesce(p.decision, ''doubler'') = ''doubler'' -- 0560');
  execute d;
end
$p$;
