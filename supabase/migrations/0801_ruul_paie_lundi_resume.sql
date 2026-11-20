-- 0801 : paie du lundi et page Pay séparée par plateforme (Max, 21/11). Additif.
-- 1. ruul_lot_preparer : une semaine reportée (posteur pas prêt le dimanche) entre seule dans le lot qui suit le moment où
--    il devient prêt, sans validation ligne à ligne (« rattrapage » n'est plus un motif « à vérifier ») ; jamais pour un
--    posteur passé sur Upwork (sa plateforme n'est plus RUUL).
-- 2. paie_resume_plateformes(semaine) : « Ruul : X prêts / Y pas prêts » et « Upwork : X à payer / Y bloqués ».
-- 3. ruul_bloques_7j() : les posteurs Ruul toujours pas prêts 7 jours après avoir écrit au support pour un problème Ruul,
--    sans exception Upwork en cours : on leur propose Upwork (une fois).

-- 1.
do $$
declare
  d text := pg_get_functiondef('public.ruul_lot_preparer(date)'::regprocedure);
  a1 text := 'case when rp.rattrapage then ''rattrapage (semaine du '' || to_char(rp.semaine, ''DD/MM'') || '')'' end,';
begin
  if position('0801' in d) > 0 then return; end if;
  if position(a1 in d) = 0 then raise exception '0801 : ruul_lot_preparer a changé (rattrapage)'; end if;
  d := replace(d, a1, '/* 0801 : un rattrapage part seul, sans validation */');
  -- Jamais un posteur passé sur Upwork (sa plateforme n'est plus RUUL), ni pour la semaine ni pour un rattrapage.
  d := replace(d, 'pr.ruul_onboarding = ''READY''', 'pr.ruul_onboarding = ''READY'' and pr.canal_paie = ''ruul''');
  execute d;
end $$;

-- 2.
create or replace function public.paie_resume_plateformes(p_semaine date default null)
returns jsonb language sql stable security definer set search_path = public as $$
  with s as (select coalesce(p_semaine, (date_trunc('week', (now() at time zone 'Europe/Paris')) - interval '7 days')::date) as semaine),
  ruul as (
    select count(*) filter (where (public.ruul_etapes(pr.id)->>'pret')::boolean) as prets,
           count(*) filter (where not (public.ruul_etapes(pr.id)->>'pret')::boolean) as pas_prets
      from public.profiles pr join public.user_roles ur on ur.user_id = pr.id and ur.role = 'poster'
     where pr.is_active and pr.canal_paie = 'ruul'),
  upw as (
    select count(*) filter (where ps.paye_at is null and coalesce(ps.action, 'payer') in ('payer', 'payer_moins', 'kill')
                              and coalesce(ps.statut, 'ok') = 'ok' and coalesce(ps.montant_corrige, ps.montant) > 0) as a_payer,
           count(*) filter (where ps.paye_at is null and (coalesce(ps.statut, 'ok') <> 'ok' or ps.action in ('a_verifier', 'legacy')
                              or coalesce(pr.upwork_contract_id, '') = '') and coalesce(ps.montant_corrige, ps.montant) > 0) as bloques,
           count(*) filter (where ps.paye_at is not null) as payes
      from public.paie_semaines ps join public.profiles pr on pr.id = ps.poster_id, s
     where ps.semaine = s.semaine and coalesce(pr.canal_paie, 'upwork') = 'upwork' and not coalesce(ps.exclu, false))
  select jsonb_build_object('semaine', s.semaine,
    'ruul', jsonb_build_object('prets', ruul.prets, 'pas_prets', ruul.pas_prets),
    'upwork', jsonb_build_object('a_payer', upw.a_payer, 'bloques', upw.bloques, 'payes', upw.payes))
    from s, ruul, upw
   where public.is_admin() or coalesce(auth.role(), '') = 'service_role';
$$;
revoke execute on function public.paie_resume_plateformes(date) from public, anon;
grant execute on function public.paie_resume_plateformes(date) to authenticated, service_role;

-- 3.
create or replace function public.ruul_bloques_7j()
returns table (poster_id uuid, prenom text, depuis timestamptz)
language sql stable security definer set search_path = public as $$
  select pr.id, pr.prenom, min(t.premier_at)
    from public.profiles pr
    join public.support_ruul_tentatives t on t.poster_id = pr.id and t.cle <> 'upwork_demande'
   where pr.is_active and pr.canal_paie = 'ruul'
     and coalesce(pr.ruul_onboarding, '') <> 'READY'
     and pr.relances_stop_at is null
     and not public.ne_plus_contacter_bloque(pr.id)
     and not exists (select 1 from public.upwork_a_ajouter u where u.poster_id = pr.id)
     and not exists (select 1 from public.ruul_email_relances r where r.poster_id = pr.id and r.etape = 'upwork_7j')
   group by pr.id, pr.prenom
  having min(t.premier_at) <= now() - interval '7 days';
$$;
revoke execute on function public.ruul_bloques_7j() from public, anon, authenticated;
grant execute on function public.ruul_bloques_7j() to service_role;

-- La proposition Upwork après 7 jours bloqué : chaque jour à 11:41 (Paris, 10:41 UTC).
do $$
begin
  perform cron.unschedule(j.jobid) from cron.job j where j.jobname = 'ruul-upwork-7j';
  perform cron.schedule('ruul-upwork-7j', '41 10 * * *',
    $c$select net.http_post(url := 'https://mbikecieskoobeizixig.supabase.co/functions/v1/ruul',
        headers := jsonb_build_object('content-type', 'application/json', 'x-cron-secret', public.cron_secret_lire()),
        body := '{"action":"upwork_7j"}'::jsonb, timeout_milliseconds := 120000)$c$);
end $$;
