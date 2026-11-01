-- 0503 — Les conversations Upwork COMPLÈTES, lues par l'OS (jamais un appel de plus).
--
-- 1. upwork_messages : chaque message des conversations VIk Studios (contrats
--    actifs et fermés, depuis le 1er octobre), dans les deux sens : auteur,
--    rôle (posteur / hm / max / os ; « nous » quand l'ancien relevé ne dit pas
--    qui), date, texte (mots de passe et liens de mot de passe masqués),
--    pièces jointes (nom + lien), contrat, posteur, lien de la conversation.
-- 2. Remplie par ce que l'OS lit déjà : chaque écriture de upwork_salons
--    (trigger), et upwork_messages_garder(...) que la fonction upwork appelle
--    avec TOUTE la conversation qu'elle vient de lire (au lieu des 10 derniers).
-- 3. Jamais l'équipe « Maximilien Kender » (Calyra) : seulement l'organisation
--    VIk Studios ; jamais les messages de candidature d'avant l'offre (avant le
--    début du contrat).
-- 4. Lecture seule des bots : le rôle bots_lecture (select sur la table, les
--    deux fonctions) ; conversation_complete(poster) et nouveaux_messages(depuis).
--
-- Additif : une table, un rôle, des fonctions, un trigger. Aucune ligne supprimée.

create table if not exists public.upwork_messages (
  id               text primary key,
  contrat_id       text not null,
  organisation_id  text,
  poster_id        uuid references public.profiles(id) on delete set null,
  room_id          text,
  at               timestamptz not null,
  auteur_upwork_id text,
  auteur_nom       text,
  role             text not null check (role in ('posteur', 'hm', 'max', 'os', 'nous')),
  texte            text not null,
  pieces           jsonb not null default '[]'::jsonb,
  lien_conversation text,
  source           text not null default 'salon',
  vu_at            timestamptz not null default now()
);
create index if not exists upwork_messages_poster_at on public.upwork_messages (poster_id, at desc);
create index if not exists upwork_messages_contrat_at on public.upwork_messages (contrat_id, at desc);
create index if not exists upwork_messages_vu on public.upwork_messages (vu_at);
alter table public.upwork_messages enable row level security;

do $p$
begin
  if not exists (select 1 from pg_policies where tablename = 'upwork_messages' and policyname = 'upwork_messages_lecture_admin') then
    create policy upwork_messages_lecture_admin on public.upwork_messages for select to authenticated
      using (public.is_admin() or exists (select 1 from public.user_roles ur where ur.user_id = auth.uid() and ur.role = 'head_of_ops'));
  end if;
end
$p$;

-- Les bots : lecture seule (aucun droit d'écriture, nulle part).
do $r$
begin
  if not exists (select 1 from pg_roles where rolname = 'bots_lecture') then
    create role bots_lecture nologin;
  end if;
end
$r$;
grant usage on schema public to bots_lecture;
grant select on public.upwork_messages to bots_lecture;
do $p$
begin
  if not exists (select 1 from pg_policies where tablename = 'upwork_messages' and policyname = 'upwork_messages_lecture_bots') then
    create policy upwork_messages_lecture_bots on public.upwork_messages for select to bots_lecture using (true);
  end if;
end
$p$;

-- Mots de passe et liens de mot de passe : jamais stockés en clair.
create or replace function public.masquer_mot_de_passe(p_texte text)
returns text
language sql
immutable
as $$
  select regexp_replace(
           regexp_replace(coalesce(p_texte, ''),
             -- Liens « Set my password » et liens de connexion à usage unique.
             'https?://\S*(set-password|reset-password|mot-de-passe|password|lier-slack|token=|[?&]t=)\S*', '[password link]', 'gi'),
           -- « password is X », « password: X », « mot de passe : X ».
           '((password|passcode|mot de passe|mdp)\s*(is|:|=|-)\s*)("[^"]*"|\S+)', '\1[password link]', 'gi');
$$;

-- Le rôle d'un message de notre côté : envoyé par l'OS (un envoi par l'API noté
-- dans upwork_appels sur ce contrat, à 3 min près), la HM (son nom), sinon Max.
create or replace function public.upwork_message_role(
  p_contrat text, p_de text, p_auteur_nom text, p_at timestamptz
) returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
    when p_de = 'posteur' then 'posteur'
    when exists (select 1 from public.upwork_appels a
                  where a.contrat = p_contrat and a.action in ('message', 'message_salon', 'accueil_contrat')
                    and a.erreur is null and a.at between p_at - interval '3 minutes' and p_at + interval '3 minutes') then 'os'
    when p_auteur_nom is null then 'nous'
    when p_auteur_nom ilike 'maximilien%' or p_auteur_nom ilike 'max %' or p_auteur_nom ilike 'adrien%' then 'max'
    else 'hm' end;
$$;

-- Garder des messages lus (format de upwork_salons, ou nœuds complets) : VIk
-- Studios seulement, depuis le 1er octobre et depuis le début du contrat.
create or replace function public.upwork_messages_garder(
  p_contrat text, p_poster uuid, p_room text, p_messages jsonb, p_source text default 'salon'
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org   text;
  v_debut timestamptz;
  v_n     integer := 0;
  m       jsonb;
  v_at    timestamptz;
begin
  if jsonb_typeof(p_messages) is distinct from 'array' then
    return 0;
  end if;
  select c.organisation_id, c.debut_at into v_org, v_debut from public.upwork_contrats c where c.contrat_id = p_contrat;
  if v_org is distinct from '2074065383597823773' then
    return 0;  -- jamais Calyra ni une autre équipe ; contrat inconnu : rien
  end if;
  for m in select * from jsonb_array_elements(p_messages) loop
    v_at := nullif(m ->> 'at', '')::timestamptz;
    continue when m ->> 'id' is null or v_at is null or coalesce(btrim(m ->> 'texte'), '') = '';
    continue when v_at < '2026-10-01'::timestamptz or (v_debut is not null and v_at < v_debut);
    insert into public.upwork_messages (id, contrat_id, organisation_id, poster_id, room_id, at, auteur_upwork_id, auteur_nom, role,
                                        texte, pieces, lien_conversation, source)
    values (m ->> 'id', p_contrat, v_org, p_poster, p_room, v_at, m ->> 'auteur_id', m ->> 'auteur_nom',
            public.upwork_message_role(p_contrat, m ->> 'de', m ->> 'auteur_nom', v_at),
            public.masquer_mot_de_passe(m ->> 'texte'),
            case when jsonb_typeof(m -> 'pieces') = 'array' then m -> 'pieces' else '[]'::jsonb end,
            case when p_room is not null then 'https://www.upwork.com/ab/messages/rooms/' || p_room
                 else 'https://www.upwork.com/nx/wm/workroom/' || p_contrat || '/messages' end,
            p_source)
    on conflict (id) do update
      set poster_id = coalesce(excluded.poster_id, upwork_messages.poster_id),
          room_id = coalesce(excluded.room_id, upwork_messages.room_id),
          auteur_upwork_id = coalesce(excluded.auteur_upwork_id, upwork_messages.auteur_upwork_id),
          auteur_nom = coalesce(excluded.auteur_nom, upwork_messages.auteur_nom),
          role = case when upwork_messages.role = 'nous' then excluded.role else upwork_messages.role end,
          pieces = case when jsonb_array_length(excluded.pieces) > 0 then excluded.pieces else upwork_messages.pieces end,
          lien_conversation = excluded.lien_conversation;
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$$;
revoke all on function public.upwork_messages_garder(text, uuid, text, jsonb, text) from public, anon, authenticated;
grant execute on function public.upwork_messages_garder(text, uuid, text, jsonb, text) to service_role;

-- Chaque lecture déjà faite par l'OS (upwork_salons) alimente la table.
create or replace function public.upwork_salons_vers_messages()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.upwork_messages_garder(new.contrat_id, new.poster_id, new.room_id, new.messages, 'salon');
  return null;
end;
$$;
do $t$
begin
  if not exists (select 1 from pg_trigger where tgname = 'upwork_salons_messages') then
    create trigger upwork_salons_messages after insert or update of messages on public.upwork_salons
      for each row execute function public.upwork_salons_vers_messages();
  end if;
end
$t$;

-- Qui peut lire : admin, Head of Ops, service, bots.
create or replace function public.conversation_lecteur_ok()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select current_user = 'bots_lecture' or coalesce(auth.role(), '') = 'service_role' or public.is_admin()
      or exists (select 1 from public.user_roles ur where ur.user_id = auth.uid() and ur.role = 'head_of_ops');
$$;

-- Le résumé compact d'un posteur : étapes, posts de la semaine, dernière décision, 3 derniers messages.
create or replace function public.posteur_resume(p_poster uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with p as (select * from public.profiles where id = p_poster),
  c as (select * from public.comptes c where c.poster_id = p_poster and coalesce(c.type_compte, 'perso') = 'perso'
         order by c.is_active desc, c.created_at limit 1),
  semaine as (select date_trunc('week', (now() at time zone 'Europe/Paris'))::date as lundi)
  select jsonb_build_object(
    'poster_id', p.id,
    'nom', concat_ws(' ', p.prenom, p.nom),
    'actif', p.is_active,
    'cohorte', p.cohorte_lundi,
    'contrat', p.upwork_contract_id,
    'etapes', jsonb_build_object(
      'connecte', coalesce(p.premiere_connexion_at, (select u.last_sign_in_at from auth.users u where u.id = p.id)) is not null,
      'slack', p.slack_user_id is not null,
      'handle', (select c.handle_tiktok from c),
      'start_warmup', (select c.warmup_started_at from c),
      'follows', (select r.abonnements from public.ckd_warmup_releves r where r.compte_id = (select c.id from c) and r.existe
                   order by r.releve_at desc limit 1),
      'pret', (select public.compte_pret(c.id) from c)),
    'posts_semaine', (select jsonb_build_object('publies', count(*) filter (where ps.publie_url is not null), 'prevus', count(*))
                        from public.passages ps join public.comptes cc on cc.id = ps.compte_id, semaine s
                       where cc.poster_id = p_poster and ps.date_publication_prevue between s.lundi and s.lundi + 6),
    'derniere_decision', (select d from (
        select jsonb_build_object('quoi', 'debut:' || dc.choix, 'at', dc.decide_at) d, dc.decide_at t from public.debut_choix dc where dc.poster_id = p_poster
        union all select jsonb_build_object('quoi', 'kill_dimanche:' || k.code, 'at', k.decide_at), k.decide_at from public.dimanche_kills k where k.poster_id = p_poster
        union all select jsonb_build_object('quoi', 'arret:' || a.source, 'at', a.created_at), a.created_at from public.arrets a where a.poster_id = p_poster and a.annule_at is null
      ) x order by t desc limit 1),
    'derniers_messages', coalesce((select jsonb_agg(jsonb_build_object('at', m.at, 'role', m.role, 'texte', left(m.texte, 300)) order by m.at desc)
                                     from (select * from public.upwork_messages m where m.poster_id = p_poster order by m.at desc limit 3) m), '[]'::jsonb))
  from p;
$$;

-- Tout l'échange d'un posteur précis, plus son contexte (sur demande seulement).
create or replace function public.conversation_complete(p_poster uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.conversation_lecteur_ok() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'posteur', public.posteur_resume(p_poster),
    'messages', coalesce((select jsonb_agg(jsonb_build_object('at', m.at, 'role', m.role, 'auteur', m.auteur_nom, 'texte', m.texte,
                                                                'pieces', m.pieces, 'contrat', m.contrat_id, 'lien', m.lien_conversation) order by m.at)
                            from public.upwork_messages m where m.poster_id = p_poster), '[]'::jsonb));
end;
$$;

-- Les messages arrivés depuis un instant (vu_at), groupés par posteur, avec son résumé compact.
create or replace function public.nouveaux_messages(p_depuis timestamptz)
returns table (poster_id uuid, nom text, nouveaux jsonb, resume jsonb)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
begin
  if not public.conversation_lecteur_ok() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return query
  select m.poster_id, max(concat_ws(' ', p.prenom, p.nom)),
         jsonb_agg(jsonb_build_object('at', m.at, 'role', m.role, 'auteur', m.auteur_nom, 'texte', m.texte, 'pieces', m.pieces,
                                      'lien', m.lien_conversation) order by m.at),
         public.posteur_resume(m.poster_id)
    from public.upwork_messages m
    left join public.profiles p on p.id = m.poster_id
   where m.vu_at > p_depuis and m.poster_id is not null
   group by m.poster_id;
end;
$$;

revoke all on function public.conversation_complete(uuid) from public, anon;
revoke all on function public.nouveaux_messages(timestamptz) from public, anon;
revoke all on function public.posteur_resume(uuid) from public, anon, authenticated;
grant execute on function public.conversation_complete(uuid) to authenticated, service_role, bots_lecture;
grant execute on function public.nouveaux_messages(timestamptz) to authenticated, service_role, bots_lecture;
grant execute on function public.conversation_lecteur_ok() to authenticated, service_role, bots_lecture;

-- La reprise : ce que l'OS a déjà lu (les 10 derniers messages par conversation).
select public.upwork_messages_garder(s.contrat_id, s.poster_id, s.room_id, s.messages, 'reprise_salons') from public.upwork_salons s;

notify pgrst, 'reload schema';
