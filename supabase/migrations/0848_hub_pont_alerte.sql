-- 0848 : l'alerte « Pont Hub ↔ OS » (Max, 24/11). Cette nuit, l'action « zones » du pont (fonction hub-posteurs,
-- appelée par vik-studios-creators.com) a renvoyé 500 de 01:17 à ~08:00 UTC sans que personne ne le voie (#1868).
-- Additif.
-- 1. hub_pont_appels : une ligne par appel authentifié (action, ok = code < 500, code HTTP, erreur ≤ 300 car.), jamais
--    le corps ni le secret. Purge à 7 jours (cron quotidien).
-- 2. hub_pont_pannes() : la règle (même règle que pannesPont, _shared/hub_pont.ts) : par action, le premier échec depuis
--    le dernier succès date de plus de 15 min = le pont échoue sans interruption depuis plus de 15 min.
-- 3. hub_pont_incidents + hub_pont_verifier() (cron toutes les 5 min) : UNE alerte par incident, fermée d'elle-même au
--    premier succès. À l'ouverture, le DM Slack urgent à Max part tout de suite (action « aujourdhui_alertes » du support).
-- 4. aujourdhui_lire() : la page Aujourd'hui (Control) montre l'incident ouvert en rouge dans « Technique » (l'action,
--    depuis quand, la dernière erreur). Rouge → aujourdhui_alertes_a_envoyer le signale une fois (clé hub_pont:<id>).
--    Copie de 0805, seul le bloc « Pont Hub ↔ OS » est nouveau.
-- 5. hub_pont_etat() : l'indicateur « Pont Hub ↔ OS » de la carte Health (Overview) : vert / rouge, dernière réussite,
--    dernier échec.

-- 1.
create table if not exists public.hub_pont_appels (
  id      bigserial primary key,
  action  text not null,
  ok      boolean not null,
  code    integer not null,
  erreur  text,
  cree_at timestamptz not null default now()
);
alter table public.hub_pont_appels enable row level security;
create index if not exists hub_pont_appels_cree_at on public.hub_pont_appels (cree_at);
create index if not exists hub_pont_appels_action_cree_at on public.hub_pont_appels (action, cree_at);

-- 2.
create or replace function public.hub_pont_pannes(p_seuil interval default interval '15 minutes')
returns table (action text, debut_at timestamptz, dernier_echec_at timestamptz, derniere_erreur text, echecs bigint)
language sql stable security definer set search_path = public as $$
  with dernier_ok as (
    select a.action, max(a.cree_at) as ok_at from public.hub_pont_appels a where a.ok group by a.action
  ), echecs as (
    select a.* from public.hub_pont_appels a left join dernier_ok d on d.action = a.action
     where not a.ok and (d.ok_at is null or a.cree_at > d.ok_at)
  )
  select e.action, min(e.cree_at), max(e.cree_at),
         (array_agg(coalesce(e.erreur, 'HTTP ' || e.code) order by e.cree_at desc, e.id desc))[1], count(*)
    from echecs e
   group by e.action
  having min(e.cree_at) <= now() - p_seuil;
$$;
revoke execute on function public.hub_pont_pannes(interval) from public, anon, authenticated;
grant execute on function public.hub_pont_pannes(interval) to service_role;

-- 3.
create table if not exists public.hub_pont_incidents (
  id               bigserial primary key,
  action           text not null,
  debut_at         timestamptz not null,
  dernier_echec_at timestamptz not null,
  derniere_erreur  text,
  echecs           integer not null default 1,
  ouvert_at        timestamptz not null default now(),
  resolu_at        timestamptz
);
alter table public.hub_pont_incidents enable row level security;
create unique index if not exists hub_pont_incidents_un_ouvert on public.hub_pont_incidents (action) where resolu_at is null;

create or replace function public.hub_pont_verifier()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_fermes integer;
  v_ouverts integer;
begin
  -- Fermeture : un succès après le début de l'incident.
  with s as (
    select i.id, (select min(a.cree_at) from public.hub_pont_appels a
                   where a.action = i.action and a.ok and a.cree_at > i.debut_at) as ok_at
      from public.hub_pont_incidents i where i.resolu_at is null
  )
  update public.hub_pont_incidents i set resolu_at = s.ok_at from s where s.id = i.id and s.ok_at is not null;
  get diagnostics v_fermes = row_count;

  -- Incidents encore ouverts : dernière erreur et compte à jour.
  update public.hub_pont_incidents i
     set dernier_echec_at = p.dernier_echec_at, derniere_erreur = p.derniere_erreur, echecs = p.echecs
    from public.hub_pont_pannes() p
   where i.resolu_at is null and i.action = p.action;

  -- Ouverture : une panne de plus de 15 min sans incident ouvert.
  insert into public.hub_pont_incidents (action, debut_at, dernier_echec_at, derniere_erreur, echecs)
  select p.action, p.debut_at, p.dernier_echec_at, p.derniere_erreur, p.echecs
    from public.hub_pont_pannes() p
   where not exists (select 1 from public.hub_pont_incidents i where i.action = p.action and i.resolu_at is null);
  get diagnostics v_ouverts = row_count;

  -- Le DM Slack urgent à Max part tout de suite (sinon au prochain passage horaire de « aujourdhui-alertes »).
  if v_ouverts > 0 then
    begin
      perform net.http_post(url := 'https://mbikecieskoobeizixig.supabase.co/functions/v1/support',
        headers := jsonb_build_object('content-type', 'application/json', 'x-cron-secret', public.cron_secret_lire()),
        body := '{"action":"aujourdhui_alertes"}'::jsonb, timeout_milliseconds := 60000);
    exception when others then
      raise warning 'hub_pont_verifier : DM Slack non lancé (%)', sqlerrm;
    end;
  end if;
  return jsonb_build_object('ouverts', v_ouverts, 'fermes', v_fermes);
end;
$$;
revoke execute on function public.hub_pont_verifier() from public, anon, authenticated;
grant execute on function public.hub_pont_verifier() to service_role;

do $$
begin
  if not exists (select 1 from cron.job where jobname = 'hub-pont-verifier') then
    perform cron.schedule('hub-pont-verifier', '*/5 * * * *', $c$select public.hub_pont_verifier()$c$);
  end if;
  if not exists (select 1 from cron.job where jobname = 'hub-pont-purge') then
    perform cron.schedule('hub-pont-purge', '41 3 * * *',
      $c$delete from public.hub_pont_appels where cree_at < now() - interval '7 days'$c$);
  end if;
end $$;

-- 4. (copie de 0805 ; seul le bloc « Pont Hub ↔ OS » de la section Technique est nouveau)
create or replace function public.aujourdhui_lire()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_paris timestamptz := date_trunc('day', now() at time zone 'Europe/Paris') at time zone 'Europe/Paris';
  v_resume jsonb;
  v_up jsonb;
  v_ruul jsonb;
  v_valider jsonb := '[]'::jsonb;
  v_argent jsonb := '[]'::jsonb;
  v_posteurs jsonb := '[]'::jsonb;
  v_contenu jsonb := '[]'::jsonb;
  v_technique jsonb := '[]'::jsonb;
  v_semaine date;
  v_total numeric;
  v_jeudi date;
  r record;
  v_reponses integer;
  v_corrections integer;
  v_demandes_24h integer;
  v_bot_24h integer;
begin
  if not (public.is_admin() or coalesce(auth.role(), '') = 'service_role') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  -- 1. À VALIDER : la paie du lundi (Upwork et Ruul séparés), les doublements du jeudi, les arrêts du samedi.
  v_resume := public.paie_resume_plateformes(null);
  v_semaine := (v_resume->>'semaine')::date;
  v_up := v_resume->'upwork';
  v_ruul := v_resume->'ruul';
  select coalesce(sum(coalesce(ps.montant_corrige, ps.montant)), 0) into v_total
    from public.paie_semaines ps join public.profiles pr on pr.id = ps.poster_id
   where ps.semaine = v_semaine and ps.paye_at is null and coalesce(pr.canal_paie, 'upwork') = 'upwork' and not coalesce(ps.exclu, false);
  v_valider := v_valider || public.aujourdhui_ligne('paie_upwork',
    'Paie Upwork du lundi · semaine du ' || to_char(v_semaine, 'DD/MM'),
    (v_up->>'a_payer') || ' à payer · ' || (v_up->>'bloques') || ' bloqués · ' || (v_up->>'payes') || ' payés · total ' || round(v_total) || ' $',
    case when (v_up->>'a_payer')::int > 0 then 'orange' else 'gris' end, null, (v_up->>'a_payer')::int, v_total,
    null, null, '/admin/auto/payroll', 'Valider le lot', 'paie', 'upwork');
  select coalesce(sum(coalesce(rp.montant, 0) + coalesce(rp.bonus, 0)), 0) into v_total
    from public.ruul_paiements rp where rp.statut = 'a_payer';
  v_valider := v_valider || public.aujourdhui_ligne('paie_ruul',
    'Paie Ruul du lundi · ' || (v_ruul->>'prets') || ' posteurs prêts',
    (v_ruul->>'pas_prets') || ' pas prêts (leurs semaines partent dès qu''ils le sont) · lot ' || round(v_total) || ' $',
    case when v_total > 0 then 'orange' else 'gris' end, null, (v_ruul->>'prets')::int, v_total,
    null, null, '/admin/auto/paie-ruul', 'Valider le lot', 'paie', 'ruul');
  select max(jeudi) into v_jeudi from public.doubles_jeudi where decision = 'oui';
  if v_jeudi is not null then
    select count(*) filter (where reponse = 'oui') as oui, count(*) filter (where reponse is null and offre_envoyee_at is not null) as attente,
           count(*) filter (where reponse is null and offre_envoyee_at is null) as a_envoyer,
           count(*) filter (where reponse in ('non', 'expire')) as non, count(*) as n,
           array_agg(poster_id) as posteurs
      into r from public.doubles_jeudi where jeudi = v_jeudi and decision = 'oui';
    v_valider := v_valider || public.aujourdhui_ligne('doublements',
      'Doublements du jeudi ' || to_char(v_jeudi, 'DD/MM') || ' · ' || r.n || ' OUI',
      r.oui || ' acceptés · ' || r.attente || ' en attente de réponse · ' || r.non || ' refusés ou expirés' ||
        case when r.a_envoyer > 0 then ' · ' || r.a_envoyer || ' propositions pas encore parties' else '' end,
      case when r.a_envoyer > 0 then 'orange' else 'gris' end, null, r.n, null, r.posteurs, null,
      '/admin/auto/decisions', 'Voir', 'doublement', null);
  end if;
  select count(*) as n, min(cree_at) as depuis, array_agg(poster_id) as posteurs, max(samedi) as samedi into r
    from public.inactifs_auto where statut <> 'fait' and samedi >= (now() at time zone 'Europe/Paris')::date - 1;
  if r.n > 0 then
    v_valider := v_valider || public.aujourdhui_ligne('arrets_samedi',
      'Arrêts automatiques du samedi ' || to_char(r.samedi, 'DD/MM') || ' · ' || r.n || ' inactifs', 'jamais connectés ou jamais postés · message de fin prêt',
      'gris', r.depuis, r.n, null, r.posteurs, null, '/admin/auto/rapport-kills', 'Voir', 'arret', null);
  end if;

  -- 2. ARGENT : paie bloquée (par motif), bonus en erreur, demandes d'argent pour Max.
  for r in
    select coalesce(nullif(split_part(a.titre, ' : ', 2), ''), a.titre) as motif, count(*) as n, min(a.created_at) as depuis,
           array_agg(distinct a.poster_id) filter (where a.poster_id is not null) as posteurs
      from public.a_faire a where a.type = 'paie' and a.fait_at is null and a.created_at > now() - interval '8 days'
     group by 1 order by 2 desc
  loop
    v_argent := v_argent || public.aujourdhui_ligne('paie:' || md5(r.motif), 'Paie : ' || r.motif || ' · ' || r.n || ' posteur(s)', null,
      'rouge', r.depuis, r.n, null, r.posteurs, null, '/admin/auto/payroll', 'Lancer la correction', 'paie', 'upwork');
  end loop;
  select count(*) as n, coalesce(sum(montant), 0) as m, min(coalesce(envoi_at, calcule_at)) as depuis,
         array_agg(distinct poster_id) as posteurs into r
    from public.bonus where coalesce(erreur, '') <> '' and statut not in ('paye', 'retire');
  if r.n > 0 then
    v_argent := v_argent || public.aujourdhui_ligne('bonus_erreur', 'Bonus en erreur · ' || r.n || ' posteur(s), ' || r.m || ' $', null,
      'rouge', r.depuis, r.n, r.m, r.posteurs, null, '/admin/auto/bonus', 'Lancer la correction', 'bonus', null);
  end if;
  -- Paie et paiement : une seule ligne (c'est la même question pour Max).
  select count(*) as n, min(d.cree_at) as depuis, array_agg(distinct d.poster_id) filter (where d.poster_id is not null) as posteurs,
         array_agg(d.id) as demandes, mode() within group (order by d.plateforme) as plateforme into r
    from public.support_demandes d
   where d.statut <> 'resolu' and d.niveau = 'max' and d.categorie in ('paie', 'paiement');
  if r.n > 0 then
    v_argent := v_argent || public.aujourdhui_ligne('support:paie', 'Questions d''argent pour toi · ' || r.n || ' demande(s)', null,
      'rouge', r.depuis, r.n, null, r.posteurs, r.demandes, null, null, 'paie', r.plateforme);
  end if;

  -- 3. POSTEURS : les autres cas pour Max, par catégorie.
  for r in
    select coalesce(d.categorie, 'autre') as categorie, count(*) as n, min(d.cree_at) as depuis,
           array_agg(distinct d.poster_id) filter (where d.poster_id is not null) as posteurs, array_agg(d.id) as demandes,
           mode() within group (order by d.plateforme) as plateforme
      from public.support_demandes d
     where d.statut <> 'resolu' and d.niveau = 'max' and coalesce(d.categorie, 'autre') not in ('paie', 'paiement')
     group by 1 order by 2 desc
  loop
    v_posteurs := v_posteurs || public.aujourdhui_ligne('support:' || r.categorie,
      public.aujourdhui_libelle_categorie(r.categorie) || ' · ' || r.n || ' demande(s)', null,
      case when r.depuis < now() - interval '24 hours' then 'orange' else 'gris' end, r.depuis, r.n, null, r.posteurs, r.demandes,
      null, null, r.categorie, r.plateforme);
  end loop;

  -- 4. CONTENU ET POSTS : comptes sans posts (cartes zero_post encore ouvertes).
  select count(*) as n, min(created_at) as depuis, array_agg(distinct poster_id) filter (where poster_id is not null) as posteurs into r
    from public.problemes where statut = 'ouvert' and categorie = 'zero_post';
  if r.n > 0 then
    v_contenu := v_contenu || public.aujourdhui_ligne('zero_post', 'Comptes sans posts · ' || r.n || ' posteur(s)', 'cartes « zero post » encore ouvertes',
      'orange', r.depuis, r.n, null, r.posteurs, null, '/admin/auto/problemes', 'Voir', 'contenu', null);
  end if;

  -- 5. TECHNIQUE : emails refusés, tâches planifiées en échec, tickets #os-tickets ouverts.
  select count(*) as n, min(cree_at) as depuis, string_agg(distinct coalesce(tags[1], '?') || coalesce('/' || tags[2], ''), ', ') as types into r
    from public.emails_envois where statut = 'refuse' and cree_at > now() - interval '3 days';
  if r.n > 0 then
    v_technique := v_technique || public.aujourdhui_ligne('emails_refuses', 'Emails refusés · ' || r.n || ' en 3 jours', left(r.types, 200),
      'orange', r.depuis, r.n, null, null, null, null, null, 'email', null);
  end if;
  for r in
    select j.jobname, count(*) as n, min(d.start_time) as depuis
      from cron.job_run_details d join cron.job j on j.jobid = d.jobid
     where d.status = 'failed' and d.start_time > now() - interval '24 hours'
     group by 1 order by 2 desc limit 10
  loop
    v_technique := v_technique || public.aujourdhui_ligne('cron:' || r.jobname, 'Tâche automatique ratée : ' || r.jobname || ' · ' || r.n || ' fois', null,
      'orange', r.depuis, r.n, null, null, null, null, null, 'technique', null);
  end loop;
  select count(*) as n, min(ticket_at) as depuis, array_agg(distinct poster_id) filter (where poster_id is not null) as posteurs,
         array_agg(id) as demandes into r
    from public.support_demandes where ticket_at is not null and ticket_regle_at is null and statut <> 'resolu';
  v_technique := v_technique || public.aujourdhui_ligne('tickets', 'Tickets #os-tickets ouverts · ' || r.n, null,
    case when r.n > 0 then 'orange' else 'gris' end, r.depuis, r.n, null, r.posteurs, r.demandes, null, null, 'ticket', null);

  -- 0848 : le pont Hub ↔ OS échoue sans interruption depuis plus de 15 min (un incident ouvert par action).
  for r in
    select i.id, i.action, i.debut_at, i.dernier_echec_at, i.derniere_erreur, i.echecs
      from public.hub_pont_incidents i where i.resolu_at is null order by i.debut_at
  loop
    v_technique := v_technique || public.aujourdhui_ligne('hub_pont:' || r.id,
      'Pont Hub ↔ OS en panne : « ' || r.action || ' » échoue · dernière erreur : ' || left(coalesce(r.derniere_erreur, '?'), 160),
      'Échoue sans interruption depuis le ' || to_char(r.debut_at at time zone 'Europe/Paris', 'DD/MM "à" HH24:MI') || ' (Paris) · ' ||
        r.echecs || ' échec(s), dernier à ' || to_char(r.dernier_echec_at at time zone 'Europe/Paris', 'HH24:MI') ||
        ' · se ferme seule au premier succès',
      'rouge', r.debut_at, r.echecs, null, null, null, '/admin/auto', 'Voir la santé', 'technique', null);
  end loop;

  -- Ce que l'OS a réglé seul aujourd'hui.
  select count(*) into v_reponses from public.support_demandes where cree_at >= v_paris and niveau = 'bot';
  select count(*) into v_corrections from public.journal_auto where at >= v_paris and mode = 'agir';
  select count(*), count(*) filter (where niveau = 'bot') into v_demandes_24h, v_bot_24h
    from public.support_demandes where cree_at > now() - interval '24 hours';

  return jsonb_build_object(
    'resume', jsonb_build_object(
      'a_valider', (select count(*) from jsonb_array_elements(v_valider) x where x->>'ton' <> 'gris'),
      'cas', (select coalesce(sum((x->>'nb')::int), 0) from jsonb_array_elements(v_argent || v_posteurs) x),
      'problemes', (select count(*) from jsonb_array_elements(v_contenu || v_technique) x where x->>'ton' <> 'gris'),
      'reponses', v_reponses, 'corrections', v_corrections),
    'sections', jsonb_build_array(
      jsonb_build_object('cle', 'valider', 'titre', 'À valider', 'lignes', v_valider),
      jsonb_build_object('cle', 'argent', 'titre', 'Argent', 'lignes', v_argent),
      jsonb_build_object('cle', 'posteurs', 'titre', 'Posteurs', 'lignes', v_posteurs),
      jsonb_build_object('cle', 'contenu', 'titre', 'Contenu et posts', 'lignes', v_contenu),
      jsonb_build_object('cle', 'technique', 'titre', 'Technique', 'lignes', v_technique)),
    'chiffres', jsonb_build_object(
      'comptes_actifs', (select count(*) from public.comptes c join public.profiles p on p.id = c.poster_id
                          where c.is_active and p.is_active and coalesce(c.type_compte, 'perso') = 'perso'),
      'posts_jour', (select count(*) from public.passages where publie_url is not null and publie_at >= v_paris),
      'ruul', (select count(*) from public.profiles pr join public.user_roles ur on ur.user_id = pr.id and ur.role = 'poster'
                where pr.is_active and pr.canal_paie = 'ruul'),
      'upwork', (select count(*) from public.profiles pr join public.user_roles ur on ur.user_id = pr.id and ur.role = 'poster'
                  where pr.is_active and coalesce(pr.canal_paie, 'upwork') = 'upwork'),
      'support_sans_humain', case when v_demandes_24h > 0 then round(100.0 * v_bot_24h / v_demandes_24h) end,
      'demandes_24h', v_demandes_24h));
end;
$$;
revoke execute on function public.aujourdhui_lire() from public, anon;
grant execute on function public.aujourdhui_lire() to authenticated, service_role;

-- 5.
create or replace function public.hub_pont_etat()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not (public.is_admin() or coalesce(auth.role(), '') = 'service_role') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'dernier_succes_at', (select max(cree_at) from public.hub_pont_appels where ok),
    'dernier_echec', (select jsonb_build_object('at', a.cree_at, 'action', a.action, 'code', a.code, 'erreur', a.erreur)
                        from public.hub_pont_appels a where not a.ok order by a.cree_at desc, a.id desc limit 1),
    'appels_24h', (select count(*) from public.hub_pont_appels where cree_at > now() - interval '24 hours'),
    'echecs_24h', (select count(*) from public.hub_pont_appels where not ok and cree_at > now() - interval '24 hours'),
    'incidents', (select coalesce(jsonb_agg(jsonb_build_object('action', i.action, 'depuis', i.debut_at,
                    'derniere_erreur', i.derniere_erreur, 'echecs', i.echecs) order by i.debut_at), '[]'::jsonb)
                    from public.hub_pont_incidents i where i.resolu_at is null));
end;
$$;
revoke execute on function public.hub_pont_etat() from public, anon;
grant execute on function public.hub_pont_etat() to authenticated, service_role;
