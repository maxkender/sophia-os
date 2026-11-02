-- 0641 : le tirage de 14 h garde la trace du rattrapage d'avant tirage (0638).
--
-- 0638 renvoyait `nouveaux_avant_tirage` (rattachés, valeurs) dans la valeur de
-- retour de `bleo_tirage_cron`, que pg_cron ne garde pas (« 1 row ») : au
-- premier tirage officiel (2/11, 14 h), le compte n'était lisible nulle part.
-- Les 61 livraisons des podz du matin avaient pourtant bien famille et valeur
-- (bleo_valeurs.calcule_le = 14:00:00), et 38 sont au plan du 3/11.
--
-- Ici, le même compte est aussi écrit dans `bleo_runs.resume` du run créé.
-- Rien d'autre ne change.
--
-- Appliquée le 2/11 (API de gestion). Retour arrière : rejouer bleo_tirage_cron de 0638.

create or replace function public.bleo_tirage_cron()
 returns jsonb
 language plpgsql
 set search_path to 'public'
as $function$
declare
  v_paris timestamp := now() at time zone 'Europe/Paris';
  v_demain date := (now() at time zone 'Europe/Paris')::date + 1;
  v_mode text;
  v_nouveaux jsonb;
  v_res jsonb;
begin
  if auth.uid() is not null and not public.is_admin() then
    raise exception 'bleo : réservé aux admins' using errcode = '42501';
  end if;
  select valeur->>'mode' into v_mode from reglages where cle = 'bleo';
  if coalesce(v_mode, 'off') not in ('ombre', 'actif') then
    return jsonb_build_object('ignore', 'mode ' || coalesce(v_mode, 'off'));
  end if;
  if extract(hour from v_paris) <> 14 then
    return jsonb_build_object('ignore', 'hors heure');
  end if;
  -- Seul un tirage commencé à 14 h (heure de Paris) compte : un essai lancé à la
  -- main à une autre heure ne bloque pas le tirage officiel (0638).
  if exists (select 1 from bleo_runs
              where jour_vise = v_demain and fini_le is not null and erreur is null
                and extract(hour from demarre_le at time zone 'Europe/Paris') = 14) then
    return jsonb_build_object('jour_vise', v_demain, 'deja', true);
  end if;
  v_nouveaux := public.bleo_nouveaux_avant_tirage();
  v_res := public.bleo_tirage(v_demain, v_mode);
  -- La trace dans le run lui-même (0641) : pg_cron ne garde pas la valeur de retour.
  if v_res ? 'run_id' then
    update bleo_runs
       set resume = coalesce(resume, '{}'::jsonb) || jsonb_build_object('nouveaux_avant_tirage', v_nouveaux)
     where id = (v_res->>'run_id')::uuid;
  end if;
  return v_res || jsonb_build_object('nouveaux_avant_tirage', v_nouveaux);
end;
$function$;
