-- 0501 — Onglet Sunday : le nom de la recrue dans son contexte, pour la section
-- « Killed » (une recrue tuée n'est plus dans la liste du warm-up).

do $m$
declare
  v_def text := pg_get_functiondef('public.warmup_check_contexte(date)'::regprocedure);
  a text := $q$'offre_acceptee_le', po.offre_acceptee_le,$q$;
begin
  if position(a in v_def) = 0 then raise exception '0501 : bloc offre introuvable'; end if;
  execute replace(v_def, a, $q$'nom', nullif(btrim(concat_ws(' ', po.prenom, po.nom)), ''),
           'offre_acceptee_le', po.offre_acceptee_le,$q$);
end;
$m$;

notify pgrst, 'reload schema';
