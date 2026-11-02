-- 0517 — Page « Problèmes » (remplace Needs you), bloc C du 2/11.
--
-- Un problème = un posteur (ou un contrat, ou une source sans posteur) × une
-- catégorie ; un seul ouvert à la fois (C2), toute nouvelle source s'y ajoute.
-- Rien n'est envoyé ni exécuté ici : la collecte et la fermeture auto
-- (toutes les 30 min) n'écrivent que dans `problemes` et `problemes_sources`.
-- Les anciennes tables (a_faire, contestations, demandes_arret,
-- posteur_reponses, accueils…) ne sont pas modifiées : copie additive (C13).
--
-- Additif : 3 tables, 1 vue, des fonctions, 1 cron, 3 réglages (mode test,
-- résumé Slack OFF, envoi auto OFF). Aucune ligne existante modifiée.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table if not exists public.problemes (
  id                  uuid primary key default gen_random_uuid(),
  poster_id           uuid references public.profiles(id) on delete set null,
  contrat_id          text,
  hm                  text,
  cle_groupe          text not null,
  categorie           text not null,
  niveau              text not null check (niveau in ('urgent', 'aujourdhui', 'samedi')),
  niveau_force        boolean not null default false,
  resume              text not null,
  sources             jsonb not null default '[]'::jsonb,
  proprietaire        text not null check (proprietaire in ('new_cohort_bot', 'control_bot', 'pay_bot')),
  proposition_reponse text,
  canal_reponse       text check (canal_reponse is null or canal_reponse in ('upwork', 'slack')),
  proposition_action  text,
  propose_par         text,
  propose_at          timestamptz,
  statut              text not null default 'ouvert' check (statut in ('ouvert', 'valide', 'ignore', 'ferme_auto')),
  ferme_raison        text,
  ferme_at            timestamptz,
  ferme_par           uuid,
  journal             jsonb not null default '[]'::jsonb,
  created_at          timestamptz not null default now(),
  maj_at              timestamptz not null default now()
);
create unique index if not exists problemes_un_ouvert on public.problemes (cle_groupe, categorie) where statut = 'ouvert';
create index if not exists problemes_statut_niveau on public.problemes (statut, niveau);
create index if not exists problemes_poster on public.problemes (poster_id);
alter table public.problemes enable row level security;

-- Chaque source vue une fois : rattachée à un problème, ou archivée comme bruit (C4).
create table if not exists public.problemes_sources (
  type        text not null,
  ref         text not null,
  probleme_id uuid references public.problemes(id) on delete set null,
  poster_id   uuid,
  texte       text,
  recu_at     timestamptz,
  archive     boolean not null default false,
  raison      text,
  vu_at       timestamptz not null default now(),
  primary key (type, ref)
);
create index if not exists problemes_sources_archive on public.problemes_sources (archive, vu_at desc);
alter table public.problemes_sources enable row level security;

-- B4 (contrôle des offres) : la table offres_alertes est créée par 0516 ; lue ici si elle existe.

-- C8 : le journal des appels des bots (200 par jour et par bot).
create table if not exists public.bot_appels (
  id          uuid primary key default gen_random_uuid(),
  bot         text not null,
  at          timestamptz not null default now(),
  action      text,
  probleme_id uuid,
  ok          boolean not null,
  erreur      text,
  args        jsonb
);
create index if not exists bot_appels_bot_at on public.bot_appels (bot, at desc);
alter table public.bot_appels enable row level security;

do $p$
begin
  if not exists (select 1 from pg_policies where tablename = 'problemes' and policyname = 'problemes_admin') then
    create policy problemes_admin on public.problemes for select to authenticated using (public.is_admin());
  end if;
  if not exists (select 1 from pg_policies where tablename = 'problemes_sources' and policyname = 'problemes_sources_admin') then
    create policy problemes_sources_admin on public.problemes_sources for select to authenticated using (public.is_admin());
  end if;
  if not exists (select 1 from pg_policies where tablename = 'bot_appels' and policyname = 'bot_appels_admin') then
    create policy bot_appels_admin on public.bot_appels for select to authenticated using (public.is_admin());
  end if;
end
$p$;

-- Réglages : mode test (C12), résumé Slack OFF (C11), envoi auto OFF par catégorie (C12).
insert into public.reglages (cle, valeur, updated_at) values
  ('problemes_mode', to_jsonb('test'::text), now()),
  ('problemes_resume_slack', to_jsonb('off'::text), now()),
  ('problemes_envoi_auto', '{}'::jsonb, now())
on conflict (cle) do nothing;

-- ---------------------------------------------------------------------------
-- Règles pures : bruit (C4), catégorie d'un message, niveau (C5)
-- ---------------------------------------------------------------------------
create or replace function public.probleme_bruit(p_texte text)
returns boolean
language sql
immutable
as $$
  with t as (
    select btrim(regexp_replace(regexp_replace(lower(coalesce(p_texte, '')), '[^[:alnum:][:space:]'']+', ' ', 'g'), '[[:space:]]+', ' ', 'g')) as n
  )
  select coalesce(btrim(p_texte), '') = ''
      -- emojis ou ponctuation seuls (un « ? » seul n'est pas du bruit)
      or (p_texte !~ '[[:alnum:]]' and p_texte !~ '\?')
      or (length(n) <= 45 and p_texte !~ '\?' and n ~ (
           '^((hi|hello|hey|dear [a-z]+)( [a-z]+)? )?'
           || '(ok|okay|okey|okk|k|kk|alright|noted|got it|sure|perfect|great|good|nice|cool|'
           || 'done|all done|week done|weekly done|completed|complete|finished|submitted|'
           || 'thanks|thank you|thankyou|thx|ty|many thanks|merci|'
           || 'i (have )?(finished|completed|done)( (posting|all( the)? posts|my posts|the posts))?( for (this|the) week)?)'
           || '( (so much|very much|a lot|again|sir|team|you))*'
           || '( for (the|your|this|my|all|everything|job|the job)( [a-z'']+){0,4})?$'))
  from t;
$$;

create or replace function public.probleme_categorie_texte(p_texte text)
returns text
language sql
immutable
as $$
  with t as (select lower(coalesce(p_texte, '')) as x)
  select case
    when x ~ '^\s*stop\W*$'
      or x ~ '(i (would like|want|wish|need|have) to (stop|quit|end|leave|cancel)|end (the|my|our|this) contract|cancel (the|my|this) contract|close (the|my|this) contract|no longer (want|able|interested)|not (going to )?continue|don.?t want to continue|i quit)'
      then 'stop'
    when x ~ '(scam|fraud|lawyer|legal action|report (you|this)|open a dispute|dispute|complain to upwork|upwork support)' then 'menace'
    when x ~ '(whatsapp|telegram|paypal|wise\.com|outside (of )?upwork|off upwork|bank transfer|my (e-?mail|phone|number) is|gmail\.com|instagram dm)' then 'hors_plateforme'
    when x ~ '\m(pay|paid|payment|payments|milestones?|money|salary|refund|invoice|funded|funding|bonus)\M' or x ~ '\$' then 'paie'
    when x ~ '\m(banned|suspended|restricted|blocked|ban)\M' then 'compte_bloque'
    when x ~ '(log ?in|password|sign ?in|can.?t access|cannot access)' then 'login'
    when x ~ '\mslack\M' then 'slack'
    when x ~ '(bug|error|not working|doesn.?t work|does not work|broken|crash|nothing (shows|appears))' then 'bug_dashboard'
    when x ~ '(second account|2nd account|another account|more accounts|extra account)' then 'demande_2e_compte'
    when x ~ '\m(sick|ill|holidays?|vacation|travel(l)?ing|hospital|exams?|away|pause|busy this week)\M' then 'absence'
    when x ~ '\m(review|feedback|rating)\M' then 'avis_upwork'
    when x ~ '(no views|0 views|low views|shadow ?ban|\mviews\M)' then 'low_views'
    when x ~ '(tiktok|tik tok|warm ?up|handle|username|\maccount\M|follow)' then 'tiktok_setup'
    when x ~ '\?' or x ~ '(help|how do i|how to|what should|which one|explain|don.?t understand|confused)' then 'question_bloquante'
    else 'autre'
  end
  from t;
$$;

create or replace function public.probleme_niveau(p_categorie text)
returns text
language sql
immutable
as $$
  select case
    when p_categorie in ('stop', 'paie', 'menace', 'hors_plateforme', 'suspect', 'offre_hm_incorrecte') then 'urgent'
    when p_categorie in ('zero_post', 'demande_2e_compte', 'avis_upwork', 'low_views', 'absence') then 'samedi'
    else 'aujourdhui'
  end;
$$;

-- C6 : paie → pay_bot ; 1re semaine pas finie (cohorte de cette semaine ou suivante, Start Tuesday, Postpone) → new_cohort_bot.
create or replace function public.probleme_proprietaire(p_poster uuid, p_categorie text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
    when p_categorie = 'paie' then 'pay_bot'
    when p_categorie = 'offre_hm_incorrecte' then 'control_bot'
    when exists (select 1 from public.profiles pr where pr.id = p_poster
                  and pr.cohorte_lundi >= date_trunc('week', now() at time zone 'Europe/Paris')::date) then 'new_cohort_bot'
    else 'control_bot'
  end;
$$;

create or replace function public.probleme_action_defaut(p_categorie text)
returns text
language sql
immutable
as $$
  select case p_categorie
    when 'stop' then 'kill'
    when 'paie' then 'open_payroll'
    when 'login' then 'resend_password_link'
    when 'slack' then 'relink_slack'
    when 'tiktok_setup' then 'reread_tiktok'
    when 'retirer_slack' then 'mark_read'
    when 'relance_echec' then 'mark_read'
    else null
  end;
$$;

-- ---------------------------------------------------------------------------
-- Ajouter une source (C2) / l'archiver (C4)
-- ---------------------------------------------------------------------------
create or replace function public.probleme_ajouter(
  p_type text, p_ref text, p_poster uuid, p_contrat text, p_categorie text, p_resume text,
  p_texte text default null, p_at timestamptz default null, p_lien text default null, p_canal text default null,
  p_par text default 'os'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_cle text := coalesce(p_poster::text, case when p_contrat is not null then 'contrat:' || p_contrat end, p_type || ':' || p_ref);
  v_niveau text := public.probleme_niveau(p_categorie);
  v_source jsonb := jsonb_strip_nulls(jsonb_build_object('type', p_type, 'ref', p_ref, 'at', coalesce(p_at, now()),
                      'texte', left(p_texte, 500), 'lien', p_lien, 'canal', p_canal, 'par', p_par));
  v_hm text;
begin
  if exists (select 1 from public.problemes_sources s where s.type = p_type and s.ref = p_ref) then
    return (select s.probleme_id from public.problemes_sources s where s.type = p_type and s.ref = p_ref);
  end if;
  -- Cohorte RUUL exclue.
  if p_poster is not null and exists (select 1 from public.hub_posteurs h where h.profile_id = p_poster) then
    insert into public.problemes_sources (type, ref, poster_id, texte, recu_at, archive, raison)
    values (p_type, p_ref, p_poster, left(p_texte, 500), p_at, true, 'RUUL (exclu)') on conflict do nothing;
    return null;
  end if;
  select nullif(btrim(concat_ws(' ', m.prenom, m.nom)), '') into v_hm
    from public.profiles pr join public.profiles m on m.id = pr.manager_id where pr.id = p_poster;

  insert into public.problemes as p (poster_id, contrat_id, hm, cle_groupe, categorie, niveau, resume, sources, proprietaire,
                                     proposition_action, propose_par, propose_at)
  values (p_poster, coalesce(p_contrat, (select pr.upwork_contract_id from public.profiles pr where pr.id = p_poster)), v_hm,
          v_cle, p_categorie, v_niveau, left(coalesce(nullif(btrim(p_resume), ''), p_categorie), 200), jsonb_build_array(v_source),
          public.probleme_proprietaire(p_poster, p_categorie), public.probleme_action_defaut(p_categorie),
          case when public.probleme_action_defaut(p_categorie) is not null then 'os' end,
          case when public.probleme_action_defaut(p_categorie) is not null then now() end)
  on conflict (cle_groupe, categorie) where statut = 'ouvert' do update
     set sources = p.sources || excluded.sources,
         -- une source plus urgente remonte le problème (même déplacé au samedi)
         niveau = case when excluded.niveau = 'urgent' then 'urgent' else p.niveau end,
         maj_at = now()
  returning p.id into v_id;

  insert into public.problemes_sources (type, ref, probleme_id, poster_id, texte, recu_at)
  values (p_type, p_ref, v_id, p_poster, left(p_texte, 500), p_at) on conflict do nothing;
  return v_id;
end;
$$;
revoke all on function public.probleme_ajouter(text, text, uuid, text, text, text, text, timestamptz, text, text, text) from public, anon, authenticated;

create or replace function public.probleme_archiver(p_type text, p_ref text, p_poster uuid, p_texte text, p_at timestamptz, p_raison text)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.problemes_sources (type, ref, poster_id, texte, recu_at, archive, raison)
  values (p_type, p_ref, p_poster, left(p_texte, 500), p_at, true, p_raison)
  on conflict do nothing;
$$;
revoke all on function public.probleme_archiver(text, text, uuid, text, timestamptz, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Le passage (C3 + C7), toutes les 30 min : collecte puis fermeture auto
-- ---------------------------------------------------------------------------
create or replace function public.problemes_passage()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_vik text := '2074065383597823773';
  v_canal_questions text := (select valeur #>> '{}' from public.reglages where cle = 'slack_questions_canal');
  v_canal_pause text := (select valeur #>> '{}' from public.reglages where cle = 'slack_canal_pause');
  v_nouveaux int := 0;
  v_ajouts int := 0;
  v_bruit int := 0;
  v_fermes int := 0;
  v_avant int;
  v_run uuid := gen_random_uuid();
begin
  if coalesce(auth.role(), '') not in ('', 'service_role') and not public.is_admin() then
    raise exception 'problemes_passage : réservé à l''admin' using errcode = '42501';
  end if;
  select count(*) into v_avant from public.problemes where statut = 'ouvert';
  -- needs_you() lit en service_role (même garde que le badge et l'alerte de 18 h).
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);

  -- Une ligne par source et par passage (run) : jamais de truncate ni de delete.
  create temp table if not exists _src (
    run uuid, type text, ref text, poster_id uuid, contrat_id text, categorie text, resume text, texte text,
    at timestamptz, lien text, canal text, etat boolean
  ) on commit drop;

  -- a. Needs you actuel (a_faire, FAQ, Slack à relier, handles, fermeture, messages pas partis…)
  insert into _src
  select v_run, 'needs_you', n.cle, n.poster_id, null,
         case n.type
           when 'paiement' then 'paie' when 'a_payer_avant_fermeture' then 'paie'
           when 'arret_a_verifier' then 'stop'
           when 'question_faq' then 'question_bloquante' when 'question_hm' then 'question_bloquante'
           when 'slack_non_lie' then 'slack'
           when 'handle_a_valider' then 'tiktok_setup' when 'warmup_introuvable' then 'tiktok_setup'
           when 'message_pas_parti' then 'relance_echec'
           when 'retirer_slack' then 'retirer_slack'
           else 'autre' end,
         coalesce(nullif(btrim(n.vu), ''), nullif(btrim(n.pense), ''), n.type),
         concat_ws(' — ', n.vu, n.pense), n.cree_at, n.lien, null, true
    from public.needs_you() n;

  -- b. Contestations ouvertes → paie
  insert into _src
  select v_run, 'contestation', c.id::text, c.poster_id, null, 'paie', 'Dispute (' || c.type || ') : ' || left(coalesce(c.texte, ''), 120),
         c.texte, c.recu_at, null, c.canal, true
    from public.contestations c where c.statut = 'ouverte';

  -- c. Demandes d'arrêt sans décision → stop
  insert into _src
  select v_run, 'demande_arret', d.id::text, d.poster_id, null, 'stop',
         'Asked to stop (' || d.source || ')' || coalesce(' : ' || left(d.raison, 100), ''), d.raison, d.demande_at, null, null, true
    from public.demandes_arret d where d.decision is null;

  -- d. Accueils en erreur ou à relier (hors classés : HM, autre activité)
  insert into _src
  select v_run, 'accueil', a.contrat_id, a.poster_id, a.contrat_id, 'accueil',
         'Welcome ' || a.statut || ' : ' || coalesce(nullif(btrim(concat_ws(' ', a.prenom, a.nom)), ''), a.contrat_id) || coalesce(' (' || left(a.raison, 80) || ')', ''),
         a.raison, a.updated_at, null, null, true
    from public.accueils a
   where (a.statut = 'erreur' or (a.statut = 'a_relier' and a.classement is null))
     and coalesce(a.organisation_id, v_vik) = v_vik;

  -- e. Relances bloquées (7 derniers jours)
  insert into _src
  select v_run, 'relance_echec', rp.poster_id::text || ':' || rp.type || ':' || rp.periode, rp.poster_id, null, 'relance_echec',
         'Reminder blocked (' || rp.type || ')' || coalesce(' : ' || left(rp.raison, 100), ''), rp.raison, rp.maj_at, null, rp.canal, true
    from public.relances_prevues rp
   where rp.statut = 'bloque' and rp.maj_at > now() - interval '7 days';

  -- f. Écarts de paie : paiements API « à vérifier » (14 derniers jours)
  insert into _src
  select v_run, 'paie_api', pa.id::text, pa.poster_id, pa.contrat_id, 'paie',
         'Payroll API to check (week ' || to_char(pa.semaine, 'DD/MM') || ')' || coalesce(' : ' || left(pa.erreur, 100), ''),
         pa.erreur, pa.updated_at, null, null, true
    from public.paie_paiements_api pa
   where pa.statut = 'a_verifier' and pa.semaine >= (now() at time zone 'Europe/Paris')::date - 14;

  -- g. Alertes d'offres HM (B4, table créée par 0516 : lue seulement si elle existe)
  if to_regclass('public.offres_alertes') is not null then
    execute $q$
      insert into _src
      select $1, 'offre_alerte', o.id::text, o.poster_id, o.contrat_id, 'offre_hm_incorrecte',
             'HM offer' || coalesce(' (' || o.hm_nom || ')', '') || ' : ' || o.motif || coalesce(' — ' || left(o.detail, 120), ''),
             o.detail, o.created_at, null, null, true
        from public.offres_alertes o where o.ferme_at is null
    $q$ using v_run;
  end if;

  -- h. Réponses des posteurs (Upwork VIk Studios, boutons) à classer
  insert into _src
  select v_run, 'reponse', pr.id::text, pr.poster_id, null,
         case when pr.canal = 'bouton' and pr.texte ~* 'help' then 'question_bloquante' else public.probleme_categorie_texte(pr.texte) end,
         left(regexp_replace(pr.texte, '\s+', ' ', 'g'), 140), pr.texte, pr.recu_at, pr.lien, pr.canal, false
    from public.posteur_reponses pr
    left join public.profiles p on p.id = pr.poster_id
    left join public.upwork_contrats uc on uc.contrat_id = p.upwork_contract_id
   where pr.statut = 'a_classer'
     and (pr.canal <> 'upwork' or coalesce(uc.organisation_id, v_vik) = v_vik);

  -- i. Slack #questions et #poster-pause (7 jours, messages des posteurs, hors fils et hors réponses de la FAQ)
  insert into _src
  select v_run, 'slack', sm.canal || ':' || sm.ts, p.id, null,
         case when sm.canal = v_canal_pause then 'absence' else public.probleme_categorie_texte(sm.texte) end,
         left(regexp_replace(coalesce(sm.texte, ''), '\s+', ' ', 'g'), 140), sm.texte, sm.at, null, 'slack', false
    from public.slack_messages sm
    join public.profiles p on p.slack_user_id = sm.slack_user
   where sm.canal in (v_canal_questions, v_canal_pause)
     and sm.at > now() - interval '7 days'
     and (sm.fil_ts is null or sm.fil_ts = sm.ts)
     and not exists (select 1 from public.chatbot_questions q
                      where q.slack_ts = sm.ts and (q.envoye_at is not null or q.reponse_humaine is not null));

  -- Les nouvelles sources : bruit archivé, le reste rattaché (C2, C4)
  for r in
    select s.* from _src s
     where s.run = v_run and not exists (select 1 from public.problemes_sources x where x.type = s.type and x.ref = s.ref)
  loop
    if not r.etat and public.probleme_bruit(r.texte) then
      perform public.probleme_archiver(r.type, r.ref, r.poster_id, r.texte, r.at, 'bruit');
      v_bruit := v_bruit + 1;
    else
      perform public.probleme_ajouter(r.type, r.ref, r.poster_id, r.contrat_id, r.categorie, r.resume, r.texte, r.at, r.lien, r.canal);
      v_ajouts := v_ajouts + 1;
    end if;
  end loop;
  select count(*) - v_avant into v_nouveaux from public.problemes where statut = 'ouvert';

  -- Fermeture auto (C7)
  with base as (
    select p.id, p.categorie, p.created_at, pr.is_active, pr.premiere_connexion_at, pr.slack_user_id, pr.slack_lie_at, p.poster_id,
           (select max((s->>'at')::timestamptz) from jsonb_array_elements(p.sources) s where s->>'type' in ('reponse', 'slack')) as dernier_msg,
           exists (select 1 from jsonb_array_elements(p.sources) s where s->>'type' not in ('reponse', 'slack', 'bot')) as a_etat,
           exists (select 1 from jsonb_array_elements(p.sources) s join _src x on x.run = v_run and x.type = s->>'type' and x.ref = s->>'ref' where x.etat) as etat_ouvert,
           exists (select 1 from jsonb_array_elements(p.sources) s where s->>'type' in ('reponse', 'slack', 'bot')) as a_msg
      from public.problemes p
      left join public.profiles pr on pr.id = p.poster_id
     where p.statut = 'ouvert'
  ),
  reponses as (
    select b.*,
           (select max(um.at) from public.upwork_messages um
             where um.poster_id = b.poster_id and um.role in ('nous', 'os', 'max', 'hm') and um.at > b.dernier_msg) as repondu_at,
           (select max(ps.paye_at) from public.paie_semaines ps where ps.poster_id = b.poster_id) as paye_at,
           (select max(f.finance_at) from public.paie_a_financer f where f.poster_id = b.poster_id) as finance_at,
           (select d.decision from public.demandes_arret d where d.poster_id = b.poster_id and d.decision is not null
             order by d.decide_at desc nulls last limit 1) as decision_arret,
           (select min(w.releve_at) from public.ckd_warmup_releves w join public.comptes c on c.id = w.compte_id
             where c.poster_id = b.poster_id and c.is_active and w.existe) as tiktok_trouve_at
      from base b
  ),
  decision as (
    select rr.id,
      case
        -- posteur désactivé : tout fermé (sauf la paie et le retrait de Slack, qui restent à faire)
        when rr.poster_id is not null and rr.is_active is false and rr.categorie not in ('paie', 'retirer_slack', 'accueil')
          then case when rr.categorie = 'stop' then 'kill fait (posteur désactivé)' else 'posteur désactivé' end
        when rr.etat_ouvert then null
        -- paie : payé ou financé après le dernier message
        when rr.categorie = 'paie' and rr.a_msg and greatest(rr.paye_at, rr.finance_at) > rr.dernier_msg
          then 'paie : payé ou financé après le message'
        -- sources de l'OS toutes réglées, sans message du posteur
        when rr.a_etat and not rr.a_msg then case rr.categorie
            when 'paie' then 'paie : payé, financé ou remboursé (plus rien d''ouvert)'
            when 'stop' then 'stop : décision prise (' || coalesce(rr.decision_arret, '?') || ')'
            when 'retirer_slack' then 'fait'
            when 'accueil' then 'accueil relié ou classé'
            else 'réglé dans l''OS' end
        -- étapes faites après le dernier message
        when rr.categorie = 'login' and rr.premiere_connexion_at > coalesce(rr.dernier_msg, rr.created_at) then 'étape faite (connexion)'
        when rr.categorie = 'slack' and rr.slack_user_id is not null and coalesce(rr.slack_lie_at, rr.created_at) >= coalesce(rr.dernier_msg, rr.created_at) - interval '1 minute'
          then 'étape faite (Slack relié)'
        when rr.categorie = 'tiktok_setup' and rr.tiktok_trouve_at > coalesce(rr.dernier_msg, rr.created_at) then 'étape faite (TikTok trouvé)'
        -- question (et tout le non urgent) : répondu, pas de nouveau message sous 48 h
        when public.probleme_niveau(rr.categorie) <> 'urgent' and rr.a_msg and rr.repondu_at is not null
             and rr.repondu_at < now() - interval '48 hours'
          then 'répondu le ' || to_char(rr.repondu_at at time zone 'Europe/Paris', 'DD/MM HH24:MI') || ', pas de nouveau message sous 48 h'
        else null
      end as raison
      from reponses rr
  )
  update public.problemes p
     set statut = 'ferme_auto', ferme_raison = d.raison, ferme_at = now(), maj_at = now()
    from decision d
   where d.id = p.id and d.raison is not null;
  get diagnostics v_fermes = row_count;

  return jsonb_build_object('sources_ajoutees', v_ajouts, 'nouveaux_problemes', v_nouveaux, 'bruit_archive', v_bruit,
                            'fermes_auto', v_fermes,
                            'ouverts', (select count(*) from public.problemes where statut = 'ouvert'));
end;
$$;
revoke all on function public.problemes_passage() from public, anon;
grant execute on function public.problemes_passage() to authenticated;

do $c$
begin
  if not exists (select 1 from cron.job where jobname = 'problemes-passage') then
    perform cron.schedule('problemes-passage', '7,37 * * * *', 'select public.problemes_passage()');
  end if;
end
$c$;

-- ---------------------------------------------------------------------------
-- La page (C9, C10) : lecture, compteurs, gestes de l'admin
-- ---------------------------------------------------------------------------
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
                            order by c.created_at limit 1))
           order by case p.niveau when 'urgent' then 0 when 'aujourdhui' then 1 else 2 end, p.maj_at desc)
      from public.problemes p
      left join public.profiles pr on pr.id = p.poster_id
     where case when p_vue = 'fermes' then p.statut <> 'ouvert' and coalesce(p.ferme_at, p.maj_at) > now() - interval '7 days'
                else p.statut = 'ouvert' end
  ), '[]'::jsonb);
end;
$$;
revoke all on function public.problemes_liste(text) from public, anon;
grant execute on function public.problemes_liste(text) to authenticated;

create or replace function public.problemes_archives_liste(p_limite int default 200)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'problemes_archives_liste : réservé à l''admin' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(x order by x->>'recu_at' desc nulls last) from (
      select jsonb_build_object('type', s.type, 'ref', s.ref, 'poster_id', s.poster_id,
               'nom', nullif(btrim(concat_ws(' ', pr.prenom, pr.nom)), ''), 'texte', s.texte, 'recu_at', s.recu_at, 'raison', s.raison) as x
        from public.problemes_sources s left join public.profiles pr on pr.id = s.poster_id
       where s.archive
       order by s.recu_at desc nulls last
       limit greatest(1, least(p_limite, 1000))
    ) t
  ), '[]'::jsonb);
end;
$$;
revoke all on function public.problemes_archives_liste(int) from public, anon;
grant execute on function public.problemes_archives_liste(int) to authenticated;

create or replace function public.problemes_compte()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select case when public.is_admin() then jsonb_build_object(
    'urgent', count(*) filter (where niveau = 'urgent'),
    'aujourdhui', count(*) filter (where niveau = 'aujourdhui'),
    'samedi', count(*) filter (where niveau = 'samedi'),
    'total', count(*)) end
    from public.problemes where statut = 'ouvert';
$$;
revoke all on function public.problemes_compte() from public, anon;
grant execute on function public.problemes_compte() to authenticated;

-- Les gestes : modifier la proposition, Samedi, Ignorer, Valider (rien n'est envoyé ici :
-- le navigateur envoie d'abord quand le mode n'est plus « test », et l'argent n'est jamais validé ici).
create or replace function public.probleme_agir(p_id uuid, p_action text, p_valeur jsonb default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  p public.problemes;
  v_mode text := coalesce((select valeur #>> '{}' from public.reglages where cle = 'problemes_mode'), 'test');
  v_entree jsonb := jsonb_build_object('at', now(), 'par', auth.uid(), 'action', p_action, 'valeur', p_valeur, 'mode', v_mode);
begin
  if not public.is_admin() then
    raise exception 'probleme_agir : réservé à l''admin' using errcode = '42501';
  end if;
  select * into p from public.problemes where id = p_id for update;
  if not found then raise exception 'problème introuvable'; end if;
  if p.statut <> 'ouvert' then raise exception 'problème déjà fermé (%)', p.statut; end if;

  if p_action = 'modifier' then
    update public.problemes set
      proposition_reponse = coalesce(p_valeur->>'reponse', proposition_reponse),
      canal_reponse = coalesce(nullif(p_valeur->>'canal', ''), canal_reponse),
      proposition_action = case when p_valeur ? 'action' then nullif(p_valeur->>'action', '') else proposition_action end,
      propose_par = 'admin', propose_at = now(), journal = journal || v_entree, maj_at = now()
     where id = p_id;
  elsif p_action = 'samedi' then
    update public.problemes set niveau = 'samedi', niveau_force = true, journal = journal || v_entree, maj_at = now() where id = p_id;
  elsif p_action = 'ignorer' then
    update public.problemes set statut = 'ignore', ferme_raison = 'ignoré', ferme_at = now(), ferme_par = auth.uid(),
           journal = journal || v_entree, maj_at = now() where id = p_id;
  elsif p_action = 'valider' then
    if p.categorie = 'paie' then
      raise exception 'paie : rien n''est validé ici ; ouvre la ligne de Payroll ou de Who to fund';
    end if;
    -- En mode test, rien n'est parti : on le note.
    update public.problemes set statut = 'valide',
           ferme_raison = case when coalesce((p_valeur->>'envoye')::boolean, false) then 'validé, envoyé' else 'validé (mode ' || v_mode || ' : rien envoyé)' end,
           ferme_at = now(), ferme_par = auth.uid(), journal = journal || v_entree, maj_at = now() where id = p_id;
  else
    raise exception 'action inconnue : %', p_action;
  end if;
  return (select to_jsonb(x) from public.problemes x where x.id = p_id);
end;
$$;
revoke all on function public.probleme_agir(uuid, text, jsonb) from public, anon;
grant execute on function public.probleme_agir(uuid, text, jsonb) to authenticated;

-- « Valider toute la catégorie », sauf pour l'argent.
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
  if p_categorie = 'paie' then
    raise exception 'paie : jamais validée en lot';
  end if;
  update public.problemes set statut = 'valide', ferme_raison = 'validé en lot (mode ' || v_mode || ' : rien envoyé)',
         ferme_at = now(), ferme_par = auth.uid(), maj_at = now(),
         journal = journal || jsonb_build_object('at', now(), 'par', auth.uid(), 'action', 'valider_categorie', 'mode', v_mode)
   where statut = 'ouvert' and niveau = p_niveau and categorie = p_categorie;
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke all on function public.problemes_valider_categorie(text, text) from public, anon;
grant execute on function public.problemes_valider_categorie(text, text) to authenticated;

-- C12 : l'envoi auto par catégorie (OFF par défaut) ; jamais pour l'argent et le sensible.
create or replace function public.problemes_envoi_auto_regler(p_categorie text, p_actif boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v jsonb;
begin
  if not public.is_admin() then
    raise exception 'problemes_envoi_auto_regler : réservé à l''admin' using errcode = '42501';
  end if;
  if p_categorie in ('stop', 'paie', 'menace', 'hors_plateforme', 'suspect', 'contrat_hm', 'offre_hm_incorrecte') then
    raise exception 'catégorie « % » : jamais d''envoi auto', p_categorie;
  end if;
  if p_actif and coalesce((select valeur #>> '{}' from public.reglages where cle = 'problemes_mode'), 'test') = 'test' then
    raise exception 'mode test : l''envoi auto reste coupé';
  end if;
  update public.reglages set valeur = jsonb_set(coalesce(valeur, '{}'::jsonb), array[p_categorie], to_jsonb(p_actif)),
         updated_by = auth.uid(), updated_at = now()
   where cle = 'problemes_envoi_auto'
  returning valeur into v;
  return v;
end;
$$;
revoke all on function public.problemes_envoi_auto_regler(text, boolean) from public, anon;
grant execute on function public.problemes_envoi_auto_regler(text, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- Les bots (C8) : proposer, ou créer pour un posteur existant ; 200 appels / jour / bot
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
  v_erreur text;
  v_ref text;
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
                                                   'open_payroll', 'open_who_to_fund') then
      raise exception 'action « % » refusée', v_action;
    end if;
    if v_canal is not null and v_canal not in ('upwork', 'slack') then
      raise exception 'canal « % » refusé', v_canal;
    end if;

    if p_action = 'proposer' then
      v_id := (p_args->>'probleme_id')::uuid;
      update public.problemes
         set proposition_reponse = coalesce(nullif(btrim(p_args->>'reponse'), ''), proposition_reponse),
             canal_reponse = coalesce(v_canal, canal_reponse),
             proposition_action = coalesce(v_action, proposition_action),
             propose_par = p_bot, propose_at = now(), maj_at = now(),
             journal = journal || jsonb_build_object('at', now(), 'par', p_bot, 'action', 'proposer')
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
      if v_id is not null and (p_args ? 'reponse' or v_action is not null) then
        update public.problemes
           set proposition_reponse = coalesce(nullif(btrim(p_args->>'reponse'), ''), proposition_reponse),
               canal_reponse = coalesce(v_canal, canal_reponse), proposition_action = coalesce(v_action, proposition_action),
               propose_par = p_bot, propose_at = now()
         where id = v_id and statut = 'ouvert';
      end if;
    else
      raise exception 'action « % » refusée (proposer ou creer seulement)', p_action;
    end if;
  exception when others then
    v_erreur := sqlerrm;
  end;

  insert into public.bot_appels (bot, action, probleme_id, ok, erreur, args)
  values (p_bot, p_action, v_id, v_erreur is null, v_erreur, p_args);
  return case when v_erreur is null then jsonb_build_object('ok', true, 'probleme_id', v_id)
              else jsonb_build_object('ok', false, 'error', v_erreur) end;
end;
$$;
revoke all on function public.probleme_bot(text, text, jsonb) from public, anon, authenticated;
grant execute on function public.probleme_bot(text, text, jsonb) to service_role;

-- La vue en lecture seule des bots (rôle bots_lecture) : le problème et son contexte.
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
          from (select * from public.upwork_messages m where m.poster_id = p.poster_id order by m.at desc limit 5) m) as messages
  from public.problemes p
  left join public.profiles pr on pr.id = p.poster_id
 where p.statut = 'ouvert';
revoke all on public.problemes_ouverts from public, anon, authenticated;
grant select on public.problemes_ouverts to bots_lecture;

notify pgrst, 'reload schema';
