-- 0791 : un contenu est noté tout de suite dans une langue neuve de son label.
--
-- Le tirage ne prend un contenu dans une langue que s'il y a une ligne
-- `bleo_valeurs` (contenu, langue). Ces lignes ne naissaient que dans bleo_nuit
-- (5 h 15), et `bleo_nouveaux_avant_tirage` ne notait que les contenus sans
-- AUCUNE valeur. Le 20/11 (refonte des labels micabo), les comptes déplacés
-- vers Fathomly (lt, no, et, fi) et clean_girl_run (bg, en, es, hr, hu, ja, ro)
-- n'avaient donc aucun créneau au plan du lendemain : leurs contenus étaient
-- notés dans les anciennes langues du label, pas dans les leurs.
--
-- 1. `bleo_nouveaux_avant_tirage` note chaque couple (contenu, langue) qui
--    manque, plus seulement les contenus sans aucune valeur. Appelée avant
--    chaque tirage de 14 h, elle comble donc aussi les langues neuves.
--    Mesuré le 20/11 : 1 à 2 s, 312 valeurs comblées au premier passage.
-- 2. Un déclencheur sur `compte_labels` l'appelle dès qu'un compte reçoit un
--    label (page Podz, compte_deplacer, Labels & applications) : les valeurs
--    existent tout de suite, pour le secours de minuit ou un tirage relancé.
--    Il ne bloque jamais le changement de label.
--
-- Les contenus livrés restent filtrés par le tirage sur leurs langues livrées
-- (bt_pool) : une valeur dans une langue sans slides ne sert rien.
--
-- Appliquée le 20/11 (API de gestion). Retour arrière : drop trigger
-- bleo_valeurs_apres_label on compte_labels ; retirer « and bv.langue =
-- l.langue » de bleo_nouveaux_avant_tirage.

do $do$
declare
  v_def text := pg_get_functiondef('public.bleo_nouveaux_avant_tirage()'::regprocedure);
  v_ancre text := 'not exists (select 1 from bleo_valeurs bv where bv.contenu_id = c.id)';
begin
  if position('bv.contenu_id = c.id and bv.langue = l.langue' in v_def) > 0 then
    return; -- déjà fait
  end if;
  if (length(v_def) - length(replace(v_def, v_ancre, ''))) / length(v_ancre) <> 1 then
    raise exception 'bleo_nouveaux_avant_tirage : ancre introuvable ou ambiguë';
  end if;
  execute replace(v_def, v_ancre,
    'not exists (select 1 from bleo_valeurs bv where bv.contenu_id = c.id and bv.langue = l.langue)');
end
$do$;

create or replace function public.bleo_valeurs_apres_label()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  -- 0791 : un compte qui reçoit un label peut ouvrir une langue neuve à ce label. Ses contenus sont
  -- notés tout de suite dans cette langue, sans attendre bleo_nuit (5 h 15) : sinon le compte n'a rien
  -- au tirage suivant. Ne bloque jamais le changement de label.
  begin
    perform public.bleo_nouveaux_avant_tirage();
  exception when others then
    raise warning 'bleo_valeurs_apres_label : %', sqlerrm;
  end;
  return null;
end;
$function$;

revoke all on function public.bleo_valeurs_apres_label() from public, anon, authenticated;

drop trigger if exists bleo_valeurs_apres_label on public.compte_labels;
create trigger bleo_valeurs_apres_label
  after insert on public.compte_labels
  for each statement execute function public.bleo_valeurs_apres_label();
