-- 0382 — v3 point 4 : le samedi, Kill ou Double, validés par Max, arrivent
-- chez le posteur.
--
-- 1. `posteur_messages` : ce que l'OS dit au posteur (pop-up, bandeau, Slack),
--    un message par posteur, par type et par semaine. Lu par son espace, par
--    sa HM (information seulement) et par l'admin.
-- 2. Kill (« ne pas renouveler ») : si `kill_message_auto`, la fonction `ckd`
--    crée le message le dimanche à 12 h (`kill_message_creer`) et l'envoie
--    sur Slack ; le posteur le voit aussi en bandeau. Seulement si tous ses
--    comptes actifs s'arrêtent : sinon il continue avec un compte.
-- 3. Double : valider « Doubler » ne crée plus le 2ᵉ compte. L'OS propose au
--    posteur une pop-up (Yes / No) à partir du dimanche, jusqu'à
--    `double_popup_expire` (mercredi 23 h 59). Yes : la fonction `ckd` crée le
--    compte, qui démarre le lundi J+9 comme avant (0369), et la paie passe en
--    « Modifier » (0380, 2 comptes la semaine suivante). No : le refus est
--    noté. Sans réponse à l'heure : l'offre expire.
-- 4. Réglages (table `reglages`, modifiables dans l'OS), créés s'ils
--    n'existent pas : `kill_message_auto` (true), `kill_message_texte`,
--    `double_popup_texte`, `double_popup_expire` ({"jour_iso":3,"heure":"23:59"}).
--    Textes en anglais ; `{prenom}` devient le prénom du posteur.
--
-- Additive : une table, des réglages créés s'ils manquent, des fonctions
-- nouvelles. Aucune ligne existante modifiée. La cohorte RUUL n'est pas
-- concernée (ses posteurs n'ont pas de propositions Check, Kill or Double).

-- ---------------------------------------------------------------------------
-- 1. Réglages
-- ---------------------------------------------------------------------------
insert into public.reglages (cle, valeur) values
  ('kill_message_auto', 'true'::jsonb),
  ('kill_message_texte', to_jsonb('Hi {prenom}, thank you for your work with us. We''re stopping our collaboration this week, so please don''t post after Sunday. All the best!'::text)),
  ('double_popup_texte', to_jsonb('You post really well! Do you want a second TikTok account? Same work on a second account, and your weekly pay doubles.'::text)),
  ('double_popup_expire', '{"jour_iso": 3, "heure": "23:59"}'::jsonb)
on conflict (cle) do nothing;

-- Un réglage texte, `{prenom}` remplacé.
create or replace function public.posteur_texte(p_cle text, p_prenom text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select replace(coalesce((select valeur #>> '{}' from public.reglages where cle = p_cle), ''),
                 '{prenom}', coalesce(nullif(btrim(split_part(coalesce(p_prenom, ''), ' ', 1)), ''), 'there'));
$$;

revoke execute on function public.posteur_texte(text, text) from public, anon;
grant execute on function public.posteur_texte(text, text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. Les messages
-- ---------------------------------------------------------------------------
create table if not exists public.posteur_messages (
  id              uuid primary key default gen_random_uuid(),
  poster_id       uuid not null references public.profiles (id) on delete cascade,
  compte_id       uuid,
  proposition_id  uuid,
  -- Le samedi du contrôle (ou le jour du message) : un message par semaine.
  semaine         date not null,
  type            text not null check (type in ('kill', 'double', 'recreer', 'nudge')),
  texte           text not null,
  visible_de      timestamptz not null default now(),
  expire_at       timestamptz,
  lu_at           timestamptz,
  reponse         text check (reponse in ('oui', 'non')),
  repondu_at      timestamptz,
  slack_statut    text check (slack_statut in ('envoye', 'introuvable', 'erreur')),
  slack_at        timestamptz,
  slack_erreur    text,
  erreur          text,
  created_at      timestamptz not null default now(),
  unique (poster_id, type, semaine)
);

create index if not exists posteur_messages_proposition on public.posteur_messages (proposition_id);

alter table public.posteur_messages enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'posteur_messages'
                  and policyname = 'posteur_messages_lecture') then
    create policy posteur_messages_lecture on public.posteur_messages for select to authenticated
      using (
        poster_id = auth.uid()
        or public.is_admin()
        or (public.is_hiring_manager()
            and exists (select 1 from public.profiles p where p.id = posteur_messages.poster_id and p.manager_id = auth.uid()))
      );
  end if;
end
$$;

comment on table public.posteur_messages is
  'Ce que l''OS dit au posteur (0382) : Kill (dimanche 12 h, Slack + bandeau), offre Double (pop-up Yes/No), et plus tard Recréer et Nudge.';

-- ---------------------------------------------------------------------------
-- 3. Double : l'offre, puis la réponse
-- ---------------------------------------------------------------------------

-- Validée par la fonction `ckd` à la place de la création du compte.
create or replace function public.double_offrir(p_id uuid)
returns public.posteur_messages
language plpgsql
security definer
set search_path = public
as $$
declare
  p public.ckd_propositions%rowtype;
  v_exp jsonb;
  v_jour_iso integer;
  v_heure time;
  v_expire date;
  v_prenom text;
  m public.posteur_messages;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'double_offrir : réservé à la fonction ckd';
  end if;
  select * into p from public.ckd_propositions where id = p_id;
  if not found or p.decision is distinct from 'doubler' then
    raise exception 'double_offrir : proposition introuvable ou pas en Doubler';
  end if;
  select valeur into v_exp from public.reglages where cle = 'double_popup_expire';
  v_jour_iso := coalesce((v_exp->>'jour_iso')::int, 3);
  v_heure := coalesce((v_exp->>'heure')::time, time '23:59');
  -- Le premier jour v_jour_iso après le samedi (mercredi : samedi + 4).
  v_expire := p.jour + 1 + ((v_jour_iso - extract(isodow from p.jour + 1)::int + 7) % 7);
  select prenom into v_prenom from public.profiles where id = p.poster_id;

  insert into public.posteur_messages (poster_id, compte_id, proposition_id, semaine, type, texte, visible_de, expire_at)
  values (p.poster_id, p.compte_id, p.id, p.jour, 'double', public.posteur_texte('double_popup_texte', v_prenom),
          greatest(now(), ((p.jour + 1)::timestamp at time zone 'Europe/Paris')),
          ((v_expire + v_heure)::timestamp at time zone 'Europe/Paris'))
  on conflict (poster_id, type, semaine) do update
    set proposition_id = excluded.proposition_id, compte_id = excluded.compte_id, texte = excluded.texte,
        visible_de = excluded.visible_de, expire_at = excluded.expire_at, erreur = null
    where posteur_messages.reponse is null
  returning * into m;
  return m;
end;
$$;

revoke execute on function public.double_offrir(uuid) from public, anon, authenticated;
grant execute on function public.double_offrir(uuid) to service_role;

-- La réponse du posteur, appelée par la fonction `ckd` avec l'ID du posteur
-- connecté. Rend la proposition (Yes : la fonction crée alors le compte).
create or replace function public.double_repondre(p_message uuid, p_reponse text, p_poster uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  m public.posteur_messages%rowtype;
  v_decision text;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'double_repondre : réservé à la fonction ckd';
  end if;
  if p_reponse not in ('oui', 'non') then
    raise exception 'double_repondre : réponse oui ou non';
  end if;
  select * into m from public.posteur_messages where id = p_message for update;
  if not found or m.type <> 'double' or m.poster_id <> p_poster then
    raise exception 'double_repondre : offre introuvable';
  end if;
  if m.reponse is not null then
    raise exception 'double_repondre : déjà répondu';
  end if;
  if m.expire_at is not null and m.expire_at <= now() then
    raise exception 'double_repondre : offre expirée';
  end if;
  select decision into v_decision from public.ckd_propositions where id = m.proposition_id;
  if v_decision is distinct from 'doubler' then
    raise exception 'double_repondre : offre retirée';
  end if;
  update public.posteur_messages set reponse = p_reponse, repondu_at = now(), lu_at = coalesce(lu_at, now())
   where id = p_message;
  return m.proposition_id;
end;
$$;

revoke execute on function public.double_repondre(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.double_repondre(uuid, text, uuid) to service_role;

-- ---------------------------------------------------------------------------
-- 4. Kill : le message du dimanche
-- ---------------------------------------------------------------------------

-- Crée le message de Kill d'une proposition validée, si le réglage est actif
-- et si tous les comptes actifs du posteur s'arrêtent. Rend le message s'il
-- vient d'être créé, rien sinon (déjà créé, réglage coupé, posteur gardé).
create or replace function public.kill_message_creer(p_id uuid)
returns setof public.posteur_messages
language plpgsql
security definer
set search_path = public
as $$
declare
  p public.ckd_propositions%rowtype;
  v_prenom text;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'kill_message_creer : réservé à la fonction ckd';
  end if;
  if not coalesce((select (valeur #>> '{}')::boolean from public.reglages where cle = 'kill_message_auto'), false) then
    return;
  end if;
  select * into p from public.ckd_propositions where id = p_id;
  if not found or p.decision is distinct from 'ne_pas_renouveler' then
    return;
  end if;
  -- Un compte actif sans arrêt prévu : le posteur continue, pas de message.
  if exists (select 1 from public.comptes c
              where c.poster_id = p.poster_id and c.is_active
                and not exists (select 1 from public.ckd_arrets a
                                 where a.compte_id = c.id and a.annule_at is null and a.fait_at is null)) then
    return;
  end if;
  select prenom into v_prenom from public.profiles where id = p.poster_id;
  return query
  insert into public.posteur_messages (poster_id, compte_id, proposition_id, semaine, type, texte)
  values (p.poster_id, p.compte_id, p.id, p.jour, 'kill', public.posteur_texte('kill_message_texte', v_prenom))
  on conflict (poster_id, type, semaine) do nothing
  returning *;
end;
$$;

revoke execute on function public.kill_message_creer(uuid) from public, anon, authenticated;
grant execute on function public.kill_message_creer(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- 5. L'espace du posteur
-- ---------------------------------------------------------------------------

-- Ce qu'il doit voir maintenant : l'offre Double en cours, le Kill de la
-- semaine (7 jours), et plus tard les autres types.
create or replace function public.mes_messages_posteur()
returns table (id uuid, type text, texte text, expire_at timestamptz, created_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select m.id, m.type, m.texte, m.expire_at, m.created_at
    from public.posteur_messages m
    left join public.ckd_propositions p on p.id = m.proposition_id
   where m.poster_id = auth.uid()
     and m.visible_de <= now()
     and (
       (m.type = 'double' and m.reponse is null and (m.expire_at is null or m.expire_at > now())
          and p.decision = 'doubler')
       or (m.type = 'kill' and m.created_at > now() - interval '7 days'
          and (p.id is null or p.decision = 'ne_pas_renouveler'))
     )
   order by m.created_at desc;
$$;

revoke execute on function public.mes_messages_posteur() from public, anon;
grant execute on function public.mes_messages_posteur() to authenticated;

-- ---------------------------------------------------------------------------
-- 6. Le suivi (admin : tout ; HM : ses posteurs, en lecture)
-- ---------------------------------------------------------------------------
create or replace function public.messages_posteurs(p_depuis date)
returns table (
  id            uuid,
  poster_id     uuid,
  poster_nom    text,
  hm_id         uuid,
  hm_prenom     text,
  compte_id     uuid,
  proposition_id uuid,
  semaine       date,
  type          text,
  texte         text,
  statut        text,
  visible_de    timestamptz,
  expire_at     timestamptz,
  lu_at         timestamptz,
  reponse       text,
  repondu_at    timestamptz,
  slack_statut  text,
  slack_at      timestamptz,
  erreur        text,
  nouveau_compte_id uuid,
  created_at    timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  tous boolean := public.is_admin();
begin
  if not tous and not public.is_hiring_manager() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return query
  select m.id, m.poster_id, nullif(btrim(concat_ws(' ', pr.prenom, pr.nom)), ''), pr.manager_id, hm.prenom,
         m.compte_id, m.proposition_id, m.semaine, m.type, m.texte,
         case
           when m.type = 'double' and p.decision is distinct from 'doubler' then 'retiree'
           when m.type = 'double' and m.reponse = 'oui' and p.nouveau_compte_id is not null then 'acceptee'
           when m.type = 'double' and m.reponse = 'oui' then 'acceptee_compte_a_creer'
           when m.type = 'double' and m.reponse = 'non' then 'refusee'
           when m.type = 'double' and m.expire_at <= now() then 'expiree'
           when m.type = 'double' and m.visible_de > now() then 'programmee'
           when m.type = 'double' then 'en_attente'
           when m.lu_at is not null then 'lu'
           else 'envoye'
         end,
         m.visible_de, m.expire_at, m.lu_at, m.reponse, m.repondu_at, m.slack_statut, m.slack_at,
         coalesce(m.erreur, p.erreur), p.nouveau_compte_id, m.created_at
    from public.posteur_messages m
    join public.profiles pr on pr.id = m.poster_id
    left join public.profiles hm on hm.id = pr.manager_id
    left join public.ckd_propositions p on p.id = m.proposition_id
   where m.semaine >= p_depuis
     and (tous or pr.manager_id = auth.uid())
   order by m.created_at desc;
end;
$$;

revoke execute on function public.messages_posteurs(date) from public, anon;
grant execute on function public.messages_posteurs(date) to authenticated, service_role;

notify pgrst, 'reload schema';
