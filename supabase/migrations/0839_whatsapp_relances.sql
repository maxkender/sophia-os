-- 0839 : WhatsApp — relances automatiques, bannière de consentement, statistiques (22/11, Max). Additif.
--  1. whatsapp_banniere (false) : la bannière « numéro + accord » du dashboard posteur et la phrase WhatsApp au pied
--     des emails. Éteint : rien ne change pour les posteurs tant que Max ne l'allume pas.
--  2. whatsapp_relances ({live:false}) : en mode test, les relances ne partent qu'aux numéros autorisés ; une fois
--     WhatsApp en live, elles ne partent aux posteurs que si live = true (deuxième verrou, éteint).
--  3. whatsapp_relances_faits() : pour chaque numéro connu, les faits utiles aux relances (lecture seule ; réservé au
--     service : la fonction whatsapp).
--  4. whatsapp_stats() : la carte WhatsApp des pages Ruul et Recruits (admin).
--  5. Le cron horaire whatsapp-relances → /functions/v1/whatsapp {"action":"relances"}.

insert into public.reglages (cle, valeur) values ('whatsapp_banniere', 'false'::jsonb) on conflict (cle) do nothing;
insert into public.reglages (cle, valeur) values ('whatsapp_relances', jsonb_build_object('live', false)) on conflict (cle) do nothing;

create or replace function public.whatsapp_relances_faits()
returns table(
  contact_id uuid, poster_id uuid, site_id uuid, e164 text, optin_at timestamptz, optout_at timestamptz,
  prenom text, pays text,
  accepte_at timestamptz, signe_at timestamptz, desinscrit_at timestamptz, expire_at timestamptz, statut_site text,
  is_active boolean, premiere_connexion_at timestamptz, cohorte_lundi date, canal_paie text,
  ruul_onboarding text, ruul_ready_at timestamptz, warmup_started_at timestamptz, premier_post_at timestamptz,
  prevus_a_date int, publies_semaine int,
  arrete boolean, absent boolean, panne boolean, envois_jour int, envois_semaine int, deja text[]
)
language sql stable security definer set search_path = public as $$
  with p as (
    select (now() at time zone 'Europe/Paris')::date as auj
  ),
  b as (
    select ct.id as contact_id, ct.whatsapp_e164 as e164, ct.whatsapp_optin_at as optin_at, ct.whatsapp_optout_at as optout_at,
           ct.site_id, ct.poster_id as ct_poster,
           cand.c_nom, cand.c_pays, cand.accepte_at, cand.signe_at, cand.desinscrit_at, cand.expire_at, cand.statut_site,
           cand.start_monday, coalesce(ct.poster_id, cand.os_profile_id) as pid
      from public.posteur_contacts ct
      left join lateral (
        select c.nom as c_nom, c.pays as c_pays, c.accepte_at, c.signe_at, c.desinscrit_at, c.expire_at, c.statut_site,
               c.start_monday, c.os_profile_id
          from public.ruul_candidatures c
         where c.site_id = ct.site_id or (ct.poster_id is not null and c.os_profile_id = ct.poster_id)
         order by (c.site_id = ct.site_id) desc, c.cree_at desc
         limit 1
      ) cand on true
     where ct.whatsapp_e164 is not null
  )
  select b.contact_id, b.pid, b.site_id, b.e164, b.optin_at, b.optout_at,
         coalesce(nullif(btrim(pr.prenom), ''), nullif(split_part(btrim(coalesce(b.c_nom, '')), ' ', 1), '')),
         coalesce(public.paie_pays_posteur(b.pid), upper(b.c_pays), upper(pr.nationalite)),
         b.accepte_at, b.signe_at, b.desinscrit_at, b.expire_at, b.statut_site,
         pr.is_active, coalesce(pr.premiere_connexion_at, u.last_sign_in_at), coalesce(pr.cohorte_lundi, b.start_monday),
         pr.canal_paie, pr.ruul_onboarding, pr.ruul_ready_at,
         (select min(co.warmup_started_at) from public.comptes co where co.poster_id = b.pid),
         (select min(coalesce(ps.publie_at, ps.date_publication_prevue::timestamptz))
            from public.passages ps join public.comptes co on co.id = ps.compte_id
           where co.poster_id = b.pid and ps.publie_url is not null),
         coalesce(s.prevus, 0), coalesce(s.publies, 0),
         (pr.is_active is false or pr.relances_stop_at is not null
           or exists (select 1 from public.arrets a where a.poster_id = b.pid and a.annule_at is null)
           or exists (select 1 from public.ne_plus_contacter n where n.poster_id = b.pid and n.leve_at is null)),
         exists (select 1 from public.absences_declarees a, p
                  where a.poster_id = b.pid and p.auj >= a.debut
                    and p.auj <= least(coalesce(a.fin, a.debut + greatest(coalesce(a.jours, 1), 1) - 1),
                                       coalesce(a.retour_le - 1, 'infinity'::date))),
         exists (select 1 from public.jours_credites jc, p where jc.poster_id = b.pid and jc.jour = p.auj),
         (select count(*)::int from public.whatsapp_envois e, p
           where (e.e164 = b.e164 or (b.pid is not null and e.poster_id = b.pid))
             and e.statut in ('a_envoyer', 'envoye', 'livre', 'lu')
             and e.cree_at >= (p.auj::timestamp at time zone 'Europe/Paris')),
         (select count(*)::int from public.whatsapp_envois e
           where (e.e164 = b.e164 or (b.pid is not null and e.poster_id = b.pid))
             and e.statut in ('a_envoyer', 'envoye', 'livre', 'lu')
             and e.cree_at >= now() - interval '7 days'),
         coalesce((select array_agg(distinct e.motif) from public.whatsapp_envois e
                    where (e.e164 = b.e164 or (b.pid is not null and e.poster_id = b.pid))
                      and e.motif like 'relance:%' and e.statut in ('a_envoyer', 'envoye', 'livre', 'lu')), '{}')
    from b
    cross join p
    left join public.profiles pr on pr.id = b.pid
    left join auth.users u on u.id = b.pid
    left join lateral (
      select count(*)::int as prevus,
             count(*) filter (where x.publie_url is not null or x.publie_at is not null or x.statut::text = 'publie')::int as publies
        from public.passages x join public.comptes co on co.id = x.compte_id
       where co.poster_id = b.pid and co.is_active
         and not coalesce(x.est_rappel, false) and x.statut::text <> 'brouillon'
         and x.date_publication_prevue between p.auj - (extract(isodow from p.auj)::int - 1) and p.auj
    ) s on b.pid is not null;
$$;
revoke execute on function public.whatsapp_relances_faits() from public, anon, authenticated;
grant execute on function public.whatsapp_relances_faits() to service_role;

-- La carte WhatsApp (admin) : couverture (numéro + accord), envois de la semaine, réponses en 48 h, coût estimé.
create or replace function public.whatsapp_stats()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_lundi date := (now() at time zone 'Europe/Paris')::date - (extract(isodow from (now() at time zone 'Europe/Paris'))::int - 1);
  v_depuis timestamptz := v_lundi::timestamp at time zone 'Europe/Paris';
  v jsonb;
begin
  if not public.is_admin() then raise exception 'réservé à l''admin' using errcode = '42501'; end if;
  with po as (
    select pr.id from public.profiles pr
     where pr.is_active and exists (select 1 from public.user_roles r where r.user_id = pr.id and r.role = 'poster')
  ),
  sem as (
    select e.* from public.whatsapp_envois e where e.cree_at >= v_depuis
  )
  select jsonb_build_object(
    'mode', (select valeur->>'mode' from public.reglages where cle = 'whatsapp_mode'),
    'depuis', v_lundi,
    'posteurs', (select count(*) from po),
    'avec_accord', (select count(*) from po join public.posteur_contacts c on c.poster_id = po.id
                     where c.whatsapp_e164 is not null and c.whatsapp_optin_at is not null and c.whatsapp_optout_at is null),
    'envoyes', (select count(*) from sem where statut in ('envoye', 'livre', 'lu')),
    'livres', (select count(*) from sem where statut in ('livre', 'lu') or livre_at is not null),
    'lus', (select count(*) from sem where statut = 'lu' or lu_at is not null),
    'echecs', (select count(*) from sem where statut = 'echec'),
    'bloques', (select count(*) from sem where statut = 'bloque'),
    'avec_reponse', (select count(*) from sem
                      where statut in ('envoye', 'livre', 'lu') and envoye_at is not null
                        and exists (select 1 from public.whatsapp_recus r
                                     where r.de = sem.e164 and r.recu_at > sem.envoye_at and r.recu_at <= sem.envoye_at + interval '48 hours')),
    'cout_estime', coalesce((select sum(cout_estime) from sem where statut in ('a_envoyer', 'envoye', 'livre', 'lu')), 0)
  ) into v;
  return v;
end;
$$;
revoke execute on function public.whatsapp_stats() from public, anon;
grant execute on function public.whatsapp_stats() to authenticated;

-- Le cron horaire des relances (la fonction décide : heure du posteur, garde-fous, mode test).
do $c$
begin
  if not exists (select 1 from cron.job where jobname = 'whatsapp-relances') then
    perform cron.schedule('whatsapp-relances', '17 * * * *', $cmd$
      select net.http_post(url := 'https://mbikecieskoobeizixig.supabase.co/functions/v1/whatsapp',
        headers := jsonb_build_object('content-type', 'application/json', 'x-cron-secret', public.cron_secret_lire()),
        body := '{"action":"relances"}'::jsonb, timeout_milliseconds := 120000)
    $cmd$);
  end if;
end
$c$;
