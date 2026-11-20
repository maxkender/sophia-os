-- 0805 : la page « Aujourd'hui » (Max, 21/11, « SUPPORT + BOTS », points 7 et 10). Additif.
-- 1. aujourdhui_lire() : tout ce que la page montre, en une fois : le résumé, 5 sections de lignes (un problème par
--    ligne, pas un posteur) et les chiffres du jour. Ce que l'OS règle seul n'y est pas (compté dans « géré »).
-- 2. aujourdhui_alertes_envoyees : une alerte Slack urgente au plus par ligne (argent, ou bloquée depuis plus de 24 h).
-- 3. support_qualite(p_lundi) : le rapport qualité du lundi (semaine qui vient de finir).

-- Une ligne de la page.
create or replace function public.aujourdhui_ligne(
  p_id text, p_titre text, p_detail text, p_ton text, p_depuis timestamptz, p_nb bigint, p_montant numeric,
  p_posteurs uuid[], p_demandes uuid[], p_lien text, p_lien_label text, p_categorie text, p_plateforme text)
returns jsonb language sql immutable as $$
  select jsonb_build_object('id', p_id, 'titre', p_titre, 'detail', p_detail, 'ton', p_ton, 'depuis', p_depuis,
    'nb', p_nb, 'montant', p_montant, 'posteurs', coalesce(to_jsonb(p_posteurs), '[]'::jsonb),
    'demandes', coalesce(to_jsonb(p_demandes), '[]'::jsonb), 'lien', p_lien, 'lien_label', p_lien_label,
    'categorie', p_categorie, 'plateforme', p_plateforme);
$$;

-- Les libellés des catégories du support.
create or replace function public.aujourdhui_libelle_categorie(p text)
returns text language sql immutable as $$
  select case coalesce(p, 'autre')
    when 'paie' then 'Paie' when 'paiement' then 'Paiement' when 'arret' then 'Arrêt' when 'statut' then 'Statut du compte'
    when 'posting' then 'Posts' when 'lien_post' then 'Liens de posts' when 'tiktok' then 'TikTok' when 'warmup' then 'Warm-up'
    when 'ruul' then 'Ruul' when 'login' then 'Connexion' when 'bug' then 'Bug' when 'parrainage' then 'Parrainage'
    when 'double' then '2e compte' when 'autre' then 'Autres demandes' else initcap(replace(p, '_', ' ')) end;
$$;

-- 1.
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

-- 1 bis. Le panneau de droite et la recherche : qui sont les posteurs des lignes (nom, @, email) et leurs demandes
-- ouvertes (texte, brouillon ou réponse proposée par le bot, canal). Lecture seule, admin.
create or replace function public.aujourdhui_details(p_posteurs uuid[], p_demandes uuid[] default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not (public.is_admin() or coalesce(auth.role(), '') = 'service_role') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'posteurs', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', p.id, 'nom', coalesce(nullif(btrim(concat_ws(' ', p.prenom, p.nom)), ''), p.email),
        'email', p.email, 'plateforme', coalesce(p.canal_paie, 'upwork'),
        'handles', (select coalesce(jsonb_agg(distinct c.handle) filter (where c.handle is not null), '[]'::jsonb)
                      from public.comptes c where c.poster_id = p.id))), '[]'::jsonb)
        from public.profiles p where p.id = any(coalesce(p_posteurs, '{}'))),
    'demandes', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', d.id, 'poster_id', d.poster_id, 'source', d.source, 'categorie', d.categorie, 'plateforme', d.plateforme,
        'cree_at', d.cree_at, 'statut', d.statut, 'texte', left(d.texte, 2000),
        'proposition', coalesce(nullif(d.brouillon, ''), nullif(d.bot_reponse, ''))) order by d.cree_at), '[]'::jsonb)
        from public.support_demandes d
       where d.id = any(coalesce(p_demandes, '{}'))
          or (p_demandes is null and d.poster_id = any(coalesce(p_posteurs, '{}')) and d.statut <> 'resolu')));
end;
$$;
revoke execute on function public.aujourdhui_details(uuid[], uuid[]) from public, anon;
grant execute on function public.aujourdhui_details(uuid[], uuid[]) to authenticated, service_role;

-- 2.
create table if not exists public.aujourdhui_alertes_envoyees (
  cle text primary key,
  titre text,
  envoye_at timestamptz not null default now()
);
alter table public.aujourdhui_alertes_envoyees enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'aujourdhui_alertes_envoyees' and policyname = 'aujourdhui_alertes_admin') then
    create policy aujourdhui_alertes_admin on public.aujourdhui_alertes_envoyees for select to authenticated using (public.is_admin());
  end if;
end $$;

-- Les lignes urgentes pas encore signalées : argent (rouge), ou bloquées depuis plus de 24 h. Les demandes du support
-- (« support:… ») n'y sont pas : l'action « alertes » du support les signale déjà une par une (pas de doublon).
create or replace function public.aujourdhui_alertes_a_envoyer()
returns table (cle text, titre text, detail text, ton text, depuis timestamptz, nb bigint)
language sql stable security definer set search_path = public as $$
  with l as (
    select x as ligne from jsonb_array_elements((public.aujourdhui_lire())->'sections') s, jsonb_array_elements(s->'lignes') x
  )
  select ligne->>'id', ligne->>'titre', ligne->>'detail', ligne->>'ton', (ligne->>'depuis')::timestamptz, (ligne->>'nb')::bigint
    from l
   where (ligne->>'ton' = 'rouge' or (ligne->>'ton' <> 'gris' and (ligne->>'depuis')::timestamptz < now() - interval '24 hours'))
     and ligne->>'id' not like 'support:%'
     and not exists (select 1 from public.aujourdhui_alertes_envoyees a where a.cle = ligne->>'id' and a.envoye_at > now() - interval '7 days');
$$;
revoke execute on function public.aujourdhui_alertes_a_envoyer() from public, anon, authenticated;
grant execute on function public.aujourdhui_alertes_a_envoyer() to service_role;

-- 3. Le rapport qualité de la semaine (lundi → dimanche).
create or replace function public.support_qualite(p_lundi date default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_lundi date := coalesce(p_lundi, (date_trunc('week', now() at time zone 'Europe/Paris') - interval '7 days')::date);
  v_debut timestamptz := v_lundi::timestamp at time zone 'Europe/Paris';
  v_fin timestamptz := (v_lundi + 7)::timestamp at time zone 'Europe/Paris';
  v jsonb;
begin
  if not (public.is_admin() or coalesce(auth.role(), '') = 'service_role') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  with d as (select * from public.support_demandes where cree_at >= v_debut and cree_at < v_fin)
  select jsonb_build_object(
    'lundi', v_lundi,
    'demandes', (select count(*) from d),
    'sans_humain', (select count(*) from d where niveau = 'bot' or resolu_par_bot),
    'pct_sans_humain', (select case when count(*) > 0 then round(100.0 * count(*) filter (where niveau = 'bot' or resolu_par_bot) / count(*)) end from d),
    'objectif', 70,
    -- Délai médian de la 1re réponse (minutes, 1 décimale) : toutes les demandes, puis celles qui ont attendu un humain.
    'delai_premiere_reponse_min', (select round((percentile_cont(0.5) within group (order by extract(epoch from (r1 - cree_at)) / 60))::numeric, 1)
        from (select d.cree_at, coalesce((select min(m.cree_at) from public.support_messages m where m.demande_id = d.id and m.auteur <> 'posteur'), d.equipe_at) as r1 from d) x
       where r1 is not null and r1 >= cree_at),
    'delai_reponse_humaine_min', (select round((percentile_cont(0.5) within group (order by extract(epoch from (r1 - cree_at)) / 60))::numeric, 1)
        from (select d.cree_at, coalesce((select min(m.cree_at) from public.support_messages m where m.demande_id = d.id and m.auteur = 'equipe'), d.equipe_at) as r1
                from d where d.niveau in ('max', 'adrien')) x
       where r1 is not null and r1 >= cree_at),
    'rouverts', (select count(*) from d where rouverte_at is not null),
    'niveau2_par_sujet', (select coalesce(jsonb_object_agg(sujet, n), '{}'::jsonb) from (
        select public.aujourdhui_libelle_categorie(categorie) as sujet, count(*) as n from d where niveau = 'max' group by 1 order by 2 desc) x),
    'emails', (select jsonb_build_object('envoyes', count(*), 'delivres', count(*) filter (where statut = 'delivre'),
        'refuses', count(*) filter (where statut = 'refuse')) from public.emails_envois where cree_at >= v_debut and cree_at < v_fin),
    'emails_entrants_non_relies', (select count(*) from d where source = 'email' and poster_id is null),
    'a_relire', (select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'categorie', x.categorie, 'langue', x.langue,
        'demande', left(x.texte, 300), 'reponse', left(x.bot_reponse, 500))), '[]'::jsonb)
        from (select * from d where niveau = 'bot' and coalesce(bot_reponse, '') <> '' order by random() limit 10) x)
  ) into v;
  return v;
end;
$$;
revoke execute on function public.support_qualite(date) from public, anon;
grant execute on function public.support_qualite(date) to authenticated, service_role;

-- 4. Les DM Slack à Max (fonction support) : alertes urgentes (chaque heure), résumé de 18 h (Paris), rapport qualité
--    du lundi 9 h (Paris). Le cron passe aux deux heures UTC possibles (hiver, été) ; la fonction garde la bonne.
do $$
begin
  perform cron.unschedule(j.jobid) from cron.job j where j.jobname in ('aujourdhui-alertes', 'aujourdhui-resume', 'support-qualite');
  perform cron.schedule('aujourdhui-alertes', '17 * * * *',
    $c$select net.http_post(url := 'https://mbikecieskoobeizixig.supabase.co/functions/v1/support',
        headers := jsonb_build_object('content-type', 'application/json', 'x-cron-secret', public.cron_secret_lire()),
        body := '{"action":"aujourdhui_alertes"}'::jsonb, timeout_milliseconds := 60000)$c$);
  perform cron.schedule('aujourdhui-resume', '3 16,17 * * *',
    $c$select net.http_post(url := 'https://mbikecieskoobeizixig.supabase.co/functions/v1/support',
        headers := jsonb_build_object('content-type', 'application/json', 'x-cron-secret', public.cron_secret_lire()),
        body := '{"action":"aujourdhui_resume"}'::jsonb, timeout_milliseconds := 60000)$c$);
  perform cron.schedule('support-qualite', '7 7,8 * * 1',
    $c$select net.http_post(url := 'https://mbikecieskoobeizixig.supabase.co/functions/v1/support',
        headers := jsonb_build_object('content-type', 'application/json', 'x-cron-secret', public.cron_secret_lire()),
        body := '{"action":"qualite_semaine"}'::jsonb, timeout_milliseconds := 60000)$c$);
end $$;
