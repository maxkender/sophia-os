-- 0576 : Ruul, les envois et le STOP (9/11).
--
-- 1. ruul_stop_jeton(jeton) : le lien « Unsubscribe » des emails (fonction
--    ruul) : plus aucune relance (profiles.relances_stop_at) et une demande
--    d'arrêt « A demandé STOP » qui remonte au samedi.
-- 2. Crons : fonction ruul (invitation, relances, « You received X $ ») toutes
--    les 15 min ; le lot Ruul de la semaine préparé chaque lundi à 9 h 20
--    (Paris), en même temps que la paie Upwork. Rien n'est payé : Max paie
--    sur Ruul.
-- Additif : une fonction, deux crons.

create or replace function public.ruul_stop_jeton(p_jeton uuid, p_source text default 'email')
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  update public.profiles
     set relances_stop_at = coalesce(relances_stop_at, now())
   where ruul_jeton = p_jeton
  returning id into v_id;
  if v_id is null then return false; end if;
  begin
    perform public.demande_arret_noter(v_id, 'message', 'STOP (' || coalesce(p_source, 'email') || ', lien « Unsubscribe »)', null);
  exception when others then
    null;
  end;
  return true;
end;
$$;

revoke execute on function public.ruul_stop_jeton(uuid, text) from public, anon, authenticated;
grant execute on function public.ruul_stop_jeton(uuid, text) to service_role;

do $c$
begin
  perform cron.schedule('ruul-envoyer', '*/15 * * * *', $cmd$
    select net.http_post(
      url := 'https://mbikecieskoobeizixig.supabase.co/functions/v1/ruul',
      headers := jsonb_build_object('content-type', 'application/json', 'x-cron-secret', public.cron_secret_lire()),
      body := '{"action":"envoyer"}'::jsonb,
      timeout_milliseconds := 120000)
  $cmd$);
  -- 8 h 20 UTC = 9 h 20 à Paris (heure d'hiver).
  perform cron.schedule('ruul-lot', '20 8 * * 1', 'select public.ruul_lot_preparer()');
end
$c$;
