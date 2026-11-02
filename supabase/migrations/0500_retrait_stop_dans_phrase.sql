-- 0500 — Onglet Sunday : un « STOP » écrit en majuscules dans une phrase
-- (« i will have to STOP here ») ou « have to stop » compte comme un retrait,
-- comme un STOP seul. warmup_check_contexte (0496, 0499) : la règle de
-- détection est élargie dans les deux branches (Upwork et Slack).

do $m$
declare
  v_def text := pg_get_functiondef('public.warmup_check_contexte(date)'::regprocedure);
  a text := $q$~* '(^\s*stop\s*$|withdraw|$q$;
  n int;
begin
  n := (length(v_def) - length(replace(v_def, a, ''))) / length(a);
  if n <> 2 then raise exception '0500 : règle de retrait attendue 2 fois, trouvée %', n; end if;
  -- « STOP » en majuscules (mot entier) d'abord, puis la règle insensible à la casse, élargie.
  v_def := replace(v_def, $q$coalesce(m.recu_upwork ->> 'texte', '') ~* '(^\s*stop\s*$|withdraw|$q$,
                          $q$coalesce(m.recu_upwork ->> 'texte', '') ~ '\mSTOP\M' or coalesce(m.recu_upwork ->> 'texte', '') ~* '(^\s*stop\s*$|have to stop|withdraw|$q$);
  v_def := replace(v_def, $q$coalesce(m.recu_slack ->> 'texte', '') ~* '(^\s*stop\s*$|withdraw|$q$,
                          $q$coalesce(m.recu_slack ->> 'texte', '') ~ '\mSTOP\M' or coalesce(m.recu_slack ->> 'texte', '') ~* '(^\s*stop\s*$|have to stop|withdraw|$q$);
  if position('have to stop' in v_def) = 0 then raise exception '0500 : remplacement non fait'; end if;
  execute v_def;
end;
$m$;

notify pgrst, 'reload schema';
