-- 0661 : deux décisions d'Adrien du 7/11.
--
-- (1) Moins de perdants resservis. Après 0660, le plan du 8/11 donnait 130 créneaux sur
--     614 (21 %) à des contenus jugés non gagnants servis dans une langue où ils n'ont
--     pas été essayés (catégories non_gagnant_neuve / non_gagnant_servie). Ils font r 0,66
--     à J+3, contre 1,79 pour la récolte ; la spec les limite à 15 %. Le poids d'un
--     candidat au tirage est valeur^exposant (3) : la valeur d'un candidat non gagnant
--     (verdict propre ou de sa famille autre que « gagnant ») est maintenant multipliée
--     par `valeur.facteur_non_gagnant` (0,5), soit un poids divisé par 8. Il reste servi
--     quand il n'y a rien d'autre (garde-fous). Même règle pour les remplaçants de la
--     journée (`bleo_remplacants`). Absent du réglage : facteur 1, comme avant.
-- (2) Les 14 déclinaisons des podz de remakes encore en classe `livre` (valeur de départ
--     4,0) passent en `accroche_gagnante` (2,0 depuis 0660), comme toutes les autres
--     déclinaisons. Depuis 0652, une nouvelle déclinaison livrée prend déjà cette classe.
--
-- Retour arrière : retirer `valeur.facteur_non_gagnant` (facteur 1) ; les 14 contenus
-- sont listés par la requête de la partie (2), sur `type_bleo = 'declinaison'`.

update public.reglages
   set valeur = jsonb_set(valeur, '{valeur,facteur_non_gagnant}', '0.5'::jsonb)
 where cle = 'bleo';

update public.contenus
   set classe_defaut = 'accroche_gagnante'
 where type_bleo = 'declinaison' and classe_defaut = 'livre';

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
      raise exception '0661 : % : bloc % trouvé % fois (attendu 1), rien n''est changé', p_fn, i, n;
    end if;
    d := replace(d, p_paires[2 * i - 1], p_paires[2 * i]);
  end loop;
  execute d;
end;
$function$;

select pg_temp.bleo_patcher('public.bleo_tirage(date, text)'::regprocedure, array[
$a$  v_exposant numeric;
$a$,
$b$  v_exposant numeric;
  v_facteur_ng numeric;
$b$,
$a$  v_exposant := (reg->'valeur'->>'exposant')::numeric;
$a$,
$b$  v_exposant := (reg->'valeur'->>'exposant')::numeric;
  -- 0661 : un non gagnant pèse moins au tirage (sa valeur × ce facteur, avant l'exposant).
  v_facteur_ng := coalesce((reg->'valeur'->>'facteur_non_gagnant')::numeric, 1);
$b$,
$a$power(v.valeur, v_exposant) as w$a$,
$b$power(v.valeur * case when v.verdict = 'gagnant' then 1 else v_facteur_ng end, v_exposant) as w$b$
]);

select pg_temp.bleo_patcher('public.bleo_remplacants(uuid, date, uuid, uuid[], integer)'::regprocedure, array[
$a$  v_exposant double precision;
$a$,
$b$  v_exposant double precision;
  v_facteur_ng double precision;
$b$,
$a$  v_exposant := coalesce((reg->'valeur'->>'exposant')::double precision, 3);
$a$,
$b$  v_exposant := coalesce((reg->'valeur'->>'exposant')::double precision, 3);
  -- 0661 : un non gagnant pèse moins, comme au tirage.
  v_facteur_ng := coalesce((reg->'valeur'->>'facteur_non_gagnant')::double precision, 1);
$b$,
$a$greatest(power(note.val::double precision, v_exposant), 1e-300)$a$,
$b$greatest(power(note.val::double precision * case when note.verdict = 'gagnant' then 1 else v_facteur_ng end, v_exposant), 1e-300)$b$
]);
