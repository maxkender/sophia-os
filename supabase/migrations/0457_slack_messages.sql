-- Prompt 27, suite : les messages des posteurs dans les canaux Slack.
--
-- Le bot FAQ ne gardait que les questions qu'il traitait : des messages de
-- #questions (et ceux des canaux de zone) manquaient dans la colonne Context.
-- slack_messages garde tout message humain des canaux où est l'appli (reçu par
-- slack-faq, et les 30 derniers jours repris une fois par ckd,
-- action slack_messages_reprendre), sans rien classer ni répondre.
-- messages_posteurs (0456) les lit.

create table if not exists public.slack_messages (
  canal text not null,
  ts text not null,
  slack_user text not null,
  texte text,
  at timestamptz not null,
  fil_ts text,
  recu_at timestamptz not null default now(),
  primary key (canal, ts)
);
create index if not exists slack_messages_user on public.slack_messages (slack_user, at desc);
alter table public.slack_messages enable row level security;
create policy "slack_messages lecture" on public.slack_messages for select using ((select public.is_admin()));

create or replace function public.messages_posteurs(p_posteurs uuid[])
returns table (poster_id uuid, sens text, canal text, at timestamptz, texte text, lien text, cas text)
language sql
stable
security definer
set search_path = public
as $$
  with po as (
    select pr.id, pr.slack_user_id, pr.upwork_contract_id,
           s.room_id, s.lu_at as salon_lu_at, s.messages as salon_messages
      from public.profiles pr
      left join public.upwork_salons s on s.contrat_id = pr.upwork_contract_id
     where pr.id = any (p_posteurs)
  ),
  -- La conversation Upwork relue fait foi pour Upwork jusqu'à sa lecture (pas de doublon).
  couvert as (
    select po.id, po.salon_lu_at from po where po.room_id is not null and po.salon_lu_at is not null
  ),
  upwork_lien as (
    select po.id,
           case when po.room_id is not null then 'https://www.upwork.com/ab/messages/rooms/' || po.room_id
                when po.upwork_contract_id is not null then 'https://www.upwork.com/nx/wm/workroom/' || po.upwork_contract_id || '/messages'
           end as lien
      from po
  )
  -- Reçus : la conversation Upwork.
  select po.id, case when m ->> 'de' = 'posteur' then 'recu' else 'envoye' end, 'upwork',
         (m ->> 'at')::timestamptz, left(m ->> 'texte', 2000), ul.lien, null::text
    from po
    join upwork_lien ul on ul.id = po.id
    cross join lateral jsonb_array_elements(coalesce(po.salon_messages, '[]'::jsonb)) m
  union all
  -- Reçus : posteur_reponses (Upwork avant la 1re lecture du salon, DM au bot, boutons, Send to OS).
  select r.poster_id, 'recu',
         case when r.canal = 'bouton' then 'bouton' when r.lien is not null then 'send_to_os' else r.canal end,
         r.recu_at, left(r.texte, 2000),
         coalesce(r.lien,
                  case when r.canal = 'upwork' then (select ul.lien from upwork_lien ul where ul.id = r.poster_id)
                       else (select 'https://sophia-system.slack.com/team/' || po.slack_user_id from po where po.id = r.poster_id and po.slack_user_id is not null) end),
         coalesce(r.corrige_cas, r.cas, case when r.canal = 'bouton' and r.texte = 'I want to stop' then 'stop' end)
    from public.posteur_reponses r
   where r.poster_id = any (p_posteurs)
     and not (r.canal = 'upwork' and exists (select 1 from couvert c where c.id = r.poster_id and r.recu_at <= c.salon_lu_at))
  union all
  -- Reçus : ses messages dans les canaux Slack où est l'appli (#questions, canaux de zone…), gardés depuis 0457.
  select po.id, 'recu', 'slack', sm.at, left(sm.texte, 2000),
         'https://sophia-system.slack.com/archives/' || sm.canal || '/p' || replace(sm.ts, '.', ''), null
    from public.slack_messages sm
    join po on po.slack_user_id is not null and po.slack_user_id = sm.slack_user
  union all
  -- Reçus : ses questions au bot (#questions) pas déjà gardées ci-dessus, et le chatbot du dashboard.
  select po.id, 'recu', case when q.source = 'os' then 'dashboard' else 'slack' end, q.created_at, left(q.question, 2000),
         case when q.source = 'slack' and q.slack_canal is not null and q.slack_ts is not null
              then 'https://sophia-system.slack.com/archives/' || q.slack_canal || '/p' || replace(q.slack_ts, '.', '') end,
         null
    from public.chatbot_questions q
    join po on po.id = q.user_id or (q.user_id is null and q.slack_user_id is not null and q.slack_user_id = po.slack_user_id)
   where q.role = 'poster' and q.source in ('slack', 'os') and coalesce(q.test, false) = false
     and not exists (select 1 from public.slack_messages sm where sm.canal = q.slack_canal and sm.ts = q.slack_ts)
  union all
  -- Envoyés : les réponses du bot dans Slack.
  select po.id, 'envoye', 'slack', q.envoye_at, left(coalesce(q.reponse_humaine, q.reponse), 2000),
         case when q.slack_canal is not null and coalesce(q.slack_reponse_ts, q.slack_ts) is not null
              then 'https://sophia-system.slack.com/archives/' || q.slack_canal || '/p' || replace(coalesce(q.slack_reponse_ts, q.slack_ts), '.', '') end,
         null
    from public.chatbot_questions q
    join po on po.id = q.user_id or (q.user_id is null and q.slack_user_id is not null and q.slack_user_id = po.slack_user_id)
   where q.role = 'poster' and q.source = 'slack' and q.envoye_at is not null and coalesce(q.reponse_humaine, q.reponse) is not null
     and coalesce(q.test, false) = false
  union all
  -- Envoyés : nos nudges et relances (Upwork seul : couvert par la conversation relue).
  select n.poster_id, 'envoye', coalesce(nullif(array_to_string(n.canaux, '+'), ''), n.canal), n.envoye_at, left(n.texte, 2000),
         case when coalesce(nullif(array_to_string(n.canaux, '+'), ''), n.canal) = 'upwork'
              then (select ul.lien from upwork_lien ul where ul.id = n.poster_id)
              else (select 'https://sophia-system.slack.com/team/' || po.slack_user_id from po where po.id = n.poster_id and po.slack_user_id is not null) end,
         null
    from public.nudges n
   where n.poster_id = any (p_posteurs) and n.envoye_at is not null
     and not (coalesce(nullif(array_to_string(n.canaux, '+'), ''), n.canal) = 'upwork'
              and exists (select 1 from couvert c where c.id = n.poster_id and n.envoye_at <= c.salon_lu_at))
  union all
  -- Envoyés : la bienvenue (Upwork).
  select a.poster_id, 'envoye', 'upwork', a.message_at, left(a.message_texte, 2000),
         (select ul.lien from upwork_lien ul where ul.id = a.poster_id), null
    from public.accueils a
   where a.poster_id = any (p_posteurs) and a.message_at is not null
     and not exists (select 1 from couvert c where c.id = a.poster_id and a.message_at <= c.salon_lu_at)
  union all
  -- Envoyés : les réponses automatiques de l'OS.
  select r.poster_id, 'envoye', r.canal, r.reponse_at, left(r.reponse_texte, 2000), null, null
    from public.posteur_reponses r
   where r.poster_id = any (p_posteurs) and r.reponse_at is not null and r.reponse_statut = 'envoye'
     and not (r.canal = 'upwork' and exists (select 1 from couvert c where c.id = r.poster_id and r.reponse_at <= c.salon_lu_at));
$$;
revoke all on function public.messages_posteurs(uuid[]) from public, anon, authenticated;

notify pgrst, 'reload schema';
