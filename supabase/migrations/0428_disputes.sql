-- 0428 — Prompt 21, partie R : la page « Disputes » (quand un posteur dit que
-- l'OS s'est trompé : paie, Kill, posts, liens, messages).
--
-- 1. `contestations` : une ligne par contestation. Elles arrivent seules :
--    - un message reçu (Slack, Upwork, boutons) que l'IA classe « paie » ou
--      marque comme une contestation (`posteur_reponses.conteste`, déclencheur) ;
--    - une question du tableau de bord (chatbot, source os) que l'IA marque
--      comme une contestation (recrues-check, `chatbot_questions.conteste`) ;
--    - un problème de paie que la partie P n'a pas réglé seule (`a_faire` de
--      type paie, déclencheur) ;
--    - à la main : « This is a dispute » sur Messages received.
--    Les retours contestés (`reviews`, 0340) restent dans leur table : ils sont
--    l'onglet Feedback.
-- 2. `contestation_dossier(id)` : tout au même endroit (posts de la semaine,
--    lignes de paie et ce que l'API a payé sur Upwork, messages envoyés, Kill
--    ou arrêt avec sa raison, contrat terminé ou non).
-- 3. `contestation_agir(id, action, valeur)` : Close, Cancel the Kill, Reopen,
--    Count this post, et les notes (paiement fait, réponse envoyée). Chaque
--    action va dans le journal de la contestation et dans les Logs
--    (`recrue_evenements`).
-- 4. Tant qu'une contestation sur un Kill est ouverte, le Kill est suspendu :
--    `contestations_kill_ouvertes()` (lue par la fonction upwork avant chaque
--    arrêt), et `arrets_fins_a_faire()` / `slack_a_retirer_lundi()` ignorent
--    ces posteurs : pas de fin de contrat, pas de retrait de Slack.
-- 5. `needs_you()` : une contestation ouverte depuis plus de 24 h y passe en
--    rouge (Issues) ; les questions de paie n'y sont plus (onglet Pay).
--
-- Réglages (textes aux posteurs, en anglais, modifiables) :
--   contestation_accuse_texte, contestation_texte_os_tort, contestation_texte_os_raison.
-- La réponse automatique part avec l'interrupteur `reponses_auto` (test : simulée).
--
-- Additive : 1 table, 3 colonnes (arrets.annule_at/annule_par,
-- posteur_reponses.conteste, chatbot_questions.conteste/conteste_vu_at),
-- 3 déclencheurs, des fonctions, 3 réglages. Aucune donnée existante modifiée.
-- Retour arrière : retirer les 3 déclencheurs (posteur_reponses_contestation,
-- chatbot_questions_contestation, a_faire_contestation), remettre
-- arrets_fins_a_faire (0414), slack_a_retirer_lundi (0418) et needs_you (0421).

insert into public.reglages (cle, valeur) values
  ('contestation_accuse_texte', to_jsonb('Thanks, we''re checking it. We''ll reply here within 24 hours.'::text)),
  ('contestation_texte_os_tort', to_jsonb('Hi {prenom}, you were right, sorry about that. {raison} It''s fixed now.'::text)),
  ('contestation_texte_os_raison', to_jsonb('Hi {prenom}, we checked: {raison} If something still looks wrong, reply here with a screenshot.'::text))
on conflict (cle) do nothing;

alter table public.arrets add column if not exists annule_at timestamptz;
alter table public.arrets add column if not exists annule_par uuid;
alter table public.posteur_reponses add column if not exists conteste text;
alter table public.chatbot_questions add column if not exists conteste text;
alter table public.chatbot_questions add column if not exists conteste_vu_at timestamptz;

comment on column public.arrets.annule_at is
  'Prompt 21, R (0428) : Kill annulé ou posteur rouvert depuis Disputes. L''arrêt ne part plus et le contrat n''est pas terminé.';
comment on column public.posteur_reponses.conteste is
  'Prompt 21, R (0428) : l''IA y voit une contestation (paie, kill, posts, lien, message) ; null sinon.';

create table if not exists public.contestations (
  id             uuid primary key default gen_random_uuid(),
  poster_id      uuid not null,
  -- paie | kill | posts | lien | message | autre
  type           text not null check (type in ('paie', 'kill', 'posts', 'lien', 'message', 'autre')),
  -- message (Slack, Upwork, boutons) | tableau (chatbot) | paie_os (partie P) | manuel
  source         text not null check (source in ('message', 'tableau', 'paie_os', 'manuel')),
  reponse_id     uuid unique,
  chatbot_id     uuid unique,
  a_faire_id     uuid unique,
  -- slack | upwork | bouton | tableau | os
  canal          text,
  texte          text,
  recu_at        timestamptz not null default now(),
  -- La semaine concernée (lundi).
  semaine        date,
  statut         text not null default 'ouverte' check (statut in ('ouverte', 'fermee')),
  -- La réponse automatique « we're checking it » : a_envoyer | envoye | simule | deja (le posteur a déjà eu une réponse) | sans_canal | erreur
  accuse_statut  text not null default 'a_envoyer',
  accuse_at      timestamptz,
  accuse_erreur  text,
  -- La dernière réponse d'une personne (« Reply »).
  reponse_texte  text,
  reponse_statut text,
  reponse_at     timestamptz,
  -- os_tort | os_raison : le verdict retenu à la fermeture.
  verdict        text check (verdict in ('os_tort', 'os_raison')),
  ferme_raison   text,
  ferme_at       timestamptz,
  ferme_par      uuid,
  -- Le journal : {action, detail, par, at}.
  journal        jsonb not null default '[]'::jsonb,
  cree_par       uuid,
  created_at     timestamptz not null default now(),
  maj_at         timestamptz not null default now()
);

create index if not exists contestations_ouvertes on public.contestations (recu_at) where statut = 'ouverte';
create index if not exists contestations_poster on public.contestations (poster_id, recu_at desc);

comment on table public.contestations is
  'Prompt 21, R (0428) : un posteur dit que l''OS s''est trompé (paie, Kill, posts, lien, message). Page Disputes.';

alter table public.contestations enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'contestations'
                  and policyname = 'contestations lecture admin') then
    create policy "contestations lecture admin" on public.contestations
      for select to authenticated using (public.is_admin());
  end if;
end $$;
revoke all on public.contestations from public, anon, authenticated;
grant select on public.contestations to authenticated;
grant all on public.contestations to service_role;

-- La semaine concernée : la paie porte sur la semaine finie ; le reste, lundi
-- et mardi sur la semaine finie, ensuite sur la semaine en cours.
create or replace function public.contestation_semaine(p_type text, p_at timestamptz)
returns date
language sql
immutable
as $$
  select case
           when p_type = 'paie' or extract(isodow from (p_at at time zone 'Europe/Paris')) <= 2
             then date_trunc('week', (p_at at time zone 'Europe/Paris'))::date - 7
           else date_trunc('week', (p_at at time zone 'Europe/Paris'))::date
         end;
$$;

-- Une entrée dans le journal de la contestation et dans les Logs.
create or replace function public.contestation_noter_journal(p_id uuid, p_action text, p_detail text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_poster uuid;
begin
  update public.contestations
     set journal = journal || jsonb_build_array(jsonb_build_object('action', p_action, 'detail', p_detail, 'par', auth.uid(), 'at', now())),
         maj_at = now()
   where id = p_id
  returning poster_id into v_poster;
  if v_poster is not null then
    insert into public.recrue_evenements (poster_id, type, at, detail, cle)
    values (v_poster, 'contestation_' || p_action, now(), left(p_detail, 500), p_id::text || ':' || p_action || ':' || clock_timestamp()::text)
    on conflict do nothing;
  end if;
end;
$$;
revoke all on function public.contestation_noter_journal(uuid, text, text) from public, anon, authenticated;
grant execute on function public.contestation_noter_journal(uuid, text, text) to service_role;

-- 1a. Un message reçu, classé : paie ou contestation → une contestation.
create or replace function public.contestation_depuis_reponse()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_type text;
  v_id   uuid;
begin
  if new.statut <> 'classe' or old.statut = 'classe' then
    return new;
  end if;
  v_type := case when new.conteste in ('paie', 'kill', 'posts', 'lien', 'message') then new.conteste
                 when new.cas = 'paie' then 'paie' end;
  if v_type is null then
    return new;
  end if;
  insert into public.contestations (poster_id, type, source, reponse_id, canal, texte, recu_at, semaine,
                                    accuse_statut)
  values (new.poster_id, v_type, 'message', new.id, new.canal, new.texte, new.recu_at,
          public.contestation_semaine(v_type, new.recu_at),
          -- Le posteur a déjà eu une réponse sur ce message (paie : « already paid », attente) : pas de 2e.
          case when new.reponse_texte is not null then 'deja' else 'a_envoyer' end)
  on conflict (reponse_id) do nothing
  returning id into v_id;
  if v_id is not null then
    perform public.contestation_noter_journal(v_id, 'creee', format('message %s classé « %s »', new.canal, v_type));
  end if;
  return new;
end;
$$;

create or replace trigger posteur_reponses_contestation
  after update of statut on public.posteur_reponses
  for each row execute function public.contestation_depuis_reponse();

-- 1b. Une question du tableau de bord que l'IA marque comme une contestation.
create or replace function public.contestation_depuis_chatbot()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if new.conteste is null or old.conteste is not distinct from new.conteste or new.user_id is null
     or new.conteste not in ('paie', 'kill', 'posts', 'lien', 'message') then
    return new;
  end if;
  insert into public.contestations (poster_id, type, source, chatbot_id, canal, texte, recu_at, semaine)
  values (new.user_id, new.conteste, 'tableau', new.id, 'tableau', new.question, new.created_at,
          public.contestation_semaine(new.conteste, new.created_at))
  on conflict (chatbot_id) do nothing
  returning id into v_id;
  if v_id is not null then
    perform public.contestation_noter_journal(v_id, 'creee', format('question du tableau de bord classée « %s »', new.conteste));
  end if;
  return new;
end;
$$;

create or replace trigger chatbot_questions_contestation
  after update of conteste on public.chatbot_questions
  for each row execute function public.contestation_depuis_chatbot();

-- 1c. Un problème de paie que la partie P n'a pas réglé seule (pas le Legacy, payé en fin de période).
create or replace function public.contestation_depuis_a_faire()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if new.type <> 'paie' or new.poster_id is null or new.titre ilike '%Legacy%' then
    return new;
  end if;
  insert into public.contestations (poster_id, type, source, a_faire_id, canal, texte, recu_at, semaine, accuse_statut)
  values (new.poster_id, 'paie', 'paie_os', new.id, 'os', concat_ws(' · ', new.titre, new.detail), new.created_at,
          coalesce(new.semaine, public.contestation_semaine('paie', new.created_at)),
          -- Le posteur n'a rien dit : pas de réponse automatique.
          'sans_canal')
  on conflict (a_faire_id) do nothing
  returning id into v_id;
  if v_id is not null then
    perform public.contestation_noter_journal(v_id, 'creee', 'problème de paie que l''OS n''a pas réglé seul');
  end if;
  return new;
end;
$$;

create or replace trigger a_faire_contestation
  after insert on public.a_faire
  for each row execute function public.contestation_depuis_a_faire();

-- 1d. À la main : « This is a dispute » sur un message reçu.
create or replace function public.contestation_creer(p_reponse_id uuid, p_type text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  r    public.posteur_reponses;
  v_id uuid;
begin
  if not public.is_admin() then
    raise exception 'contestation_creer : réservé à l''admin et au Head of Ops';
  end if;
  if p_type not in ('paie', 'kill', 'posts', 'lien', 'message', 'autre') then
    raise exception 'type inconnu : %', p_type;
  end if;
  select * into r from public.posteur_reponses where id = p_reponse_id;
  if r.id is null then
    raise exception 'message introuvable';
  end if;
  select id into v_id from public.contestations where reponse_id = p_reponse_id;
  if v_id is not null then
    return v_id;
  end if;
  insert into public.contestations (poster_id, type, source, reponse_id, canal, texte, recu_at, semaine, cree_par, accuse_statut)
  values (r.poster_id, p_type, 'manuel', r.id, r.canal, r.texte, r.recu_at, public.contestation_semaine(p_type, r.recu_at), auth.uid(),
          case when r.reponse_texte is not null and r.reponse_statut in ('envoye', 'simule') then 'deja' else 'a_envoyer' end)
  returning id into v_id;
  perform public.contestation_noter_journal(v_id, 'creee', format('ajoutée à la main (« %s »)', p_type));
  return v_id;
end;
$$;
revoke all on function public.contestation_creer(uuid, text) from public, anon;
grant execute on function public.contestation_creer(uuid, text) to authenticated;

-- 2. La liste (contestations + retours contestés), pour la page et les compteurs.
create or replace function public.contestations_liste()
returns table (
  id            uuid,
  genre         text,
  poster_id     uuid,
  nom           text,
  hm            text,
  cohorte       date,
  type          text,
  source        text,
  canal         text,
  texte         text,
  recu_at       timestamptz,
  semaine       date,
  statut        text,
  accuse_statut text,
  verdict       text,
  ferme_raison  text,
  ferme_at      timestamptz,
  reponse_statut text,
  slack_user_id text,
  upwork_contrat text
)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
begin
  if not public.is_admin() then
    raise exception 'contestations_liste : réservé à l''admin et au Head of Ops';
  end if;
  return query
  select c.id, 'contestation'::text, c.poster_id,
         coalesce(nullif(btrim(concat_ws(' ', pr.prenom, pr.nom)), ''), pr.email),
         hm.prenom, pr.cohorte_lundi, c.type, c.source, c.canal, c.texte, c.recu_at, c.semaine, c.statut,
         c.accuse_statut, c.verdict, c.ferme_raison, c.ferme_at, c.reponse_statut, pr.slack_user_id, pr.upwork_contract_id
    from public.contestations c
    left join public.profiles pr on pr.id = c.poster_id
    left join public.profiles hm on hm.id = pr.manager_id
   where c.statut = 'ouverte' or c.ferme_at > now() - interval '30 days'
  union all
  select rv.id, 'retour'::text, rv.poster_id,
         coalesce(nullif(btrim(concat_ws(' ', pr.prenom, pr.nom)), ''), pr.email),
         hm.prenom, pr.cohorte_lundi, 'feedback'::text, 'tableau'::text, 'tableau'::text, rv.contestation, rv.contestee_at,
         date_trunc('week', rv.date_publication)::date,
         case when rv.contestation_traitee_at is null then 'ouverte' else 'fermee' end,
         'sans_canal'::text,
         case rv.contestation_verdict when 'fondee' then 'os_tort' when 'rejetee' then 'os_raison' end,
         rv.contestation_reponse, rv.contestation_traitee_at, null::text, pr.slack_user_id, pr.upwork_contract_id
    from public.reviews rv
    left join public.profiles pr on pr.id = rv.poster_id
    left join public.profiles hm on hm.id = pr.manager_id
   where rv.contestee_at is not null
     and (rv.contestation_traitee_at is null or rv.contestation_traitee_at > now() - interval '30 days');
end;
$$;
revoke all on function public.contestations_liste() from public, anon;
grant execute on function public.contestations_liste() to authenticated;

-- Le compteur (menu, Overview, Logs) : contestations ouvertes + retours contestés à trancher.
create or replace function public.contestations_compte()
returns table (ouvertes integer, plus_24h integer)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'contestations_compte : réservé à l''admin et au Head of Ops';
  end if;
  return query
  select (select count(*) from public.contestations c where c.statut = 'ouverte')::int
         + (select count(*) from public.reviews rv where rv.contestee_at is not null and rv.contestation_traitee_at is null)::int,
         (select count(*) from public.contestations c where c.statut = 'ouverte' and c.recu_at < now() - interval '24 hours')::int;
end;
$$;
revoke all on function public.contestations_compte() from public, anon;
grant execute on function public.contestations_compte() to authenticated;

-- 3. Le dossier : ce que l'OS a vu et fait.
create or replace function public.contestation_dossier(p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  c        public.contestations;
  v_w      date;
  v_arret  public.arrets;
  v_fin    boolean;
  v_contrat text;
begin
  if not public.is_admin() then
    raise exception 'contestation_dossier : réservé à l''admin et au Head of Ops';
  end if;
  select * into c from public.contestations where id = p_id;
  if c.id is null then
    raise exception 'contestation introuvable';
  end if;
  v_w := coalesce(c.semaine, public.contestation_semaine(c.type, c.recu_at));
  select * into v_arret from public.arrets a where a.poster_id = c.poster_id order by a.created_at desc limit 1;
  select pr.upwork_contract_id into v_contrat from public.profiles pr where pr.id = c.poster_id;
  v_fin := exists (select 1 from public.contrats_fins f where f.poster_id = c.poster_id)
           or exists (select 1 from jsonb_array_elements(coalesce(v_arret.etapes, '[]'::jsonb)) e
                       where e->>'action' = 'fermeture' and e->>'statut' = 'fait')
           or exists (select 1 from public.upwork_contrats u where u.contrat_id = v_contrat and not u.actif);
  return jsonb_build_object(
    'contestation', to_jsonb(c),
    'semaine', v_w,
    'prenom', (select pr.prenom from public.profiles pr where pr.id = c.poster_id),
    'actif', (select pr.is_active from public.profiles pr where pr.id = c.poster_id),
    'contrat_id', v_contrat,
    'contrat_termine', v_fin,
    'posts', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', pa.id, 'jour', pa.date_publication_prevue, 'publie_at', pa.publie_at, 'url', pa.publie_url,
               'resolution', pa.resolution_statut, 'confirme', pa.lien_confirme_at is not null,
               'compte', co.handle_tiktok, 'compte_id', co.id)
             order by pa.date_publication_prevue, pa.publie_at nulls last)
        from public.passages pa
        join public.comptes co on co.id = pa.compte_id
       where co.poster_id = c.poster_id and pa.date_publication_prevue between v_w and v_w + 6), '[]'::jsonb),
    'paie', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', s.id, 'semaine', s.semaine, 'montant', coalesce(s.montant_corrige, s.montant), 'action', s.action,
               'statut', s.statut, 'raison', s.raison, 'paye_at', s.paye_at, 'exclu', coalesce(s.exclu, false),
               'faits', s.faits, 'prevus', s.prevus, 'manques', s.manques, 'nb_comptes', s.nb_comptes, 'tarif', s.tarif,
               'suivante_faite_at', s.semaine_suivante_faite_at)
             order by s.semaine desc)
        from public.paie_semaines s
       where s.poster_id = c.poster_id and s.semaine between v_w - 7 and v_w), '[]'::jsonb),
    'paiements', coalesce((
      select jsonb_agg(jsonb_build_object(
               'semaine', p.semaine, 'statut', p.statut, 'jalon_approuve', p.jalon_approuve, 'montant_approuve', p.montant_approuve,
               'jalon_finance', p.jalon_finance, 'montant_finance', p.montant_finance, 'erreur', p.erreur, 'maj_at', p.updated_at)
             order by p.updated_at desc)
        from public.paie_paiements_api p
       where p.poster_id = c.poster_id and p.semaine between v_w - 7 and v_w and p.statut <> 'libere'), '[]'::jsonb),
    'messages', coalesce((
      select jsonb_agg(x order by x->>'at' desc) from (
        select jsonb_build_object('at', n.envoye_at, 'type', n.type, 'canal', n.canal, 'texte', left(n.texte, 400),
                                  'reponse_at', n.reponse_at, 'erreur', n.slack_erreur) x
          from public.nudges n
         where n.poster_id = c.poster_id and n.envoye_at > c.recu_at - interval '14 days'
        union all
        select jsonb_build_object('at', m.created_at, 'type', m.type, 'canal', 'os', 'texte', left(m.texte, 400),
                                  'reponse_at', m.repondu_at, 'reponse', m.reponse, 'lu_at', m.lu_at, 'erreur', coalesce(m.slack_erreur, m.upwork_erreur))
          from public.posteur_messages m
         where m.poster_id = c.poster_id and m.created_at > c.recu_at - interval '14 days'
        order by 1 desc limit 30) t), '[]'::jsonb),
    'recus', coalesce((
      select jsonb_agg(jsonb_build_object('at', r.recu_at, 'canal', r.canal, 'texte', left(r.texte, 400), 'cas', r.cas,
                                          'reponse', r.reponse_texte, 'reponse_statut', r.reponse_statut) order by r.recu_at desc)
        from public.posteur_reponses r
       where r.poster_id = c.poster_id and r.recu_at > c.recu_at - interval '14 days'), '[]'::jsonb),
    'arret', case when v_arret.id is null then null else jsonb_build_object(
               'id', v_arret.id, 'source', v_arret.source, 'motif', v_arret.motif, 'statut', v_arret.statut,
               'created_at', v_arret.created_at, 'etapes', v_arret.etapes, 'annule_at', v_arret.annule_at) end,
    'kill', (select jsonb_build_object('id', k.id, 'etape', k.etape, 'statut', k.statut, 'raison', k.raison,
                                       'message_at', k.message_at, 'prevu_at', k.prevu_at, 'annule_at', k.annule_at)
               from public.kills_auto k where k.poster_id = c.poster_id order by k.detecte_at desc limit 1)
  );
end;
$$;
revoke all on function public.contestation_dossier(uuid) from public, anon;
grant execute on function public.contestation_dossier(uuid) to authenticated;

-- 4. Les posteurs dont un Kill est contesté : la fonction upwork ne les arrête pas.
create or replace function public.contestations_kill_ouvertes()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select distinct c.poster_id from public.contestations c where c.statut = 'ouverte' and c.type = 'kill';
$$;
revoke all on function public.contestations_kill_ouvertes() from public, anon, authenticated;
grant execute on function public.contestations_kill_ouvertes() to service_role;

-- 5. Les actions (confirmées dans la page, notées dans les Logs).
create or replace function public.contestation_agir(p_id uuid, p_action text, p_valeur jsonb default null)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  c       public.contestations;
  v_arret public.arrets;
  v_kill  public.kills_auto;
  v_fin   boolean;
  v_url   text;
  v_pa    uuid;
  v_jour  date;
begin
  if not public.is_admin() then
    raise exception 'contestation_agir : réservé à l''admin et au Head of Ops';
  end if;
  select * into c from public.contestations where id = p_id for update;
  if c.id is null then
    raise exception 'contestation introuvable';
  end if;

  if p_action = 'fermer' then
    if coalesce(btrim(p_valeur->>'raison'), '') = '' then
      raise exception 'une raison est demandée';
    end if;
    update public.contestations
       set statut = 'fermee', ferme_at = now(), ferme_par = auth.uid(), ferme_raison = btrim(p_valeur->>'raison'),
           verdict = case when p_valeur->>'verdict' in ('os_tort', 'os_raison') then p_valeur->>'verdict' else verdict end,
           maj_at = now()
     where id = p_id;
    -- Le problème de paie d'origine (To do) est réglé aussi.
    if c.a_faire_id is not null then
      update public.a_faire set fait_at = now(), fait_par = auth.uid(), maj_at = now() where id = c.a_faire_id and fait_at is null;
    end if;
    -- Le message d'origine sort des listes de Messages received.
    if c.reponse_id is not null then
      update public.posteur_reponses set lu_at = now(), lu_par = auth.uid() where id = c.reponse_id and lu_at is null;
    end if;
    perform public.contestation_noter_journal(p_id, 'fermee', btrim(p_valeur->>'raison'));
    return 'fermée';
  end if;

  if p_action = 'rouvrir_contestation' then
    update public.contestations set statut = 'ouverte', ferme_at = null, ferme_par = null, maj_at = now() where id = p_id;
    perform public.contestation_noter_journal(p_id, 'rouverte', null);
    return 'rouverte';
  end if;

  if p_action in ('annuler_kill', 'rouvrir') then
    select * into v_arret from public.arrets a where a.poster_id = c.poster_id and a.annule_at is null order by a.created_at desc limit 1;
    select * into v_kill from public.kills_auto k where k.poster_id = c.poster_id and k.statut in ('simule', 'en_attente') order by k.detecte_at desc limit 1;
    v_fin := exists (select 1 from public.contrats_fins f where f.poster_id = c.poster_id)
             or exists (select 1 from jsonb_array_elements(coalesce(v_arret.etapes, '[]'::jsonb)) e
                         where e->>'action' = 'fermeture' and e->>'statut' = 'fait');
    if v_fin then
      raise exception 'contract ended: reopen it by hand on Upwork';
    end if;
    if v_arret.id is null and v_kill.id is null then
      raise exception 'aucun Kill ni arrêt en cours pour ce posteur';
    end if;
    if v_kill.id is not null then
      update public.kills_auto set statut = 'annule', annule_par = auth.uid(), annule_at = now(), raison = 'annulé depuis Disputes'
       where id = v_kill.id;
    end if;
    if v_arret.id is not null then
      -- L'arrêt ne part plus (ou ne va pas plus loin) : il sort de la file et des fins de contrat.
      update public.arrets
         set annule_at = now(), annule_par = auth.uid(),
             statut = case when statut in ('a_faire', 'en_cours') then 'fait' else statut end,
             etapes = etapes || jsonb_build_array(jsonb_build_object('action', 'annulation', 'statut', 'fait',
                                                                      'detail', 'annulé depuis Disputes', 'at', now())),
             maj_at = now()
       where id = v_arret.id;
      -- Déjà désactivé : le posteur et ses comptes sont rouverts.
      if exists (select 1 from public.profiles pr where pr.id = c.poster_id and not pr.is_active) then
        update public.profiles set is_active = true where id = c.poster_id;
        update public.comptes set is_active = true where poster_id = c.poster_id and not coalesce(non_renouveler, false);
      end if;
    end if;
    perform public.contestation_noter_journal(p_id, p_action,
      concat_ws(' · ', case when v_kill.id is not null then 'Kill annulé' end,
                       case when v_arret.id is not null then 'arrêt annulé, posteur actif' end,
                       case when exists (select 1 from jsonb_array_elements(coalesce(v_arret.etapes, '[]'::jsonb)) e
                                          where e->>'action' = 'slack' and e->>'statut' = 'fait')
                            then 'déjà retiré de Slack : à réinviter à la main' end));
    return case when v_arret.id is not null then 'posteur rouvert' else 'Kill annulé' end;
  end if;

  if p_action = 'compter_post' then
    v_pa := nullif(p_valeur->>'passage_id', '')::uuid;
    v_url := nullif(btrim(coalesce(p_valeur->>'url', '')), '');
    if v_pa is null then
      raise exception 'post à compter manquant';
    end if;
    if v_url is not null and v_url !~ '^https?://([a-z]+\.)?(tiktok\.com|tt\.site)/' then
      raise exception 'lien TikTok attendu';
    end if;
    -- Le post doit être à ce posteur.
    if not exists (select 1 from public.passages pa join public.comptes co on co.id = pa.compte_id
                    where pa.id = v_pa and co.poster_id = c.poster_id) then
      raise exception 'ce post n''est pas à ce posteur';
    end if;
    update public.passages
       set publie_url = coalesce(v_url, publie_url),
           publie_at = coalesce(publie_at, now()),
           lien_confirme_at = now(), lien_confirme_par = auth.uid()
     where id = v_pa and coalesce(v_url, publie_url) is not null
    returning date_publication_prevue into v_jour;
    if v_jour is null then
      raise exception 'il faut le lien du post';
    end if;
    v_jour := date_trunc('week', v_jour)::date;
    -- La semaine est recalculée (règle des 6 comprise) tant qu'elle n'est pas payée.
    if exists (select 1 from public.paie_semaines ps where ps.semaine = v_jour and ps.paye_at is null) then
      perform public.paie_generer(v_jour);
    end if;
    perform public.contestation_noter_journal(p_id, 'compter_post', format('post du %s compté%s', v_jour, coalesce(' : ' || v_url, '')));
    return 'post compté, semaine recalculée';
  end if;

  if p_action = 'noter' then
    -- « Pay what's due » et « Reply » passent par les fonctions upwork et recrues-check, puis notent ici.
    perform public.contestation_noter_journal(p_id, coalesce(nullif(p_valeur->>'quoi', ''), 'note'), left(coalesce(p_valeur->>'detail', ''), 500));
    return 'noté';
  end if;

  raise exception 'action inconnue : %', p_action;
end;
$$;
revoke all on function public.contestation_agir(uuid, text, jsonb) from public, anon;
grant execute on function public.contestation_agir(uuid, text, jsonb) to authenticated;

-- 6. Kill suspendu : pas de fin de contrat (0414), pas de retrait de Slack (0418).
create or replace function public.arrets_fins_a_faire()
returns table (
  arret_id   uuid,
  poster_id  uuid,
  contrat_id text,
  semaine    date,
  montant    numeric,
  paye_at    timestamptz,
  posts      integer
)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
begin
  if coalesce(auth.role(), '') <> 'service_role' and not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return query
  with a as (
    select x.id, x.poster_id, x.etapes,
           -- La semaine du Kill : celle de l'arrêt (créé lundi 00 h 30 pour un Kill du dimanche → la semaine finie).
           (date_trunc('week', (x.created_at at time zone 'Europe/Paris') - interval '6 hours'))::date as w
      from public.arrets x
     where x.statut in ('fait', 'erreur') and x.a_poste
       -- Prompt 21, R : un arrêt annulé, ou un Kill contesté, ne ferme pas le contrat.
       and x.annule_at is null
       and not exists (select 1 from public.contestations ct where ct.poster_id = x.poster_id and ct.statut = 'ouverte' and ct.type = 'kill')
       and exists (select 1 from jsonb_array_elements(coalesce(x.etapes, '[]'::jsonb)) e
                    where e->>'action' = 'paie' and e->>'statut' = 'a_faire')
       and not exists (select 1 from jsonb_array_elements(coalesce(x.etapes, '[]'::jsonb)) e
                        where e->>'action' = 'fermeture' and e->>'statut' in ('fait', 'simule', 'a_faire'))
  )
  select a.id, a.poster_id, pr.upwork_contract_id, a.w,
         (select coalesce(s.montant_corrige, s.montant) from public.paie_semaines s
           where s.poster_id = a.poster_id and s.semaine = a.w and not coalesce(s.exclu, false)
           order by s.calcule_at desc nulls last limit 1),
         (select s.paye_at from public.paie_semaines s where s.poster_id = a.poster_id and s.semaine = a.w
           order by s.paye_at desc nulls last limit 1),
         (select count(*) from public.passages p join public.comptes c on c.id = p.compte_id
           where c.poster_id = a.poster_id and p.publie_url is not null
             and p.date_publication_prevue between a.w and a.w + 6)::int
    from a
    join public.profiles pr on pr.id = a.poster_id
   where not pr.is_active
     and now() >= ((a.w + 7)::timestamp at time zone 'Europe/Paris')
     and not exists (select 1 from public.contrats_fins f where f.poster_id = a.poster_id and f.semaine = a.w);
end;
$$;

revoke execute on function public.arrets_fins_a_faire() from public, anon;
grant execute on function public.arrets_fins_a_faire() to authenticated, service_role;

create or replace function public.slack_a_retirer_lundi()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_n   integer;
  v_url text := coalesce((select valeur #>> '{}' from public.reglages where cle = 'slack_membres_url'), 'https://slack.com/admin');
begin
  insert into public.a_faire (cle, type, gravite, titre, detail, poster_id, ref, lien)
  select 'slack:' || a.id, 'slack', 'todo',
         'To remove from Slack: ' || coalesce(nullif(btrim(concat_ws(' ', p.prenom, p.nom)), ''), p.email, p.id::text),
         format('%s · arrêt du %s · Slack %s',
                case coalesce(a.motif, a.source)
                  when 'moins6' then 'moins de 6 posts'
                  when 'kill_48h' then 'Kill à 48 h'
                  when 'kill_samedi' then 'Kill du samedi'
                  when 'je_ne_veux_plus' then 'demande d''arrêt'
                  else 'arrêt manuel' end,
                to_char(a.created_at at time zone 'Europe/Paris', 'DD/MM'),
                p.slack_user_id),
         a.poster_id, a.id, v_url
    from public.arrets a
    join public.profiles p on p.id = a.poster_id
   where p.slack_user_id is not null
     and a.statut in ('fait', 'erreur', 'en_cours')
     -- Prompt 21, R : un arrêt annulé, ou un Kill contesté, ne retire personne de Slack.
     and a.annule_at is null
     and not exists (select 1 from public.contestations ct where ct.poster_id = a.poster_id and ct.statut = 'ouverte' and ct.type = 'kill')
     and exists (select 1 from jsonb_array_elements(a.etapes) e where e->>'action' = 'slack' and e->>'statut' = 'a_faire')
  on conflict (cle) do nothing;
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;
revoke all on function public.slack_a_retirer_lundi() from public, anon, authenticated;

-- 7. La réponse automatique et la réponse d'une personne : recrues-check les
-- envoie (canal du message). Ces deux fonctions lui donnent la file et notent.
create or replace function public.contestations_accuses()
returns table (id uuid, poster_id uuid, canal text, prenom text)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'contestations_accuses : réservé au service';
  end if;
  return query
  select c.id, c.poster_id, c.canal, pr.prenom
    from public.contestations c
    join public.profiles pr on pr.id = c.poster_id
   where c.statut = 'ouverte' and c.accuse_statut = 'a_envoyer'
   order by c.recu_at
   limit 20;
end;
$$;
revoke all on function public.contestations_accuses() from public, anon, authenticated;
grant execute on function public.contestations_accuses() to service_role;

-- 8. Needs you (0421) : les contestations y passent en rouge après 24 h.
create or replace function public.needs_you()
returns table (
  cle          text,
  categorie    text,
  type         text,
  poster_id    uuid,
  nom          text,
  cohorte      date,
  hm           text,
  pays         text,
  vu           text,
  pense        text,
  confiance    numeric,
  urgence      text,
  rang         integer,
  cree_at      timestamptz,
  actions      text[],
  ref          text,
  lien         text,
  valeur       text,
  compteur     integer,
  contestation boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_lundi   date := date_trunc('week', (now() at time zone 'Europe/Paris'))::date;
  v_seuil   numeric := coalesce((select (rg.valeur ->> 'seuil')::numeric from public.reglages rg where rg.cle = 'reponses_reglages'), 0.8);
  v_semaine date := date_trunc('week', (now() at time zone 'Europe/Paris'))::date - 7;
  v_kill6   date := coalesce((select (rg.valeur #>> '{}')::date from public.reglages rg where rg.cle = 'paie_kill6_des'), date '2026-11-02');
begin
  if not (public.is_admin() or coalesce(auth.jwt() ->> 'role', '') = 'service_role') then
    raise exception 'needs_you : réservé à l''admin et au Head of Ops';
  end if;
  return query
  with items as (
    -- Pas pu répondre : messages reçus pas classés ; questions de paie. Pas sûr : classés sous le seuil.
    select 'reponse:' || r.id as cle,
           case when r.cas_ia is not null and r.statut = 'classe' and coalesce(r.confiance, 0) < v_seuil and r.liste = 'a_lire'
                then 'pas_sur' else 'pas_pu_repondre' end as categorie,
           case when r.liste = 'paie' then 'question_paie'
                when r.cas_ia is not null and r.statut = 'classe' and coalesce(r.confiance, 0) < v_seuil then 'reponse_peu_sure'
                else 'message_a_lire' end as type,
           r.poster_id, null::text as nom_secours,
           left(coalesce(r.texte, ''), 400) as vu,
           case when r.liste = 'paie' then 'Question de paie : l''OS a répondu d''attendre'
                when r.cas_ia is not null then format('Classé « %s » à %s %%', r.cas_ia, round(coalesce(r.confiance, 0) * 100))
                else 'Pas su classer' || coalesce(' : ' || r.erreur, '') end as pense,
           r.confiance,
           case when r.liste = 'paie' then 'paie' else 'rien' end as urgence,
           r.recu_at as cree_at,
           case when r.cas_ia is not null then array['valider', 'classer', 'ouvrir'] else array['classer', 'ouvrir'] end as actions,
           r.id::text as ref, '/admin/auto/received' as lien, r.cas_ia as valeur, 1 as compteur
      from public.posteur_reponses r
     where r.lu_at is null and r.corrige_at is null
       and ((r.statut = 'classe' and r.liste in ('a_lire', 'paie')) or r.statut = 'erreur')
       -- Prompt 21, R : une contestation (dont les questions de paie) est sur la page Disputes.
       and not exists (select 1 from public.contestations ct where ct.reponse_id = r.id)
    union all
    -- Pas pu répondre : questions que la FAQ ne couvre pas, une seule fois avec leur compteur.
    select 'faq:' || md5(lower(btrim(q.question))), 'pas_pu_repondre', 'question_faq',
           (array_agg(q.user_id order by q.created_at desc))[1], (array_agg(q.slack_nom order by q.created_at desc))[1],
           left(min(q.question), 400),
           coalesce('Réponse proposée : ' || left((array_agg(q.reponse order by q.created_at desc) filter (where q.reponse is not null))[1], 300),
                    'La FAQ ne couvre pas cette question'),
           null::numeric, 'rien', min(q.created_at),
           array['repondre', 'ignorer'],
           string_agg(q.id::text, ',' order by q.created_at), '/admin/auto/faq',
           (array_agg(q.reponse order by q.created_at desc) filter (where q.reponse is not null))[1],
           count(*)::int
      from public.chatbot_questions q
     where q.etat in ('a_traiter', 'a_valider', 'relance') and not coalesce(q.test, false)
     group by lower(btrim(q.question))
    union all
    -- To do et Issues (paie, Slack…) : bloqué ou à faire à la main.
    select 'afaire:' || a.id, case when a.type = 'slack' then 'a_la_main' else 'bloque' end,
           case when a.type = 'slack' then 'retirer_slack' when a.type = 'upwork' then 'upwork_limite'
                when a.gravite = 'issue' then 'paiement_urgent' else 'paiement' end,
           a.poster_id, null, a.titre, coalesce(a.detail, ''), null,
           case when a.type = 'paie' then 'paie' else 'rien' end, a.created_at,
           array['fait'], a.id::text, a.lien, null, 1
      from public.a_faire a
     where a.fait_at is null
    union all
    -- Bloqué : messages qui n'ont pas pu partir (Upwork, Slack), 7 derniers jours.
    select 'message:' || m.id, 'bloque', 'message_pas_parti', m.poster_id, null,
           left(m.texte, 300), 'Pas parti : ' || coalesce(m.upwork_erreur, m.slack_erreur, m.erreur, 'erreur'), null,
           case when m.type = 'kill' then 'kill' else 'rien' end, m.created_at,
           array['ignorer', 'ouvrir'], m.id::text, '/admin/auto/sent', null, 1
      from public.posteur_messages m
     where m.created_at > now() - interval '7 days'
       and (m.upwork_statut = 'erreur' or m.slack_statut in ('erreur', 'introuvable'))
    union all
    select 'nudge:' || n.id, 'bloque', 'message_pas_parti', n.poster_id, null,
           left(n.texte, 300), 'Pas parti : ' || n.slack_erreur, null, 'rien', n.envoye_at,
           array['ignorer', 'ouvrir'], n.id::text, '/admin/auto/sent', null, 1
      from public.nudges n
     where n.slack_erreur is not null and n.envoye_at > now() - interval '7 days' and n.resolu_at is null
    union all
    select 'repondu:' || r.id, 'bloque', 'message_pas_parti', r.poster_id, null,
           left(coalesce(r.reponse_texte, ''), 300), 'Réponse pas partie : ' || coalesce(r.erreur, 'erreur'), null, 'rien', r.recu_at,
           array['ignorer', 'ouvrir'], r.id::text, '/admin/auto/received', null, 1
      from public.posteur_reponses r
     where r.reponse_statut = 'erreur' and r.recu_at > now() - interval '7 days'
    union all
    -- Bloqué : une recrue sans aucun canal (ni contrat Upwork, ni Slack).
    select 'sans_canal:' || p.id, 'bloque', 'sans_canal', p.id, null,
           'Ni contrat Upwork relié, ni Slack', 'L''OS ne peut rien lui envoyer', null,
           'lundi', p.created_at, array['ouvrir', 'ignorer'], p.id::text, '/admin/auto/recruits', null, 1
      from public.profiles p
     where p.is_active and p.cohorte_lundi >= v_lundi
       and p.slack_user_id is null and p.upwork_contract_id is null
       and exists (select 1 from public.user_roles ur where ur.user_id = p.id and ur.role = 'poster')
    union all
    -- Bloqué : contrats à relier, doublons.
    select 'accueil:' || a.contrat_id, 'bloque', case when a.statut = 'doublon' then 'doublon' else 'contrat_a_relier' end,
           a.poster_id, nullif(btrim(concat_ws(' ', a.prenom, a.nom)), ''),
           format('Contrat %s%s', a.contrat_id, coalesce(' · ' || a.job_titre, '')),
           coalesce(a.raison, case when a.statut = 'doublon' then 'Doublon possible' else 'Pas relié à un posteur' end), null,
           case when a.cohorte_lundi >= v_lundi then 'lundi' else 'rien' end, a.created_at,
           array['ouvrir', 'ignorer'], a.contrat_id, '/admin/auto/recruits', null, 1
      from public.accueils a
     where a.statut in ('a_relier', 'doublon')
    union all
    -- Bloqué : tarif du contrat impossible à déduire (hors paie automatique).
    select 'tarif:' || t.contrat_id, 'bloque', 'tarif_manquant', p.id, null,
           coalesce(t.raison, 'Milestones illisibles'), 'Tarif du contrat à fixer (Payroll → Contract rate)', null,
           'paie', t.lu_at, array['ouvrir', 'ignorer'], t.contrat_id, '/admin/auto/payroll', null, 1
      from public.contrats_tarifs t
      join public.profiles p on p.upwork_contract_id = t.contrat_id and p.is_active
     where t.rythme = 'a_verifier' and t.force_tarif is null
    union all
    -- Bloqué : la connexion Upwork (erreur, ou bientôt périmée : 2 semaines sans appel).
    select 'upwork:' || u.compte, 'bloque', 'jeton_upwork', null, 'Upwork',
           coalesce(u.derniere_erreur, format('Dernier appel le %s', to_char(u.dernier_appel_at at time zone 'Europe/Paris', 'DD/MM HH24:MI'))),
           case when u.statut = 'erreur' then 'La connexion Upwork ne marche plus : la reconnecter' else 'La connexion expire bientôt' end, null,
           'paie', coalesce(u.alerte_at, now()), array['ouvrir'], u.compte, '/admin/reglages#upwork', null, 1
      from public.upwork_connexion u
     where u.statut = 'erreur' or u.dernier_appel_at < now() - interval '10 days'
    union all
    -- Bloqué : une tâche automatique en erreur (24 dernières heures).
    select 'cron:' || j.jobname, 'bloque', 'tache_erreur', null, j.jobname,
           left((array_agg(d.return_message order by d.start_time desc))[1], 300),
           format('%s échec(s) depuis 24 h', count(*)), null, 'rien', max(d.start_time),
           array['ignorer'], j.jobname, '/admin/auto/logs', null, count(*)::int
      from cron.job_run_details d
      join cron.job j on j.jobid = d.jobid
     where d.status = 'failed' and d.start_time > now() - interval '24 hours'
       -- ~8 000 passages par jour : on ne lit que les derniers (l'historique entier prend 3 s).
       and d.runid > (select max(x.runid) from cron.job_run_details x) - 20000
     group by j.jobname
    union all
    -- Pas sûr : lien TikTok introuvable (ne compte pas pour la règle des 6 tant qu'il n'est pas confirmé) ou pas encore résolu.
    select 'lien:' || pa.id, 'pas_sur', case when pa.resolution_statut = 'introuvable' then 'lien_introuvable' else 'lien_pas_resolu' end,
           c.poster_id, null,
           pa.publie_url || coalesce(' · ' || pa.resolution_detail, ''),
           case when pa.resolution_statut = 'introuvable' then 'Introuvable sur TikTok : faux lien, ou post supprimé ?'
                else 'Pas encore résolu après 24 h' end,
           -- Urgent seulement sous la règle des 6 (il ne compte pas tant qu'il n'est pas confirmé).
           null, case when pa.date_publication_prevue >= v_kill6 then 'paie' else 'rien' end, coalesce(pa.publie_at, pa.created_at),
           array['compter', 'corriger_lien', 'ignorer'], pa.id::text, pa.publie_url, pa.publie_url, 1
      from public.passages pa
      join public.comptes c on c.id = pa.compte_id
     where pa.publie_url is not null and pa.lien_confirme_at is null
       and pa.date_publication_prevue >= (now() at time zone 'Europe/Paris')::date - 7
       and (pa.resolution_statut = 'introuvable'
            or (pa.resolution_statut = 'a_resoudre' and coalesce(pa.publie_at, pa.created_at) < now() - interval '24 hours'))
    union all
    -- Pas sûr : compte TikTok introuvable au dernier relevé (handle faux ?).
    select 'compte:' || w.compte_id, 'pas_sur', case when c.warmup_started_at is not null then 'warmup_introuvable' else 'compte_introuvable' end,
           c.poster_id, null, '@' || w.handle,
           case when c.warmup_started_at is not null then 'Start warmup cliqué, mais compte introuvable au relevé du ' else 'Compte introuvable au relevé du ' end
             || to_char(w.releve_at at time zone 'Europe/Paris', 'DD/MM HH24:MI') || ' : handle faux ?',
           null, case when pr.cohorte_lundi >= v_lundi then 'lundi' else 'rien' end, w.releve_at,
           array['corriger_handle', 'ignorer'], w.compte_id::text, 'https://www.tiktok.com/@' || w.handle, w.handle, 1
      from (select distinct on (x.compte_id) x.* from public.ckd_warmup_releves x
             where x.releve_at > now() - interval '3 days' order by x.compte_id, x.releve_at desc) w
      join public.comptes c on c.id = w.compte_id and c.is_active
      join public.profiles pr on pr.id = c.poster_id and pr.is_active
     where w.existe = false
    union all
    -- Pas sûr : shadowban supposé.
    select 'shadowban:' || s.compte_id, 'pas_sur', 'shadowban', s.poster_id, null,
           '@' || coalesce(s.handle, '?') || ' · ' || s.type,
           'Shadowban supposé depuis le ' || to_char(s.depuis, 'DD/MM'), null, 'rien', s.calcule_at,
           array['ouvrir', 'ignorer'], s.compte_id::text, '/admin/auto/decisions', null, 1
      from public.ckd_shadowban s
     where s.recreation_at is null and s.nouveau_compte_id is null
    union all
    -- Pas sûr : un retour de l'agent de relecture dont aucun point n'est vu sur plus de la moitié des slides (3 derniers jours).
    select 'relecture:' || ra.id, 'pas_sur', 'relecture_doute', ra.poster_id, null,
           left(ra.brouillon, 400),
           'L''agent relève ' || (select string_agg(d->>'code', ', ') from jsonb_array_elements(ra.defauts) d where d->>'niveau' = 'remarque'),
           (select min((d->>'confiance')::numeric) from jsonb_array_elements(ra.defauts) d where d->>'niveau' = 'remarque'),
           'rien', ra.created_at, array['juste', 'faux'], ra.id::text, ra.publie_url, null, 1
      from public.relectures_auto ra
     where ra.statut = 'fait' and ra.brouillon is not null and ra.created_at > now() - interval '3 days'
       and coalesce(ra.envoi, '') not like 'rejeté%'
       and not exists (select 1 from public.relecture_avis av where av.relecture_id = ra.id)
       and exists (select 1 from jsonb_array_elements(ra.defauts) d where d->>'niveau' = 'remarque')
       and not exists (select 1 from jsonb_array_elements(ra.defauts) d
                        where d->>'niveau' = 'remarque' and (d->>'confiance')::numeric >= 0.6)
    union all
    -- Pas sûr : liaison contrat ↔ posteur sans nom qui correspond (ou à 2 lettres près).
    select 'liaison:' || l.poster_id, 'pas_sur', 'liaison_incertaine', l.poster_id, null,
           format('Contrat %s · freelance « %s »', l.contrat_id, coalesce(l.freelancer_nom, '?')),
           case when l.regle = 3 then 'Noms proches (2 lettres près) : même personne ?' else 'Les noms ne correspondent pas : même personne ?' end,
           case when l.regle = 3 then 0.6 else 0.3 end, 'paie', l.cree_at,
           array['confirmer', 'delier'], l.poster_id::text, '/admin/auto/recruits', null, 1
      from public.liaisons_a_verifier() l
     where l.regle is null or l.regle = 3
    union all
    -- Pas sûr : Kill sous les 6 posts, alors que des liens introuvables ne sont pas vérifiés.
    select 'kill_incomplet:' || ps.id, 'pas_sur', 'kill_incomplet', ps.poster_id, null,
           format('%s posts avec lien · %s lien(s) introuvable(s) pas vérifié(s)', ps.faits,
                  (select sum((d->>'douteux')::int) from jsonb_array_elements(ps.detail_comptes) d)),
           'Kill proposé sur des données incomplètes : vérifier les liens d''abord', null, 'kill', ps.calcule_at,
           array['ouvrir'], ps.id::text, '/admin/auto/payroll', null, 1
      from public.paie_semaines ps
     where ps.semaine = v_semaine and ps.action = 'kill' and ps.paye_at is null and not ps.exclu
       and exists (select 1 from jsonb_array_elements(ps.detail_comptes) d where coalesce((d->>'douteux')::int, 0) > 0)
    union all
    -- À faire à la main : remboursement à demander (arrêt complet).
    select 'remboursement:' || a.id, 'a_la_main', 'remboursement', a.poster_id, null,
           (select e->>'detail' from jsonb_array_elements(a.etapes) e where e->>'action' = 'remboursement' limit 1),
           'Remboursement à demander sur Upwork, puis le contrat à fermer', null, 'paie', a.created_at,
           array['fait', 'ouvrir'], a.id::text, '/admin/auto/payroll', null, 1
      from public.arrets a
     where exists (select 1 from jsonb_array_elements(a.etapes) e where e->>'action' = 'remboursement' and e->>'statut' = 'a_faire')
    union all
    -- À faire à la main : décisions du samedi pas validées (7 derniers jours).
    select 'samedi:' || cp.id, 'a_la_main', 'samedi_non_valide', cp.poster_id, null,
           format('%s · %s', cp.regle, coalesce(cp.action, '')), 'Décision du samedi pas encore validée', null, 'kill', cp.created_at,
           array['ouvrir'], cp.id::text, '/admin/auto/decisions', null, 1
      from public.ckd_propositions cp
     -- Seulement le samedi et le dimanche de la décision : ensuite, elle est dépassée.
     where cp.type = 'samedi' and cp.decision is null and cp.jour >= (now() at time zone 'Europe/Paris')::date - 1
    union all
    -- Prompt 21, R : une contestation ouverte depuis plus de 24 h (Issues, en rouge).
    select 'contestation:' || ct.id, 'bloque', 'contestation_24h', ct.poster_id, null,
           left(coalesce(ct.texte, ''), 400),
           format('Contestation (%s) ouverte depuis %s h : à régler sur Disputes', ct.type,
                  floor(extract(epoch from now() - ct.recu_at) / 3600)::int),
           null, case when ct.type = 'kill' then 'kill' when ct.type = 'paie' then 'paie' else 'rien' end, ct.recu_at,
           array['ouvrir'], ct.id::text, '/admin/auto/disputes', null, 1
      from public.contestations ct
     where ct.statut = 'ouverte' and ct.recu_at < now() - interval '24 hours'
  )
  select i.cle, i.categorie, i.type, i.poster_id,
         coalesce(nullif(btrim(concat_ws(' ', pr.prenom, pr.nom)), ''), i.nom_secours, pr.email),
         pr.cohorte_lundi, hm.prenom, (select a.pays from public.accueils a where a.poster_id = i.poster_id limit 1),
         i.vu, i.pense, i.confiance, i.urgence,
         case i.urgence when 'lundi' then 1 when 'paie' then 2 when 'kill' then 3 else 4 end,
         i.cree_at, i.actions, i.ref, i.lien, i.valeur, i.compteur,
         exists (select 1 from public.reviews rv where rv.poster_id = i.poster_id
                  and rv.contestee_at is not null and rv.contestation_traitee_at is null)
         or exists (select 1 from public.contestations ct where ct.poster_id = i.poster_id and ct.statut = 'ouverte')
    from items i
    left join public.profiles pr on pr.id = i.poster_id
    left join public.profiles hm on hm.id = pr.manager_id
   where not exists (select 1 from public.needs_you_ignores ig where ig.cle = i.cle)
   order by 13, i.cree_at;
end;
$$;

notify pgrst, 'reload schema';
