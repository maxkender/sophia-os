-- 0528 — La page Problèmes est le SEUL endroit où Max décide (03/11).
--
-- 1. Cartes « décision » : une question (1 phrase) et 2 à 4 options, chacune un
--    bouton (libellé, réponse au posteur ou à l'HM, action non financière,
--    ou « paie » : le bouton ouvre le contrat Upwork, l'OS ne paie jamais).
--    La 1re option est la recommandée. probleme_decider() enregistre le choix,
--    ferme la carte et l'écrit dans bot_feedback (juste si la recommandée a
--    été choisie, sinon « mauvaise_action » avec le choix de Max).
-- 2. Sujets « hm » et « offre » : une carte peut concerner une HM ou une
--    offre Upwork (nom de l'HM, lien de l'offre, réponse proposée à l'HM).
-- 3. Bots (probleme_bot) : actions acceptées resend_password_link,
--    relink_slack, reread_tiktok, recreate, postpone, kill, mark_read,
--    pay_check, open_payroll, open_who_to_fund, saturday, close, none,
--    decision ; un refus rend la liste acceptée. pay_check proposé par un
--    autre bot : accepté, la carte passe au Pay Bot. « creer » accepte
--    pas_poste_aujourdhui, bloque_etape, hm, offre.
-- 4. « lire » : en plus des problèmes, TOUS les posteurs actifs (onboarding
--    compris), avec groupe, cohorte, démarrage prévu, étapes, posts assignés
--    et avec lien aujourd'hui, posts 7 jours, dernière connexion, reports.
-- 5. Le recalcul et le diagnostic de l'OS ne touchent pas aux cartes
--    décision ni aux cartes HM / offre ; une carte créée par un bot n'est plus
--    fermée « pas de demande en attente » ; « Valider tout » les ignore.
--
-- Additif : des colonnes, des fonctions, la vue (colonnes ajoutées à la fin).

alter table public.problemes add column if not exists question text;
alter table public.problemes add column if not exists options jsonb;
alter table public.problemes add column if not exists decision_choisie int;
alter table public.problemes add column if not exists decision_at timestamptz;
alter table public.problemes add column if not exists decision_par uuid;
alter table public.problemes add column if not exists sujet text not null default 'posteur'
  check (sujet in ('posteur', 'hm', 'offre'));
alter table public.problemes add column if not exists hm_id uuid;
alter table public.problemes add column if not exists hm_nom text;
alter table public.problemes add column if not exists offre_lien text;
alter table public.problemes add column if not exists destinataire text not null default 'posteur'
  check (destinataire in ('posteur', 'hm'));
alter table public.bot_feedback add column if not exists choix text;

-- Les options d'une décision : 2 à 4, la 1re recommandée.
create or replace function public.probleme_options_valider(p_options jsonb, p_actions text[])
returns jsonb
language plpgsql
immutable
as $$
declare
  o jsonb;
  i int := 0;
  v_res jsonb := '[]'::jsonb;
begin
  if p_options is null or jsonb_typeof(p_options) <> 'array' or jsonb_array_length(p_options) not between 2 and 4 then
    raise exception 'decision : « options » = 2 à 4 options';
  end if;
  for o in select value from jsonb_array_elements(p_options) loop
    if coalesce(btrim(o->>'libelle'), '') = '' or length(o->>'libelle') > 60 then
      raise exception 'decision : chaque option a un « libelle » (60 caractères au plus)';
    end if;
    if nullif(o->>'action', '') is not null and not ((o->>'action') = any (p_actions)) then
      raise exception 'decision : action « % » refusée ; valeurs acceptées : %', o->>'action', array_to_string(p_actions, ', ');
    end if;
    v_res := v_res || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
      'libelle', btrim(o->>'libelle'),
      'reponse', nullif(left(btrim(coalesce(o->>'reponse', '')), 2000), ''),
      'action', nullif(o->>'action', ''),
      'paie', coalesce((o->>'paie')::boolean, false),
      'lien', nullif(o->>'lien', ''),
      'recommande', i = 0)));
    i := i + 1;
  end loop;
  return v_res;
end;
$$;

-- Ce que lit un bot : + tous les posteurs actifs (onboarding compris).
create or replace function public.probleme_bot_lire(p_bot text, p_probleme uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_auj date := (now() at time zone 'Europe/Paris')::date;
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
               'sujet', o.sujet, 'hm_nom', o.hm_nom, 'offre_lien', o.offre_lien, 'question', o.question, 'options', o.options,
               'proposition', jsonb_build_object('reponse', o.proposition_reponse, 'canal', o.canal_reponse, 'action', o.proposition_action,
                                                 'propose_par', o.propose_par, 'propose_at', o.propose_at),
               'contexte', jsonb_build_object('etapes', o.etapes, 'posts_7j', o.posts_7j, 'paie', o.paie, 'nb_reports', o.nb_reports,
                                              'premier_post_at', o.premier_post_at,
                                              'messages', case when o.poster_id is null then '[]'::jsonb
                                                               else public.probleme_messages(o.poster_id, case when p_probleme is null then 5 else 20 end) end))
             order by o.created_at)
        from public.problemes_ouverts o
       where (o.proprietaire = p_bot and (p_probleme is null or o.id = p_probleme))), '[]'::jsonb),
    'regles', coalesce((select jsonb_agg(jsonb_build_object('regle', r.regle, 'exemple', r.exemple, 'pour_tous', r.bot = 'tous') order by r.created_at)
                          from public.regles_bots r where r.active and (r.bot = p_bot or r.bot = 'tous')), '[]'::jsonb),
    'feedbacks', coalesce((select jsonb_agg(jsonb_build_object('at', f.created_at, 'verdict', f.verdict, 'raison', f.raison, 'categorie', f.categorie,
                                                               'diagnostic_du_bot', f.diagnostic_du_bot, 'action_du_bot', f.action_du_bot, 'choix', f.choix)
                                            order by f.created_at desc)
                             from public.bot_feedback f where f.bot = p_bot and f.created_at > now() - interval '30 days'), '[]'::jsonb),
    'posteurs', case when p_probleme is not null then '[]'::jsonb else coalesce((
      select jsonb_agg(jsonb_build_object(
               'poster_id', x.id, 'nom', x.nom, 'groupe', x.groupe, 'contrat_id', x.contrat_id, 'cohorte_lundi', x.cohorte_lundi,
               'demarrage_prevu', x.demarrage, 'etapes', x.etapes,
               'posts_assignes_aujourdhui', x.assignes, 'posts_lien_aujourdhui', x.lien_auj, 'posts_7j', x.p7,
               'derniere_connexion', x.connexion, 'nb_reports', x.reports) order by x.nom)
        from (
          select pr.id, nullif(btrim(concat_ws(' ', pr.prenom, pr.nom)), '') as nom, pr.upwork_contract_id as contrat_id, pr.cohorte_lundi,
                 case when pp.premier is null then 'onboarding'
                      when pp.premier > now() - interval '14 days' then 'nouveaux_actifs' else 'actifs' end as groupe,
                 case when dc.choix = 'mardi' then pr.cohorte_lundi + 1 else pr.cohorte_lundi end as demarrage,
                 jsonb_build_object(
                   'login', coalesce(pr.premiere_connexion_at, u.last_sign_in_at) is not null,
                   'slack', pr.slack_user_id is not null,
                   'tiktok', exists (select 1 from public.ckd_warmup_releves w join public.comptes c on c.id = w.compte_id
                                      where c.poster_id = pr.id and c.is_active and w.existe),
                   'warmup', exists (select 1 from public.comptes c where c.poster_id = pr.id and c.is_active and c.warmup_started_at is not null)
                             and exists (select 1 from public.ckd_warmup_releves w join public.comptes c on c.id = w.compte_id
                                          where c.poster_id = pr.id and c.is_active and coalesce(w.abonnements, 0) >= 5)) as etapes,
                 coalesce(pc.assignes, 0) as assignes, coalesce(pc.lien_auj, 0) as lien_auj, coalesce(pc.p7, 0) as p7,
                 greatest(pr.premiere_connexion_at, u.last_sign_in_at) as connexion,
                 (select count(distinct y.lundi) from (
                    select rr.periode as lundi from public.recrues_rouges rr where rr.poster_id = pr.id and rr.decision = 'reporter'
                    union
                    select d.lundi from public.debut_choix d where d.poster_id = pr.id and d.choix = 'reporter') y) as reports
            from public.profiles pr
            left join auth.users u on u.id = pr.id
            left join public.debut_choix dc on dc.poster_id = pr.id and dc.lundi = pr.cohorte_lundi
            left join lateral (
              select min(coalesce(pa.publie_at, pa.date_publication_prevue::timestamptz)) as premier
                from public.passages pa join public.comptes c on c.id = pa.compte_id
               where c.poster_id = pr.id and pa.publie_url is not null
            ) pp on true
            left join lateral (
              select count(*) filter (where pa.date_publication_prevue = v_auj) as assignes,
                     count(*) filter (where pa.date_publication_prevue = v_auj and pa.publie_url is not null) as lien_auj,
                     count(*) filter (where pa.publie_url is not null) as p7
                from public.passages pa join public.comptes c on c.id = pa.compte_id
               where c.poster_id = pr.id and c.is_active and pa.date_publication_prevue between v_auj - 6 and v_auj
            ) pc on true
           where pr.is_active
             and exists (select 1 from public.user_roles ur where ur.user_id = pr.id and ur.role = 'poster')
             and not exists (select 1 from public.hub_posteurs h where h.profile_id = pr.id)
        ) x), '[]'::jsonb) end
  );
end;
$$;
revoke all on function public.probleme_bot_lire(text, uuid) from public, anon, authenticated;
grant execute on function public.probleme_bot_lire(text, uuid) to service_role;

-- Max choisit une option : la carte se ferme, le choix va dans bot_feedback.
create or replace function public.probleme_decider(p_id uuid, p_index int, p_envoye boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  p public.problemes;
  v_opt jsonb;
  v_reco jsonb;
  v_bot text;
  v_mode text := coalesce((select valeur #>> '{}' from public.reglages where cle = 'problemes_mode'), 'test');
begin
  if not public.is_admin() then
    raise exception 'probleme_decider : réservé à l''admin' using errcode = '42501';
  end if;
  select * into p from public.problemes where id = p_id for update;
  if not found then raise exception 'problème introuvable'; end if;
  if p.statut <> 'ouvert' then raise exception 'problème déjà fermé (%)', p.statut; end if;
  if p.options is null or p_index < 0 or p_index >= jsonb_array_length(p.options) then raise exception 'option inconnue'; end if;
  v_opt := p.options->p_index;
  v_reco := p.options->0;
  update public.problemes
     set statut = 'valide', decision_choisie = p_index, decision_at = now(), decision_par = auth.uid(),
         ferme_raison = 'décision : « ' || (v_opt->>'libelle') || ' »'
                        || case when coalesce((v_opt->>'paie')::boolean, false) then ' (paie : à faire sur Upwork, l''OS ne paie pas)'
                                when p_envoye then ' · envoyé' else ' (mode ' || v_mode || ' : rien envoyé)' end,
         ferme_at = now(), ferme_par = auth.uid(), maj_at = now(),
         journal = journal || jsonb_build_object('at', now(), 'par', auth.uid(), 'action', 'decision', 'index', p_index,
                                                 'libelle', v_opt->>'libelle', 'envoye', p_envoye, 'mode', v_mode)
   where id = p_id;
  -- Pour que les bots apprennent : le choix de Max contre la recommandation.
  v_bot := case when p.propose_par in ('new_cohort_bot', 'control_bot', 'pay_bot') then p.propose_par else p.proprietaire end;
  insert into public.bot_feedback (probleme_id, bot, categorie, groupe, verdict, raison, diagnostic_du_bot, action_du_bot, donne_par, choix)
  values (p.id, v_bot, p.categorie, p.groupe,
          case when p_index = 0 then 'juste' else 'mauvaise_action' end,
          case when p_index = 0 then null
               else 'Max a choisi « ' || (v_opt->>'libelle') || ' » au lieu de « ' || (v_reco->>'libelle') || ' » (recommandé)' end,
          case when p.diagnostic_par = p.propose_par then p.diagnostic end,
          left(coalesce(v_reco->>'action', v_reco->>'libelle'), 300), auth.uid(), v_opt->>'libelle');
  return v_opt;
end;
$$;
revoke all on function public.probleme_decider(uuid, int, boolean) from public, anon;
grant execute on function public.probleme_decider(uuid, int, boolean) to authenticated;

-- L'OS (ou l'admin) pose une question à Max sur une carte (paie, HM, offre, posteur).
create or replace function public.probleme_decision_creer(p jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_poster uuid := nullif(p->>'poster_id', '')::uuid;
  v_sujet text := coalesce(nullif(p->>'sujet', ''), 'posteur');
  v_actions text[] := array['resend_password_link', 'relink_slack', 'reread_tiktok', 'recreate', 'postpone', 'kill', 'mark_read',
                            'pay_check', 'open_payroll', 'open_who_to_fund', 'saturday', 'close', 'none', 'decision'];
  v_options jsonb := public.probleme_options_valider(p->'options', v_actions);
  v_hm_nom text := coalesce(nullif(p->>'hm_nom', ''), (select nullif(btrim(concat_ws(' ', m.prenom, m.nom)), '') from public.profiles m where m.id = nullif(p->>'hm_id', '')::uuid));
begin
  if coalesce(auth.role(), '') not in ('', 'service_role') and not public.is_admin() then
    raise exception 'probleme_decision_creer : réservé à l''admin' using errcode = '42501';
  end if;
  if coalesce(btrim(p->>'question'), '') = '' or coalesce(btrim(p->>'cle'), '') = '' then raise exception 'cle et question obligatoires'; end if;
  v_id := public.probleme_ajouter('os_decision', p->>'cle', v_poster, nullif(p->>'contrat_id', ''), coalesce(nullif(p->>'categorie', ''), 'autre'),
                                  coalesce(nullif(p->>'resume', ''), p->>'question'), p->>'texte', now(), nullif(p->>'lien', ''), null, 'os');
  if v_id is null then return null; end if;
  update public.problemes
     set question = left(btrim(p->>'question'), 300), options = v_options,
         niveau = coalesce(nullif(p->>'niveau', ''), 'aujourdhui'), niveau_force = true,
         diagnostic = coalesce(nullif(left(btrim(coalesce(p->>'diagnostic', '')), 300), ''), diagnostic), diagnostic_par = 'decision',
         sujet = v_sujet, hm_id = nullif(p->>'hm_id', '')::uuid, hm_nom = v_hm_nom, offre_lien = nullif(p->>'offre_lien', ''),
         destinataire = case when v_sujet in ('hm', 'offre') then 'hm' else 'posteur' end,
         proprietaire = coalesce(nullif(p->>'proprietaire', ''), proprietaire),
         groupe = coalesce(nullif(p->>'groupe', ''), groupe),
         proposition_action = 'decision', propose_par = 'os', propose_at = now(), maj_at = now()
   where id = v_id and statut = 'ouvert';
  return v_id;
end;
$$;
revoke all on function public.probleme_decision_creer(jsonb) from public, anon;
grant execute on function public.probleme_decision_creer(jsonb) to authenticated, service_role;

-- « Valider toute la catégorie » : jamais une décision ni une carte HM / offre.
create or replace function public.problemes_valider_categorie(p_niveau text, p_categorie text)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  n int;
  v_mode text := coalesce((select valeur #>> '{}' from public.reglages where cle = 'problemes_mode'), 'test');
begin
  if not public.is_admin() then
    raise exception 'problemes_valider_categorie : réservé à l''admin' using errcode = '42501';
  end if;
  if p_categorie in ('paie', 'kill_contrat') then
    raise exception 'paie : jamais validée en lot';
  end if;
  update public.problemes set statut = 'valide', ferme_raison = 'validé en lot (mode ' || v_mode || ' : rien envoyé)',
         ferme_at = now(), ferme_par = auth.uid(), maj_at = now(),
         journal = journal || jsonb_build_object('at', now(), 'par', auth.uid(), 'action', 'valider_categorie', 'mode', v_mode)
   where statut = 'ouvert' and niveau = p_niveau and categorie = p_categorie and question is null and sujet = 'posteur';
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke all on function public.problemes_valider_categorie(text, text) from public, anon;
grant execute on function public.problemes_valider_categorie(text, text) to authenticated;

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
  v_actions text[] := array['resend_password_link', 'relink_slack', 'reread_tiktok', 'recreate', 'postpone', 'kill', 'mark_read',
                            'pay_check', 'open_payroll', 'open_who_to_fund', 'saturday', 'close', 'none', 'decision'];
  v_categories text[] := array['stop', 'paie', 'menace', 'hors_plateforme', 'suspect', 'offre_hm_incorrecte',
          'login', 'slack', 'tiktok_setup', 'compte_bloque', 'question_bloquante', 'bug_dashboard', 'contrat_hm',
          'zero_post', 'demande_2e_compte', 'avis_upwork', 'low_views', 'absence', 'autre',
          'pas_poste_aujourdhui', 'bloque_etape', 'hm', 'offre'];
  v_sujet text := coalesce(nullif(p_args->>'sujet', ''), 'posteur');
  v_question text := nullif(left(btrim(coalesce(p_args->>'question', '')), 300), '');
  v_options jsonb;
  v_proprio text;
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
    if v_action is not null and not (v_action = any (v_actions)) then
      raise exception 'action « % » refusée ; valeurs acceptées : %', v_action, array_to_string(v_actions, ', ');
    end if;
    if v_sujet not in ('posteur', 'hm', 'offre') then
      raise exception 'sujet « % » refusé ; valeurs acceptées : posteur, hm, offre', v_sujet;
    end if;
    -- 0528 : une question à Max (« decision ») : 2 à 4 options, la recommandée en premier.
    if v_question is not null or v_action = 'decision' then
      v_options := public.probleme_options_valider(p_args->'options', v_actions);
      if v_question is null then raise exception 'decision : « question » obligatoire (1 phrase)'; end if;
    end if;
    -- 0528 : pay_check proposé par un autre bot : accepté, la carte passe au Pay Bot.
    v_proprio := case when v_action = 'pay_check' then 'pay_bot' end;
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
      if coalesce(btrim(p_args->>'reponse'), '') = '' and v_action is null and v_diag is null and v_question is null then
        raise exception 'reponse, action, diagnostic ou question obligatoire';
      end if;
      update public.problemes
         set proposition_reponse = coalesce(nullif(btrim(p_args->>'reponse'), ''), proposition_reponse),
             canal_reponse = coalesce(v_canal, canal_reponse),
             proposition_action = case when v_action = 'none' then null else coalesce(v_action, proposition_action) end,
             diagnostic = coalesce(v_diag, diagnostic),
             diagnostic_par = case when v_diag is not null then p_bot else diagnostic_par end,
             groupe_suggere = coalesce(v_groupe, groupe_suggere),
             question = coalesce(v_question, question), options = coalesce(v_options, options),
             proprietaire = coalesce(v_proprio, proprietaire),
             propose_par = p_bot, propose_at = now(), maj_at = now(),
             journal = journal || jsonb_build_object('at', now(), 'par', p_bot, 'action', 'proposer',
                                                     'diagnostic', v_diag, 'proposition_action', v_action)
       where id = v_id and statut = 'ouvert';
      if not found then raise exception 'problème introuvable ou fermé'; end if;
    elsif p_action = 'creer' then
      v_poster := nullif(p_args->>'poster_id', '')::uuid;
      v_contrat := nullif(p_args->>'contrat_id', '');
      if v_sujet = 'posteur' then
        if v_poster is null and v_contrat is null then raise exception 'poster_id ou contrat_id obligatoire'; end if;
        if v_poster is null then
          select pr.id into v_poster from public.profiles pr where pr.upwork_contract_id = v_contrat limit 1;
        end if;
        if v_poster is null or not exists (select 1 from public.profiles pr where pr.id = v_poster) then
          raise exception 'posteur introuvable';
        end if;
      elsif coalesce(p_args->>'hm_id', p_args->>'hm_nom', p_args->>'offre_lien', p_args->>'offre_id', '') = '' then
        raise exception 'sujet % : hm_id, hm_nom, offre_lien ou offre_id obligatoire', v_sujet;
      end if;
      if not (coalesce(p_args->>'categorie', '') = any (v_categories)) then
        raise exception 'catégorie inconnue ; valeurs acceptées : %', array_to_string(v_categories, ', ');
      end if;
      if coalesce(btrim(p_args->>'resume'), '') = '' then raise exception 'resume obligatoire'; end if;
      v_ref := p_bot || ':' || gen_random_uuid()::text;
      v_id := public.probleme_ajouter('bot', v_ref, v_poster, v_contrat, p_args->>'categorie', p_args->>'resume',
                                      p_args->>'texte', now(), nullif(p_args->>'lien', ''), null, p_bot);
      if v_id is not null then
        update public.problemes
           set proposition_reponse = coalesce(nullif(btrim(p_args->>'reponse'), ''), proposition_reponse),
               canal_reponse = coalesce(v_canal, canal_reponse),
               proposition_action = case when v_action = 'none' then null else coalesce(v_action, proposition_action) end,
               diagnostic = coalesce(v_diag, diagnostic),
               diagnostic_par = case when v_diag is not null then p_bot else diagnostic_par end,
               groupe_suggere = coalesce(v_groupe, groupe_suggere),
               question = coalesce(v_question, question), options = coalesce(v_options, options),
               proprietaire = coalesce(v_proprio, proprietaire),
               sujet = v_sujet,
               hm_id = coalesce(nullif(p_args->>'hm_id', '')::uuid, hm_id),
               hm_nom = coalesce(nullif(p_args->>'hm_nom', ''), (select nullif(btrim(concat_ws(' ', m.prenom, m.nom)), '') from public.profiles m where m.id = nullif(p_args->>'hm_id', '')::uuid), hm_nom),
               offre_lien = coalesce(nullif(p_args->>'offre_lien', ''), offre_lien),
               destinataire = case when v_sujet in ('hm', 'offre') then 'hm' else 'posteur' end,
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

create or replace function public.problemes_recalculer()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  s jsonb;
  v_lundi boolean := extract(isodow from now() at time zone 'Europe/Paris') = 1;
  v_raison text;
  v_niveau text;
  v_groupe text;
  v_proprio text;
  n_fermes int := 0;
  n_niveaux int := 0;
  v_fin jsonb;
  v_os boolean;
  v_a_ecrit boolean;
  v_signale timestamptz;
  v_login_at timestamptz;
  v_slack_at timestamptz;
  v_tiktok_at timestamptz;
  v_post_at timestamptz;
  v_textes text;
  v_bot boolean;
begin
  if coalesce(auth.role(), '') not in ('', 'service_role') and not public.is_admin() then
    raise exception 'problemes_recalculer : réservé à l''admin' using errcode = '42501';
  end if;
  for r in select p.id, p.poster_id, p.categorie, p.niveau, p.niveau_force, p.sources, p.proprietaire, p.groupe, p.created_at, p.question, p.sujet
             from public.problemes p where p.statut = 'ouvert' loop
    -- 0528 : une question posée à Max (decision) ou une carte HM / offre : seul Max la ferme.
    if r.question is not null or coalesce(r.sujet, 'posteur') <> 'posteur' then
      continue;
    end if;
    s := case when r.poster_id is not null then public.probleme_situation(r.poster_id) end;
    v_os := exists (select 1 from jsonb_array_elements(r.sources) x where x->>'type' not in ('reponse', 'slack', 'bot'));
    -- 0528 : une carte créée par un bot est un constat (pas un simple message) : jamais fermée « pas de demande ».
    v_bot := exists (select 1 from jsonb_array_elements(r.sources) x where x->>'type' = 'bot');
    v_a_ecrit := coalesce((s->>'a_ecrit')::boolean, false);
    -- Le dernier signalement (la source la plus récente).
    select coalesce(max((x->>'at')::timestamptz), r.created_at), string_agg(lower(coalesce(x->>'texte', '')), ' ')
      into v_signale, v_textes
      from jsonb_array_elements(r.sources) x;
    v_raison := null;

    -- Posteur désactivé : tout est fermé, sauf « retirer de Slack » (le geste qui reste à faire pour lui).
    -- 0527 : « kill_contrat » (contrat à fermer à la main) reste ouverte même posteur désactivé.
    if s is not null and not coalesce((s->>'actif')::boolean, true) and r.categorie not in ('retirer_slack', 'kill_contrat') then
      v_raison := 'posteur désactivé : tout est fermé';
    elsif r.categorie = 'paie' and s is not null and coalesce((s->>'paye_passee')::boolean, false) and coalesce((s->>'finance_ok')::boolean, false) then
      select f into v_fin from jsonb_array_elements(s->'finances') f
       where abs((f->>'montant')::numeric - (s->>'attendu_semaine')::numeric) < 0.01 limit 1;
      v_raison := 'paie : semaine du ' || to_char((s->'paie_passee'->>'semaine')::date, 'DD/MM') || ' payée, « '
                  || coalesce(v_fin->>'nom', '?') || ' » financé à ' || (v_fin->>'montant') || ' $ pour la semaine en cours';
    elsif r.categorie = 'login' and s is not null then
      select greatest(pr.premiere_connexion_at, u.last_sign_in_at) into v_login_at
        from public.profiles pr left join auth.users u on u.id = pr.id where pr.id = r.poster_id;
      if v_login_at > v_signale then
        v_raison := 'étape faite : connecté(e) le ' || to_char(v_login_at at time zone 'Europe/Paris', 'DD/MM HH24:MI');
      end if;
    elsif r.categorie = 'slack' and s is not null and coalesce((s->'etapes'->>'slack')::boolean, false) then
      select max(sm.at) into v_slack_at from public.slack_messages sm
        join public.profiles pr on pr.slack_user_id = sm.slack_user where pr.id = r.poster_id;
      if not v_a_ecrit or v_slack_at > v_signale then
        v_raison := 'étape faite : Slack relié' || coalesce(', écrit sur Slack le ' || to_char(v_slack_at at time zone 'Europe/Paris', 'DD/MM'), '');
      end if;
    elsif r.categorie = 'tiktok_setup' and s is not null and coalesce((s->'etapes'->>'tiktok')::boolean, false)
          and coalesce((s->'etapes'->>'warmup')::boolean, false) then
      select max(w.releve_at) into v_tiktok_at from public.ckd_warmup_releves w
        join public.comptes c on c.id = w.compte_id where c.poster_id = r.poster_id and w.existe;
      if not v_a_ecrit or v_tiktok_at > v_signale then
        v_raison := 'étape faite : compte TikTok trouvé et warm-up fait';
      end if;
    end if;

    -- Bug du dashboard ou 0 post, puis un post avec lien depuis ; post signalé « pas compté », puis compté
    -- (le post peut dater de peu avant le signalement : son lien a été compté après).
    if v_raison is null and s is not null and coalesce((s->>'posts')::int, 0) > 0
       and r.categorie not in ('paie', 'stop', 'menace', 'hors_plateforme', 'suspect', 'offre_hm_incorrecte') then
      v_post_at := (s->>'dernier_post_at')::timestamptz;
      if r.categorie in ('bug_dashboard', 'zero_post') and v_post_at > v_signale then
        v_raison := 'posté depuis : post avec lien compté le ' || to_char(v_post_at at time zone 'Europe/Paris', 'DD/MM');
      elsif v_textes ~ '\mposts?\M'
            and v_textes ~ '(not|n.?t|never) (been |yet |be )?(counted|count|showing|shown|show up|appear(ing|ed)?|visible|validated|registered|recorded|taken into account)'
            and v_post_at >= v_signale - interval '3 days' then
        v_raison := 'post signalé non compté, compté depuis (dernier post avec lien le ' || to_char(v_post_at at time zone 'Europe/Paris', 'DD/MM') || ')';
      end if;
    end if;

    if v_raison is null and not v_os and not v_bot and not v_a_ecrit
       and r.categorie not in ('paie', 'stop', 'menace', 'hors_plateforme', 'suspect', 'offre_hm_incorrecte') then
      -- Seulement des messages, dont le dernier ne demande rien (merci, c'est fait, j'ai compris) : pas de carte.
      v_raison := 'pas de demande en attente (dernier message sans question ni blocage)';
    end if;

    if v_raison is not null then
      update public.problemes set statut = 'ferme_auto', ferme_raison = v_raison, ferme_at = now(), maj_at = now(),
             journal = journal || jsonb_build_object('at', now(), 'par', 'os', 'action', 'fermer_auto', 'raison', v_raison)
       where id = r.id;
      n_fermes := n_fermes + 1;
      continue;
    end if;

    -- A1/A4 : le groupe et le propriétaire suivent le posteur.
    -- Sans posteur (accueil à relier, offre HM) : onboarding ; le reste sans situation : actifs.
    v_groupe := coalesce(s->>'groupe', case when r.categorie in ('accueil', 'offre_hm_incorrecte') then 'onboarding' else 'actifs' end);
    v_proprio := case when r.categorie in ('paie', 'kill_contrat') then 'pay_bot'
                      when v_groupe in ('onboarding', 'nouveaux_actifs') then 'new_cohort_bot'
                      when v_groupe = 'actifs' then 'control_bot'
                      else r.proprietaire end;
    v_niveau := r.niveau;
    if not r.niveau_force then
      v_niveau := public.probleme_niveau_calc(r.categorie, v_a_ecrit,
                    coalesce((s->>'devrait_poster')::boolean, false), coalesce((s->>'actif')::boolean, true), v_lundi, v_os);
      -- B4 : une recrue bloquée (devrait poster, 0 post) qui signale connexion / compte / dashboard = urgent.
      if r.categorie in ('login', 'compte_bloque', 'bug_dashboard', 'tiktok_setup') and coalesce((s->>'bloque')::boolean, false) then
        v_niveau := 'urgent';
      end if;
    end if;
    if v_niveau is distinct from r.niveau or v_groupe is distinct from r.groupe or v_proprio is distinct from r.proprietaire then
      update public.problemes set niveau = v_niveau, groupe = v_groupe, proprietaire = v_proprio,
             maj_at = case when v_niveau is distinct from r.niveau then now() else maj_at end
       where id = r.id;
      if v_niveau is distinct from r.niveau then n_niveaux := n_niveaux + 1; end if;
    end if;
  end loop;
  return jsonb_build_object('fermes', n_fermes, 'niveaux_changes', n_niveaux,
    'ouverts', (select jsonb_object_agg(niveau, n) from (select niveau, count(*) n from public.problemes where statut = 'ouvert' group by 1) x),
    'groupes', (select jsonb_object_agg(coalesce(groupe, 'sans'), n) from (select groupe, count(*) n from public.problemes where statut = 'ouvert' group by 1) x));
end;
$$;
revoke all on function public.problemes_recalculer() from public, anon;
grant execute on function public.problemes_recalculer() to authenticated;

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
             'question', p.question, 'options', p.options, 'decision_choisie', p.decision_choisie, 'decision_at', p.decision_at,
             'sujet', coalesce(p.sujet, 'posteur'), 'hm_id', p.hm_id, 'hm_nom', p.hm_nom, 'offre_lien', p.offre_lien,
             'destinataire', coalesce(p.destinataire, 'posteur'),
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
       p.diagnostic_par,
       p.question, p.options, coalesce(p.sujet, 'posteur') as sujet, p.hm_nom, p.offre_lien
  from public.problemes p
  left join public.profiles pr on pr.id = p.poster_id
 where p.statut = 'ouvert';
revoke all on public.problemes_ouverts from public, anon, authenticated;
grant select on public.problemes_ouverts to bots_lecture;

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
            where p.statut = 'ouvert' and coalesce(p.diagnostic_par, 'os') = 'os' and p.question is null and coalesce(p.sujet, 'posteur') = 'posteur' loop
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
notify pgrst, 'reload schema';
