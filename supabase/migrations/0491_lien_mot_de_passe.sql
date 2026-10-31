-- 0491 — Plus aucun mot de passe dans un message Upwork : le lien « Set my password ».
--
-- Le welcome (et la relance « log in ») donnent le login et un lien personnel :
-- {OS}/set-password?t=<jeton>. La recrue y choisit son mot de passe (et donne
-- son email perso, pour Slack), puis elle est connectée. Le lien sert une seule
-- fois et vaut 14 jours. Seule l'empreinte du jeton (sha256) est gardée.
-- Les comptes déjà créés gardent leur mot de passe : rien n'est changé tant que
-- la recrue n'utilise pas son lien.
--
-- 1. mot_de_passe_liens : poster, empreinte, créé, expire, utilisé, par.
-- 2. mot_de_passe_lien_creer(poster, par) (service_role) : rend le jeton.
-- 3. mot_de_passe_lien_lire(jeton) (service_role) : le login du lien et son état.
-- 4. mot_de_passe_lien_utiliser(jeton) (service_role) : le marque utilisé (une fois).
-- 5. mot_de_passe_lien_nouveau(poster) : un nouveau lien pour l'admin, le Head of
--    Ops ou la HM du posteur (lien perdu ou expiré).
-- 6. Les textes (réglages) : le welcome sans mot de passe, sans guide, sans
--    « get paid » (seule « All payments are made only through Upwork
--    milestones. ») ; la relance « log in » et l'ancien texte d'étape sans mot
--    de passe. Modifiables ensuite dans Settings.
--
-- Additive : 1 table, 5 fonctions, 3 textes de réglage mis à jour. Aucune ligne supprimée.

create table if not exists public.mot_de_passe_liens (
  id uuid primary key default gen_random_uuid(),
  poster_id uuid not null references public.profiles(id),
  jeton_hash text not null unique,
  cree_at timestamptz not null default now(),
  expire_at timestamptz not null default now() + interval '14 days',
  utilise_at timestamptz,
  par text
);
create index if not exists mot_de_passe_liens_poster on public.mot_de_passe_liens (poster_id);
alter table public.mot_de_passe_liens enable row level security;

create or replace function public.mot_de_passe_jeton_hash(p_jeton text)
returns text
language sql
immutable
as $$
  select encode(sha256(convert_to(coalesce(p_jeton, ''), 'UTF8')), 'hex');
$$;

create or replace function public.mot_de_passe_lien_creer(p_poster uuid, p_par text default null)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_jeton text := encode(extensions.gen_random_bytes(24), 'hex');
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if not exists (select 1 from public.profiles p where p.id = p_poster and p.is_active) then
    raise exception 'posteur inconnu ou inactif';
  end if;
  insert into public.mot_de_passe_liens (poster_id, jeton_hash, par)
  values (p_poster, public.mot_de_passe_jeton_hash(v_jeton), p_par);
  return v_jeton;
end;
$$;
revoke all on function public.mot_de_passe_lien_creer(uuid, text) from public, anon, authenticated;
grant execute on function public.mot_de_passe_lien_creer(uuid, text) to service_role;

-- statut : ok | utilise | expire | inconnu
create or replace function public.mot_de_passe_lien_lire(p_jeton text)
returns table (statut text, poster_id uuid, email text, prenom text)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  l record;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select m.poster_id, m.expire_at, m.utilise_at, p.email, p.prenom, p.is_active into l
    from public.mot_de_passe_liens m join public.profiles p on p.id = m.poster_id
   where m.jeton_hash = public.mot_de_passe_jeton_hash(p_jeton);
  if not found or not l.is_active then
    return query select 'inconnu'::text, null::uuid, null::text, null::text;
    return;
  end if;
  return query select case when l.utilise_at is not null then 'utilise' when l.expire_at <= now() then 'expire' else 'ok' end,
                      l.poster_id, l.email, l.prenom;
end;
$$;
revoke all on function public.mot_de_passe_lien_lire(text) from public, anon, authenticated;
grant execute on function public.mot_de_passe_lien_lire(text) to service_role;

-- Atomique : un seul appel gagne. Rend le posteur, ou null (inconnu, utilisé, expiré).
create or replace function public.mot_de_passe_lien_utiliser(p_jeton text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_poster uuid;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  update public.mot_de_passe_liens m set utilise_at = now()
   where m.jeton_hash = public.mot_de_passe_jeton_hash(p_jeton) and m.utilise_at is null and m.expire_at > now()
     and exists (select 1 from public.profiles p where p.id = m.poster_id and p.is_active)
  returning m.poster_id into v_poster;
  return v_poster;
end;
$$;
revoke all on function public.mot_de_passe_lien_utiliser(text) from public, anon, authenticated;
grant execute on function public.mot_de_passe_lien_utiliser(text) to service_role;

-- Lien perdu ou expiré : l'admin, le Head of Ops ou la HM du posteur en fait un nouveau (à copier).
create or replace function public.mot_de_passe_lien_nouveau(p_poster uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_jeton text := encode(extensions.gen_random_bytes(24), 'hex');
begin
  if not (public.is_admin()
          or exists (select 1 from public.user_roles ur where ur.user_id = auth.uid() and ur.role = 'head_of_ops')
          or exists (select 1 from public.profiles p where p.id = p_poster and p.manager_id = auth.uid())) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if not exists (select 1 from public.profiles p where p.id = p_poster and p.is_active
                   and exists (select 1 from public.user_roles ur where ur.user_id = p.id and ur.role = 'poster')) then
    raise exception 'posteur inconnu ou inactif';
  end if;
  insert into public.mot_de_passe_liens (poster_id, jeton_hash, par)
  values (p_poster, public.mot_de_passe_jeton_hash(v_jeton), 'manuel:' || auth.uid()::text);
  return v_jeton;
end;
$$;
revoke all on function public.mot_de_passe_lien_nouveau(uuid) from public, anon;
grant execute on function public.mot_de_passe_lien_nouveau(uuid) to authenticated;

-- 6. Les textes.
update public.reglages set valeur = to_jsonb($t$Hi {prenom}, welcome to Vik Studios!

The job in short: you assemble slideshows on TikTok (about 5 minutes a day). All the content is given in your dashboard. All payments are made only through Upwork milestones.

You start posting on Monday {date}.

This role has no fixed end date: it only stops if you perform badly, or when you wish to leave.

IMPORTANT: if you don't want to do this job, or you won't be ready to post consistently every day from Monday {date}, reply STOP here right now and don't log in anywhere. We'll close the contract, no hard feelings.

Everything you need:
• Your dashboard: {url}
• Your login: {email}
• Set your password here (personal link, works once, valid 14 days): {lien_mot_de_passe}
• Your TikTok account to create: @{handle} (use exactly this name)

Join our Slack now: {slack}
• Use your PERSONAL email, not the dashboard login above.
• Use your FULL NAME (first and last name). This is IMPORTANT: it's how we recognize you.

Before Sunday midnight:
1. Set your password with the link above, then log in to your dashboard.
2. Create the TikTok account shown on your dashboard, with the exact @ and your personal email.
3. Click Start warmup, then warm the account up like a real person: scroll a few minutes a day, like and follow accounts in the general knowledge niche. This is the most important step: without it, your posts get 0 views.

For any other question, please ask on Slack, in #questions.$t$::text), updated_at = now()
 where cle = 'accueil_message_texte';

update public.reglages
   set valeur = to_jsonb('log in to your dashboard: {url} with your login {email} (first time: set your password with your personal link {lien_mot_de_passe})'::text),
       updated_at = now()
 where cle = 'relance_texte_connexion';

update public.reglages
   set valeur = to_jsonb('Hi {prenom}, you haven''t logged in yet. Dashboard: {url}. Your login: {email} (first time: set your password with the personal link in your welcome message). Please log in today.'::text),
       updated_at = now()
 where cle = 'etape_texte_connexion_identifiants';

notify pgrst, 'reload schema';
