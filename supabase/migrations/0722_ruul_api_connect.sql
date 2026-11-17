-- 17/11 (Max) : API Ruul, phase 2 — l'invitation automatique.
-- POST /ruul-api/connect (5 par seconde au plus) pour chaque posteur Ruul actif pas encore READY : Ruul
-- trouve ou crée le contractor, le relie à notre société et rend un lien d'onboarding valable 72 h.
-- Le lien est gardé ici et régénéré quand il a plus de 48 h (jamais un lien périmé dans un email).
-- Interrupteur : ruul_api.connect_actif (false par défaut). Éteint : les emails gardent l'ancien guide.

create table if not exists public.ruul_liens (
  poster_id uuid primary key references public.profiles (id) on delete cascade,
  env text not null,
  talent_id bigint,
  url text not null,
  statut text,
  kyc text,
  banque boolean,
  cree_at timestamptz not null default now()
);
alter table public.ruul_liens enable row level security;
drop policy if exists ruul_liens_admin on public.ruul_liens;
create policy ruul_liens_admin on public.ruul_liens for select to authenticated using (public.is_admin());

-- Les posteurs à connecter maintenant : Ruul, actifs, email Ruul connu, pas READY, sans lien frais (< 48 h).
create or replace function public.ruul_connect_a_faire(p_limite integer default 100)
 returns table(poster_id uuid, email text, prenom text, nom text)
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select p.id, lower(btrim(p.ruul_email)),
         coalesce(nullif(btrim(h.prenom_legal), ''), nullif(btrim(p.prenom), ''), split_part(p.ruul_email, '@', 1)),
         coalesce(nullif(btrim(h.nom_legal), ''), nullif(btrim(p.nom), ''), '-')
    from public.profiles p
    left join public.hub_posteurs h on h.profile_id = p.id
    left join public.ruul_liens l on l.poster_id = p.id
   where p.canal_paie = 'ruul' and p.is_active
     and nullif(btrim(coalesce(p.ruul_email, '')), '') is not null
     and nullif(btrim(coalesce(p.ruul_ne_pas_inviter, '')), '') is null
     and p.relances_stop_at is null
     and coalesce(p.ruul_onboarding, '') <> 'READY'
     and (l.poster_id is null or l.cree_at < now() - interval '48 hours')
   order by l.cree_at nulls first, p.cohorte_lundi nulls last
   limit greatest(1, least(coalesce(p_limite, 100), 300));
$function$;
revoke all on function public.ruul_connect_a_faire(integer) from public, anon, authenticated;

-- Le lien rendu par Ruul (service seulement). En prod, l'état lu au passage met aussi la fiche à jour.
create or replace function public.ruul_lien_noter(p_poster uuid, p_env text, p_talent_id bigint, p_url text,
                                                  p_statut text, p_kyc text, p_banque boolean)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_onb text := public.ruul_onboarding_de(p_statut, p_kyc, p_banque);
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'ruul_lien_noter : réservé au service' using errcode = '42501';
  end if;
  insert into public.ruul_liens as l (poster_id, env, talent_id, url, statut, kyc, banque, cree_at)
  values (p_poster, p_env, p_talent_id, p_url, upper(p_statut), upper(p_kyc), p_banque, now())
  on conflict (poster_id) do update
     set env = excluded.env, talent_id = excluded.talent_id, url = excluded.url, statut = excluded.statut,
         kyc = excluded.kyc, banque = excluded.banque, cree_at = now();
  if p_env = 'prod' then
    update public.profiles p
       set ruul_talent_id = coalesce(p_talent_id, p.ruul_talent_id),
           ruul_statut_api = upper(p_statut), ruul_kyc = upper(p_kyc), ruul_banque = p_banque,
           ruul_onboarding = case when p.ruul_onboarding = 'PENDING_AGREEMENTS' and v_onb = 'READY' then p.ruul_onboarding else v_onb end,
           ruul_api_lu_at = now(),
           ruul_ajoute_at = coalesce(p.ruul_ajoute_at, now()),
           ruul_statut = case when p.ruul_statut in ('pret', 'paye_1x', 'invite') then p.ruul_statut else 'invite' end
     where p.id = p_poster;
  end if;
end;
$function$;
revoke all on function public.ruul_lien_noter(uuid, text, bigint, text, text, text, boolean) from public, anon, authenticated;

-- Le dashboard du posteur : son vrai statut Ruul (l'étape 6 n'est « prête » qu'à READY).
create or replace function public.ruul_mon_onboarding()
 returns jsonb
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select jsonb_build_object(
    'ruul', coalesce(pr.canal_paie = 'ruul', false),
    'cohorte_lundi', pr.cohorte_lundi,
    'prenom_legal', h.prenom_legal,
    'nom_legal', h.nom_legal,
    'ruul_email', nullif(btrim(coalesce(pr.ruul_email, '')), ''),
    'email_candidature', coalesce(nullif(btrim(h.email_perso), ''), nullif(btrim(pr.email_perso), '')),
    'handle', c.handle_tiktok,
    'tiktok', coalesce(w.existe, false)
              or exists (select 1 from public.etape_declarations d where d.poster_id = pr.id and d.etape = 'tiktok' and d.statut <> 'refuse')
              or c.warmup_started_at is not null,
    'warmup_lance', c.warmup_started_at is not null,
    'abonnements', coalesce(w.abonnements, 0),
    'pret_warmup', coalesce(public.compte_pret(c.id), false),
    'slack', nullif(btrim(coalesce(pr.slack_user_id, '')), '') is not null
             or nullif(btrim(coalesce(h.slack_user_id, '')), '') is not null
             or exists (select 1 from public.etape_declarations d where d.poster_id = pr.id and d.etape = 'slack' and d.statut <> 'refuse'),
    'ruul_statut', pr.ruul_statut,
    'ruul_invite', pr.ruul_ajoute_at is not null,
    'ruul_pret', pr.ruul_statut in ('pret', 'paye_1x'),
    'ruul_compte', pr.ruul_compte,
    -- 0722 : le statut lu par l'API Ruul (READY = payable) et si l'invitation automatique est allumée.
    'ruul_onboarding', pr.ruul_onboarding,
    'ruul_lien_auto', coalesce((select (valeur->>'connect_actif')::boolean from public.reglages where cle = 'ruul_api'), false))
    from public.profiles pr
    left join public.hub_posteurs h on h.profile_id = pr.id
    left join lateral (select x.* from public.comptes x where x.poster_id = pr.id and x.is_active and coalesce(x.type_compte, 'perso') = 'perso'
                        order by x.created_at limit 1) c on true
    left join lateral (select r.existe, r.abonnements from public.ckd_warmup_releves r
                        where r.compte_id = c.id and r.existe is not null order by r.releve_at desc limit 1) w on true
   where pr.id = auth.uid();
$function$;

-- L'admin peut allumer / éteindre l'invitation automatique depuis la page Ruul.
create or replace function public.ruul_api_regler(p_connect_actif boolean)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  if not public.is_admin_strict() then
    raise exception 'ruul_api_regler : réservé à l''admin' using errcode = '42501';
  end if;
  update public.reglages set valeur = coalesce(valeur, '{}'::jsonb) || jsonb_build_object('connect_actif', coalesce(p_connect_actif, false))
   where cle = 'ruul_api';
  return (select valeur from public.reglages where cle = 'ruul_api');
end;
$function$;
revoke all on function public.ruul_api_regler(boolean) from public, anon;
grant execute on function public.ruul_api_regler(boolean) to authenticated;

-- Toutes les heures (minute 14, après la lecture), les liens à créer ou régénérer.
select cron.unschedule('ruul-api-connect') where exists (select 1 from cron.job where jobname = 'ruul-api-connect');
select cron.schedule('ruul-api-connect', '14 * * * *', $cron$
  select net.http_post(url := 'https://mbikecieskoobeizixig.supabase.co/functions/v1/ruul-api',
    headers := jsonb_build_object('content-type', 'application/json', 'x-cron-secret', public.cron_secret_lire()),
    body := jsonb_build_object('action', 'connect'), timeout_milliseconds := 120000);
$cron$);
