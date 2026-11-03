-- 0524 — Vérification du 03/11 : les bots lisent, « none », et l'OS écrit son diagnostic.
--
-- 1. probleme_bot(bot, 'lire') : les problèmes ouverts du bot (vue
--    problemes_ouverts, avec les 5 derniers messages), ses règles actives
--    (+ « tous ») et ses feedbacks des 30 derniers jours. Compté dans
--    bot_appels comme les autres appels (200 par jour).
-- 2. « proposer » accepte l'action « none » : pas d'action (la proposition
--    d'action précédente est effacée).
-- 3. Le diagnostic de l'OS : quand aucun bot n'a écrit de diagnostic, l'OS
--    écrit le sien (à partir de la situation) dans problemes.diagnostic, avec
--    diagnostic_par = 'os' ; il le réécrit à chaque passage. Le diagnostic d'un
--    bot n'est jamais écrasé. bot_feedback ne copie que le diagnostic du bot.
--
-- Additif : 1 colonne, des fonctions, la vue (colonne ajoutée à la fin). Seule
-- la table problemes est écrite (diagnostic des cartes ouvertes).

alter table public.problemes add column if not exists diagnostic_par text;
-- Les diagnostics déjà posés viennent des bots (seul probleme_bot les écrivait).
update public.problemes set diagnostic_par = propose_par where diagnostic is not null and diagnostic_par is null;

-- ---------------------------------------------------------------------------
-- 3. Le diagnostic de l'OS, en une phrase, depuis la situation (probleme_situation).
-- ---------------------------------------------------------------------------
create or replace function public.probleme_diagnostic_os(p_categorie text, p_resume text, s jsonb)
returns text
language plpgsql
immutable
as $$
declare
  pp jsonb := s->'paie_passee';
  v_f jsonb := s->'finances'->0;
  v_jour text;
begin
  if s is null then
    return left(p_resume, 300);
  end if;
  v_jour := to_char((s->'message'->>'at')::timestamptz at time zone 'Europe/Paris', 'DD/MM');
  if p_categorie = 'paie' then
    if not coalesce((s->>'paye_passee')::boolean, false) then
      return 'Semaine du ' || to_char((pp->>'semaine')::date, 'DD/MM') || ' pas encore payée (' || coalesce(pp->>'montant', '?') || ' $ dus).';
    elsif jsonb_array_length(coalesce(s->'finances', '[]'::jsonb)) = 0 then
      return 'Semaine du ' || to_char((pp->>'semaine')::date, 'DD/MM') || ' payée, mais aucun milestone financé pour la semaine du '
             || to_char((s->>'lundi')::date, 'DD/MM') || ' (attendu ' || coalesce(s->>'attendu_semaine', '?') || ' $).';
    elsif not coalesce((s->>'finance_ok')::boolean, false) then
      return 'Semaine du ' || to_char((pp->>'semaine')::date, 'DD/MM') || ' payée, mais « ' || coalesce(v_f->>'nom', '?') || ' » est financé à '
             || coalesce(v_f->>'montant', '?') || ' $ au lieu de ' || coalesce(s->>'attendu_semaine', '?') || ' $ (' || coalesce(s->>'comptes', '?') || ' compte(s)).';
    end if;
    return 'Semaine du ' || to_char((pp->>'semaine')::date, 'DD/MM') || ' payée et semaine en cours financée : plus rien à faire.';
  elsif p_categorie = 'stop' then
    return 'A demandé l''arrêt' || coalesce(' le ' || v_jour, '') || ' : kill à faire.';
  elsif p_categorie = 'login' and not coalesce((s->'etapes'->>'login')::boolean, false) then
    return 'Ne s''est jamais connecté·e au dashboard.';
  elsif p_categorie = 'slack' and not coalesce((s->'etapes'->>'slack')::boolean, false) then
    return 'Slack pas relié : nos messages Slack ne lui arrivent pas.';
  elsif p_categorie = 'tiktok_setup' and not coalesce((s->'etapes'->>'tiktok')::boolean, false) then
    return 'Compte TikTok introuvable : impossible de commencer.';
  elsif p_categorie = 'tiktok_setup' and not coalesce((s->'etapes'->>'warmup')::boolean, false) then
    return 'Warm-up pas fini (Start warmup ou 5 abonnements manquants).';
  elsif coalesce((s->>'bloque')::boolean, false) then
    return 'Devrait poster mais 0 post avec lien sur ' || coalesce(s->>'attendus', '?') || ' attendus cette semaine'
           || case when coalesce((s->>'a_ecrit')::boolean, false) then ' ; attend une réponse depuis le ' || v_jour else '' end || '.';
  elsif coalesce((s->>'a_ecrit')::boolean, false) then
    return 'Attend une réponse depuis le ' || v_jour || ' : « ' || left(regexp_replace(coalesce(s->'message'->>'texte', ''), '\s+', ' ', 'g'), 140) || ' »';
  end if;
  return left(p_resume, 300);
end;
$$;

create or replace function public.problemes_diagnostiquer()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v text;
  n int := 0;
begin
  if coalesce(auth.role(), '') not in ('', 'service_role') and not public.is_admin() then
    raise exception 'problemes_diagnostiquer : réservé à l''admin' using errcode = '42501';
  end if;
  for r in select p.id, p.poster_id, p.categorie, p.resume, p.diagnostic from public.problemes p
            where p.statut = 'ouvert' and coalesce(p.diagnostic_par, 'os') = 'os' loop
    v := public.probleme_diagnostic_os(r.categorie, r.resume,
           case when r.poster_id is not null then public.probleme_situation(r.poster_id) end);
    if v is distinct from r.diagnostic then
      update public.problemes set diagnostic = v, diagnostic_par = 'os' where id = r.id;
      n := n + 1;
    end if;
  end loop;
  return n;
end;
$$;
revoke all on function public.problemes_diagnostiquer() from public, anon;
grant execute on function public.problemes_diagnostiquer() to authenticated;

-- Collecte, recalcul, puis le diagnostic de l'OS (le cron problemes-passage et la page l'appellent).
create or replace function public.problemes_actualiser()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_passage jsonb;
  v_recalcul jsonb;
begin
  if coalesce(auth.role(), '') not in ('', 'service_role') and not public.is_admin() then
    raise exception 'problemes_actualiser : réservé à l''admin' using errcode = '42501';
  end if;
  v_passage := public.problemes_passage();
  v_recalcul := public.problemes_recalculer();
  return jsonb_build_object('passage', v_passage, 'recalcul', v_recalcul, 'diagnostics', public.problemes_diagnostiquer());
end;
$$;
revoke all on function public.problemes_actualiser() from public, anon;
grant execute on function public.problemes_actualiser() to authenticated;

-- La liste : + diagnostic_par.
create or replace function public.problemes_liste(p_vue text default 'ouverts')
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'problemes_liste : réservé à l''admin' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', p.id, 'poster_id', p.poster_id, 'contrat_id', p.contrat_id,
             'nom', nullif(btrim(concat_ws(' ', pr.prenom, pr.nom)), ''), 'hm', p.hm, 'cohorte', pr.cohorte_lundi,
             'actif', pr.is_active, 'categorie', p.categorie, 'niveau', p.niveau, 'resume', p.resume, 'sources', p.sources,
             'proprietaire', p.proprietaire, 'proposition_reponse', p.proposition_reponse, 'canal_reponse', p.canal_reponse,
             'proposition_action', p.proposition_action, 'propose_par', p.propose_par, 'propose_at', p.propose_at,
             'statut', p.statut, 'ferme_raison', p.ferme_raison, 'ferme_at', p.ferme_at, 'created_at', p.created_at, 'maj_at', p.maj_at,
             'slack_relie', pr.slack_user_id is not null,
             'compte_id', (select c.id from public.comptes c where c.poster_id = p.poster_id and c.is_active and coalesce(c.type_compte, 'perso') = 'perso'
                            order by c.created_at limit 1),
             'groupe', p.groupe, 'diagnostic', p.diagnostic, 'diagnostic_par', p.diagnostic_par, 'groupe_suggere', p.groupe_suggere,
             'situation', case when p_vue = 'ouverts' and p.poster_id is not null then public.probleme_situation(p.poster_id) end)
           order by p.created_at)
      from public.problemes p
      left join public.profiles pr on pr.id = p.poster_id
     where case when p_vue = 'fermes' then p.statut <> 'ouvert' and coalesce(p.ferme_at, p.maj_at) > now() - interval '7 days'
                else p.statut = 'ouvert' end
  ), '[]'::jsonb);
end;
$$;
revoke all on function public.problemes_liste(text) from public, anon;
grant execute on function public.problemes_liste(text) to authenticated;

-- Le feedback ne copie que le diagnostic du bot (pas celui de l'OS).
create or replace function public.bot_feedback_donner(p_probleme uuid, p_verdict text, p_raison text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  p public.problemes;
  v_id uuid;
begin
  if not public.is_admin() then
    raise exception 'bot_feedback_donner : réservé à l''admin' using errcode = '42501';
  end if;
  select * into p from public.problemes where id = p_probleme;
  if not found then raise exception 'problème introuvable'; end if;
  if coalesce(p.propose_par, '') not in ('new_cohort_bot', 'control_bot', 'pay_bot') then
    raise exception 'cette carte n''a pas été proposée par un bot';
  end if;
  if p_verdict not in ('juste', 'pas_un_probleme', 'mauvais_diagnostic', 'mauvaise_action') then
    raise exception 'verdict inconnu';
  end if;
  if p_verdict <> 'juste' and coalesce(btrim(p_raison), '') = '' then
    raise exception 'raison obligatoire (sauf pour « juste »)';
  end if;
  insert into public.bot_feedback (probleme_id, bot, categorie, groupe, verdict, raison, diagnostic_du_bot, action_du_bot, donne_par)
  values (p.id, p.propose_par, p.categorie, p.groupe, p_verdict, nullif(left(btrim(p_raison), 1000), ''),
          case when p.diagnostic_par = p.propose_par then p.diagnostic end,
          coalesce(p.proposition_action, left(p.proposition_reponse, 300)), auth.uid())
  returning id into v_id;
  return (select to_jsonb(f) from public.bot_feedback f where f.id = v_id);
end;
$$;
revoke all on function public.bot_feedback_donner(uuid, text, text) from public, anon;
grant execute on function public.bot_feedback_donner(uuid, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 1 et 2. Les bots : « lire », et l'action « none ».
-- ---------------------------------------------------------------------------
create or replace function public.probleme_bot(p_bot text, p_action text, p_args jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_jour timestamptz := (date_trunc('day', now() at time zone 'Europe/Paris')) at time zone 'Europe/Paris';
  v_id uuid;
  v_poster uuid;
  v_contrat text;
  v_action text := nullif(p_args->>'action', '');
  v_canal text := nullif(p_args->>'canal', '');
  v_diag text := nullif(left(btrim(coalesce(p_args->>'diagnostic', '')), 300), '');
  v_groupe text := nullif(p_args->>'groupe_suggere', '');
  v_erreur text;
  v_ref text;
  v_lu jsonb;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'probleme_bot : réservé à la fonction bot_propositions' using errcode = '42501';
  end if;
  if p_bot not in ('new_cohort_bot', 'control_bot', 'pay_bot') then
    raise exception 'bot inconnu';
  end if;
  if (select count(*) from public.bot_appels b where b.bot = p_bot and b.at >= v_jour) >= 200 then
    insert into public.bot_appels (bot, action, ok, erreur, args) values (p_bot, p_action, false, 'quota : 200 appels par jour', p_args);
    return jsonb_build_object('ok', false, 'error', 'quota : 200 appels par jour');
  end if;

  begin
    if v_action is not null and v_action not in ('resend_password_link', 'relink_slack', 'reread_tiktok', 'recreate', 'kill', 'mark_read',
                                                   'open_payroll', 'open_who_to_fund', 'close', 'postpone', 'none') then
      raise exception 'action « % » refusée', v_action;
    end if;
    if v_canal is not null and v_canal not in ('upwork', 'slack') then
      raise exception 'canal « % » refusé', v_canal;
    end if;
    if v_groupe is not null and v_groupe not in ('onboarding', 'nouveaux_actifs', 'actifs') then
      raise exception 'groupe « % » refusé', v_groupe;
    end if;

    if p_action = 'lire' then
      -- Ses problèmes ouverts (avec les 5 derniers messages), ses règles actives (+ « tous »), ses feedbacks des 30 jours.
      v_lu := jsonb_build_object(
        'problemes', coalesce((select jsonb_agg(to_jsonb(o) order by o.created_at) from public.problemes_ouverts o where o.proprietaire = p_bot), '[]'::jsonb),
        'regles', coalesce((select jsonb_agg(jsonb_build_object('regle', a.regle, 'exemple', a.exemple, 'pour_tous', a.pour_tous) order by a.at)
                              from public.bots_apprentissage a where a.bot = p_bot and a.type = 'regle'), '[]'::jsonb),
        'feedbacks', coalesce((select jsonb_agg(jsonb_build_object('at', a.at, 'verdict', a.verdict, 'raison', a.raison, 'categorie', a.categorie,
                                                                   'diagnostic_du_bot', a.diagnostic_du_bot, 'action_du_bot', a.action_du_bot) order by a.at desc)
                                 from public.bots_apprentissage a where a.bot = p_bot and a.type = 'feedback'), '[]'::jsonb));
    elsif p_action = 'proposer' then
      v_id := (p_args->>'probleme_id')::uuid;
      if coalesce(btrim(p_args->>'reponse'), '') = '' and v_action is null and v_diag is null then
        raise exception 'reponse, action ou diagnostic obligatoire';
      end if;
      update public.problemes
         set proposition_reponse = coalesce(nullif(btrim(p_args->>'reponse'), ''), proposition_reponse),
             canal_reponse = coalesce(v_canal, canal_reponse),
             proposition_action = case when v_action = 'none' then null else coalesce(v_action, proposition_action) end,
             diagnostic = coalesce(v_diag, diagnostic),
             diagnostic_par = case when v_diag is not null then p_bot else diagnostic_par end,
             groupe_suggere = coalesce(v_groupe, groupe_suggere),
             propose_par = p_bot, propose_at = now(), maj_at = now(),
             journal = journal || jsonb_build_object('at', now(), 'par', p_bot, 'action', 'proposer',
                                                     'diagnostic', v_diag, 'proposition_action', v_action)
       where id = v_id and statut = 'ouvert';
      if not found then raise exception 'problème introuvable ou fermé'; end if;
    elsif p_action = 'creer' then
      v_poster := nullif(p_args->>'poster_id', '')::uuid;
      v_contrat := nullif(p_args->>'contrat_id', '');
      if v_poster is null and v_contrat is null then raise exception 'poster_id ou contrat_id obligatoire'; end if;
      if v_poster is null then
        select pr.id into v_poster from public.profiles pr where pr.upwork_contract_id = v_contrat limit 1;
      end if;
      if v_poster is null or not exists (select 1 from public.profiles pr where pr.id = v_poster) then
        raise exception 'posteur introuvable';
      end if;
      if coalesce(p_args->>'categorie', '') not in ('stop', 'paie', 'menace', 'hors_plateforme', 'suspect', 'offre_hm_incorrecte',
          'login', 'slack', 'tiktok_setup', 'compte_bloque', 'question_bloquante', 'bug_dashboard', 'contrat_hm',
          'zero_post', 'demande_2e_compte', 'avis_upwork', 'low_views', 'absence', 'autre') then
        raise exception 'catégorie inconnue';
      end if;
      if coalesce(btrim(p_args->>'resume'), '') = '' then raise exception 'resume obligatoire'; end if;
      v_ref := p_bot || ':' || gen_random_uuid()::text;
      v_id := public.probleme_ajouter('bot', v_ref, v_poster, v_contrat, p_args->>'categorie', p_args->>'resume',
                                      p_args->>'texte', now(), nullif(p_args->>'lien', ''), null, p_bot);
      if v_id is not null and (p_args ? 'reponse' or v_action is not null or v_diag is not null or v_groupe is not null) then
        update public.problemes
           set proposition_reponse = coalesce(nullif(btrim(p_args->>'reponse'), ''), proposition_reponse),
               canal_reponse = coalesce(v_canal, canal_reponse),
               proposition_action = case when v_action = 'none' then null else coalesce(v_action, proposition_action) end,
               diagnostic = coalesce(v_diag, diagnostic),
               diagnostic_par = case when v_diag is not null then p_bot else diagnostic_par end,
               groupe_suggere = coalesce(v_groupe, groupe_suggere),
               propose_par = p_bot, propose_at = now()
         where id = v_id and statut = 'ouvert';
      end if;
    else
      raise exception 'action « % » refusée (lire, proposer ou creer seulement)', p_action;
    end if;
  exception when others then
    v_erreur := sqlerrm;
  end;

  insert into public.bot_appels (bot, action, probleme_id, ok, erreur, args)
  values (p_bot, p_action, v_id, v_erreur is null, v_erreur,
          case when p_action = 'lire' then jsonb_build_object('problemes', jsonb_array_length(v_lu->'problemes')) else p_args end);
  if v_erreur is not null then
    return jsonb_build_object('ok', false, 'error', v_erreur);
  end if;
  if p_action = 'lire' then
    return jsonb_build_object('ok', true) || v_lu;
  end if;
  return jsonb_build_object('ok', true, 'probleme_id', v_id);
end;
$$;
revoke all on function public.probleme_bot(text, text, jsonb) from public, anon, authenticated;
grant execute on function public.probleme_bot(text, text, jsonb) to service_role;

-- La vue des bots : + diagnostic_par (ajoutée à la fin).
create or replace view public.problemes_ouverts as
select p.id, p.poster_id, p.contrat_id, p.hm, p.categorie, p.niveau, p.resume, p.sources, p.proprietaire,
       p.proposition_reponse, p.canal_reponse, p.proposition_action, p.propose_par, p.propose_at, p.created_at, p.maj_at,
       nullif(btrim(concat_ws(' ', pr.prenom, pr.nom)), '') as nom, pr.cohorte_lundi, pr.is_active,
       jsonb_build_object(
         'connexion', pr.premiere_connexion_at,
         'slack_relie', pr.slack_user_id is not null,
         'warmup_lance', (select min(c.warmup_started_at) from public.comptes c where c.poster_id = p.poster_id and c.is_active),
         'tiktok_trouve', exists (select 1 from public.ckd_warmup_releves w join public.comptes c on c.id = w.compte_id
                                   where c.poster_id = p.poster_id and c.is_active and w.existe)
       ) as etapes,
       (select count(*) from public.passages pa join public.comptes c on c.id = pa.compte_id
         where c.poster_id = p.poster_id and pa.publie_url is not null
           and pa.date_publication_prevue > (now() at time zone 'Europe/Paris')::date - 7) as posts_7j,
       (select coalesce(jsonb_agg(jsonb_build_object('semaine', s.semaine, 'statut', s.statut, 'montant', coalesce(s.montant_corrige, s.montant),
                                                     'paye_at', s.paye_at) order by s.semaine desc), '[]'::jsonb)
          from (select * from public.paie_semaines s where s.poster_id = p.poster_id order by s.semaine desc limit 2) s) as paie,
       (select coalesce(jsonb_agg(jsonb_build_object('at', m.at, 'role', m.role, 'texte', left(m.texte, 300)) order by m.at desc), '[]'::jsonb)
          from (select * from public.upwork_messages m where m.poster_id = p.poster_id order by m.at desc limit 5) m) as messages,
       p.groupe,
       p.diagnostic,
       (select count(distinct x.lundi) from (
          select rr.periode as lundi from public.recrues_rouges rr where rr.poster_id = p.poster_id and rr.decision = 'reporter'
          union
          select d.lundi from public.debut_choix d where d.poster_id = p.poster_id and d.choix = 'reporter') x) as nb_reports,
       (select min(coalesce(pa.publie_at, pa.date_publication_prevue::timestamptz))
          from public.passages pa join public.comptes c on c.id = pa.compte_id
         where c.poster_id = p.poster_id and pa.publie_url is not null) as premier_post_at,
       p.diagnostic_par
  from public.problemes p
  left join public.profiles pr on pr.id = p.poster_id
 where p.statut = 'ouvert';
revoke all on public.problemes_ouverts from public, anon, authenticated;
grant select on public.problemes_ouverts to bots_lecture;

notify pgrst, 'reload schema';
