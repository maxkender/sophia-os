-- 0775 : emails Ruul (Max, 19/11). Les relances KYC partaient à l'adresse de connexion (@sophia.com), qui n'est pas une
-- vraie boîte : 106 refus le 18/11 (550 5.4.1 Access denied), puis 41 « blocked » le 19/11 (Brevo bloque une adresse
-- après un hard bounce). Additif.
-- 1. ruul_adresse_morte / ruul_adresse_joignable : la vraie adresse d'un posteur (Hub, email perso, email Ruul), jamais
--    @sophia.com, jamais une adresse dont le dernier envoi est revenu (hard bounce, bloquée, plainte).
-- 2. ruul_kyc_relances_dues et ruul_slack_a_inviter : l'email est la vraie adresse joignable (null s'il n'y en a pas).
-- 3. ruul_injoignables : les posteurs Ruul actifs sans adresse joignable, avec leur HM (onglet Ruul).
-- 4. ruul_kyc_echecs : les posteurs pas encore prêts dont la relance KYC n'est pas arrivée (rattrapage par bandeau).
-- 5. mes_bandeaux_compte : le bandeau de relance Ruul (clé relance_ruul:…), le plus récent, tant que Ruul n'est pas prêt.

-- 1.
create or replace function public.ruul_adresse_morte(p_adresse text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select coalesce(e.dernier_evenement, e.statut) ~* '^(hardbounces|blocked|invalid|spam|complaint)'
      from public.emails_envois e
     where lower(e.destinataire) = lower(btrim(p_adresse))
       and coalesce(e.dernier_evenement, e.statut) ~* '^(delivered|delivre|opened|clicks|loadedbyproxy|hardbounces|blocked|invalid|spam|complaint)'
     order by e.cree_at desc
     limit 1), false);
$$;

create or replace function public.ruul_adresse_joignable(p_poster uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select x.a
    from (
      select lower(btrim(t.a)) as a, t.ord
        from public.profiles pr
        left join public.hub_posteurs h on h.profile_id = pr.id
        cross join lateral unnest(array[h.email_perso, pr.email_perso, pr.ruul_email, pr.email]) with ordinality as t(a, ord)
       where pr.id = p_poster
    ) x
   where x.a ~ '^[^\s@]+@[^\s@]+\.[^\s@]+$'
     and x.a !~ '@sophia\.com$'
     and not public.ruul_adresse_morte(x.a)
   order by x.ord
   limit 1;
$$;

-- Jamais lisibles par un posteur : seulement la fonction ruul (service) et les autres fonctions de 0775.
revoke all on function public.ruul_adresse_morte(text) from public, anon, authenticated;
revoke all on function public.ruul_adresse_joignable(uuid) from public, anon, authenticated;
grant execute on function public.ruul_adresse_morte(text) to service_role;
grant execute on function public.ruul_adresse_joignable(uuid) to service_role;

-- 2.
create or replace function public.ruul_kyc_relances_dues(p_jour date DEFAULT NULL::date, p_forcer boolean DEFAULT false)
returns table(poster_id uuid, prenom text, email text, ruul_email text, langue text, slack_user_id text, manque text, etape text)
language sql
stable
security definer
set search_path = public
as $function$
  -- 0775 : email = la vraie adresse joignable (jamais le login @sophia.com).
  with j as (select coalesce(p_jour, (now() at time zone 'Europe/Paris')::date) as jour)
  select pr.id, pr.prenom, public.ruul_adresse_joignable(pr.id),
         coalesce(nullif(btrim(pr.ruul_email), ''), public.ruul_adresse_joignable(pr.id), pr.email),
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
$function$;

do $p$
declare
  d text := pg_get_functiondef('public.ruul_slack_a_inviter()'::regprocedure);
  avant text := 'select distinct pr.id, pr.prenom, pr.email,';
begin
  if position('0775' in d) > 0 then return; end if;
  if position(avant in d) = 0 then raise exception '0775 : ruul_slack_a_inviter ne correspond pas'; end if;
  execute replace(d, avant, 'select distinct pr.id, pr.prenom, public.ruul_adresse_joignable(pr.id) /* 0775 */,');
end
$p$;

-- 3.
create or replace function public.ruul_injoignables()
returns table (poster_id uuid, nom text, handle text, pays text, hm_nom text, onboarding text, adresses jsonb,
               bandeau_at timestamptz, bandeau_vu_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  with p as (
    select pr.*, h.email_perso as hub_email
      from public.profiles pr
      left join public.hub_posteurs h on h.profile_id = pr.id
     where pr.canal_paie = 'ruul'
       and exists (select 1 from public.comptes c where c.poster_id = pr.id and c.is_active)
       and public.ruul_adresse_joignable(pr.id) is null
  )
  select p.id,
         coalesce(nullif(btrim(concat_ws(' ', p.prenom, p.nom)), ''), p.email),
         (select c.handle_tiktok from public.comptes c where c.poster_id = p.id and c.is_active order by c.created_at limit 1),
         (select c.pays from public.comptes c where c.poster_id = p.id and c.is_active order by c.created_at limit 1),
         (select coalesce(nullif(btrim(concat_ws(' ', h.prenom, h.nom)), ''), h.email) from public.profiles h where h.id = p.manager_id),
         p.ruul_onboarding,
         (select coalesce(jsonb_agg(jsonb_build_object(
                    'adresse', a.a,
                    'statut', (select coalesce(e.dernier_evenement, e.statut) from public.emails_envois e
                                where lower(e.destinataire) = a.a order by e.cree_at desc limit 1),
                    'raison', (select left(e.erreur, 140) from public.emails_envois e
                                where lower(e.destinataire) = a.a and e.erreur is not null order by e.cree_at desc limit 1),
                    'at', (select max(e.cree_at) from public.emails_envois e where lower(e.destinataire) = a.a))), '[]'::jsonb)
            from (select distinct lower(btrim(x)) as a
                    from unnest(array[p.hub_email, p.email_perso, p.ruul_email, p.email]) x
                   where nullif(btrim(x), '') is not null and lower(x) !~ '@sophia\.com\s*$') a),
         (select max(t.maj_at) from public.posteur_textes t where t.poster_id = p.id and t.cle like 'relance_ruul:%'),
         (select max(t.vu_at) from public.posteur_textes t where t.poster_id = p.id and t.cle like 'relance_ruul:%')
    from p
   where public.is_admin()
   order by 5 nulls last, 2;
$$;

revoke all on function public.ruul_injoignables() from public, anon;
grant execute on function public.ruul_injoignables() to authenticated, service_role;

-- 4.
create or replace function public.ruul_kyc_echecs(p_depuis timestamptz)
returns table(poster_id uuid, prenom text, ruul_email text, langue text, manque text)
language sql
stable
security definer
set search_path = public
as $$
  select pr.id, pr.prenom,
         coalesce(nullif(btrim(pr.ruul_email), ''), public.ruul_adresse_joignable(pr.id), pr.email),
         public.parrainage_langue_pays((select c.pays from public.comptes c where c.poster_id = pr.id and c.is_active order by c.created_at limit 1)),
         case
           when w.kyc = 'DECLINED' then 'identite_refusee'
           when pr.ruul_onboarding is null or pr.ruul_onboarding = 'NOT_REGISTERED' then 'inscription'
           when pr.ruul_onboarding = 'PENDING_COLLECTION_ACCOUNT' then 'banque'
           else 'identite'
         end
    from public.profiles pr
    left join public.ruul_workmates w on w.poster_id = pr.id and w.env = 'prod'
   where pr.canal_paie = 'ruul'
     and coalesce(pr.ruul_onboarding, '') <> 'READY'
     and pr.relances_stop_at is null
     and exists (select 1 from public.comptes c where c.poster_id = pr.id and c.is_active)
     and exists (
       select 1 from public.emails_envois e
        where e.cree_at >= p_depuis and 'kyc_relance' = any(e.tags)
          and coalesce(e.dernier_evenement, e.statut) ~* '^(hardbounces|blocked|invalid|spam|complaint|refuse|error)'
          and lower(e.destinataire) in (lower(pr.email), lower(pr.email_perso), lower(pr.ruul_email)))
   order by pr.id;
$$;

revoke all on function public.ruul_kyc_echecs(timestamptz) from public, anon, authenticated;
grant execute on function public.ruul_kyc_echecs(timestamptz) to service_role;

-- 5.
create or replace function public.mes_bandeaux_compte()
returns table (cle text, texte text, maj_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select t.cle, t.texte, t.maj_at from public.posteur_textes t
   where t.poster_id = auth.uid() and t.vu_at is null
     and (t.cle like 'compte_arrete:%' or t.cle like 'compte_double:%' or t.cle like 'nudge_jeudi:%'
          -- 0775 : la relance Ruul, la plus récente seulement, tant que Ruul n'est pas prêt.
          or (t.cle like 'relance_ruul:%'
              and not exists (select 1 from public.profiles pr where pr.id = t.poster_id and pr.ruul_onboarding = 'READY')
              and not exists (select 1 from public.posteur_textes t2
                               where t2.poster_id = t.poster_id and t2.cle like 'relance_ruul:%' and t2.maj_at > t.maj_at)))
   order by t.maj_at desc;
$$;
