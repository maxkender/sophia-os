-- 0669 : Upwork saturé (Max, 10/11).
-- 1. upwork_lectures : la dernière lecture de chaque cible (« offre:<contrat> »,
--    « reponses:<contrat> », « contexte:<contrat> », « rapport:<jour> ») et la date
--    du dernier message vu ; un contrat n'est relu que s'il a bougé (ou après 6 h).
-- 2. accueils.bienvenue_apres : une bienvenue qui n'a pas pu partir (Upwork plein)
--    attend le lendemain 8 h (Paris) et part en premier.
-- 3. Réglages : 15 conversations par jour réservées aux bienvenues
--    (upwork_reserve_bienvenues), lectures par le compte secours
--    (upwork_compte_lectures), cache des jalons 6 h, rapport du soir à 21 h.
-- 4. upwork_budget_jour : la réserve = la plus grande des deux réserves.
-- 5. Tâche « upwork-rapport-soir » (19 h et 20 h UTC ; l'Edge n'envoie qu'à 21 h Paris, une fois).
-- Additif : une table, une colonne, des réglages, une fonction remplacée, une tâche.

create table if not exists public.upwork_lectures (
  cle          text primary key,
  lu_at        timestamptz not null default now(),
  activite_at  timestamptz
);
alter table public.upwork_lectures enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'upwork_lectures' and policyname = 'upwork_lectures_admin') then
    create policy upwork_lectures_admin on public.upwork_lectures for select to authenticated using (public.is_admin());
  end if;
end $$;
create index if not exists upwork_lectures_lu_at on public.upwork_lectures (lu_at);

alter table public.accueils add column if not exists bienvenue_apres timestamptz;

insert into public.reglages (cle, valeur) values
  ('upwork_reserve_bienvenues', to_jsonb(15)),
  ('upwork_compte_lectures', to_jsonb('secours'::text)),
  ('upwork_jalons_cache_h', to_jsonb(6)),
  ('upwork_rapport_soir', to_jsonb('on'::text))
on conflict (cle) do nothing;

create or replace function public.upwork_budget_jour(p_contrat text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $function$
declare
  v_debut timestamptz := ((now() at time zone 'UTC')::date)::timestamp at time zone 'UTC';
  v_max integer := coalesce((select (r.valeur #>> '{}')::int from public.reglages r where r.cle = 'upwork_conversations_jour_max'), 45);
  -- 10/11 : les relances s'arrêtent avant les 15 conversations gardées pour les bienvenues.
  v_reserve integer := greatest(
    coalesce((select (r.valeur #>> '{}')::int from public.reglages r where r.cle = 'upwork_reserve_prioritaire'), 5),
    coalesce((select (r.valeur #>> '{}')::int from public.reglages r where r.cle = 'upwork_reserve_bienvenues'), 0));
  v jsonb;
begin
  if not (public.is_admin() or coalesce(auth.jwt() ->> 'role', '') = 'service_role') then
    raise exception 'upwork_budget_jour : réservé à l''admin' using errcode = '42501';
  end if;
  with m as (
    select coalesce(a.compte, 'principal') as compte, a.contrat, a.erreur, a.at
      from public.upwork_appels a
     where a.action = 'message' and a.at >= v_debut
  ),
  c as (
    select x.compte, x.ordre,
           coalesce(u.statut = 'connecte' and u.access_secret_id is not null, false) as connecte,
           coalesce(u.statut, 'deconnecte') as statut,
           (select count(distinct m.contrat) from m where m.compte = x.compte and m.erreur is null)::int as conv,
           exists (select 1 from m where m.compte = x.compte and m.erreur ilike '%maximum number of rooms%') as limite,
           (p_contrat is not null and exists (select 1 from m where m.compte = x.compte and m.erreur is null and m.contrat = p_contrat)) as deja
      from (values ('principal', 1), ('secours', 2)) as x(compte, ordre)
      left join public.upwork_connexion u on u.compte = x.compte
  ),
  libre as (
    select coalesce(sum(greatest(0, v_max - c.conv)) filter (where c.connecte and not c.limite), 0)::int as n from c
  )
  select jsonb_build_object(
    'jour', (now() at time zone 'UTC')::date,
    'conversations', (select coalesce(sum(c.conv), 0)::int from c),
    'max', v_max,
    'reserve', v_reserve,
    'restant', greatest(0, (select n from libre) - v_reserve),
    'restant_prioritaire', (select n from libre),
    'limite_atteinte', not exists (select 1 from c where c.connecte and not c.limite),
    'limite_at', (select min(m.at) from m where m.erreur ilike '%maximum number of rooms%'),
    'deja', exists (select 1 from c where c.deja),
    'compte_du_jour', (select c.compte from c where c.deja order by c.ordre limit 1),
    'dernier_ms', (select floor(extract(epoch from now() - max(m.at)) * 1000)::bigint from m),
    'comptes', (select jsonb_agg(jsonb_build_object('compte', c.compte, 'connecte', c.connecte, 'statut', c.statut,
                                                    'conversations', c.conv, 'limite', c.limite, 'deja', c.deja) order by c.ordre)
                  from c)
  ) into v;
  return v;
end;
$function$;

do $c$
begin
  if not exists (select 1 from cron.job where jobname = 'upwork-rapport-soir') then
    perform cron.schedule('upwork-rapport-soir', '0 19,20 * * *', $cmd$
      select net.http_post(
        url := 'https://mbikecieskoobeizixig.supabase.co/functions/v1/upwork',
        headers := jsonb_build_object('content-type', 'application/json', 'x-cron-secret', public.cron_secret_lire()),
        body := '{"action":"rapport_soir"}'::jsonb,
        timeout_milliseconds := 60000)
    $cmd$);
  end if;
end
$c$;
