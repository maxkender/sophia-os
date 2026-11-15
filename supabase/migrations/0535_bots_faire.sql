-- 0535 — Simplification (04/11), partie 3 : les bots agissent seuls (« faire »)
-- pour les actions sans risque, avec des garde-fous, et tout est noté.
--
-- Actions : reponse (répondre à une question), resend_password_link,
-- relink_slack, reread_tiktok, relance (étape d'onboarding), message_hm (DM
-- Slack à l'HM), stop (STOP sûr = Kill samedi + relances et posts coupés +
-- réponse gentille).
-- Garde-fous (probleme_bot_faire, avant toute action) :
--   - le réglage « autonomie_bots » est sur on (off par défaut : refus) ;
--   - confiance du bot ≥ 0,8, sinon la carte passe ⚡ Urgent avec sa question ;
--   - jamais d'argent (carte paie / contrat), jamais de kill immédiat, jamais
--     de bonus ;
--   - au plus 1 message de bot par personne et par 24 h, sauf la réponse à
--     une question sans réponse ;
--   - pas de message entre 22 h et 8 h, heure du posteur (fuseau de son pays) ;
--   - STOP : seulement un stop sûr (texte_arret_signal = stop).
-- bot_actions : le journal (prévu → fait / erreur / refusé / annulé), lu par
-- l'onglet 🤖 ; bot_action_annuler : annuler / corriger (le Kill samedi est
-- annulé ; la carte revient à Max avec le message du bot).
--
-- Additif : 1 table, des fonctions ; probleme_kill_samedi accepte aussi la
-- fonction des bots (service_role).

create table if not exists public.bot_actions (
  id          uuid primary key default gen_random_uuid(),
  bot         text not null check (bot in ('new_cohort_bot', 'control_bot', 'pay_bot')),
  probleme_id uuid references public.problemes(id) on delete set null,
  poster_id   uuid,
  hm_id       uuid,
  action      text not null,
  canal       text,
  message     text,
  confiance   numeric,
  statut      text not null default 'prevu' check (statut in ('prevu', 'fait', 'erreur', 'refuse', 'annule')),
  raison      text,
  at          timestamptz not null default now(),
  fait_at     timestamptz,
  annule_at   timestamptz,
  annule_par  uuid
);
create index if not exists bot_actions_at on public.bot_actions (at desc);
create index if not exists bot_actions_poster on public.bot_actions (poster_id, at desc);
alter table public.bot_actions enable row level security;

-- L'interrupteur (admin).
create or replace function public.autonomie_bots_regler(p_on boolean)
returns text
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'autonomie_bots_regler : réservé à l''admin' using errcode = '42501';
  end if;
  insert into public.reglages (cle, valeur) values ('autonomie_bots', to_jsonb(case when p_on then 'on' else 'off' end))
  on conflict (cle) do update set valeur = excluded.valeur;
  return case when p_on then 'on' else 'off' end;
end;
$$;
revoke all on function public.autonomie_bots_regler(boolean) from public, anon;
grant execute on function public.autonomie_bots_regler(boolean) to authenticated;

-- Les actions des bots (24 h par défaut) pour l'onglet 🤖.
create or replace function public.bot_actions_lire(p_heures int default 24)
returns table (id uuid, bot text, probleme_id uuid, poster_id uuid, nom text, action text, canal text, message text,
               statut text, raison text, confiance numeric, at timestamptz)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
begin
  if not public.is_admin() then
    raise exception 'bot_actions_lire : réservé à l''admin' using errcode = '42501';
  end if;
  return query
  select a.id, a.bot, a.probleme_id, a.poster_id,
         coalesce(nullif(btrim(concat_ws(' ', pr.prenom, pr.nom)), ''), nullif(btrim(concat_ws(' ', h.prenom, h.nom)), '')),
         a.action, a.canal, a.message, a.statut, a.raison, a.confiance, a.at
    from public.bot_actions a
    left join public.profiles pr on pr.id = a.poster_id
    left join public.profiles h on h.id = a.hm_id
   where a.at > now() - make_interval(hours => greatest(1, least(coalesce(p_heures, 24), 168)))
     and a.statut in ('fait', 'erreur', 'annule')
   order by a.at desc;
end;
$$;
revoke all on function public.bot_actions_lire(int) from public, anon;
grant execute on function public.bot_actions_lire(int) to authenticated;

-- Le Kill samedi peut être préparé par la fonction des bots (STOP sûr).
do $p$
declare
  v_def text := pg_get_functiondef('public.probleme_kill_samedi(uuid,boolean)'::regprocedure);
  v_a text := $q$  if not public.is_admin() then
    raise exception 'probleme_kill_samedi : réservé à l''admin' using errcode = '42501';$q$;
begin
  if position(v_a in v_def) = 0 then raise exception '0535 : probleme_kill_samedi ne correspond pas'; end if;
  execute replace(v_def, v_a, $q$  if not (public.is_admin() or coalesce(auth.role(), '') = 'service_role') then
    raise exception 'probleme_kill_samedi : réservé à l''admin' using errcode = '42501';$q$);
end;
$p$;

-- L'heure du posteur (fuseau de son pays), 8 h - 22 h.
create or replace function public.posteur_heure_ok(p_poster uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select extract(hour from now() at time zone coalesce(public.fuseau_pays(
           (select c.pays from public.comptes c where c.poster_id = p_poster and c.is_active and coalesce(c.type_compte, 'perso') = 'perso'
             order by c.created_at limit 1)), 'Europe/Paris')) between 8 and 21;
$$;

-- Les garde-fous, puis le plan de l'action (le message part depuis la fonction bot_propositions).
create or replace function public.probleme_bot_faire(p_bot text, p_args jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  p public.problemes;
  v_action text := nullif(p_args->>'action', '');
  v_conf numeric := coalesce(nullif(p_args->>'confiance', '')::numeric, 0);
  v_msg text := nullif(btrim(coalesce(p_args->>'reponse', '')), '');
  v_canal text := coalesce(nullif(p_args->>'canal', ''), 'upwork');
  v_id uuid;
  v_sr jsonb;
  v_refus text;
  v_message_autorise boolean;
  v_actions text[] := array['reponse', 'resend_password_link', 'relink_slack', 'reread_tiktok', 'relance', 'message_hm', 'stop'];
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'probleme_bot_faire : réservé à la fonction bot_propositions' using errcode = '42501';
  end if;
  select * into p from public.problemes where id = nullif(p_args->>'probleme_id', '')::uuid;
  if not found or p.statut <> 'ouvert' then return jsonb_build_object('ok', false, 'error', 'problème introuvable ou fermé'); end if;

  v_refus := case
    when coalesce((select valeur #>> '{}' from public.reglages where cle = 'autonomie_bots'), 'off') <> 'on'
      then 'autonomie_bots est sur off : utilise « proposer », Max décide'
    when v_action is null or not (v_action = any (v_actions))
      then 'action « ' || coalesce(v_action, '') || ' » refusée ; valeurs acceptées : ' || array_to_string(v_actions, ', ')
    when p.categorie in ('paie', 'kill_contrat') or exists (select 1 from jsonb_array_elements(p.sujets) s where s->>'categorie' in ('paie', 'kill_contrat'))
      then 'jamais d''argent : une carte de paie reste à Max'
    when v_conf < 0.8
      then 'confiance ' || v_conf || ' < 0,8 : la carte passe en Urgent pour Max'
    when v_action = 'stop' and not (p.categorie = 'stop' and (public.probleme_arret_carte(p.id)->>'verdict') = 'stop')
      then 'stop : seulement un STOP sûr (demande d''arrêt claire)'
    when v_action in ('reponse', 'relance', 'relink_slack', 'message_hm') and v_msg is null
      then 'message obligatoire'
    when v_action = 'message_hm' and p.hm_id is null and not exists (select 1 from public.profiles x where x.id = p.poster_id and x.manager_id is not null)
      then 'pas d''HM reliée'
  end;

  -- Message au posteur : au plus 1 par 24 h (sauf la réponse à une question sans réponse), et 8 h - 22 h chez lui.
  if v_refus is null and v_msg is not null and v_action <> 'message_hm' and p.poster_id is not null then
    v_sr := public.probleme_sans_reponse(p.poster_id);
    v_message_autorise := (v_action = 'reponse' and coalesce((v_sr->>'question')::boolean, false))
      or not exists (select 1 from public.bot_actions a where a.poster_id = p.poster_id and a.statut = 'fait'
                      and a.message is not null and a.at > now() - interval '24 hours');
    if not v_message_autorise then
      v_refus := 'déjà un message de bot à cette personne ces 24 h';
    elsif not public.posteur_heure_ok(p.poster_id) then
      v_refus := 'entre 22 h et 8 h chez le posteur : réessaie plus tard';
    end if;
  end if;

  insert into public.bot_actions (bot, probleme_id, poster_id, hm_id, action, canal, message, confiance, statut, raison)
  values (p_bot, p.id, p.poster_id,
          case when v_action = 'message_hm' then coalesce(p.hm_id, (select x.manager_id from public.profiles x where x.id = p.poster_id)) end,
          coalesce(v_action, '?'), case when v_action = 'message_hm' then 'slack' else v_canal end, v_msg, v_conf,
          case when v_refus is null then 'prevu' else 'refuse' end, v_refus)
  returning id into v_id;

  if v_refus is not null then
    -- Pas sûr : la carte passe en Urgent avec sa question (et la proposition du bot).
    if v_conf < 0.8 then
      update public.problemes
         set confiance = v_conf,
             diagnostic = coalesce(nullif(left(btrim(coalesce(p_args->>'diagnostic', '')), 300), ''), diagnostic),
             diagnostic_par = case when nullif(p_args->>'diagnostic', '') is not null then p_bot else diagnostic_par end,
             proposition_reponse = coalesce(v_msg, proposition_reponse), propose_par = p_bot, propose_at = now(), maj_at = now()
       where id = p.id;
    end if;
    return jsonb_build_object('ok', false, 'error', v_refus, 'bot_action_id', v_id);
  end if;

  if v_action = 'stop' then
    perform public.probleme_kill_samedi(p.id);
  end if;

  return jsonb_build_object('ok', true, 'bot_action_id', v_id, 'action', v_action, 'poster_id', p.poster_id,
    'hm_id', case when v_action = 'message_hm' then coalesce(p.hm_id, (select x.manager_id from public.profiles x where x.id = p.poster_id)) end,
    'compte_id', (select c.id from public.comptes c where c.poster_id = p.poster_id and c.is_active and coalesce(c.type_compte, 'perso') = 'perso'
                   order by c.created_at limit 1),
    'canal', case when v_action = 'message_hm' then 'slack' else v_canal end, 'message', v_msg);
end;
$$;
revoke all on function public.probleme_bot_faire(text, jsonb) from public, anon, authenticated;
grant execute on function public.probleme_bot_faire(text, jsonb) to service_role;

-- Le résultat de l'action : fait (le sujet de la carte est réglé), ou erreur.
create or replace function public.probleme_bot_fait(p_id uuid, p_ok boolean, p_erreur text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  a public.bot_actions;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'probleme_bot_fait : réservé à la fonction bot_propositions' using errcode = '42501';
  end if;
  update public.bot_actions set statut = case when p_ok then 'fait' else 'erreur' end, raison = coalesce(p_erreur, raison), fait_at = now()
   where id = p_id returning * into a;
  if not found then return; end if;
  if p_ok and a.probleme_id is not null then
    update public.problemes
       set journal = journal || jsonb_build_object('at', now(), 'par', a.bot, 'action', 'fait_par_bot', 'quoi', a.action, 'message', left(a.message, 300)),
           maj_at = now()
     where id = a.probleme_id;
    -- Le STOP reste ouvert (Kill prévu samedi) ; le reste est réglé.
    if a.action <> 'stop' then
      perform public.probleme_fermer_sujet(a.probleme_id, 'fait par ' || a.bot || ' : ' || a.action);
    end if;
  end if;
end;
$$;
revoke all on function public.probleme_bot_fait(uuid, boolean, text) from public, anon, authenticated;
grant execute on function public.probleme_bot_fait(uuid, boolean, text) to service_role;

-- Annuler / corriger : le Kill samedi est annulé ; la carte revient à Max avec ce que le bot avait fait.
create or replace function public.bot_action_annuler(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  a public.bot_actions;
  v_carte uuid;
begin
  if not public.is_admin() then
    raise exception 'bot_action_annuler : réservé à l''admin' using errcode = '42501';
  end if;
  update public.bot_actions set statut = 'annule', annule_at = now(), annule_par = auth.uid()
   where id = p_id and statut = 'fait' returning * into a;
  if not found then raise exception 'action introuvable ou déjà annulée'; end if;
  if a.action = 'stop' and a.probleme_id is not null then
    perform public.probleme_kill_samedi(a.probleme_id, true);
  end if;
  -- La carte de la personne revient (ouverte) avec ce que le bot a fait, pour que Max corrige.
  if a.poster_id is not null then
    select id into v_carte from public.problemes where cle_groupe = a.poster_id::text and statut = 'ouvert' limit 1;
    if v_carte is null and a.probleme_id is not null
       and not exists (select 1 from public.problemes x join public.problemes y on y.cle_groupe = x.cle_groupe and y.statut = 'ouvert'
                        where x.id = a.probleme_id) then
      update public.problemes set statut = 'ouvert', ferme_at = null, ferme_raison = null, maj_at = now() where id = a.probleme_id;
      v_carte := a.probleme_id;
    end if;
    if v_carte is not null then
      update public.problemes
         set proposition_reponse = coalesce(a.message, proposition_reponse), confiance = 0, maj_at = now(),
             diagnostic = 'Action du bot annulée par Max (' || a.action || ') : à corriger.', diagnostic_par = 'os',
             journal = journal || jsonb_build_object('at', now(), 'par', auth.uid(), 'action', 'bot_annule', 'quoi', a.action)
       where id = v_carte;
    end if;
  end if;
  if a.probleme_id is not null then
    insert into public.bot_feedback (probleme_id, bot, verdict, raison, action_du_bot, donne_par, choix)
    values (a.probleme_id, a.bot, 'mauvaise_action', 'Max a annulé l''action du bot (' || a.action || ')', a.action, auth.uid(), 'annule');
  end if;
end;
$$;
revoke all on function public.bot_action_annuler(uuid) from public, anon;
grant execute on function public.bot_action_annuler(uuid) to authenticated;

notify pgrst, 'reload schema';
