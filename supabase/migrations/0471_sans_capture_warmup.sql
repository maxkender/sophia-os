-- 0471 — Plus de capture de warm-up.
--
-- La recrue n'envoie plus de capture « Warm-up done » (bouton retiré du
-- dashboard) et Needs you ne montre plus les cartes « warmup_capture ». Les
-- recrues concernées sont dans le cas normal : le warm-up fini se lit dans les
-- relevés TikTok de l'OS (compte_pret), et le check du dimanche soir fait le reste.
--
-- Rien n'est supprimé : warmup_declarations, ses lignes et les captures restent ;
-- compte_pret ne change pas (aucune déclaration validée).

do $p$
declare
  v_def text := pg_get_functiondef('public.needs_you()'::regprocedure);
  v_debut text := $a$    union all
    select 'warmup_capture:' || wd.id$a$;
  v_suite text := $a$    union all
    select 'handle_probable:' || hv.id$a$;
  i int;
  j int;
begin
  if (length(v_def) - length(replace(v_def, v_debut, ''))) / length(v_debut) <> 1 then
    raise exception '0471 : needs_you : le bloc warmup_capture est introuvable ou en double';
  end if;
  if (length(v_def) - length(replace(v_def, v_suite, ''))) / length(v_suite) <> 1 then
    raise exception '0471 : needs_you : le bloc handle_probable est introuvable ou en double';
  end if;
  i := position(v_debut in v_def);
  j := position(v_suite in v_def);
  if j <= i then
    raise exception '0471 : needs_you : blocs dans un ordre inattendu';
  end if;
  execute substr(v_def, 1, i - 1) || substr(v_def, j);
end;
$p$;

notify pgrst, 'reload schema';
