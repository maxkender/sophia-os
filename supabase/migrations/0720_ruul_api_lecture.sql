-- 17/11 (Max) : API Ruul, phase 1 — LECTURE SEULE.
-- Toutes les heures, la fonction ruul-api lit GET /ruul-api/workmates (un seul appel : la liste n'est pas
-- paginée ; limite Ruul 200 lectures/heure) et met à jour chaque posteur Ruul. Plus d'import manuel.
--
-- Le statut d'onboarding est déduit comme Ruul le décrit (NOT_REGISTERED → PENDING_KYC →
-- PENDING_COLLECTION_ACCOUNT → READY). PENDING_AGREEMENTS n'existe que dans la réponse d'un paiement :
-- il est noté là (phase 3), jamais ici.
-- Les champs déjà lus par l'OS gardent leur sens : ruul_compte = 'active' quand le compte Ruul est
-- activé (status ACTIVE), sinon 'invited' ; ruul_identite = le KYC en minuscules (refus comptés).
-- La clé API reste dans les secrets des fonctions (RUUL_API_KEY / RUUL_SANDBOX_API_KEY) : jamais en base.

alter table public.profiles add column if not exists ruul_onboarding text;
alter table public.profiles add column if not exists ruul_kyc text;
alter table public.profiles add column if not exists ruul_banque boolean;
alter table public.profiles add column if not exists ruul_talent_id bigint;
alter table public.profiles add column if not exists ruul_statut_api text;
alter table public.profiles add column if not exists ruul_api_lu_at timestamptz;
comment on column public.profiles.ruul_onboarding is
  '0720 : statut Ruul lu par l''API (NOT_REGISTERED, PENDING_KYC, PENDING_COLLECTION_ACCOUNT, PENDING_AGREEMENTS, READY) ; null = pas trouvé chez Ruul.';

-- Le journal des appels (sans clé ni données bancaires).
create table if not exists public.ruul_api_appels (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  env text not null,
  action text not null,
  http integer,
  code text,
  erreur text,
  duree_ms integer,
  detail jsonb
);
create index if not exists ruul_api_appels_at on public.ruul_api_appels (at desc);
alter table public.ruul_api_appels enable row level security;
drop policy if exists ruul_api_appels_admin on public.ruul_api_appels;
create policy ruul_api_appels_admin on public.ruul_api_appels for select to authenticated using (public.is_admin());

-- La photo de la liste Ruul (une ligne par contractor et par environnement).
create table if not exists public.ruul_workmates (
  env text not null,
  talent_id bigint not null,
  company_id bigint,
  email text,
  nom text,
  pays text,
  statut text,
  kyc text,
  banque boolean,
  onboarding text,
  poster_id uuid,
  lu_at timestamptz not null default now(),
  primary key (env, talent_id)
);
create index if not exists ruul_workmates_email on public.ruul_workmates (lower(email));
alter table public.ruul_workmates enable row level security;
drop policy if exists ruul_workmates_admin on public.ruul_workmates;
create policy ruul_workmates_admin on public.ruul_workmates for select to authenticated using (public.is_admin());

-- Le réglage : environnement, société qui paie, devise de la facture, invitation automatique (phase 2).
insert into public.reglages (cle, valeur)
values ('ruul_api', jsonb_build_object('env', 'prod', 'company_id', null, 'devise_facture', 'EUR', 'connect_actif', false))
on conflict (cle) do nothing;

create or replace function public.ruul_onboarding_de(p_statut text, p_kyc text, p_banque boolean)
 returns text
 language sql
 immutable
as $function$
  select case
           when p_statut is null or upper(p_statut) = 'NOT_REGISTERED' then 'NOT_REGISTERED'
           when upper(coalesce(p_kyc, '')) <> 'APPROVED' then 'PENDING_KYC'
           when not coalesce(p_banque, false) then 'PENDING_COLLECTION_ACCOUNT'
           else 'READY'
         end;
$function$;

-- Appelée par la fonction ruul-api (service_role) avec la liste lue chez Ruul.
create or replace function public.ruul_api_appliquer(p_env text, p_company_id bigint, p_workmates jsonb)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_res jsonb;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'ruul_api_appliquer : réservé au service' using errcode = '42501';
  end if;

  create temp table _w on commit drop as
  select (x->'contractor'->>'id')::bigint as talent_id,
         nullif(x->>'companyId', '')::bigint as company_id,
         lower(btrim(x->'contractor'->>'email')) as email,
         x->'contractor'->>'name' as nom,
         x->'contractor'->>'country' as pays,
         upper(x->'contractor'->>'status') as statut,
         upper(x->'contractor'->>'kycStatus') as kyc,
         coalesce((x->'contractor'->>'collectionAccountAdded')::boolean, false) as banque
    from jsonb_array_elements(coalesce(p_workmates, '[]'::jsonb)) x
   where x->'contractor'->>'id' is not null
     and (p_company_id is null or nullif(x->>'companyId', '')::bigint = p_company_id);

  -- Un posteur Ruul par email (email Ruul d'abord, sinon l'email du compte).
  create temp table _m on commit drop as
  select distinct on (w.talent_id) w.*, public.ruul_onboarding_de(w.statut, w.kyc, w.banque) as onboarding, p.id as poster_id
    from _w w
    left join public.profiles p on p.canal_paie = 'ruul'
     and (lower(btrim(p.ruul_email)) = w.email or (nullif(btrim(coalesce(p.ruul_email, '')), '') is null and lower(btrim(p.email)) = w.email))
   order by w.talent_id, (lower(btrim(p.ruul_email)) = w.email) desc nulls last, p.is_active desc nulls last;

  insert into public.ruul_workmates as r (env, talent_id, company_id, email, nom, pays, statut, kyc, banque, onboarding, poster_id, lu_at)
  select p_env, talent_id, company_id, email, nom, pays, statut, kyc, banque, onboarding, poster_id, now() from _m
  on conflict (env, talent_id) do update
     set company_id = excluded.company_id, email = excluded.email, nom = excluded.nom, pays = excluded.pays, statut = excluded.statut,
         kyc = excluded.kyc, banque = excluded.banque, onboarding = excluded.onboarding, poster_id = excluded.poster_id, lu_at = now();

  select jsonb_build_object(
    'ruul', (select count(*) from _m),
    'relies', (select count(*) from _m where poster_id is not null),
    'non_relies', (select count(*) from _m where poster_id is null),
    'nouveaux_ready', (select count(*) from _m m join public.profiles p on p.id = m.poster_id
                        where m.onboarding = 'READY' and p.ruul_onboarding is distinct from 'READY'),
    'nouveaux_refus', (select count(*) from _m m join public.profiles p on p.id = m.poster_id
                        where m.kyc = 'DECLINED' and p.ruul_identite is distinct from 'declined'),
    'par_statut', (select coalesce(jsonb_object_agg(onboarding, n), '{}'::jsonb)
                     from (select onboarding, count(*) n from _m where poster_id is not null group by 1) s))
    into v_res;

  -- Seulement en prod : la sandbox ne touche jamais aux fiches.
  if p_env = 'prod' then
    update public.profiles p
       set ruul_talent_id = m.talent_id,
           ruul_statut_api = m.statut,
           ruul_kyc = m.kyc,
           ruul_banque = m.banque,
           -- Un PENDING_AGREEMENTS lu sur un paiement reste tant que l'API ne dit pas mieux que READY.
           ruul_onboarding = case when p.ruul_onboarding = 'PENDING_AGREEMENTS' and m.onboarding = 'READY' then p.ruul_onboarding else m.onboarding end,
           ruul_api_lu_at = now(),
           ruul_compte_at = case when p.ruul_compte is distinct from (case when m.statut = 'ACTIVE' then 'active' else 'invited' end) then now() else p.ruul_compte_at end,
           ruul_compte = case when m.statut = 'ACTIVE' then 'active' else 'invited' end,
           ruul_compte_vu_at = now(),
           ruul_ajoute_at = coalesce(p.ruul_ajoute_at, now()),
           ruul_statut = case when p.ruul_statut in ('pret', 'paye_1x', 'invite') then p.ruul_statut else 'invite' end,
           ruul_identite_refus = coalesce(p.ruul_identite_refus, 0)
             + case when m.kyc = 'DECLINED' and p.ruul_identite is distinct from 'declined' then 1 else 0 end,
           ruul_identite_at = case when m.kyc is not null and p.ruul_identite is distinct from lower(m.kyc) then now() else p.ruul_identite_at end,
           ruul_identite = coalesce(lower(m.kyc), p.ruul_identite)
      from _m m
     where p.id = m.poster_id;
  end if;
  return v_res;
end;
$function$;
revoke all on function public.ruul_api_appliquer(text, bigint, jsonb) from public, anon, authenticated;

-- Le tableau pour l'admin : posteurs Ruul par cohorte et par statut lu chez Ruul.
create or replace function public.ruul_onboarding_tableau()
 returns table(cohorte date, onboarding text, posteurs integer, actifs integer, ont_poste integer)
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select p.cohorte_lundi, coalesce(p.ruul_onboarding, 'PAS_TROUVE'),
         count(*)::int, count(*) filter (where p.is_active)::int,
         count(*) filter (where exists (select 1 from public.passages pa join public.comptes c on c.id = pa.compte_id
                                        where c.poster_id = p.id and pa.publie_url is not null))::int
    from public.profiles p
   where p.canal_paie = 'ruul' and public.is_admin()
   group by 1, 2
   order by 1 desc nulls last, 2;
$function$;
revoke all on function public.ruul_onboarding_tableau() from public, anon;
grant execute on function public.ruul_onboarding_tableau() to authenticated;

-- Toutes les heures (minute 12), la lecture.
select cron.unschedule('ruul-api-sync') where exists (select 1 from cron.job where jobname = 'ruul-api-sync');
select cron.schedule('ruul-api-sync', '12 * * * *', $cron$
  select net.http_post(url := 'https://mbikecieskoobeizixig.supabase.co/functions/v1/ruul-api',
    headers := jsonb_build_object('content-type', 'application/json', 'x-cron-secret', public.cron_secret_lire()),
    body := jsonb_build_object('action', 'sync'), timeout_milliseconds := 60000);
$cron$);
