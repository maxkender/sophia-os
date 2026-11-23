-- 23/11 (Max) : rappel aux posteurs Ruul « reportés » (pas encore READY chez Ruul).
-- Ajouts seulement : une fonction de lecture pour Paie > Ruul et la relance du jeudi (cron).

-- Les rappels envoyés pour une semaine de lot : posteur, statut Ruul, canal, date (email suivi dans emails_envois).
create or replace function public.ruul_rappels_reportes(p_semaine date default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_semaine date := coalesce(p_semaine, (date_trunc('week', (now() at time zone 'Europe/Paris')::date) - interval '7 days')::date);
begin
  if coalesce(auth.role(), '') in ('anon', 'authenticated') and not public.is_admin() then
    raise exception 'réservé à l''admin';
  end if;
  return jsonb_build_object(
    'semaine', v_semaine,
    'lignes', coalesce((
      select jsonb_agg(jsonb_build_object(
               'poster_id', r.poster_id,
               'nom', btrim(coalesce(p.prenom, '') || ' ' || coalesce(p.nom, '')),
               'statut_ruul', coalesce(p.ruul_onboarding, '?'),
               'pret', p.ruul_onboarding = 'READY',
               'envoye_at', r.envoye_at,
               'canaux', to_jsonb(r.canaux),
               'erreur', r.erreur,
               'email', (select e.statut from public.emails_envois e
                          where e.destinataire = p.ruul_email and 'rappel_reporte' = any(e.tags) and v_semaine::text = any(e.tags)
                          order by e.cree_at desc limit 1),
               'montant', (select rp.montant + rp.bonus from public.ruul_paiements rp where rp.poster_id = r.poster_id and rp.semaine = v_semaine)
             ) order by r.envoye_at desc)
        from public.ruul_email_relances r
        join public.profiles p on p.id = r.poster_id
       where r.etape like 'reporte:' || v_semaine::text || ':%'), '[]'::jsonb));
end;
$$;
revoke all on function public.ruul_rappels_reportes(date) from public, anon;
grant execute on function public.ruul_rappels_reportes(date) to authenticated, service_role;

-- Jeudi 10 h 07 (Paris, heure d'hiver = 9 h 07 UTC) : le rappel renvoyé seulement à ceux encore pas READY.
do $$
begin
  if not exists (select 1 from cron.job where jobname = 'ruul-rappel-reportes-jeudi') then
    perform cron.schedule('ruul-rappel-reportes-jeudi', '7 9 * * 4', $c$
      select net.http_post(
        url := 'https://mbikecieskoobeizixig.supabase.co/functions/v1/ruul',
        headers := jsonb_build_object('content-type', 'application/json', 'x-cron-secret', public.cron_secret_lire()),
        body := jsonb_build_object('action', 'rappel_reportes', 'relance', true, 'confirmer', true),
        timeout_milliseconds := 120000);
    $c$);
  end if;
end;
$$;
