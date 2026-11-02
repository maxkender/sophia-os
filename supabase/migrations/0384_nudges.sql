-- 0384 — v3 point 6 : « Nudge all » (admin).
--
-- 1. Cibles : la cohorte en warm-up (premiers posts lundi prochain), la
--    cohorte en 1ʳᵉ semaine (premiers posts ce lundi), tous les actifs, ou
--    les actifs d'une HM. Pour chaque compte, son blocage du moment
--    (`nudge_bloquant`) et le message qui va avec (réglage `nudge_messages`,
--    un texte par blocage, en anglais). Rien à débloquer : pas de nudge.
-- 2. L'admin voit l'aperçu (`nudge_cibles`), décoche, envoie : la fonction
--    `nudges` écrit sur Slack (sinon pop-up dans l'OS) et note chaque envoi
--    dans `nudges` (posteur, compte, type, canal, texte, envoye_at,
--    reponse_at, resolu_at).
-- 3. Réponse : un message du posteur au bot en DM (événement `message.im`,
--    `slack-faq`) ou « A répondu » sur la page. Résolu : le blocage a disparu
--    (`nudges_maj_resolus`, à chaque lecture et chaque matin).
-- 4. Escalade : au 2ᵉ nudge sans réponse ni résolution, le posteur passe dans
--    « À relancer sur Upwork » (lien du contrat), jusqu'à « Relancé ».
--
-- Additive : une table, un réglage créé s'il manque, des fonctions nouvelles.
-- La cohorte RUUL est exclue.

insert into public.reglages (cle, valeur) values
  ('nudge_messages', jsonb_build_object(
    'warmup_pas_lance', 'Hi {prenom}, your account @{handle} is ready in the OS. Please create it on TikTok and press "Start warmup" in the OS today.',
    'compte_introuvable', 'Hi {prenom}, we can''t find @{handle} on TikTok. Please create it with exactly this name, or tell us which name you used.',
    'reposts', 'Hi {prenom}, please do the 2 reposts of the warm-up on @{handle} and tick them in the OS.',
    'abonnements', 'Hi {prenom}, please follow at least 5 accounts with @{handle}: it''s part of the warm-up.',
    'posts_manques', 'Hi {prenom}, {n} posts on @{handle} are missing in the OS over the last 2 days. Please post them and paste each link in the OS.'
  ))
on conflict (cle) do nothing;

create table if not exists public.nudges (
  id                uuid primary key default gen_random_uuid(),
  poster_id         uuid not null references public.profiles (id) on delete cascade,
  compte_id         uuid,
  type              text not null,
  cible             text,
  canal             text not null check (canal in ('slack', 'os')),
  texte             text not null,
  envoye_at         timestamptz not null default now(),
  envoye_par        uuid references auth.users (id) on delete set null,
  reponse_at        timestamptz,
  resolu_at         timestamptz,
  upwork_relance_at timestamptz,
  slack_erreur      text
);

create index if not exists nudges_poster on public.nudges (poster_id, envoye_at desc);

alter table public.nudges enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'nudges'
                  and policyname = 'nudges_lecture_admin') then
    create policy nudges_lecture_admin on public.nudges for select to authenticated using (public.is_admin());
  end if;
end
$$;

comment on table public.nudges is
  'Nudge all (v3, 0384) : chaque relance envoyée à un posteur, sa réponse, sa résolution et l''escalade Upwork.';

-- ---------------------------------------------------------------------------
-- Le blocage d'un compte
-- ---------------------------------------------------------------------------

-- Le premier blocage du compte, dans l'ordre : en warm-up, warm-up pas lancé,
-- compte introuvable sur TikTok, reposts, abonnements ; en posts, posts
-- prévus des 2 derniers jours sans lien. Aucune ligne : rien à débloquer.
create or replace function public.nudge_bloquant(p_compte uuid)
returns table (type text, n integer)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  c public.comptes%rowtype;
  r public.ckd_warmup_releves%rowtype;
  v_auj date := (now() at time zone 'Europe/Paris')::date;
  v_manques integer;
begin
  select * into c from public.comptes where id = p_compte;
  if not found or not c.is_active then
    return;
  end if;
  if c.warmup_ends_at is null or c.warmup_ends_at > now() then
    if c.warmup_started_at is null then
      return query select 'warmup_pas_lance'::text, 0;
      return;
    end if;
    select * into r from public.ckd_warmup_releves w
     where w.compte_id = c.id and w.existe is not null order by w.releve_at desc limit 1;
    if found and r.existe = false then
      return query select 'compte_introuvable'::text, 0;
      return;
    end if;
    if c.warmup_reposts_at is null then
      return query select 'reposts'::text, 0;
      return;
    end if;
    if found and coalesce(r.abonnements, 0) < 5 then
      return query select 'abonnements'::text, coalesce(r.abonnements, 0);
      return;
    end if;
    return;
  end if;
  select count(*)::int into v_manques
    from public.passages p
   where p.compte_id = c.id
     and p.date_publication_prevue between v_auj - 2 and v_auj - 1
     and p.statut::text <> 'brouillon'
     and not coalesce(p.est_rappel, false)
     and p.publie_at is null;
  if v_manques > 0 then
    return query select 'posts_manques'::text, v_manques;
  end if;
end;
$$;

revoke execute on function public.nudge_bloquant(uuid) from public, anon, authenticated;
grant execute on function public.nudge_bloquant(uuid) to service_role;

-- Le texte d'un blocage (réglage `nudge_messages`).
create or replace function public.nudge_texte(p_type text, p_prenom text, p_handle text, p_n integer)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select replace(replace(replace(
           coalesce((select valeur ->> p_type from public.reglages where cle = 'nudge_messages'), ''),
           '{prenom}', coalesce(nullif(btrim(split_part(coalesce(p_prenom, ''), ' ', 1)), ''), 'there')),
           '{handle}', coalesce(p_handle, '')),
           '{n}', coalesce(p_n, 0)::text);
$$;

revoke execute on function public.nudge_texte(text, text, text, integer) from public, anon, authenticated;
grant execute on function public.nudge_texte(text, text, text, integer) to service_role;

-- ---------------------------------------------------------------------------
-- L'aperçu : qui serait relancé, pour quoi, avec quel texte
-- ---------------------------------------------------------------------------
--   p_cible : warmup | premiere_semaine | actifs ; p_hm : seulement ses posteurs.
create or replace function public.nudge_cibles(p_cible text, p_hm uuid default null)
returns table (
  poster_id   uuid,
  poster_nom  text,
  hm_id       uuid,
  hm_prenom   text,
  compte_id   uuid,
  handle      text,
  type        text,
  n           integer,
  texte       text,
  slack       boolean,
  nudges_sans_reponse integer
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_auj date := (now() at time zone 'Europe/Paris')::date;
  v_lundi date := v_auj - (extract(isodow from v_auj)::int - 1);
begin
  if coalesce(auth.role(), '') <> 'service_role' and not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_cible not in ('warmup', 'premiere_semaine', 'actifs') then
    raise exception 'cible inconnue : %', p_cible;
  end if;
  return query
  with comptes_cible as (
    select s.compte_id from public.hm_comptes_semaine(v_lundi + 7) s where p_cible = 'warmup'
    union
    select s.compte_id from public.hm_comptes_semaine(v_lundi) s where p_cible = 'premiere_semaine'
    union
    select c.id from public.comptes c
     where p_cible = 'actifs' and c.is_active and c.type_compte = 'perso'
       and not coalesce(c.ugc_ai_video, false) and not coalesce(c.videos_uniquement, false)
  )
  select c.poster_id, nullif(btrim(concat_ws(' ', pr.prenom, pr.nom)), ''), pr.manager_id, hm.prenom,
         c.id, c.handle_tiktok, b.type, b.n,
         public.nudge_texte(b.type, pr.prenom, c.handle_tiktok, b.n),
         pr.slack_user_id is not null,
         (select count(*)::int from public.nudges x
           where x.poster_id = c.poster_id and x.reponse_at is null and x.resolu_at is null
             and x.envoye_at > now() - interval '14 days')
    from comptes_cible cc
    join public.comptes c on c.id = cc.compte_id
    join public.profiles pr on pr.id = c.poster_id
    left join public.profiles hm on hm.id = pr.manager_id
    cross join lateral public.nudge_bloquant(c.id) b
   where c.is_active and pr.is_active
     and not exists (select 1 from public.hub_posteurs h where h.profile_id = c.poster_id)
     and (p_hm is null or pr.manager_id = p_hm)
   order by hm.prenom nulls last, 2, c.handle_tiktok;
end;
$$;

revoke execute on function public.nudge_cibles(text, uuid) from public, anon;
grant execute on function public.nudge_cibles(text, uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Réponse, résolution, escalade
-- ---------------------------------------------------------------------------

-- Résolu : le compte n'a plus ce blocage (ou s'est arrêté).
create or replace function public.nudges_maj_resolus()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  k integer;
begin
  update public.nudges n
     set resolu_at = now()
   where n.resolu_at is null
     and n.envoye_at > now() - interval '30 days'
     and not exists (select 1 from public.nudge_bloquant(n.compte_id) b where b.type = n.type);
  get diagnostics k = row_count;
  return k;
end;
$$;

revoke execute on function public.nudges_maj_resolus() from public, anon, authenticated;
grant execute on function public.nudges_maj_resolus() to service_role;

-- Le posteur a répondu au bot sur Slack (DM) : ses nudges ouverts.
create or replace function public.nudge_repondu_slack(p_slack_user text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  k integer;
begin
  update public.nudges n
     set reponse_at = now()
    from public.profiles p
   where p.slack_user_id = p_slack_user and n.poster_id = p.id
     and n.reponse_at is null and n.envoye_at > now() - interval '14 days';
  get diagnostics k = row_count;
  return k;
end;
$$;

revoke execute on function public.nudge_repondu_slack(text) from public, anon, authenticated;
grant execute on function public.nudge_repondu_slack(text) to service_role;

-- L'admin : « A répondu » (sur un nudge) ou « Relancé sur Upwork » (sur un posteur).
create or replace function public.nudge_marquer(p_id uuid, p_quoi text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_quoi = 'repondu' then
    update public.nudges set reponse_at = coalesce(reponse_at, now()) where id = p_id;
  elsif p_quoi = 'upwork' then
    -- p_id : le posteur ; tous ses nudges ouverts sont relancés.
    update public.nudges set upwork_relance_at = now()
     where poster_id = p_id and reponse_at is null and resolu_at is null and upwork_relance_at is null;
  else
    raise exception 'action inconnue : %', p_quoi;
  end if;
end;
$$;

revoke execute on function public.nudge_marquer(uuid, text) from public, anon;
grant execute on function public.nudge_marquer(uuid, text) to authenticated;

-- À relancer sur Upwork : au moins 2 nudges sans réponse ni résolution
-- (14 derniers jours) pas encore relancés.
create or replace function public.nudges_a_relancer_upwork()
returns table (
  poster_id      uuid,
  poster_nom     text,
  hm_prenom      text,
  upwork_contrat_url text,
  upwork_url     text,
  nudges         integer,
  dernier_at     timestamptz,
  types          text[]
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return query
  select n.poster_id, nullif(btrim(concat_ws(' ', pr.prenom, pr.nom)), ''), hm.prenom,
         pr.upwork_contrat_url, pr.upwork_url, count(*)::int, max(n.envoye_at),
         array_agg(distinct n.type)
    from public.nudges n
    join public.profiles pr on pr.id = n.poster_id
    left join public.profiles hm on hm.id = pr.manager_id
   where n.reponse_at is null and n.resolu_at is null and n.upwork_relance_at is null
     and n.envoye_at > now() - interval '14 days'
     and pr.is_active
   group by n.poster_id, pr.prenom, pr.nom, hm.prenom, pr.upwork_contrat_url, pr.upwork_url
  having count(*) >= 2
   order by max(n.envoye_at) desc;
end;
$$;

revoke execute on function public.nudges_a_relancer_upwork() from public, anon;
grant execute on function public.nudges_a_relancer_upwork() to authenticated;

-- L'historique (14 derniers jours) avec l'état de chaque nudge.
create or replace function public.nudges_liste(p_depuis date)
returns table (
  id          uuid,
  poster_id   uuid,
  poster_nom  text,
  hm_prenom   text,
  compte_id   uuid,
  handle      text,
  type        text,
  canal       text,
  texte       text,
  envoye_at   timestamptz,
  reponse_at  timestamptz,
  resolu_at   timestamptz,
  upwork_relance_at timestamptz,
  slack_erreur text
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return query
  select n.id, n.poster_id, nullif(btrim(concat_ws(' ', pr.prenom, pr.nom)), ''), hm.prenom, n.compte_id,
         c.handle_tiktok, n.type, n.canal, n.texte, n.envoye_at, n.reponse_at, n.resolu_at,
         n.upwork_relance_at, n.slack_erreur
    from public.nudges n
    join public.profiles pr on pr.id = n.poster_id
    left join public.profiles hm on hm.id = pr.manager_id
    left join public.comptes c on c.id = n.compte_id
   where n.envoye_at >= p_depuis
   order by n.envoye_at desc;
end;
$$;

revoke execute on function public.nudges_liste(date) from public, anon;
grant execute on function public.nudges_liste(date) to authenticated;

notify pgrst, 'reload schema';
