-- 0747 : relances « finir son installation Ruul » (KYC, banque, inscription) (Max, 18/11).
-- ruul_email_relances n'a rien envoyé depuis 7 jours : elle ne relançait que l'email Ruul manquant, et ce circuit est
-- éteint depuis le parcours Ruul. Or ~100 posteurs Ruul actifs ne sont pas READY (pas inscrits, identité pas faite,
-- banque manquante, identité refusée) et ne peuvent pas être payés lundi.
-- 1. ruul_email_relances accepte une étape par jour « kyc_AAAA-MM-JJ » (une relance au plus par jour et par posteur).
-- 2. ruul_kyc_relances_dues(jour, forcer) : les posteurs Ruul actifs pas READY, pas en STOP, pas déjà relancés ce jour,
--    avec ce qui manque exactement et leur langue (pays du compte). Hors forçage : le jeudi et le samedi seulement.
-- 3. Cron jeudi et samedi 10 h 12 (Paris) : fonction ruul, action « kyc_relances ».
-- La règle de paie ne change pas : un posteur pas READY n'entre dans aucun lot.
-- Additif : une contrainte élargie (les anciennes étapes restent valides), une fonction, un cron.

do $c$
declare
  v text;
begin
  select conname into v from pg_constraint
   where conrelid = 'public.ruul_email_relances'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%etape%';
  if v is not null and v <> 'ruul_email_relances_etape_0747' then
    execute format('alter table public.ruul_email_relances drop constraint %I', v);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'ruul_email_relances_etape_0747') then
    alter table public.ruul_email_relances add constraint ruul_email_relances_etape_0747
      check (etape in ('j1', 'j3', 'vendredi') or etape ~ '^kyc_[0-9]{4}-[0-9]{2}-[0-9]{2}$');
  end if;
end
$c$;

create or replace function public.ruul_kyc_relances_dues(p_jour date default null, p_forcer boolean default false)
returns table (poster_id uuid, prenom text, email text, ruul_email text, langue text, slack_user_id text, manque text, etape text)
language sql
stable
security definer
set search_path to 'public'
as $$
  with j as (select coalesce(p_jour, (now() at time zone 'Europe/Paris')::date) as jour)
  select pr.id, pr.prenom, pr.email, coalesce(nullif(btrim(pr.ruul_email), ''), pr.email),
         public.parrainage_langue_pays((select c.pays from public.comptes c where c.poster_id = pr.id and c.is_active order by c.created_at limit 1)),
         pr.slack_user_id,
         case
           when w.kyc = 'DECLINED' then 'identite_refusee'
           when pr.ruul_onboarding is null or pr.ruul_onboarding = 'NOT_REGISTERED' then 'inscription'
           when pr.ruul_onboarding = 'PENDING_COLLECTION_ACCOUNT' then 'banque'
           else 'identite'
         end,
         'kyc_' || to_char(j.jour, 'YYYY-MM-DD')
    from public.profiles pr
    cross join j
    left join public.ruul_workmates w on w.poster_id = pr.id and w.env = 'prod'
   where pr.canal_paie = 'ruul'
     and coalesce(pr.ruul_onboarding, '') <> 'READY'
     and pr.relances_stop_at is null
     and exists (select 1 from public.comptes c where c.poster_id = pr.id and c.is_active)
     and not exists (select 1 from public.ruul_email_relances r where r.poster_id = pr.id and r.etape = 'kyc_' || to_char(j.jour, 'YYYY-MM-DD'))
     and (p_forcer or extract(isodow from j.jour) in (4, 6))
   order by pr.id;
$$;

revoke all on function public.ruul_kyc_relances_dues(date, boolean) from public, anon, authenticated;
grant execute on function public.ruul_kyc_relances_dues(date, boolean) to service_role;

do $c$
begin
  if not exists (select 1 from cron.job where jobname = 'ruul-kyc-relances') then
    -- 9 h 12 UTC = 10 h 12 à Paris (heure d'hiver) ; la fonction ne relance que le jeudi et le samedi.
    perform cron.schedule('ruul-kyc-relances', '12 9 * * 4,6', $j$
      select net.http_post(url := 'https://mbikecieskoobeizixig.supabase.co/functions/v1/ruul',
        headers := jsonb_build_object('content-type', 'application/json', 'x-cron-secret', public.cron_secret_lire()),
        body := '{"action":"kyc_relances"}'::jsonb, timeout_milliseconds := 150000)
    $j$);
  end if;
end
$c$;
