-- 0614 : BLEO, le mode `actif` (bascule du lundi 2/11, décision d'Adrien le 29/10).
--
-- En mode `actif`, l'assignation de minuit suit le plan du tirage de 14 h
-- (`supabase/functions/_shared/bleo_plan.ts`). Il faut donc que le tirage
-- continue de tourner en mode actif : jusqu'ici, `bleo_tirage_cron` ne tirait
-- qu'en mode `ombre` et `bleo_tirage` refusait tout autre mode. Le tirage d'un
-- jour actif est le même que celui d'un jour ombre (il n'écrit que le plan),
-- il est seulement marqué `mode = 'actif'` dans `bleo_runs`.
--
-- Et l'interrupteur de l'OS : `bleo_changer_mode(p_mode)`, réservé à l'admin,
-- change `reglages.bleo.mode` sans toucher au reste des réglages et garde les
-- 20 derniers changements dans `reglages.bleo.mode_historique`.
--
-- Les deux fonctions de tirage sont patchées EN PLACE (même méthode que 0612) :
-- la migration échoue si la garde attendue n'est pas trouvée.

set lock_timeout = '5s';

do $migration$
declare
  src text;
  ancien constant text := $a$  if p_mode <> 'ombre' then
    raise exception 'bleo_tirage : seul le mode ombre est branché (demandé : %)', p_mode;
  end if;$a$;
  nouveau constant text := $n$  if p_mode not in ('ombre', 'actif') then
    raise exception 'bleo_tirage : modes ombre et actif seulement (demandé : %)', p_mode;
  end if;$n$;
begin
  select prosrc into src from pg_proc where oid = 'public.bleo_tirage(date, text)'::regprocedure;
  if position(ancien in src) = 0 then
    raise exception 'bleo_tirage : garde du mode introuvable, rien n''est changé';
  end if;
  src := replace(src, ancien, nouveau);
  execute format(
    'create or replace function public.bleo_tirage(p_jour date default null, p_mode text default %L) returns jsonb language plpgsql set search_path to %L as %L',
    'ombre', 'public', src);
end;
$migration$;

do $migration$
declare
  src text;
  ancien constant text := $a$  if coalesce(v_mode, 'off') <> 'ombre' then$a$;
  nouveau constant text := $n$  if coalesce(v_mode, 'off') not in ('ombre', 'actif') then$n$;
begin
  select prosrc into src from pg_proc where oid = 'public.bleo_tirage_cron()'::regprocedure;
  if position(ancien in src) = 0 then
    raise exception 'bleo_tirage_cron : garde du mode introuvable, rien n''est changé';
  end if;
  src := replace(src, ancien, nouveau);
  execute format(
    'create or replace function public.bleo_tirage_cron() returns jsonb language plpgsql set search_path to %L as %L',
    'public', src);
end;
$migration$;

create or replace function public.bleo_changer_mode(p_mode text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_avant text;
  v_le timestamptz := now();
  v_plan record;
begin
  if not (public.is_admin_strict() or coalesce(auth.jwt() ->> 'role', '') = 'service_role') then
    raise exception 'bleo_changer_mode : réservé à l''admin' using errcode = '42501';
  end if;
  if p_mode is null or p_mode not in ('off', 'ombre', 'actif') then
    raise exception 'bleo_changer_mode : mode inconnu (%)', p_mode using errcode = '22023';
  end if;

  select valeur->>'mode' into v_avant from reglages where cle = 'bleo' for update;
  if not found then
    raise exception 'reglages.bleo absent';
  end if;

  update reglages
     set valeur = jsonb_set(
                    jsonb_set(valeur, '{mode}', to_jsonb(p_mode)),
                    '{mode_historique}',
                    (select coalesce(jsonb_agg(h order by (h->>'le') desc), '[]'::jsonb)
                       from (select h
                               from jsonb_array_elements(
                                      jsonb_build_array(jsonb_build_object(
                                        'mode', p_mode, 'avant', v_avant, 'le', v_le, 'par', auth.uid()))
                                      || coalesce(valeur->'mode_historique', '[]'::jsonb)) h
                              order by (h->>'le') desc
                              limit 20) d)),
         updated_at = v_le,
         updated_by = coalesce(auth.uid(), updated_by)
   where cle = 'bleo';

  -- Le plan que suivra la prochaine assignation : le dernier tirage fini sans erreur.
  select r.id, r.jour_vise, (select count(*) from bleo_ombre_passages o where o.run_id = r.id) as lignes
    into v_plan
    from bleo_runs r
   where r.fini_le is not null and r.erreur is null
   order by r.jour_vise desc, r.demarre_le desc
   limit 1;

  return jsonb_build_object(
    'mode', p_mode,
    'avant', v_avant,
    'le', v_le,
    'dernier_plan', case when v_plan.id is null then null
                         else jsonb_build_object('run_id', v_plan.id, 'jour_vise', v_plan.jour_vise, 'lignes', v_plan.lignes) end);
end;
$$;

grant execute on function public.bleo_changer_mode(text) to authenticated, service_role;

comment on function public.bleo_changer_mode(text) is
  'BLEO : change reglages.bleo.mode (off, ombre, actif) et garde les 20 derniers changements. Admin seulement.';
