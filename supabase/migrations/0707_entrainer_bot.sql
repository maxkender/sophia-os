-- 0707 : page « Entraîner le bot » (Max, 13/11, maquette validée : « ok pour tout »).
-- 1. bot_questions_types : l'historique (chatbot_questions + support_demandes) regroupé en questions
--    types par la fonction support (action entrainement_regrouper) : nombre de fois, plateformes,
--    exemples, réponse actuelle, statut (sur / pas_sur / sans_reponse ; ok une fois entraînée).
--    4 cas en premier (priorite 1 à 4) : durée du contrat, changer son @ TikTok, suivis bloqués à 7
--    sur un compte neuf, post sans musique assignée.
-- 2. entrainement_liste() : les questions types, avec « à revoir » quand une règle (catalogue ou
--    infos), une consigne ou un document qui la touche a changé depuis l'entraînement.
-- 3. entrainement_decider(id, choix, args) : ✅ OK / ✏️ Corriger (Upwork + Ruul) / ⚡ Action /
--    ↗ Escalader → une entrée validée du catalogue (reponses_officielles), lue par le bot tout de suite.
-- 4. Actions possibles : réglage bot_actions_actives (vide = toutes actives, comme aujourd'hui),
--    entrainement_actions() (bot, actif, fois sur 7 jours), entrainement_action_activer().
-- 5. entrainement_direct() : le fil du jour (question → répondu / action / escaladé / bloqué) et ses compteurs.
-- Additif : une table, des fonctions, un réglage.

create table if not exists public.bot_questions_types (
  id uuid primary key default gen_random_uuid(),
  question text not null check (length(btrim(question)) between 3 and 300),
  categorie text,
  priorite integer,
  nb integer not null default 0,
  upwork boolean not null default false,
  ruul boolean not null default false,
  exemples jsonb not null default '[]'::jsonb,
  sources jsonb not null default '[]'::jsonb,
  regles text[] not null default '{}',
  reponse_actuelle text,
  statut_auto text not null default 'sans_reponse' check (statut_auto in ('sur', 'pas_sur', 'sans_reponse')),
  choix text check (choix in ('ok', 'corriger', 'action', 'escalader')),
  reponse_upwork text,
  reponse_ruul text,
  action text,
  action_bot text,
  escalade_vers text check (escalade_vers in ('adrien', 'max')),
  entree_ids uuid[] not null default '{}',
  entraine_at timestamptz,
  entraine_par uuid,
  regroupe_at timestamptz,
  cree_at timestamptz not null default now(),
  maj_at timestamptz not null default now()
);

alter table public.bot_questions_types enable row level security;
drop policy if exists bot_questions_types_admin on public.bot_questions_types;
create policy bot_questions_types_admin on public.bot_questions_types for select to authenticated using (public.is_admin());

-- Les 4 cas de Max d'abord (exemples réels ajoutés au premier regroupement).
insert into public.bot_questions_types (question, categorie, priorite)
select q, c, p from (values
  ('How long is the contract?', 'statut', 1),
  ('Can I change my TikTok username?', 'tiktok', 2),
  ('I can''t follow more than 7 accounts on my new TikTok account', 'warmup', 3),
  ('My post has no sound assigned', 'posting', 4)
) v(q, c, p)
where not exists (select 1 from public.bot_questions_types t where t.priorite = v.p);

insert into public.reglages (cle, valeur) values ('bot_actions_actives', '{}'::jsonb) on conflict (cle) do nothing;

-- Le statut affiché : ok (entraînée), a_revoir (une source a changé depuis), sinon le statut lu dans l'historique.
create or replace function public.entrainement_statut(t public.bot_questions_types)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
    when t.entraine_at is null then t.statut_auto
    when exists (select 1 from public.reponses_officielles r where r.id = any(t.entree_ids) and r.maj_at > t.entraine_at + interval '1 minute')
      or exists (select 1 from public.reponses_officielles r
                  where r.maj_at > t.entraine_at and not (r.id = any(t.entree_ids)) and r.question = any(t.regles))
      or exists (select 1 from public.support_infos i where i.maj_at > t.entraine_at and i.titre = any(t.regles))
      or exists (
        select 1 from (
          select c.texte as txt from public.support_consignes c where c.maj_at > t.entraine_at
          union all select d.titre || ' ' || d.contenu from public.support_documents d where d.maj_at > t.entraine_at
        ) ch
        where (select count(*) from (
                 select distinct w from regexp_split_to_table(lower(t.question), '[^a-z@]+') w where length(w) >= 5
               ) mots where ch.txt ilike '%' || mots.w || '%') >= 2)
    then 'a_revoir'
    else 'ok' end;
$$;
revoke execute on function public.entrainement_statut(public.bot_questions_types) from public, anon;

create or replace function public.entrainement_liste()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'réservé à l''admin' using errcode = '42501'; end if;
  return coalesce((
    select jsonb_agg(to_jsonb(t) || jsonb_build_object('statut', public.entrainement_statut(t))
                     order by t.priorite nulls last, t.nb desc, t.cree_at)
      from public.bot_questions_types t), '[]'::jsonb);
end;
$$;
revoke execute on function public.entrainement_liste() from public, anon;
grant execute on function public.entrainement_liste() to authenticated;

-- ✅ / ✏️ / ⚡ / ↗ : une entrée validée du catalogue par version (mise à jour si elle existe déjà).
create or replace function public.entrainement_decider(p_id uuid, p_choix text, p_args jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  t public.bot_questions_types;
  v_formulations text[];
  v_ids uuid[] := '{}';
  v_id uuid;
  v_meme boolean := coalesce((p_args->>'meme')::boolean, false);
  v_up text := nullif(btrim(coalesce(p_args->>'reponse_upwork', '')), '');
  v_ru text := nullif(btrim(coalesce(p_args->>'reponse_ruul', '')), '');
  v_rep text := nullif(btrim(coalesce(p_args->>'reponse', '')), '');
  v_action text := nullif(btrim(coalesce(p_args->>'action', '')), '');
  v_vers text := coalesce(nullif(p_args->>'vers', ''), 'adrien');
  v_niveau text := 'bot';
  v_versions jsonb := '[]'::jsonb;
  x jsonb;
  i integer := 0;
begin
  if not public.is_admin() then raise exception 'réservé à l''admin' using errcode = '42501'; end if;
  select * into t from public.bot_questions_types where id = p_id;
  if not found then return jsonb_build_object('ok', false, 'error', 'question introuvable'); end if;
  if p_choix not in ('ok', 'corriger', 'action', 'escalader') then return jsonb_build_object('ok', false, 'error', 'choix inconnu'); end if;

  select coalesce(array_agg(distinct left(e->>'texte', 300)) filter (where coalesce(e->>'texte', '') <> ''), '{}')
    into v_formulations from jsonb_array_elements(t.exemples) e;

  if p_choix = 'ok' then
    if coalesce(btrim(t.reponse_actuelle), '') = '' then return jsonb_build_object('ok', false, 'error', 'pas de réponse actuelle : corrige-la'); end if;
    v_versions := jsonb_build_array(jsonb_build_object('portee', 'tous', 'reponse', t.reponse_actuelle));
  elsif p_choix = 'corriger' then
    if v_meme then
      if coalesce(v_up, v_ru) is null then return jsonb_build_object('ok', false, 'error', 'réponse vide'); end if;
      v_versions := jsonb_build_array(jsonb_build_object('portee', 'tous', 'reponse', coalesce(v_up, v_ru)));
    else
      if v_up is null and v_ru is null then return jsonb_build_object('ok', false, 'error', 'réponse vide'); end if;
      if v_up is not null then v_versions := v_versions || jsonb_build_object('portee', 'upwork', 'reponse', v_up); end if;
      if v_ru is not null then v_versions := v_versions || jsonb_build_object('portee', 'ruul', 'reponse', v_ru); end if;
    end if;
  elsif p_choix = 'action' then
    if v_action not in ('lien_mot_de_passe', 'pseudo_tiktok', 'email_ruul', 'invitation_ruul', 'arret', 'renvoi_parrainage', 'lien_slack', 'prevenir_max') then
      return jsonb_build_object('ok', false, 'error', 'action inconnue');
    end if;
    if v_rep is null then return jsonb_build_object('ok', false, 'error', 'réponse au posteur obligatoire'); end if;
    v_versions := jsonb_build_array(jsonb_build_object('portee', 'tous', 'reponse', v_rep));
  else
    if v_vers not in ('adrien', 'max') then return jsonb_build_object('ok', false, 'error', 'escalader vers adrien ou max'); end if;
    v_niveau := v_vers;
    v_versions := jsonb_build_array(jsonb_build_object('portee', 'tous', 'reponse', coalesce(v_rep, 'We''re checking, you''ll get an answer today.')));
  end if;

  -- Les entrées déjà créées par un entraînement précédent : mises à jour (dans l'ordre), les autres désactivées.
  for x in select * from jsonb_array_elements(v_versions) loop
    i := i + 1;
    v_id := t.entree_ids[i];
    if v_id is not null and exists (select 1 from public.reponses_officielles where id = v_id) then
      update public.reponses_officielles
         set question = left(t.question, 300), reponse = left(x->>'reponse', 2000), portee = x->>'portee', categorie = t.categorie,
             formulations = v_formulations, action = case when p_choix = 'action' then v_action end, niveau = v_niveau,
             actif = true, valide_at = now(), valide_par = auth.uid(), maj_at = now()
       where id = v_id;
    else
      insert into public.reponses_officielles (question, reponse, portee, categorie, formulations, action, niveau, actif, valide_at, valide_par, cree_par, ordre)
      values (left(t.question, 300), left(x->>'reponse', 2000), x->>'portee', t.categorie, v_formulations,
              case when p_choix = 'action' then v_action end, v_niveau, true, now(), auth.uid(), auth.uid(),
              coalesce((select max(ordre) + 1 from public.reponses_officielles), 1))
      returning id into v_id;
    end if;
    v_ids := v_ids || v_id;
  end loop;
  update public.reponses_officielles set actif = false, maj_at = now()
   where id = any(t.entree_ids) and not (id = any(v_ids));

  update public.bot_questions_types
     set choix = p_choix, entree_ids = v_ids, entraine_at = now(), entraine_par = auth.uid(), maj_at = now(),
         reponse_upwork = case when p_choix = 'corriger' then v_up else reponse_upwork end,
         reponse_ruul = case when p_choix = 'corriger' then coalesce(v_ru, case when v_meme then v_up end) else reponse_ruul end,
         action = case when p_choix = 'action' then v_action end,
         action_bot = case when p_choix = 'action' then nullif(p_args->>'bot', '') end,
         escalade_vers = case when p_choix = 'escalader' then v_vers end
   where id = p_id;
  return jsonb_build_object('ok', true, 'entrees', to_jsonb(v_ids));
end;
$$;
revoke execute on function public.entrainement_decider(uuid, text, jsonb) from public, anon;
grant execute on function public.entrainement_decider(uuid, text, jsonb) to authenticated;

-- Actions possibles : actif (réglage bot_actions_actives ; absent = actif) et fois sur 7 jours.
create or replace function public.entrainement_actions()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_reg jsonb := coalesce((select valeur from public.reglages where cle = 'bot_actions_actives'), '{}'::jsonb);
  v_depuis timestamptz := now() - interval '7 days';
begin
  if not public.is_admin() then raise exception 'réservé à l''admin' using errcode = '42501'; end if;
  return (
    select jsonb_agg(jsonb_build_object('action', a.action, 'libelle', a.libelle, 'bot', a.bot,
             'actif', coalesce((v_reg->>a.action)::boolean, true),
             'fois_7j', (select count(*) from public.support_demandes d where d.cree_at >= v_depuis and d.action_faite ilike a.motif)
                        + case when a.bot_action is null then 0
                               else (select count(*) from public.bot_actions b where b.at >= v_depuis and b.action = a.bot_action and b.statut = 'fait') end)
           order by a.ordre)
      from (values
        (1, 'pseudo_tiktok', 'Changer le @ TikTok', 'cerveau support', 'pseudo tiktok :%@%', null),
        (2, 'lien_mot_de_passe', 'Renvoyer le mot de passe', 'cerveau support · new_cohort_bot', '%mot de passe%', 'resend_password_link'),
        (3, 'lien_slack', 'Renvoyer le lien Slack', 'cerveau support · new_cohort_bot', 'lien slack%', 'relink_slack'),
        (4, 'email_ruul', 'Changer l''email Ruul', 'cerveau support → ruul_bot', 'fait par le bot : nouvelle adresse%', null),
        (5, 'invitation_ruul', 'Réinviter sur Ruul (2 au plus)', 'ruul_bot', '%réinviter dans ruul%', null),
        (6, 'arret', 'Transmettre un arrêt (STOP)', 'cerveau support · control_bot', 'arrêt transmis%', 'stop'),
        (7, 'renvoi_parrainage', 'Renvoyer un parrainage', 'cerveau support · pay_bot', 'parrainage :%', null),
        (8, 'prevenir_max', 'Prévenir Max d''un bug', 'cerveau support', 'max prévenu%', null)
      ) a(ordre, action, libelle, bot, motif, bot_action));
end;
$$;
revoke execute on function public.entrainement_actions() from public, anon;
grant execute on function public.entrainement_actions() to authenticated;

create or replace function public.entrainement_action_activer(p_action text, p_actif boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'réservé à l''admin' using errcode = '42501'; end if;
  if p_action not in ('pseudo_tiktok', 'lien_mot_de_passe', 'lien_slack', 'email_ruul', 'invitation_ruul', 'arret', 'renvoi_parrainage', 'prevenir_max') then
    return jsonb_build_object('ok', false, 'error', 'action inconnue');
  end if;
  update public.reglages
     set valeur = coalesce(valeur, '{}'::jsonb) || jsonb_build_object(p_action, p_actif), updated_at = now()
   where cle = 'bot_actions_actives';
  return jsonb_build_object('ok', true);
end;
$$;
revoke execute on function public.entrainement_action_activer(text, boolean) from public, anon;
grant execute on function public.entrainement_action_activer(text, boolean) to authenticated;

-- En direct : les demandes du jour (Paris) et ce qui s'est passé.
create or replace function public.entrainement_direct()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_jour timestamptz := (date_trunc('day', now() at time zone 'Europe/Paris')) at time zone 'Europe/Paris';
begin
  if not public.is_admin() then raise exception 'réservé à l''admin' using errcode = '42501'; end if;
  return (
    with j as (
      select d.id, d.cree_at, d.source, d.texte, d.niveau, d.statut, d.action_faite, d.bot_reponse, d.ticket_at, d.remonte_par,
             d.regle_par_bot, d.bot_responsable,
             coalesce(nullif(btrim(concat_ws(' ', p.prenom, left(p.nom, 1) || '.')), ''), d.slack_user, d.email_de, '?') as nom,
             case
               when d.action_faite ~* '(erreur|rien changé|pas changé|introuvable|désactivée|pas prévenu)' then 'bloque'
               when d.niveau in ('adrien', 'max') or d.remonte_par is not null or d.ticket_at is not null then 'escalade'
               when d.action_faite is not null and d.action_faite <> 'aucune action' then 'action'
               else 'repondu' end as issue
        from public.support_demandes d left join public.profiles p on p.id = d.poster_id
       where d.cree_at >= v_jour
    )
    select jsonb_build_object(
      'compteurs', jsonb_build_object(
        'repondu', (select count(*) from j where issue = 'repondu'),
        'action', (select count(*) from j where issue = 'action'),
        'escalade', (select count(*) from j where issue = 'escalade'),
        'bloque', (select count(*) from j where issue = 'bloque')),
      'fil', coalesce((select jsonb_agg(to_jsonb(j) order by j.cree_at desc) from (select * from j order by cree_at desc limit 40) j), '[]'::jsonb)));
end;
$$;
revoke execute on function public.entrainement_direct() from public, anon;
grant execute on function public.entrainement_direct() to authenticated;
