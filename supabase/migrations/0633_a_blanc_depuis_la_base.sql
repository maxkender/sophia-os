-- 0633 : lancer une assignation à blanc depuis la base, sans jamais voir le secret.
--
-- Les répétitions de la bascule BLEO demandaient à Adrien de lancer les tests à
-- blanc depuis l'OS (Moteur → Assignation test à blanc) : la fonction Edge
-- `assignation-a-blanc` n'accepte qu'un admin connecté ou l'en-tête des crons.
-- Depuis 0477, ce secret est dans le Vault et les crons le lisent au moment de
-- partir. `a_blanc_lancer` fait pareil : elle appelle la fonction par pg_net
-- avec l'en-tête lu dans le Vault, et ne rend que le numéro de la requête.
-- `a_blanc_lire` rend la réponse (le flux NDJSON, secrets déjà masqués par la
-- fonction) : statut, lignes « Plan BLEO … » et résultat final.
--
-- Rien n'est écrit par le test lui-même (contexte à blanc : lectures seules,
-- écritures interceptées). Une seule exécution à la fois par instance de la
-- fonction (sinon 409) : lancer les comptes l'un après l'autre.
--
-- Réservé à service_role (et au propriétaire) : ni anon ni authenticated.
-- Retour arrière : drop function des deux.

set lock_timeout = '5s';

create or replace function public.a_blanc_lancer(p_compte uuid, p_jour date default null, p_bleo boolean default true)
returns bigint
language plpgsql
security definer
set search_path = public, extensions
as $function$
declare
  v_id bigint;
begin
  select net.http_post(
           url := 'https://mbikecieskoobeizixig.supabase.co/functions/v1/assignation-a-blanc',
           body := jsonb_build_object(
             'compteId', p_compte,
             'jour', to_char(coalesce(p_jour, (now() at time zone 'Europe/Paris')::date + 1), 'YYYY-MM-DD'),
             'bleo', p_bleo,
             'ia', false),
           headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', public.cron_secret_lire()),
           timeout_milliseconds := 280000)
    into v_id;
  return v_id;
end;
$function$;

revoke all on function public.a_blanc_lancer(uuid, date, boolean) from public, anon, authenticated;
grant execute on function public.a_blanc_lancer(uuid, date, boolean) to service_role;

comment on function public.a_blanc_lancer(uuid, date, boolean) is
  '0633 : lance assignation-a-blanc (sans IA) pour un compte et un jour, plan BLEO suivi par défaut ; rend l''id de la requête pg_net, à lire avec a_blanc_lire. Le secret reste dans le Vault.';

-- La réponse d'un test lancé par a_blanc_lancer : null tant qu'elle n'est pas
-- arrivée (pg_net écrit la réponse à la fin de l'appel).
create or replace function public.a_blanc_lire(p_id bigint)
returns jsonb
language sql
stable
security definer
set search_path = public, extensions
as $function$
  with r as (
    select status_code, timed_out, error_msg, content from net._http_response where id = p_id
  ),
  lignes as (
    select l::jsonb as e, n
      from r, regexp_split_to_table(coalesce(r.content, ''), E'\n') with ordinality as t(l, n)
     where l ~ '^\s*\{'
  )
  select case when not exists (select 1 from r) then null else jsonb_build_object(
    'http', (select status_code from r),
    'expire', (select timed_out from r),
    'erreur', (select error_msg from r),
    'plan_bleo', coalesce((select jsonb_agg(e->>'detail' order by n) from lignes
                            where e->>'detail' like 'Plan BLEO%'), '[]'::jsonb),
    'fin', (select e from lignes where e->>'etape' = 'ready' order by n desc limit 1),
    'debut_reponse', case when not exists (select 1 from lignes) then left((select content from r), 500) end
  ) end
$function$;

revoke all on function public.a_blanc_lire(bigint) from public, anon, authenticated;
grant execute on function public.a_blanc_lire(bigint) to service_role;

comment on function public.a_blanc_lire(bigint) is
  '0633 : la réponse d''un test à blanc lancé par a_blanc_lancer (statut HTTP, lignes « Plan BLEO … », résultat final).';
