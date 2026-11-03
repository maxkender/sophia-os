-- 0525 — bot_propositions : l'action « lire » complète (03/11).
--
-- {"action":"lire"} rend, pour le bot du jeton (lecture seule ; l'appel est
-- noté dans bot_appels et compte dans le quota de 200 par jour) :
-- 1. problemes : ses problèmes ouverts (problemes_ouverts, proprietaire = bot)
--    avec probleme_id, poster_id, contrat_id, nom, pays, hm, cohorte_lundi,
--    groupe, categorie, niveau, resume, sources (liens), diagnostic, la
--    proposition actuelle, et le contexte : etapes, posts_7j, paie,
--    nb_reports, premier_post_at, les 5 derniers messages (Upwork et Slack :
--    date, canal, auteur, texte) ;
-- 2. regles : ses règles actives + « tous » ;
-- 3. feedbacks : ses feedbacks des 30 derniers jours ;
-- 4. posteurs (new_cohort_bot et control_bot) : les posteurs actifs de son
--    groupe (onboarding + nouveaux actifs, ou actifs), pour « creer ».
-- {"action":"lire","probleme_id":"<id>"} : ce seul problème, 20 messages.
--
-- Additif : des fonctions. Rien n'est écrit, sauf la ligne de bot_appels.

-- Les derniers messages d'un posteur : Upwork (lui et nous) et Slack (lui).
create or replace function public.probleme_messages(p_poster uuid, p_n int default 5)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object('at', m.at, 'canal', m.canal, 'auteur', m.auteur, 'texte', m.texte) order by m.at desc), '[]'::jsonb)
    from (
      select x.* from (
        select um.at, 'upwork'::text as canal, um.role as auteur, left(um.texte, 1000) as texte
          from public.upwork_messages um where um.poster_id = p_poster
        union all
        select sm.at, 'slack', 'posteur', left(sm.texte, 1000)
          from public.slack_messages sm join public.profiles pr on pr.slack_user_id = sm.slack_user
         where pr.id = p_poster
      ) x
      order by x.at desc
      limit greatest(1, least(coalesce(p_n, 5), 50))
    ) m;
$$;
revoke all on function public.probleme_messages(uuid, int) from public, anon, authenticated;

-- Ce que lit un bot (appelée par probleme_bot ; service_role seulement).
create or replace function public.probleme_bot_lire(p_bot text, p_probleme uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_groupes text[] := case p_bot when 'new_cohort_bot' then array['onboarding', 'nouveaux_actifs']
                                 when 'control_bot' then array['actifs'] else array[]::text[] end;
begin
  return jsonb_build_object(
    'bot', p_bot,
    'problemes', coalesce((
      select jsonb_agg(jsonb_build_object(
               'probleme_id', o.id, 'poster_id', o.poster_id, 'contrat_id', o.contrat_id, 'nom', o.nom,
               'pays', (select c.pays from public.comptes c where c.poster_id = o.poster_id and c.is_active and coalesce(c.type_compte, 'perso') = 'perso'
                         order by c.created_at limit 1),
               'hm', o.hm, 'cohorte_lundi', o.cohorte_lundi, 'groupe', o.groupe, 'categorie', o.categorie, 'niveau', o.niveau,
               'resume', o.resume, 'sources', o.sources,
               'diagnostic', o.diagnostic, 'diagnostic_par', o.diagnostic_par,
               'proposition', jsonb_build_object('reponse', o.proposition_reponse, 'canal', o.canal_reponse, 'action', o.proposition_action,
                                                 'propose_par', o.propose_par, 'propose_at', o.propose_at),
               'contexte', jsonb_build_object('etapes', o.etapes, 'posts_7j', o.posts_7j, 'paie', o.paie, 'nb_reports', o.nb_reports,
                                              'premier_post_at', o.premier_post_at,
                                              'messages', case when o.poster_id is null then '[]'::jsonb
                                                               else public.probleme_messages(o.poster_id, case when p_probleme is null then 5 else 20 end) end))
             order by o.created_at)
        from public.problemes_ouverts o
       where o.proprietaire = p_bot and (p_probleme is null or o.id = p_probleme)), '[]'::jsonb),
    'regles', coalesce((select jsonb_agg(jsonb_build_object('regle', r.regle, 'exemple', r.exemple, 'pour_tous', r.bot = 'tous') order by r.created_at)
                          from public.regles_bots r where r.active and (r.bot = p_bot or r.bot = 'tous')), '[]'::jsonb),
    'feedbacks', coalesce((select jsonb_agg(jsonb_build_object('at', f.created_at, 'verdict', f.verdict, 'raison', f.raison, 'categorie', f.categorie,
                                                               'diagnostic_du_bot', f.diagnostic_du_bot, 'action_du_bot', f.action_du_bot) order by f.created_at desc)
                             from public.bot_feedback f where f.bot = p_bot and f.created_at > now() - interval '30 days'), '[]'::jsonb),
    'posteurs', case when p_probleme is not null or cardinality(v_groupes) = 0 then '[]'::jsonb else coalesce((
      select jsonb_agg(jsonb_build_object('poster_id', x.id, 'nom', x.nom, 'groupe', x.groupe, 'contrat_id', x.contrat_id) order by x.nom)
        from (
          select pr.id, nullif(btrim(concat_ws(' ', pr.prenom, pr.nom)), '') as nom, pr.upwork_contract_id as contrat_id,
                 case when pp.premier is null then 'onboarding'
                      when pp.premier > now() - interval '14 days' then 'nouveaux_actifs' else 'actifs' end as groupe
            from public.profiles pr
            left join lateral (
              select min(coalesce(pa.publie_at, pa.date_publication_prevue::timestamptz)) as premier
                from public.passages pa join public.comptes c on c.id = pa.compte_id
               where c.poster_id = pr.id and pa.publie_url is not null
            ) pp on true
           where pr.is_active
             and exists (select 1 from public.user_roles ur where ur.user_id = pr.id and ur.role = 'poster')
             and not exists (select 1 from public.hub_posteurs h where h.profile_id = pr.id)
        ) x
       where x.groupe = any (v_groupes)), '[]'::jsonb) end
  );
end;
$$;
revoke all on function public.probleme_bot_lire(text, uuid) from public, anon, authenticated;
grant execute on function public.probleme_bot_lire(text, uuid) to service_role;

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
      -- Lecture seule (0525) : tout le contexte du bot, ou un seul problème avec 20 messages.
      if p_args ? 'probleme_id' and nullif(p_args->>'probleme_id', '') is not null then
        v_id := (p_args->>'probleme_id')::uuid;
      end if;
      v_lu := public.probleme_bot_lire(p_bot, v_id);
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
          case when p_action = 'lire' then jsonb_build_object('problemes', jsonb_array_length(coalesce(v_lu->'problemes', '[]'::jsonb)),
                                                              'posteurs', jsonb_array_length(coalesce(v_lu->'posteurs', '[]'::jsonb)),
                                                              'probleme_id', v_id) else p_args end);
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

notify pgrst, 'reload schema';
