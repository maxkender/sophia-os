-- 0532 — Qualité des propositions des bots (04/11).
--
-- 1. Une seule carte par posteur et par sujet : probleme_sujet() donne le sujet
--    d'une carte (login, slack, tiktok, stop, ou sa catégorie) ; « creer » d'un
--    bot fusionne dans la carte ouverte du même posteur et du même sujet (la
--    source s'ajoute, la proposition est mise à jour). Les doublons ouverts
--    sont fusionnés maintenant (problemes_fusionner_doublons) : la carte gardée
--    reçoit les sources des autres, qui sont fermées « fusionné dans … ».
-- 2. Messages : les 15 derniers messages Upwork et Slack (#questions et ses
--    fils, plus les messages Slack envoyés par l'OS), avec le canal, l'auteur
--    (posteur, hm, max, os) et l'heure ; « dernier message sans réponse »
--    (texte, canal, depuis combien d'heures, question ou non). Dans « lire » et
--    sur la carte.
-- 3. mark_read refusé quand le dernier message du posteur est une question ou
--    un problème sans réponse : « question sans réponse : propose une réponse ».
-- 4. a_traiter : une carte ouverte depuis plus de 6 h sans proposition d'un bot
--    (ou dont le posteur a réécrit depuis la proposition du bot, il y a plus de
--    6 h) passe en tête de « lire » avec a_traiter = true.
--
-- Additif : des fonctions ; probleme_bot, probleme_bot_lire et problemes_liste
-- patchées en place. Les doublons sont fermés (statut ferme_auto), jamais supprimés.

-- Le sujet d'une carte : deux cartes du même posteur et du même sujet n'en font qu'une.
create or replace function public.probleme_sujet(p_categorie text, p_texte text, p_etape text default null)
returns text
language sql
immutable
as $$
  select case
    when p_categorie in ('paie', 'kill_contrat', 'stop', 'menace', 'hors_plateforme', 'suspect', 'offre_hm_incorrecte',
                         'compte_bloque', 'bug_dashboard', 'low_views', 'demande_2e_compte', 'retirer_slack', 'accueil',
                         'zero_post', 'pas_poste_aujourdhui', 'absence', 'avis_upwork', 'contrat_hm', 'upwork_mauvais_compte') then p_categorie
    when p_categorie = 'login' then 'login'
    when p_categorie = 'slack' then 'slack'
    when p_categorie = 'tiktok_setup' then 'tiktok'
    when p_categorie in ('question_bloquante', 'autre', 'bloque_etape') then coalesce(
      case lower(coalesce(p_etape, ''))
        when 'login' then 'login' when 'slack' then 'slack' when 'tiktok' then 'tiktok' when 'warmup' then 'tiktok' end,
      case when coalesce(p_texte, '') ~* '(^|\s)stop\M|end the collaboration|don.?t want to continue|demand\w* (l.)?arr[eê]t' then 'stop'
           when coalesce(p_texte, '') ~* 'tiktok|warm.?up|handle|abonn|follow' then 'tiktok'
           when coalesce(p_texte, '') ~* 'slack' then 'slack'
           when coalesce(p_texte, '') ~* 'password|mot de passe|log ?in|connexion|sign ?in|se connecter' then 'login' end,
      p_categorie)
    else p_categorie end;
$$;

-- La carte ouverte du même posteur et du même sujet (null : aucune).
create or replace function public.probleme_fusion_cible(p_poster uuid, p_categorie text, p_texte text, p_etape text default null)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select p.id from public.problemes p
   where p_poster is not null and p.poster_id = p_poster and p.statut = 'ouvert' and p.question is null
     and coalesce(p.sujet, 'posteur') = 'posteur' and p.categorie not in ('paie', 'kill_contrat')
     and p_categorie not in ('paie', 'kill_contrat')
     and public.probleme_sujet(p.categorie, concat_ws(' ', p.resume, p.diagnostic))
         = public.probleme_sujet(p_categorie, p_texte, p_etape)
   order by (p.kill_samedi_lundi is not null or p.rituel_choix is not null) desc,
            (p.categorie in ('login', 'slack', 'tiktok_setup')) desc, p.created_at
   limit 1;
$$;
revoke all on function public.probleme_fusion_cible(uuid, text, text, text) from public, anon, authenticated;

-- Ajoute une source à une carte existante (fusion).
create or replace function public.probleme_fusionner_source(p_id uuid, p_type text, p_ref text, p_texte text, p_par text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.problemes
     set sources = sources || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
                     'type', p_type, 'ref', p_ref, 'at', now(), 'texte', left(p_texte, 500), 'par', p_par))),
         maj_at = now(),
         journal = journal || jsonb_build_object('at', now(), 'par', p_par, 'action', 'fusion', 'ref', p_ref)
   where id = p_id;
  insert into public.problemes_sources (type, ref, probleme_id, poster_id, texte, recu_at)
  select p_type, p_ref, p_id, p.poster_id, left(p_texte, 500), now() from public.problemes p where p.id = p_id
  on conflict do nothing;
end;
$$;
revoke all on function public.probleme_fusionner_source(uuid, text, text, text, text) from public, anon, authenticated;

-- Les doublons ouverts : fusionnés dans une seule carte par posteur et par sujet.
create or replace function public.problemes_fusionner_doublons()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  g record;
  r record;
  v_garde uuid;
  n int := 0;
  v_liste jsonb := '[]'::jsonb;
begin
  if coalesce(auth.role(), '') not in ('', 'service_role') and not public.is_admin() then
    raise exception 'problemes_fusionner_doublons : réservé à l''admin' using errcode = '42501';
  end if;
  for g in
    select p.poster_id, public.probleme_sujet(p.categorie, concat_ws(' ', p.resume, p.diagnostic)) as sujet
      from public.problemes p
     where p.statut = 'ouvert' and p.poster_id is not null and p.question is null
       and coalesce(p.sujet, 'posteur') = 'posteur' and p.categorie not in ('paie', 'kill_contrat')
     group by 1, 2 having count(*) > 1
  loop
    select p.id into v_garde from public.problemes p
     where p.poster_id = g.poster_id and p.statut = 'ouvert' and p.question is null
       and coalesce(p.sujet, 'posteur') = 'posteur' and p.categorie not in ('paie', 'kill_contrat')
       and public.probleme_sujet(p.categorie, concat_ws(' ', p.resume, p.diagnostic)) = g.sujet
     order by (p.kill_samedi_lundi is not null or p.rituel_choix is not null) desc,
              (p.categorie in ('login', 'slack', 'tiktok_setup')) desc, p.created_at
     limit 1;
    for r in select * from public.problemes p
              where p.poster_id = g.poster_id and p.statut = 'ouvert' and p.id <> v_garde and p.question is null
                and coalesce(p.sujet, 'posteur') = 'posteur' and p.categorie not in ('paie', 'kill_contrat')
                and public.probleme_sujet(p.categorie, concat_ws(' ', p.resume, p.diagnostic)) = g.sujet loop
      update public.problemes k
         set sources = k.sources || r.sources,
             niveau = case when r.niveau = 'urgent' or k.niveau = 'urgent' then 'urgent'
                           when r.niveau = 'aujourdhui' or k.niveau = 'aujourdhui' then 'aujourdhui' else k.niveau end,
             proposition_reponse = coalesce(k.proposition_reponse, r.proposition_reponse),
             proposition_action = coalesce(k.proposition_action, r.proposition_action),
             diagnostic = coalesce(k.diagnostic, r.diagnostic),
             maj_at = now(),
             journal = k.journal || jsonb_build_object('at', now(), 'par', 'os', 'action', 'fusion', 'depuis', r.id, 'categorie', r.categorie)
       where k.id = v_garde;
      update public.problemes_sources s set probleme_id = v_garde where s.probleme_id = r.id;
      update public.problemes
         set statut = 'ferme_auto', ferme_at = now(), maj_at = now(),
             ferme_raison = 'fusionné dans la carte ' || left(v_garde::text, 8) || ' (même sujet : ' || g.sujet || ')',
             journal = journal || jsonb_build_object('at', now(), 'par', 'os', 'action', 'fusionne_dans', 'vers', v_garde)
       where id = r.id;
      n := n + 1;
      v_liste := v_liste || jsonb_build_object('poster_id', g.poster_id, 'sujet', g.sujet, 'garde', v_garde, 'ferme', r.id, 'categorie', r.categorie);
    end loop;
  end loop;
  return jsonb_build_object('fusionnes', n, 'detail', v_liste);
end;
$$;
revoke all on function public.problemes_fusionner_doublons() from public, anon;
grant execute on function public.problemes_fusionner_doublons() to authenticated;

-- 2. Les 15 derniers messages Upwork et Slack, avec le canal, l'auteur et l'heure.
create or replace function public.probleme_messages(p_poster uuid, p_n int default 15)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with moi as (select pr.slack_user_id as su from public.profiles pr where pr.id = p_poster),
  slack_posteur as (
    select sm.canal, sm.ts, coalesce(sm.fil_ts, sm.ts) as fil from public.slack_messages sm, moi where sm.slack_user = moi.su
  ),
  m as (
    select um.at, 'upwork'::text as canal,
           case um.role when 'posteur' then 'posteur' when 'hm' then 'hm' when 'max' then 'max' when 'nous' then 'max' else 'os' end as auteur,
           left(um.texte, 1000) as texte
      from public.upwork_messages um where um.poster_id = p_poster
    union all
    -- Slack (#questions et les autres canaux suivis) : ses messages, et les réponses dans ses fils.
    select sm.at, 'slack',
           case when sm.slack_user = (select su from moi) then 'posteur'
                when exists (select 1 from public.profiles x where x.slack_user_id = sm.slack_user and x.id = 'dde5916a-89b8-4fc3-897b-dc7f0d88e20e') then 'max'
                when exists (select 1 from public.profiles x join public.user_roles ur on ur.user_id = x.id
                              where x.slack_user_id = sm.slack_user and ur.role::text in ('hiring_manager', 'head_of_ops', 'admin')) then 'hm'
                else 'os' end,
           left(sm.texte, 1000)
      from (select sm.* from public.slack_messages sm where sm.slack_user = (select su from moi)
            union
            select sm.* from public.slack_messages sm
             where sm.fil_ts in (select s.fil from slack_posteur s) and sm.slack_user is distinct from (select su from moi)) sm
    union all
    -- Ce que l'OS a envoyé sur Slack (DM : relances, nudges).
    select n.envoye_at, 'slack_dm', 'os', left(n.texte, 1000)
      from public.nudges n where n.poster_id = p_poster and n.canal = 'slack' and n.envoye_at is not null and n.texte is not null
  )
  select coalesce(jsonb_agg(jsonb_build_object('at', x.at, 'canal', x.canal, 'auteur', x.auteur, 'texte', x.texte) order by x.at desc), '[]'::jsonb)
    from (select * from m where m.at is not null order by m.at desc limit greatest(1, least(coalesce(p_n, 15), 50))) x;
$$;
revoke all on function public.probleme_messages(uuid, int) from public, anon, authenticated;

-- Une question ou un problème (pas « merci », « ok, c'est fait »).
create or replace function public.texte_est_question(p_texte text)
returns boolean
language sql
immutable
as $$
  select coalesce(p_texte, '') ~ '\?'
      or coalesce(p_texte, '') ~* '\m(help|problem|issue|error|can.?t|cannot|unable|not working|doesn.?t work|don.?t understand|stuck|blocked|wrong|missing|not paid|haven.?t (been )?paid|how (do|can|to|should)|where (is|are|do|can)|why|what (do|should)|aide|probl[eè]me|erreur|bloqu|comment|pourquoi|o[uù] (est|sont))\M';
$$;

-- Le dernier message, s'il vient du posteur (sans réponse après lui, tous canaux confondus).
create or replace function public.probleme_sans_reponse(p_poster uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select case when d->>'auteur' = 'posteur' then jsonb_build_object(
           'texte', left(d->>'texte', 500), 'canal', d->>'canal', 'at', d->>'at',
           'depuis_heures', round(extract(epoch from (now() - (d->>'at')::timestamptz)) / 3600.0, 1),
           'question', public.texte_est_question(d->>'texte')) end
    from (select public.probleme_messages(p_poster, 1)->0 as d) x;
$$;
revoke all on function public.probleme_sans_reponse(uuid) from public, anon, authenticated;

-- 3. mark_read refusé quand une question du posteur attend une réponse.
create or replace function public.probleme_mark_read_verifier(p_poster uuid, p_action text)
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  s jsonb;
begin
  if p_poster is null or coalesce(p_action, '') not in ('mark_read') then return; end if;
  s := public.probleme_sans_reponse(p_poster);
  if s is not null and coalesce((s->>'question')::boolean, false) then
    raise exception 'question sans réponse : propose une réponse (dernier message %, il y a % h : « % »)',
      s->>'canal', s->>'depuis_heures', left(s->>'texte', 120);
  end if;
end;
$$;
revoke all on function public.probleme_mark_read_verifier(uuid, text) from public, anon, authenticated;

-- 4. À traiter : ouverte depuis plus de 6 h sans proposition d'un bot, ou le posteur a réécrit
--    depuis la proposition du bot (il y a plus de 6 h). Jamais une décision de Max ni un rituel prévu.
create or replace function public.probleme_a_traiter(p_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select p.statut = 'ouvert' and p.question is null and p.kill_samedi_lundi is null and p.rituel_choix is null
           and case when p.propose_par in ('new_cohort_bot', 'control_bot', 'pay_bot')
                    then p.propose_at < now() - interval '6 hours'
                         and exists (select 1 from public.upwork_messages um
                                      where um.poster_id = p.poster_id and um.role = 'posteur' and um.at > p.propose_at)
                    else p.created_at < now() - interval '6 hours' end
      from public.problemes p where p.id = p_id), false);
$$;
revoke all on function public.probleme_a_traiter(uuid) from public, anon, authenticated;

-- « lire » : 15 messages, le dernier sans réponse, a_traiter en tête.
do $p$
declare
  v_def text := pg_get_functiondef('public.probleme_bot_lire(text,uuid)'::regprocedure);
  v_a1 text := $q$else public.probleme_messages(o.poster_id, case when p_probleme is null then 5 else 20 end) end))$q$;
  v_a2 text := $q$             order by o.created_at)$q$;
  v_a3 text := $q$'sujet', o.sujet,$q$;
begin
  if position(v_a1 in v_def) = 0 or position(v_a2 in v_def) = 0 or position(v_a3 in v_def) = 0 then
    raise exception '0532 : probleme_bot_lire ne correspond pas';
  end if;
  v_def := replace(v_def, v_a1, $q$else public.probleme_messages(o.poster_id, 15) end,
                                              'sans_reponse', case when o.poster_id is not null then public.probleme_sans_reponse(o.poster_id) end))$q$);
  v_def := replace(v_def, v_a2, $q$             order by public.probleme_a_traiter(o.id) desc,
                      case o.niveau when 'urgent' then 0 when 'aujourdhui' then 1 else 2 end, o.created_at)$q$);
  v_def := replace(v_def, v_a3, $q$'a_traiter', public.probleme_a_traiter(o.id), 'sujet', o.sujet,$q$);
  execute v_def;
end;
$p$;

-- probleme_bot : fusion dans la carte du même sujet ; mark_read refusé sur une question sans réponse.
do $p$
declare
  v_def text := pg_get_functiondef('public.probleme_bot(text,text,jsonb)'::regprocedure);
  v_a1 text := $q$        raise exception 'reponse, action, diagnostic ou question obligatoire';
      end if;$q$;
  v_a2 text := $q$      v_ref := p_bot || ':' || gen_random_uuid()::text;
      v_id := public.probleme_ajouter('bot', v_ref, v_poster, v_contrat, p_args->>'categorie', p_args->>'resume',
                                      p_args->>'texte', now(), nullif(p_args->>'lien', ''), null, p_bot);$q$;
begin
  if position(v_a1 in v_def) = 0 or position(v_a2 in v_def) = 0 then
    raise exception '0532 : probleme_bot ne correspond pas';
  end if;
  v_def := replace(v_def, v_a1, v_a1 || $q$
      -- 0532 : pas de « lu » sur une question sans réponse.
      perform public.probleme_mark_read_verifier((select x.poster_id from public.problemes x where x.id = v_id), v_action);$q$);
  v_def := replace(v_def, v_a2, $q$      perform public.probleme_mark_read_verifier(v_poster, v_action);
      v_ref := p_bot || ':' || gen_random_uuid()::text;
      -- 0532 : une seule carte par posteur et par sujet : fusion dans la carte ouverte.
      v_id := public.probleme_fusion_cible(v_poster, p_args->>'categorie',
                                           concat_ws(' ', p_args->>'resume', p_args->>'texte', p_args->>'diagnostic'), p_args->>'etape');
      if v_id is not null then
        perform public.probleme_fusionner_source(v_id, 'bot', v_ref, coalesce(p_args->>'texte', p_args->>'resume'), p_bot);
      else
        v_id := public.probleme_ajouter('bot', v_ref, v_poster, v_contrat, p_args->>'categorie', p_args->>'resume',
                                        p_args->>'texte', now(), nullif(p_args->>'lien', ''), null, p_bot);
      end if;$q$);
  execute v_def;
end;
$p$;

-- La carte : les 15 messages et le dernier sans réponse.
do $p$
declare
  v_def text := pg_get_functiondef('public.problemes_liste(text)'::regprocedure);
  v_a text := $q$'rituel_choix', p.rituel_choix, 'rituel_lundi', p.rituel_lundi,$q$;
begin
  if position(v_a in v_def) = 0 then raise exception '0532 : problemes_liste ne correspond pas'; end if;
  execute replace(v_def, v_a, v_a || $q$
             'messages', case when p_vue = 'ouverts' and p.poster_id is not null then public.probleme_messages(p.poster_id, 15) end,
             'sans_reponse', case when p_vue = 'ouverts' and p.poster_id is not null then public.probleme_sans_reponse(p.poster_id) end,$q$);
end;
$p$;

notify pgrst, 'reload schema';
