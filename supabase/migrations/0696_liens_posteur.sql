-- 0696 (Max, 13/11) : les liens des emails aux posteurs passent par sophia-marketing-orga.vercel.app
-- (/r/done, /r/password, /r/stop) avec un jeton RÉEL, UNIQUE et À USAGE LIMITÉ (plus le ruul_jeton
-- permanent, plus d'URL supabase.co dans les emails). Un jeton : un posteur, une action, valable 14 jours,
-- utilisable une seule fois. Additif : une table, deux fonctions.

create table if not exists public.liens_posteur (
  jeton       text primary key,
  poster_id   uuid not null references public.profiles(id),
  action      text not null check (action in ('done', 'password', 'stop')),
  source      text,
  cree_at     timestamptz not null default now(),
  expire_at   timestamptz not null default now() + interval '14 days',
  utilise_at  timestamptz
);
alter table public.liens_posteur enable row level security;
create policy liens_posteur_admin on public.liens_posteur for select to authenticated using (public.is_admin());
create index if not exists liens_posteur_poster_idx on public.liens_posteur (poster_id, action);

/* Un jeton neuf : 24 octets aléatoires (base64 url), jamais réutilisé. Serveur seulement. */
create or replace function public.lien_posteur_creer(p_poster uuid, p_action text, p_source text default null, p_jours integer default 14)
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v text;
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'forbidden' using errcode = '42501'; end if;
  v := translate(encode(gen_random_bytes(24), 'base64'), '+/=', '-_');
  insert into public.liens_posteur (jeton, poster_id, action, source, expire_at)
  values (v, p_poster, p_action, p_source, now() + make_interval(days => greatest(1, least(p_jours, 30))));
  return v;
end;
$$;
revoke execute on function public.lien_posteur_creer(uuid, text, text, integer) from public, anon, authenticated;

/*
 * Utiliser un jeton : le posteur s'il est valable (bonne action, pas expiré, pas déjà utilisé), puis le jeton
 * est marqué utilisé. p_lire = true : vérifie seulement (page de confirmation), sans le consommer.
 * Rend { ok, poster_id } ou { ok: false, raison: introuvable | expire | utilise }.
 */
create or replace function public.lien_posteur_utiliser(p_jeton text, p_action text, p_lire boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  l record;
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into l from public.liens_posteur where jeton = p_jeton and action = p_action for update;
  if not found then return jsonb_build_object('ok', false, 'raison', 'introuvable'); end if;
  if l.utilise_at is not null then return jsonb_build_object('ok', false, 'raison', 'utilise', 'poster_id', l.poster_id); end if;
  if l.expire_at < now() then return jsonb_build_object('ok', false, 'raison', 'expire'); end if;
  if not p_lire then update public.liens_posteur set utilise_at = now() where jeton = p_jeton; end if;
  return jsonb_build_object('ok', true, 'poster_id', l.poster_id);
end;
$$;
revoke execute on function public.lien_posteur_utiliser(text, text, boolean) from public, anon, authenticated;
