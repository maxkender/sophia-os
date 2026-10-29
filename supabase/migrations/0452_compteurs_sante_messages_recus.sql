-- 0452 — Décisions finales 4 : les compteurs de Health et les messages reçus.
--
-- 1. sante_messages_upwork() : sur 7 jours (heure de Paris), les messages
--    partis sur Upwork par jour et par type, ceux confiés aux HM (à envoyer à
--    la main), et ce qui attend maintenant (par type).
-- 2. messages_recus_posteurs() : les derniers messages reçus de chaque recrue
--    (Slack, Upwork, dashboard), pour la carte d'Onboarding posters.

create or replace function public.sante_messages_upwork()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select case when not public.is_admin() then null else jsonb_build_object(
    'jours', coalesce((
      select jsonb_agg(jsonb_build_object('jour', x.jour, 'type', x.type, 'upwork', x.upwork, 'hm', x.hm) order by x.jour desc, x.type)
        from (
          select j.jour, j.type, sum(j.upwork)::int as upwork, sum(j.hm)::int as hm
            from (
              select (n.envoye_at at time zone 'Europe/Paris')::date as jour, n.type, 1 as upwork, 0 as hm
                from public.nudges n
               where n.envoye_at >= now() - interval '7 days'
                 and ('upwork' = any (coalesce(n.canaux, array[]::text[])) or n.canal = 'upwork')
                 and n.slack_erreur is null
                 and coalesce(n.expediteur, '') <> 'hm'
              union all
              select (rp.main_at at time zone 'Europe/Paris')::date, rp.type, 0, 1
                from public.relances_prevues rp
               where rp.main_at >= now() - interval '7 days'
            ) j
           group by j.jour, j.type
        ) x), '[]'::jsonb),
    'attente', coalesce((
      select jsonb_agg(jsonb_build_object('type', y.type, 'n', y.n, 'main', y.main) order by y.type)
        from (
          select rp.type,
                 (count(*) filter (where rp.statut = 'prevu'))::int as n,
                 (count(*) filter (where rp.statut = 'main'))::int as main
            from public.relances_prevues rp
           where rp.statut in ('prevu', 'main')
           group by rp.type
        ) y), '[]'::jsonb)
  ) end;
$$;
revoke all on function public.sante_messages_upwork() from public, anon;
grant execute on function public.sante_messages_upwork() to authenticated;

create or replace function public.messages_recus_posteurs(p_posteurs uuid[])
returns table (poster_id uuid, canal text, recu_at timestamptz, texte text, cas text)
language sql
stable
security definer
set search_path = public
as $$
  select x.poster_id, x.canal, x.recu_at, x.texte, x.cas
    from (
      select r.poster_id, r.canal, r.recu_at, left(r.texte, 500) as texte, coalesce(r.corrige_cas, r.cas, r.cas_ia) as cas,
             row_number() over (partition by r.poster_id order by r.recu_at desc) as rang
        from public.posteur_reponses r
       where r.poster_id = any (p_posteurs)
    ) x
   where x.rang <= 10 and public.is_admin()
   order by x.poster_id, x.recu_at desc;
$$;
revoke all on function public.messages_recus_posteurs(uuid[]) from public, anon;
grant execute on function public.messages_recus_posteurs(uuid[]) to authenticated;

notify pgrst, 'reload schema';
