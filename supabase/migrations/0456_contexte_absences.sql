-- Prompt 27 : le contexte dans la masterlist, et « I'll be away ».
--
-- 1. upwork_salons : la conversation Upwork de chaque contrat actif, relue
--    (lecture seule) par la fonction upwork (action contexte_upwork, cron
--    toutes les 2 h, 120 contrats par passage, les plus anciens d'abord) :
--    les 10 derniers messages des deux côtés, sans rien classer ni répondre.
-- 2. absences_declarees : « I'll be away » sur le dashboard du posteur.
--    Rien d'autre : pas de pause, pas de message, ni paie ni proposition
--    changées. « I'm back » termine l'absence le jour même (retour_le).
-- 3. messages_posteurs(posteurs) : tous les messages connus, des deux
--    côtés (Upwork, #questions, Send to OS, DM au bot, boutons, chatbot du
--    dashboard ; nos nudges, la bienvenue, les réponses du bot et de l'OS).
--    posteur_fil(posteur) : les 10 derniers (Details).
--    masterlist_contexte(lundi, posteurs) : la colonne Context et la
--    colonne Away de la masterlist.

-- 1. Les conversations Upwork -------------------------------------------------
create table if not exists public.upwork_salons (
  contrat_id text primary key,
  poster_id uuid references public.profiles(id) on delete set null,
  room_id text,
  freelance_id text,
  -- Les 10 derniers messages : [{id, at, texte, de: 'posteur' | 'nous'}], du plus récent au plus ancien.
  messages jsonb not null default '[]'::jsonb,
  dernier_posteur_at timestamptz,
  dernier_nous_at timestamptz,
  lu_at timestamptz,
  erreur text
);
alter table public.upwork_salons enable row level security;
create policy "upwork_salons lecture" on public.upwork_salons for select using ((select public.is_admin()));

create or replace function public.contexte_cibles_upwork(p_posteurs uuid[] default null, p_max integer default 120)
returns table (poster_id uuid, contrat_id text, organisation_id text, room_id text, freelance_id text)
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
  select x.poster_id, x.contrat_id, x.organisation_id, x.room_id, x.freelance_id
    from (
      select distinct on (pr.upwork_contract_id)
             pr.id as poster_id, pr.upwork_contract_id as contrat_id, uc.organisation_id, s.room_id, s.freelance_id, s.lu_at
        from public.profiles pr
        join public.upwork_contrats uc on uc.contrat_id = pr.upwork_contract_id
        left join public.upwork_salons s on s.contrat_id = pr.upwork_contract_id
       where pr.is_active and pr.upwork_contract_id is not null and uc.actif
         and not exists (select 1 from public.hub_posteurs h where h.profile_id = pr.id)
         and (p_posteurs is null or pr.id = any (p_posteurs))
       order by pr.upwork_contract_id, pr.created_at
    ) x
   order by x.lu_at nulls first, x.contrat_id
   limit greatest(1, least(coalesce(p_max, 120), 400));
end;
$$;
revoke all on function public.contexte_cibles_upwork(uuid[], integer) from public, anon;
grant execute on function public.contexte_cibles_upwork(uuid[], integer) to authenticated, service_role;

-- 2. Les absences déclarées ------------------------------------------------------
create table if not exists public.absences_declarees (
  id uuid primary key default gen_random_uuid(),
  poster_id uuid not null references public.profiles(id) on delete cascade,
  debut date not null,
  jours integer not null check (jours between 1 and 14),
  fin date not null,
  raison text check (raison is null or length(raison) <= 200),
  declare_at timestamptz not null default now(),
  retour_le date,
  retour_at timestamptz
);
create index if not exists absences_declarees_poster on public.absences_declarees (poster_id, debut desc);
alter table public.absences_declarees enable row level security;
create policy "absences lecture" on public.absences_declarees for select
  using (poster_id = (select auth.uid()) or (select public.is_admin()));

-- L'absence en cours ou à venir du posteur (retour_le avant le début : annulée).
create or replace function public.mon_absence()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object('id', a.id, 'debut', a.debut, 'fin', coalesce(a.retour_le, a.fin), 'jours', a.jours, 'raison', a.raison)
    from public.absences_declarees a
   where a.poster_id = auth.uid()
     and coalesce(a.retour_le, a.fin) >= (now() at time zone 'Europe/Paris')::date
     and (a.retour_le is null or a.retour_le >= a.debut)
   order by a.debut
   limit 1;
$$;
revoke all on function public.mon_absence() from public, anon;
grant execute on function public.mon_absence() to authenticated;

create or replace function public.absence_declarer(p_debut date, p_jours integer, p_raison text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_auj date := (now() at time zone 'Europe/Paris')::date;
  v_raison text := nullif(left(btrim(coalesce(p_raison, '')), 200), '');
  v_id uuid;
begin
  if auth.uid() is null or not exists (select 1 from public.profiles where id = auth.uid() and is_active) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_jours is null or p_jours < 1 or p_jours > 14 then
    raise exception 'How many days: 1 to 14.' using errcode = '22023';
  end if;
  if p_debut is null or p_debut < v_auj or p_debut > v_auj + 30 then
    raise exception 'From: today or a date in the next 30 days.' using errcode = '22023';
  end if;
  if public.mon_absence() is not null then
    raise exception 'You already declared an absence. Click “I''m back” first.' using errcode = '22023';
  end if;
  insert into public.absences_declarees (poster_id, debut, jours, fin, raison)
  values (auth.uid(), p_debut, p_jours, p_debut + p_jours - 1, v_raison)
  returning id into v_id;
  return public.mon_absence();
end;
$$;
revoke all on function public.absence_declarer(date, integer, text) from public, anon;
grant execute on function public.absence_declarer(date, integer, text) to authenticated;

-- « I'm back » : l'absence en cours se termine aujourd'hui ; une absence à venir est annulée.
create or replace function public.absence_retour()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_auj date := (now() at time zone 'Europe/Paris')::date;
  v_id uuid := (public.mon_absence() ->> 'id')::uuid;
begin
  if v_id is null then
    return null;
  end if;
  update public.absences_declarees
     set retour_le = case when debut > v_auj then debut - 1 else v_auj end, retour_at = now()
   where id = v_id and poster_id = auth.uid();
  return jsonb_build_object('id', v_id, 'retour_le', v_auj);
end;
$$;
revoke all on function public.absence_retour() from public, anon;
grant execute on function public.absence_retour() to authenticated;

-- 3. Les messages des deux côtés -------------------------------------------------
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
  -- Reçus : ses messages dans les canaux Slack (#questions), et le chatbot du dashboard.
  select po.id, 'recu', case when q.source = 'os' then 'dashboard' else 'slack' end, q.created_at, left(q.question, 2000),
         case when q.source = 'slack' and q.slack_canal is not null and q.slack_ts is not null
              then 'https://sophia-system.slack.com/archives/' || q.slack_canal || '/p' || replace(q.slack_ts, '.', '') end,
         null
    from public.chatbot_questions q
    join po on po.id = q.user_id or (q.user_id is null and q.slack_user_id is not null and q.slack_user_id = po.slack_user_id)
   where q.role = 'poster' and q.source in ('slack', 'os') and coalesce(q.test, false) = false
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

create or replace function public.posteur_fil(p_poster uuid, p_n integer default 10)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select case when not public.is_admin() then null else coalesce((
    select jsonb_agg(jsonb_build_object('sens', m.sens, 'canal', m.canal, 'at', m.at, 'texte', m.texte, 'lien', m.lien, 'cas', m.cas) order by m.at desc)
      from (select * from public.messages_posteurs(array[p_poster]) x where x.at is not null order by x.at desc limit greatest(1, least(coalesce(p_n, 10), 50))) m
  ), '[]'::jsonb) end;
$$;
revoke all on function public.posteur_fil(uuid, integer) from public, anon;
grant execute on function public.posteur_fil(uuid, integer) to authenticated;

create or replace function public.masterlist_contexte(p_lundi date, p_posteurs uuid[])
returns table (
  poster_id uuid, dernier_recu jsonb, dernier_envoye jsonb, repondu boolean, derniere_connexion timestamptz,
  dernier_post_at timestamptz, arrivee timestamptz, badges text[], absence jsonb, absences_30j integer, upwork_lu_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  with m as (select * from public.messages_posteurs(p_posteurs) where at is not null),
  debut as (select (p_lundi::timestamp at time zone 'Europe/Paris') as t)
  select pr.id,
         (select jsonb_build_object('canal', x.canal, 'at', x.at, 'texte', x.texte, 'lien', x.lien)
            from m x where x.poster_id = pr.id and x.sens = 'recu' order by x.at desc limit 1),
         (select jsonb_build_object('canal', x.canal, 'at', x.at, 'texte', x.texte, 'lien', x.lien)
            from m x where x.poster_id = pr.id and x.sens = 'envoye' order by x.at desc limit 1),
         exists (select 1 from m r, lateral (select max(e.at) as at from m e where e.poster_id = pr.id and e.sens = 'envoye') e
                  where r.poster_id = pr.id and r.sens = 'recu' and e.at is not null and r.at > e.at),
         greatest(u.last_sign_in_at, (select max(coalesce(s.refreshed_at, s.updated_at)) from auth.sessions s where s.user_id = pr.id)),
         (select max(coalesce(pa.publie_at, pa.lien_confirme_at)) from public.passages pa
            join public.comptes co on co.id = pa.compte_id
           where co.poster_id = pr.id and pa.publie_url is not null),
         coalesce(pr.offre_acceptee_le::timestamptz, pr.created_at),
         (select array_agg(distinct b) from (
            select case x.cas when 'stop' then 'stop' when 'absent' then 'absent' when 'paie' then 'paie' end as b
              from m x, debut d where x.poster_id = pr.id and x.sens = 'recu' and x.at >= d.t) bb where b is not null),
         (select jsonb_build_object('debut', a.debut, 'fin', coalesce(a.retour_le, a.fin), 'jours', a.jours, 'raison', a.raison,
                                    'declare_at', a.declare_at, 'retour', a.retour_le is not null)
            from public.absences_declarees a
           where a.poster_id = pr.id and (a.retour_le is null or a.retour_le >= a.debut)
             and a.debut <= p_lundi + 6 and coalesce(a.retour_le, a.fin) >= p_lundi
           order by a.declare_at desc limit 1),
         (select count(*)::int from public.absences_declarees a
           where a.poster_id = pr.id and a.declare_at > now() - interval '30 days'),
         (select s.lu_at from public.upwork_salons s where s.contrat_id = pr.upwork_contract_id)
    from public.profiles pr
    left join auth.users u on u.id = pr.id
   where pr.id = any (p_posteurs) and public.is_admin();
$$;
revoke all on function public.masterlist_contexte(date, uuid[]) from public, anon;
grant execute on function public.masterlist_contexte(date, uuid[]) to authenticated;

-- 4. Le cron : toutes les 2 h à :25, 120 conversations (les plus anciennes d'abord), lecture seule.
-- La commande est celle de reponses-upwork, seule l'action change (le secret n'est jamais écrit ici).
do $c$
declare
  v text;
begin
  select regexp_replace(j.command, '"action"\s*:\s*"reponses_lire"', '"action":"contexte_upwork"') into v
    from cron.job j where j.jobname = 'reponses-upwork';
  if v is not null and v ~ '"action":"contexte_upwork"' and not exists (select 1 from cron.job where jobname = 'contexte-upwork') then
    perform cron.schedule('contexte-upwork', '25 */2 * * *', v);
  end if;
end;
$c$;

notify pgrst, 'reload schema';
