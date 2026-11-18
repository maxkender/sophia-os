-- 0752 : page « Paie Ruul » de l'OS admin (Max, 18/11). Une lecture seule, mêmes droits que ruul_lot (is_admin) :
-- le lot d'une semaine (statut Ruul, total, nombre de posteurs), chaque posteur rangé en payé / dans le lot /
-- pas prêt / exclu avec la raison (reports des semaines d'avant compris), et l'historique des lots. N'écrit rien.
create or replace function public.ruul_paie_page(p_semaine date default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $function$
declare
  s date;
begin
  if not public.is_admin() and coalesce(auth.jwt()->>'role', '') <> 'service_role' then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  s := coalesce(p_semaine,
                (select max(x.semaine) from (select semaine from public.ruul_lots
                                              union all select semaine from public.ruul_paiements) x));

  return jsonb_build_object(
    'semaine', s,
    'lot', (select jsonb_build_object(
                     'statut', l.statut, 'ruul_statut', l.ruul_statut, 'total', l.total, 'nb', l.nb, 'facture', l.facture,
                     'ruul_batch_id', l.ruul_batch_id, 'ruul_env', l.ruul_env, 'a_virer', l.ruul_funding->'dueAmount',
                     'devise', l.ruul_funding->>'currency', 'reference', l.ruul_funding->>'reference',
                     'prepare_at', l.prepare_at, 'cree_at', l.ruul_cree_at, 'paye_at', l.paye_at, 'rapproche_at', l.rapproche_at,
                     'lu_at', l.ruul_lu_at)
              from public.ruul_lots l where l.semaine = s),
    'lignes', coalesce((
      select jsonb_agg(x order by x->>'categorie', x->>'nom')
        from (
          select jsonb_build_object(
                   'poster_id', p.poster_id, 'semaine', p.semaine,
                   'nom', coalesce(nullif(btrim(concat_ws(' ', pr.prenom, pr.nom)), ''), pr.email, 'posteur'),
                   'pays', (select c.pays from public.comptes c where c.poster_id = p.poster_id order by c.is_active desc, c.created_at limit 1),
                   'ruul_onboarding', pr.ruul_onboarding,
                   'montant', p.montant, 'bonus', p.bonus, 'retenue', p.retenue, 'faits', p.faits, 'prevus', p.prevus,
                   'nb_comptes', p.nb_comptes, 'rattrapage', p.rattrapage,
                   'ruul_statut', p.ruul_statut, 'ruul_echec', p.ruul_echec, 'paye_at', p.paye_at,
                   'categorie', case
                       when p.statut = 'paye' or p.paye_at is not null or p.ruul_statut in ('COMPLETED', 'PAID', 'SUCCEEDED') then 'paye'
                       when p.statut = 'annule' then 'exclu'
                       when coalesce(pr.ruul_onboarding, '') <> 'READY' or p.statut = 'reporte' then 'pas_pret'
                       else 'dans_lot' end,
                   'raison', case
                       when p.statut = 'annule' then coalesce(p.raison_calcul, p.raison_report, p.verif_raison, 'exclu')
                       when p.statut = 'paye' or p.paye_at is not null then null
                       when coalesce(pr.ruul_onboarding, '') <> 'READY' then
                         case coalesce(pr.ruul_onboarding, 'NOT_REGISTERED')
                           when 'NOT_REGISTERED' then 'Pas encore inscrit sur Ruul'
                           when 'PENDING_KYC' then 'Identité pas encore vérifiée chez Ruul'
                           when 'PENDING_COLLECTION_ACCOUNT' then 'Compte bancaire pas encore ajouté sur Ruul'
                           when 'PENDING_AGREEMENTS' then 'Contrat Ruul pas encore accepté'
                           else 'Pas prêt chez Ruul (' || pr.ruul_onboarding || ')' end
                         || coalesce(' · ' || p.raison_report, '')
                       when p.statut = 'reporte' then coalesce(p.raison_report, 'reporté')
                       when p.ruul_echec is not null then 'Ruul : ' || p.ruul_echec
                       else null end) as x
            from public.ruul_paiements p
            join public.profiles pr on pr.id = p.poster_id
           -- Les reports des semaines d'avant (pas prêts chez Ruul) restent visibles : ils partiront au prochain lot.
           where p.semaine = s or (p.statut = 'reporte' and p.semaine < s)
        ) t), '[]'::jsonb),
    'historique', coalesce((
      select jsonb_agg(jsonb_build_object(
               'semaine', w.semaine, 'statut', l.statut, 'ruul_statut', l.ruul_statut, 'total', l.total, 'nb', l.nb,
               'paye_at', l.paye_at, 'cree_at', l.ruul_cree_at,
               'lignes', (select count(*) from public.ruul_paiements p where p.semaine = w.semaine),
               'payes', (select count(*) from public.ruul_paiements p where p.semaine = w.semaine and (p.statut = 'paye' or p.paye_at is not null)),
               'exclus', (select count(*) from public.ruul_paiements p where p.semaine = w.semaine and p.statut = 'annule'))
             order by w.semaine desc)
        from (select distinct semaine from (select semaine from public.ruul_lots union all select semaine from public.ruul_paiements) y) w
        left join public.ruul_lots l on l.semaine = w.semaine), '[]'::jsonb)
  );
end;
$function$;

revoke all on function public.ruul_paie_page(date) from public, anon;
grant execute on function public.ruul_paie_page(date) to authenticated, service_role;
