-- 0682 : « Le cerveau du bot », partie 2 (Max, 12/11). Avant chaque réponse, le bot lit tout
-- sur la personne, et ne promet rien qu'il n'a pas lu.
-- 1. support_fiche : + zone, tarif, HM, statut (actif / pause / arrêt), Ruul complet (ajouté,
--    statut lu dans Ruul + date, emails A/B envoyés), prochain paiement. Ce qui manque côté Ruul
--    vient du statut lu dans Ruul : un compte « Active » n'est plus « à finir » (cas de Yanis).
-- 2. support_contexte_plus : ses demandes Help passées AVEC ce qu'on lui a répondu, les
--    décisions (kills, pauses, Doubler, arrêts), ses posts récents (liens), la date du dernier
--    import des statuts Ruul.
-- Additif : une fonction réécrite (mêmes champs + nouveaux), une fonction neuve.

create or replace function public.support_fiche(p_poster uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  pr public.profiles%rowtype;
  c record;
  v_ruul boolean;
  v_manque text[] := array[]::text[];
  v_paie jsonb;
  v_zone text;
  v_tarif numeric;
  v_statut text;
  v_lundi date := (date_trunc('week', (now() at time zone 'Europe/Paris')) + interval '7 days')::date;
begin
  if not (coalesce(auth.role(), '') = 'service_role' or public.is_admin() or auth.uid() = p_poster) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select * into pr from public.profiles where id = p_poster;
  if not found then return null; end if;
  v_ruul := pr.canal_paie = 'ruul';
  select co.handle_tiktok, co.warmup_started_at, co.warmup_ends_at into c
    from public.comptes co where co.poster_id = p_poster order by co.is_active desc, co.created_at limit 1;

  if v_ruul then
    v_zone := pr.ruul_zone;
    v_tarif := public.ruul_tarif(p_poster);
  else
    select z.zone into v_zone from public.zones_paie_pays z where z.pays = upper(public.paie_pays_posteur(p_poster)) and z.retire_at is null limit 1;
    v_tarif := coalesce(nullif(pr.tarif_hebdo, 0), (select zp.tarif from public.zones_paie zp where zp.zone = v_zone));
  end if;

  v_statut := case
    when not pr.is_active then 'inactif (collaboration terminée)'
    when exists (select 1 from public.arrets a where a.poster_id = p_poster and a.annule_at is null and coalesce(a.statut, '') not in ('fait', 'termine', 'annule'))
      then 'arrêt en cours'
    when exists (select 1 from public.posteur_pauses pp where pp.poster_id = p_poster and current_date between pp.debut and coalesce(pp.jusqu_au, current_date))
      then 'en pause jusqu''au ' || (select max(pp.jusqu_au)::text from public.posteur_pauses pp where pp.poster_id = p_poster and current_date between pp.debut and coalesce(pp.jusqu_au, current_date))
    else 'actif' end;

  if pr.premiere_connexion_at is null then v_manque := array_append(v_manque, 'log in to the dashboard'); end if;
  if v_ruul and nullif(btrim(coalesce(pr.ruul_email, '')), '') is null then v_manque := array_append(v_manque, 'give the email of your Ruul account'); end if;
  -- Ruul : d'après le statut lu dans Ruul (0681), pas d'après une supposition.
  if v_ruul and coalesce(pr.ruul_statut, '') not in ('pret', 'paye_1x') then
    if pr.ruul_compte = 'active' then
      v_manque := array_append(v_manque, 'in Ruul, check your identity is verified and your withdrawal method is added, then click « It''s done » in our email');
    elsif pr.ruul_compte = 'invited' then
      v_manque := array_append(v_manque, 'create your Ruul account from the Ruul invitation email (same email address), verify your identity, add a withdrawal method, then click « It''s done »');
    elsif pr.ruul_ajoute_at is null then
      v_manque := array_append(v_manque, 'nothing to do for Ruul yet: we add you to Ruul, then you get an email from Ruul');
    end if;
  end if;
  if c.handle_tiktok is null then v_manque := array_append(v_manque, 'create the TikTok account'); end if;
  if c.warmup_started_at is null then v_manque := array_append(v_manque, 'click Start warmup and follow 5 accounts'); end if;
  if pr.slack_user_id is null then v_manque := array_append(v_manque, 'join Slack (recommended)'); end if;

  if v_ruul then
    select jsonb_build_object('semaine', rp.semaine, 'statut', rp.statut, 'montant', rp.montant, 'paye_at', rp.paye_at) into v_paie
      from public.ruul_paiements rp where rp.poster_id = p_poster order by rp.semaine desc limit 1;
  else
    select jsonb_build_object('semaine', pa.semaine, 'statut', pa.statut,
                              'montant', coalesce(pa.montant_finance, pa.montant_approuve, pa.montant_reserve), 'maj_at', pa.updated_at) into v_paie
      from public.paie_paiements_api pa where pa.poster_id = p_poster order by pa.semaine desc limit 1;
  end if;
  return jsonb_build_object(
    'poster_id', pr.id,
    'nom', coalesce(nullif(btrim(concat_ws(' ', pr.prenom, pr.nom)), ''), pr.email),
    'plateforme', case when v_ruul then 'ruul' else 'upwork' end,
    'actif', pr.is_active,
    'statut', v_statut,
    'zone', v_zone,
    'tarif', v_tarif,
    'hm', (select nullif(btrim(concat_ws(' ', m.prenom, m.nom)), '') from public.profiles m where m.id = pr.manager_id),
    'debut', pr.cohorte_lundi,
    'premiere_connexion', pr.premiere_connexion_at,
    'slack_relie', pr.slack_user_id is not null,
    'tiktok', c.handle_tiktok,
    'warmup_debut', c.warmup_started_at,
    'warmup_fin', c.warmup_ends_at,
    'ruul', case when v_ruul then jsonb_build_object('statut', pr.ruul_statut, 'email_ruul', pr.ruul_email is not null,
                                                     'ajoute_at', pr.ruul_ajoute_at, 'pret_at', pr.ruul_pret_at,
                                                     'premier_paiement_at', pr.ruul_premier_paiement_at,
                                                     'compte_ruul', pr.ruul_compte, 'compte_ruul_vu_at', pr.ruul_compte_vu_at,
                                                     'email_a_at', pr.ruul_email_a_at, 'email_b_at', pr.ruul_email_b_at) end,
    'contrat_upwork', case when not v_ruul then pr.upwork_contract_id end,
    'prochain_lundi', v_lundi,
    'parrainages', jsonb_build_object(
      'declares', (select count(*) from public.creator_referrals r where r.referrer_id = p_poster),
      'invites', (select count(*) from public.parrainage_invitations i where i.parrain_id = p_poster),
      'recrues', (select count(*) from public.parrainage_invitations i where i.parrain_id = p_poster and i.recrue_id is not null)),
    'derniere_paie', v_paie,
    'manque', to_jsonb(v_manque)
  );
end;
$$;

/* Le reste de ce que l'OS sait sur la personne (en plus de support_contexte). Ne lit que. */
create or replace function public.support_contexte_plus(p_poster uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' and not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return jsonb_build_object(
    -- Ses demandes Help et ce qu'on lui a répondu : ne jamais se contredire ni répéter la même réponse.
    'demandes_help', coalesce((select jsonb_agg(jsonb_build_object(
        'at', d.cree_at, 'categorie', d.categorie, 'statut', d.statut, 'niveau', d.niveau, 'texte', left(d.texte, 300),
        'notre_reponse', left(d.bot_reponse, 400),
        'echanges', coalesce((select jsonb_agg(jsonb_build_object('de', m.auteur, 'at', m.cree_at, 'texte', left(m.texte, 300)) order by m.cree_at)
                                from (select * from public.support_messages x where x.demande_id = d.id order by x.cree_at desc limit 6) m), '[]'::jsonb))
        order by d.cree_at desc)
      from (select * from public.support_demandes y where y.poster_id = p_poster order by y.cree_at desc limit 12) d), '[]'::jsonb),
    'decisions', jsonb_build_object(
      'propositions', coalesce((select jsonb_agg(jsonb_build_object('jour', p.jour, 'type', p.type, 'action', p.action, 'decision', p.decision,
                                                                   'decision_at', p.decision_at, 'fait_at', p.fait_at) order by p.created_at desc)
                                  from (select * from public.ckd_propositions z where z.poster_id = p_poster and z.created_at > now() - interval '60 days'
                                         order by z.created_at desc limit 15) p), '[]'::jsonb),
      'arrets', coalesce((select jsonb_agg(jsonb_build_object('at', a.created_at, 'statut', a.statut, 'motif', a.motif, 'annule_at', a.annule_at) order by a.created_at desc)
                            from public.arrets a where a.poster_id = p_poster), '[]'::jsonb),
      'demandes_arret', coalesce((select jsonb_agg(jsonb_build_object('at', a.demande_at, 'source', a.source, 'decision', a.decision) order by a.demande_at desc)
                                    from public.demandes_arret a where a.poster_id = p_poster), '[]'::jsonb),
      'pauses', coalesce((select jsonb_agg(jsonb_build_object('debut', pp.debut, 'jusqu_au', pp.jusqu_au, 'raison', pp.raison) order by pp.debut desc)
                            from public.posteur_pauses pp where pp.poster_id = p_poster), '[]'::jsonb),
      'kills_dimanche', coalesce((select jsonb_agg(jsonb_build_object('lundi', k.lundi, 'code', k.code, 'montant', k.montant) order by k.lundi desc)
                                    from public.dimanche_kills k where k.poster_id = p_poster), '[]'::jsonb)),
    'posts_recents', coalesce((select jsonb_agg(jsonb_build_object('prevu', x.date_publication_prevue, 'publie_at', x.publie_at, 'lien', x.publie_url)
                                                 order by x.date_publication_prevue desc)
                                 from (select pa.date_publication_prevue, pa.publie_at, pa.publie_url
                                         from public.passages pa join public.comptes co on co.id = pa.compte_id
                                        where co.poster_id = p_poster and pa.publie_url is not null
                                        order by pa.date_publication_prevue desc limit 10) x), '[]'::jsonb),
    'ruul_dernier_import', (select max(at) from public.ruul_imports where type = 'statuts')
  );
end;
$$;
revoke execute on function public.support_contexte_plus(uuid) from public, anon;
grant execute on function public.support_contexte_plus(uuid) to authenticated;
