-- 0778 : paie Upwork bloquée par le nom de la semaine des milestones (Max, 19/11). Additif.
-- 1. paie_rattrapages : les lignes de paie bloquées « à vérifier », avec ce que l'OS propose pour chacune
--    (approuver la milestone financée telle quelle, marquer payée quand elle l'a déjà été à la main sur Upwork,
--    à financer à la main, ou garder la milestone pour la semaine suivante quand il n'a pas posté). Rien ne part
--    sans le clic de Max sur la page Pay (fonction upwork, action rattrapage_executer). Après le paiement :
--    un message court au posteur, dans sa langue (« Ta semaine du 9/11 (X $) est payée, désolé pour le retard »).
-- 2. paie_rattrapages_lire : la liste pour la page Pay (admin).
-- 3. Cron decalages-appliquer : quand une cohorte est décalée (paie_decalages, statut « prevu »), ses milestones à
--    venir sont renommées automatiquement (lundi 08:45 et mardi 00:50, Paris), juste après decalages_noter().
--    Une milestone financée (Upwork refuse de la renommer) compte pour sa nouvelle semaine (paie_jalons_semaine).

-- 1.
create table if not exists public.paie_rattrapages (
  id uuid primary key default gen_random_uuid(),
  semaine date not null,
  poster_id uuid not null references public.profiles(id),
  paie_semaine_id uuid not null,
  paiement_api_id uuid,
  contrat_id text,
  action text not null check (action in ('approuver', 'marquer_payee', 'financer_main', 'garder', 'rien', 'a_voir')),
  jalon_id text,
  jalon_nom text,
  jalon_etat text,
  jalon_montant numeric,
  semaine_jalon date check (semaine_jalon is null or extract(isodow from semaine_jalon) = 1),
  du numeric not null default 0,
  faits integer not null default 0,
  prevus integer not null default 0,
  proposition text not null,
  statut text not null default 'propose' check (statut in ('propose', 'fait', 'erreur', 'ignore')),
  resultat text,
  montant_paye numeric,
  message_statut text,
  message_at timestamptz,
  decide_par uuid,
  decide_at timestamptz,
  cree_at timestamptz not null default now(),
  maj_at timestamptz not null default now(),
  unique (paie_semaine_id)
);
alter table public.paie_rattrapages enable row level security;

-- 2.
create or replace function public.paie_rattrapages_lire(p_semaine date default null)
returns table (id uuid, semaine date, poster_id uuid, poster_nom text, contrat_id text, action text, jalon_nom text, jalon_etat text,
               jalon_montant numeric, du numeric, faits integer, prevus integer, proposition text, statut text, resultat text,
               montant_paye numeric, message_statut text, decide_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select r.id, r.semaine, r.poster_id,
         coalesce(nullif(btrim(concat_ws(' ', pr.prenom, pr.nom)), ''), pr.email),
         r.contrat_id, r.action, r.jalon_nom, r.jalon_etat, r.jalon_montant, r.du, r.faits, r.prevus, r.proposition,
         r.statut, r.resultat, r.montant_paye, r.message_statut, r.decide_at
    from public.paie_rattrapages r
    join public.profiles pr on pr.id = r.poster_id
   where public.is_admin()
     -- Sans semaine : ce qui attend Max, et ce qui a été fait ces 7 derniers jours.
     and (r.semaine = p_semaine
          or (p_semaine is null and (r.statut in ('propose', 'erreur') or r.decide_at > now() - interval '7 days')))
   order by case r.action when 'approuver' then 0 when 'financer_main' then 1 when 'a_voir' then 2 when 'marquer_payee' then 3 else 4 end,
            2, 4;
$$;
revoke all on function public.paie_rattrapages_lire(date) from public, anon;
grant execute on function public.paie_rattrapages_lire(date) to authenticated, service_role;

-- 3. Paris = UTC+1 en novembre : lundi 08:45 = 07:45 UTC ; mardi 00:50 = lundi 23:50 UTC.
do $cron$
begin
  if exists (select 1 from cron.job where jobname = 'decalages-appliquer') then
    perform cron.unschedule('decalages-appliquer');
  end if;
  perform cron.schedule('decalages-appliquer', '45 7 * * 1', $c$
    select net.http_post(
      url := 'https://mbikecieskoobeizixig.supabase.co/functions/v1/upwork',
      headers := jsonb_build_object('content-type', 'application/json', 'x-cron-secret', public.cron_secret_lire()),
      body := jsonb_build_object('action', 'decalages_appliquer'),
      timeout_milliseconds := 280000);
  $c$);
  if exists (select 1 from cron.job where jobname = 'decalages-appliquer-nuit') then
    perform cron.unschedule('decalages-appliquer-nuit');
  end if;
  perform cron.schedule('decalages-appliquer-nuit', '50 23 * * 1', $c$
    select net.http_post(
      url := 'https://mbikecieskoobeizixig.supabase.co/functions/v1/upwork',
      headers := jsonb_build_object('content-type', 'application/json', 'x-cron-secret', public.cron_secret_lire()),
      body := jsonb_build_object('action', 'decalages_appliquer'),
      timeout_milliseconds := 280000);
  $c$);
end
$cron$;

notify pgrst, 'reload schema';
