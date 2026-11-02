-- 0453 — Suppression du +1 $ de la 1re semaine (prime sur tout le reste).
--
-- Toutes les semaines sont payées au même tarif, la 1re comprise (A 14 $,
-- B 10 $, C 7 $, ou le tarif du contrat). Le réglage passe à 0 et la liste de
-- paie n'ajoute plus aucun bonus, quelle que soit sa valeur. Transition (dans
-- le moteur de paie) : une 1re milestone déjà financée au tarif + 1 $ est
-- payée en entier ; une milestone non financée au tarif + 1 $ est corrigée
-- au tarif avant d'être financée.

insert into public.reglages (cle, valeur) values ('paie_bonus_premiere_semaine', to_jsonb(0))
on conflict (cle) do update set valeur = to_jsonb(0), updated_at = now();

do $p$
declare
  v_def text := pg_get_functiondef('public.paie_liste_v2(date,boolean)'::regprocedure);
  v_avant text := $q$v_bonus := coalesce(v_bonus, 1);$q$;
begin
  if position(v_avant in v_def) = 0 then raise exception '0453 : bonus introuvable dans paie_liste_v2'; end if;
  execute replace(v_def, v_avant, $q$v_bonus := 0; -- 0453 : plus de bonus de 1re semaine$q$);
end;
$p$;

notify pgrst, 'reload schema';
