-- 0444 — Le @ TikTok qui ne correspond pas (cas réel : l'OS attendait
-- @sara.studie746, la recrue a créé @sara.studio746).
--
-- - `handles_proposes` : le @ exact donné par la recrue (dashboard « My TikTok
--   account », ou une réponse Slack / Upwork), et ce que la lecture TikTok a
--   donné (trouvé → le @ du compte est remplacé, les dates du warm-up gardées ;
--   introuvable). Le posteur lit les siennes ; l'admin toutes.
-- - `handles_introuvables()` : Start warmup cliqué, et les 2 dernières lectures
--   lisibles du @ (au moins 12 h après le clic) ne le trouvent pas. Avec le 1er
--   message « we can't find your TikTok account » (Slack, puis Upwork 24 h
--   après sans réaction), la dernière réaction et le dernier @ donné.
-- - 4 textes en anglais, modifiables dans l'OS (Messages sent → Texts).
-- - needs_you : « Start warmup cliqué, compte introuvable » seulement 48 h après
--   le 1er message, avec le @ attendu et le @ donné par la recrue (Fix handle).
--   Filet : aucun message parti (relances sur off), 72 h après le clic.
--
-- Additive : 1 table, 1 fonction, 4 réglages (s'ils n'existent pas), needs_you
-- complété. Aucune donnée existante modifiée.

create table if not exists public.handles_proposes (
  id             uuid primary key default gen_random_uuid(),
  poster_id      uuid not null references public.profiles(id) on delete cascade,
  compte_id      uuid not null references public.comptes(id) on delete cascade,
  handle_attendu text,
  handle_propose text not null,
  source         text not null check (source in ('dashboard', 'slack', 'upwork', 'admin')),
  reponse_id     uuid unique references public.posteur_reponses(id) on delete set null,
  statut         text not null default 'a_verifier' check (statut in ('a_verifier', 'trouve', 'introuvable')),
  demande_at     timestamptz not null default now(),
  verifie_at     timestamptz,
  tentatives     integer not null default 0,
  erreur         text
);
comment on table public.handles_proposes is
  '0444 : le @ TikTok exact donné par la recrue, vérifié par une lecture TikTok (trouvé : le @ du compte est remplacé).';
create index if not exists handles_proposes_compte on public.handles_proposes (compte_id, demande_at desc);
create index if not exists handles_proposes_a_verifier on public.handles_proposes (demande_at) where statut = 'a_verifier';

alter table public.handles_proposes enable row level security;
drop policy if exists handles_proposes_lecture on public.handles_proposes;
create policy handles_proposes_lecture on public.handles_proposes for select to authenticated
  using (poster_id = auth.uid() or public.is_admin());

create or replace function public.handles_introuvables()
returns table (
  compte_id      uuid,
  poster_id      uuid,
  handle         text,
  warmup_at      timestamptz,
  introuvable_at timestamptz,
  message_at     timestamptz,
  message_canaux text[],
  upwork_at      timestamptz,
  reaction_at    timestamptz,
  propose        text,
  propose_statut text,
  propose_at     timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
begin
  if not (public.is_admin() or coalesce(auth.jwt() ->> 'role', '') = 'service_role') then
    raise exception 'handles_introuvables : réservé à l''admin' using errcode = '42501';
  end if;
  return query
  with c as (
    select c.id, c.poster_id, c.handle_tiktok, c.warmup_started_at
      from public.comptes c
      join public.profiles pr on pr.id = c.poster_id and pr.is_active
     where c.is_active and c.warmup_started_at is not null and nullif(btrim(c.handle_tiktok), '') is not null
       and not exists (select 1 from public.hub_posteurs h where h.profile_id = c.poster_id)
  ),
  l as (
    select x.compte_id, x.existe, x.releve_at,
           row_number() over (partition by x.compte_id order by x.releve_at desc) as n
      from public.ckd_warmup_releves x
      join c on c.id = x.compte_id
     where lower(x.handle) = lower(c.handle_tiktok)
       and x.existe is not null
       and x.releve_at >= c.warmup_started_at + interval '12 hours'
  ),
  k as (
    select l.compte_id, min(l.releve_at) as depuis
      from l where l.n <= 2
     group by l.compte_id
    having count(*) = 2 and bool_and(not l.existe)
  )
  select c.id, c.poster_id, c.handle_tiktok, c.warmup_started_at, k.depuis,
         m.envoye_at, m.canaux, u.envoye_at,
         greatest(
           (select max(r.recu_at) from public.posteur_reponses r where r.poster_id = c.poster_id and r.recu_at > m.envoye_at),
           (select max(h.demande_at) from public.handles_proposes h where h.compte_id = c.id and h.demande_at > m.envoye_at)),
         hp.handle_propose, hp.statut, hp.demande_at
    from c
    join k on k.compte_id = c.id
    left join lateral (
      select n.envoye_at, n.canaux from public.nudges n
       where n.poster_id = c.poster_id and n.type = 'handle'
         and (n.slack_erreur is null or coalesce(array_length(n.canaux, 1), 0) > 0)
       order by n.envoye_at limit 1) m on true
    left join lateral (
      select n.envoye_at from public.nudges n
       where n.poster_id = c.poster_id and n.type = 'handle_upwork'
         and (n.slack_erreur is null or coalesce(array_length(n.canaux, 1), 0) > 0)
       order by n.envoye_at limit 1) u on true
    left join lateral (
      select h.handle_propose, h.statut, h.demande_at from public.handles_proposes h
       where h.compte_id = c.id order by h.demande_at desc limit 1) hp on true;
end;
$$;
revoke all on function public.handles_introuvables() from public, anon;
grant execute on function public.handles_introuvables() to authenticated, service_role;

insert into public.reglages (cle, valeur) values
  ('handle_introuvable_texte', to_jsonb('Hi {prenom}, we can''t find your TikTok account @{handle}. If your account has a different name, update it on your dashboard (My TikTok account), or reply here with your exact @.'::text)),
  ('handle_excuse_texte', to_jsonb('Sorry, our last message was a mistake. If your account has a different name than @{handle}, update it on your dashboard or reply with your exact @.'::text)),
  ('handle_trouve_texte', to_jsonb('Thanks, we found @{handle}.'::text)),
  ('handle_pas_trouve_texte', to_jsonb('We still can''t find @{handle}, please check the spelling.'::text))
on conflict (cle) do nothing;

-- needs_you : le compte introuvable après Start warmup n'arrive qu'48 h après le
-- 1er message « we can't find your TikTok account », avec le @ donné par la recrue.
do $ny$
declare
  v_def text := pg_get_functiondef('public.needs_you()'::regprocedure);
  v_texte_avant text := $q$           c.poster_id, null, '@' || w.handle,
           case when c.warmup_started_at is not null then 'Start warmup cliqué, mais compte introuvable au relevé du ' else 'Compte introuvable au relevé du ' end
             || to_char(w.releve_at at time zone 'Europe/Paris', 'DD/MM HH24:MI') || ' : handle faux ?',$q$;
  v_texte_apres text := $q$           c.poster_id, null,
           'Attendu @' || w.handle || coalesce(' · donné par la recrue : @' ||
             (select h.handle_propose from public.handles_proposes h where h.compte_id = c.id order by h.demande_at desc limit 1),
             ' · aucun @ donné par la recrue'),
           'Toujours introuvable 48 h après le 1er message (relevé du '
             || to_char(w.releve_at at time zone 'Europe/Paris', 'DD/MM HH24:MI') || ') : corriger le @ ?',$q$;
  v_where_avant text := $q$     where w.existe = false
       and c.warmup_started_at is not null
$q$;
  v_where_apres text := $q$     where w.existe = false
       and c.warmup_started_at is not null
       and (exists (select 1 from public.nudges n
                     where n.poster_id = c.poster_id and n.type = 'handle'
                       and (n.slack_erreur is null or coalesce(array_length(n.canaux, 1), 0) > 0)
                       and n.envoye_at < now() - interval '48 hours')
            or (not exists (select 1 from public.nudges n where n.poster_id = c.poster_id and n.type = 'handle')
                and c.warmup_started_at < now() - interval '72 hours'))
$q$;
begin
  if position(v_texte_avant in v_def) = 0 then raise exception '0444 : texte du bloc « compte » introuvable dans needs_you()'; end if;
  if position(v_where_avant in v_def) = 0 then raise exception '0444 : condition du bloc « compte » introuvable dans needs_you()'; end if;
  if position(v_where_avant in substr(v_def, position(v_where_avant in v_def) + 1)) > 0 then
    raise exception '0444 : condition du bloc « compte » en double dans needs_you()';
  end if;
  execute replace(replace(v_def, v_texte_avant, v_texte_apres), v_where_avant, v_where_apres);
end;
$ny$;

notify pgrst, 'reload schema';
