-- 0660 : deux réglages de BLEO décidés par Adrien le 6/11, après les mesures à âge égal.
--
-- Mesures (vues à J+3 des posts du 2 et du 3/11, r = vues ÷ médiane du compte) :
-- récolte (gagnants prouvés, langue neuve) r 1,79 ; déclinaisons 0,97 ; full tests
-- 0,97 ; tests d'imports arrivés depuis moins de 30 jours 0,90, depuis 30 jours ou plus
-- 0,59. Dans 193 familles qui ont un G0 gagnant et une déclinaison, les déclinaisons
-- prenaient environ 60 % des langues neuves ; elles faisaient 21 % du plan du 7/11.
--
-- (a) Valeur de départ des déclinaisons : `classes.depart.accroche_gagnante` 3,2 → 2,0.
--     Elle est relue chaque nuit pour tout contenu de cette classe, y compris les
--     déclinaisons déjà déposées et pas encore postées. Une déclinaison reste servie
--     (elle ne passe pas par les tests, c'est la récolte qui la mesure), mais derrière
--     un gagnant prouvé tant qu'elle n'a rien prouvé.
-- (b) File à juger : les imports (contenus hors podz, `contenus.pod` vide) ne sont plus
--     testés s'ils sont arrivés il y a plus de `file_juger.age_max_import_jours` (30)
--     jours. Ils restent en réserve. Les contenus des podz ne sont pas concernés.
--
-- Retour arrière : remettre 3,2 dans `classes.depart.accroche_gagnante`, retirer
-- `file_juger.age_max_import_jours` (la fonction le lit comme « pas de limite »).

update public.reglages
   set valeur = jsonb_set(jsonb_set(valeur, '{classes,depart,accroche_gagnante}', '2.0'::jsonb),
                          '{file_juger,age_max_import_jours}', '30'::jsonb)
 where cle = 'bleo';

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
      raise exception '0660 : % : bloc % trouvé % fois (attendu 1), rien n''est changé', p_fn, i, n;
    end if;
    d := replace(d, p_paires[2 * i - 1], p_paires[2 * i]);
  end loop;
  execute d;
end;
$function$;

select pg_temp.bleo_patcher('public.bleo_tirage(date, text)'::regprocedure, array[
$a$  v_part_max numeric;
$a$,
$b$  v_part_max numeric;
  v_age_max_import integer;
$b$,
$a$  v_part_max := (reg->'file_juger'->>'part_max')::numeric;
$a$,
$b$  v_part_max := (reg->'file_juger'->>'part_max')::numeric;
  -- 0660 : les imports arrivés depuis plus longtemps ne sont plus testés (vide = pas de limite).
  v_age_max_import := (reg->'file_juger'->>'age_max_import_jours')::int;
$b$,
$a$   where c.statut = 'valide' and c.import_statut = 'done' and c.etat_bleo = 'a_juger'
     and (f.racine_contenu_id = c.id or c.accroche_norm is distinct from f.accroche_norm);$a$,
$b$   where c.statut = 'valide' and c.import_statut = 'done' and c.etat_bleo = 'a_juger'
     and (f.racine_contenu_id = c.id or c.accroche_norm is distinct from f.accroche_norm)
     and (c.pod is not null or v_age_max_import is null
          or c.created_at >= now() - make_interval(days => v_age_max_import));$b$
]);
