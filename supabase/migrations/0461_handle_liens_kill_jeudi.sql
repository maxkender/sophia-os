-- Le @ TikTok corrigé depuis les liens, « Ask for @ », et « Kill Saturday » le jeudi.
--
-- 1. handle_base / handles_proches : deux @ se ressemblent s'ils ne diffèrent
--    que par les chiffres de la fin (clara.fortschritt528 ~ clara.fortschritt).
-- 2. handles_proposes.a_valider / valide_at : un @ enregistré qui ne ressemble
--    pas à celui donné → carte Needs you « New @ to check » (compte perso ?).
-- 3. handle_corrige_suite(proposition) : après un @ remplacé, les liens du
--    compte sont relus (et donc les vues), « Ask for @ » est répondu, le @ d'un
--    autre compte est réglé. Les cartes « links not found » / « account not
--    found » se ferment d'elles-mêmes (elles suivent l'état des liens et du @).
-- 4. handle_corriger_lien(compte, nouveau, ancien attendu) : le @ remplacé depuis
--    les liens (même base), avec « @ fixed from link: a → b » dans l'historique.
-- 5. handles_autres : le @ des liens complètement différent (compte perso ?) :
--    « Posting from another account? @x » avec « Use @x » et « Ask for @ ».
-- 6. handles_demandes : « Ask for @ » ; la pop-up bloquante du dashboard du
--    posteur, jusqu'à sa réponse. Rien ne part sur Slack ni sur Upwork.
-- 7. jeudi_kills : « Kill Saturday » choisi le jeudi ; samedi, Kill & pay
--    pré-sélectionné avec la note. Rien ne part ; aucun Kill automatique.
-- 8. handles_etat(comptes) : pour les lignes du jeudi et du samedi.

create or replace function public.handle_base(h text)
returns text
language sql
immutable
as $$
  select regexp_replace(lower(btrim(coalesce(h, ''), '@ ')), '[0-9]+$', '');
$$;

create or replace function public.handles_proches(a text, b text)
returns boolean
language sql
immutable
as $$
  select length(public.handle_base(a)) >= 4 and public.handle_base(a) = public.handle_base(b);
$$;

alter table public.handles_proposes add column if not exists a_valider boolean not null default false;
alter table public.handles_proposes add column if not exists valide_at timestamptz;

create table if not exists public.handles_demandes (
  id uuid primary key default gen_random_uuid(),
  compte_id uuid not null references public.comptes(id) on delete cascade,
  poster_id uuid not null references public.profiles(id) on delete cascade,
  handle_avant text,
  demande_at timestamptz not null default now(),
  demande_par uuid references auth.users(id) on delete set null,
  repondu_at timestamptz,
  handle_apres text,
  annule_at timestamptz
);
create unique index if not exists handles_demandes_ouverte on public.handles_demandes (compte_id) where repondu_at is null and annule_at is null;
alter table public.handles_demandes enable row level security;
create policy "handles_demandes lecture" on public.handles_demandes for select
  using (poster_id = (select auth.uid()) or (select public.is_admin()));

create table if not exists public.handles_autres (
  compte_id uuid primary key references public.comptes(id) on delete cascade,
  handle_lien text not null,
  liens integer not null default 0,
  vu_at timestamptz not null default now(),
  regle_at timestamptz
);
alter table public.handles_autres enable row level security;
create policy "handles_autres lecture" on public.handles_autres for select using ((select public.is_admin()));

create table if not exists public.jeudi_kills (
  compte_id uuid not null references public.comptes(id) on delete cascade,
  lundi date not null,
  poster_id uuid not null references public.profiles(id) on delete cascade,
  phrase text,
  marque_at timestamptz not null default now(),
  marque_par uuid references auth.users(id) on delete set null,
  annule_at timestamptz,
  primary key (compte_id, lundi)
);
alter table public.jeudi_kills enable row level security;
create policy "jeudi_kills lecture" on public.jeudi_kills for select using ((select public.is_admin()));

create or replace function public.handle_corrige_suite(p_proposition uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  h record;
  v_liens text[];
begin
  if coalesce(auth.role(), '') <> 'service_role' and not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select * into h from public.handles_proposes where id = p_proposition and statut = 'trouve';
  if not found then
    return;
  end if;
  -- Les @ des liens postés : le nouveau @ doit en être un, sinon (ou s'il ne ressemble pas au @ donné) : à valider.
  select array_agg(distinct lower(substring(pa.publie_url from 'tiktok\.com/@([A-Za-z0-9._]+)'))) into v_liens
    from public.passages pa
   where pa.compte_id = h.compte_id and pa.publie_url ~* 'tiktok\.com/@';
  update public.handles_proposes
     set a_valider = not public.handles_proches(h.handle_attendu, h.handle_propose)
                     or (v_liens is not null and array_length(v_liens, 1) > 0 and not (lower(h.handle_propose) = any (v_liens)))
   where id = h.id and h.source <> 'admin';
  -- Les liens du compte sont relus (puis leurs vues).
  update public.passages
     set resolution_statut = 'a_resoudre', resolution_tentatives = 0, resolution_prochaine_at = now(), resolution_detail = '@ corrigé : relu'
   where compte_id = h.compte_id and publie_url is not null and resolution_statut = 'introuvable';
  update public.handles_demandes set repondu_at = now(), handle_apres = h.handle_propose
   where compte_id = h.compte_id and repondu_at is null and annule_at is null;
  update public.handles_autres set regle_at = now() where compte_id = h.compte_id and regle_at is null;
end;
$$;
revoke all on function public.handle_corrige_suite(uuid) from public, anon;
grant execute on function public.handle_corrige_suite(uuid) to authenticated, service_role;

-- Le @ remplacé par l'OS (depuis les liens) ou par l'admin (« Use @x »), une fois le compte vu sur TikTok.
create or replace function public.handle_corriger(p_compte uuid, p_nouveau text, p_source text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  c record;
  v_id uuid;
  v_nouveau text := lower(btrim(coalesce(p_nouveau, ''), '@ '));
begin
  if coalesce(auth.role(), '') <> 'service_role' and not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if v_nouveau !~ '^[a-z0-9._]{2,24}$' then
    raise exception 'invalid @';
  end if;
  select id, poster_id, handle_tiktok into c from public.comptes where id = p_compte and is_active;
  if not found then
    raise exception 'compte introuvable';
  end if;
  if lower(coalesce(c.handle_tiktok, '')) = v_nouveau then
    return null;
  end if;
  insert into public.handles_proposes (poster_id, compte_id, handle_attendu, handle_propose, source, statut, verifie_at, tentatives)
  values (c.poster_id, c.id, c.handle_tiktok, v_nouveau, 'admin', 'trouve', now(), 1)
  returning id into v_id;
  update public.comptes set handle_tiktok = v_nouveau where id = c.id;
  insert into public.recrue_evenements (poster_id, compte_id, type, at, detail, cle)
  values (c.poster_id, c.id, 'handle_corrige', now(),
          case when p_source = 'lien' then format('@ fixed from link: %s → %s', c.handle_tiktok, v_nouveau)
               else format('@ changed by the admin: %s → %s', c.handle_tiktok, v_nouveau) end,
          v_id::text)
  on conflict (poster_id, type, cle) do nothing;
  perform public.handle_corrige_suite(v_id);
  return v_id;
end;
$$;
revoke all on function public.handle_corriger(uuid, text, text) from public, anon;
grant execute on function public.handle_corriger(uuid, text, text) to service_role;

-- « Ask for @ » (admin) : la pop-up du dashboard ; rien ne part.
create or replace function public.handle_demander(p_compte uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select id into v_id from public.handles_demandes where compte_id = p_compte and repondu_at is null and annule_at is null;
  if v_id is not null then
    return v_id;
  end if;
  insert into public.handles_demandes (compte_id, poster_id, handle_avant, demande_par)
  select c.id, c.poster_id, c.handle_tiktok, auth.uid() from public.comptes c where c.id = p_compte and c.is_active
  returning id into v_id;
  if v_id is null then
    raise exception 'compte introuvable';
  end if;
  return v_id;
end;
$$;
revoke all on function public.handle_demander(uuid) from public, anon;
grant execute on function public.handle_demander(uuid) to authenticated;

-- Pour le posteur : la demande ouverte (la pop-up bloquante).
create or replace function public.ma_demande_handle()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object('id', d.id, 'compte_id', d.compte_id, 'handle', c.handle_tiktok)
    from public.handles_demandes d
    join public.comptes c on c.id = d.compte_id
   where d.poster_id = auth.uid() and d.repondu_at is null and d.annule_at is null
   order by d.demande_at limit 1;
$$;
revoke all on function public.ma_demande_handle() from public, anon;
grant execute on function public.ma_demande_handle() to authenticated;

-- Jeudi : « Kill Saturday », ou une autre décision qui l'annule.
create or replace function public.jeudi_kill_marquer(p_compte uuid, p_lundi date, p_phrase text, p_marquer boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_marquer then
    insert into public.jeudi_kills (compte_id, lundi, poster_id, phrase, marque_par)
    select c.id, p_lundi, c.poster_id, left(p_phrase, 500), auth.uid() from public.comptes c where c.id = p_compte
    on conflict (compte_id, lundi) do update
      set phrase = excluded.phrase, marque_at = now(), marque_par = auth.uid(), annule_at = null;
  else
    update public.jeudi_kills set annule_at = now() where compte_id = p_compte and lundi = p_lundi and annule_at is null;
  end if;
end;
$$;
revoke all on function public.jeudi_kill_marquer(uuid, date, text, boolean) from public, anon;
grant execute on function public.jeudi_kill_marquer(uuid, date, text, boolean) to authenticated;

-- Les lignes du jeudi et du samedi : @ d'un autre compte, @ demandé, @ corrigé, Kill du jeudi.
create or replace function public.handles_etat(p_lundi date, p_comptes uuid[])
returns table (compte_id uuid, autre_handle text, autre_liens integer, demande_at timestamptz, repondu_at timestamptz,
               handle_avant text, handle_apres text, corrige text, corrige_at timestamptz, kill_jeudi_at timestamptz, kill_jeudi_phrase text)
language sql
stable
security definer
set search_path = public
as $$
  select c.id,
         (select a.handle_lien from public.handles_autres a where a.compte_id = c.id and a.regle_at is null),
         (select a.liens from public.handles_autres a where a.compte_id = c.id and a.regle_at is null),
         d.demande_at, d.repondu_at, d.handle_avant, d.handle_apres,
         (select e.detail from public.recrue_evenements e where e.compte_id = c.id and e.type = 'handle_corrige' and e.at > now() - interval '14 days' order by e.at desc limit 1),
         (select e.at from public.recrue_evenements e where e.compte_id = c.id and e.type = 'handle_corrige' and e.at > now() - interval '14 days' order by e.at desc limit 1),
         k.marque_at, k.phrase
    from public.comptes c
    left join lateral (select * from public.handles_demandes x where x.compte_id = c.id and x.annule_at is null order by x.demande_at desc limit 1) d on true
    left join public.jeudi_kills k on k.compte_id = c.id and k.lundi = p_lundi and k.annule_at is null
   where c.id = any (p_comptes) and public.is_admin();
$$;
revoke all on function public.handles_etat(date, uuid[]) from public, anon;
grant execute on function public.handles_etat(date, uuid[]) to authenticated;

-- Needs you : un @ enregistré qui ne ressemble pas à celui donné (ou d'où ne viennent pas les liens).
do $p$
declare
  v_def text := pg_get_functiondef('public.needs_you()'::regprocedure);
  v_ancre text := $a$    union all
    select 'samedi:' || cp.id$a$;
  v_ajout text := $a$    union all
    select 'handle_a_valider:' || h.id, 'pas_sur', 'handle_a_valider', h.poster_id, null,
           format('New @: @%s (we gave @%s)', h.handle_propose, coalesce(h.handle_attendu, '?')),
           'Doesn''t look like the @ we gave, or the posted links don''t come from it: maybe a personal account. Check it, then dismiss.',
           null, 'rien', coalesce(h.verifie_at, h.demande_at), array['ouvrir', 'ignorer'], h.id::text,
           'https://www.tiktok.com/@' || h.handle_propose, h.handle_propose, 1
      from public.handles_proposes h
     where h.statut = 'trouve' and h.a_valider and h.valide_at is null and h.demande_at > now() - interval '30 days'
$a$;
begin
  if position(v_ancre in v_def) = 0 then
    raise exception 'needs_you : l''ancre samedi est introuvable';
  end if;
  if (length(v_def) - length(replace(v_def, v_ancre, ''))) / length(v_ancre) <> 1 then
    raise exception 'needs_you : l''ancre samedi apparaît plusieurs fois';
  end if;
  execute replace(v_def, v_ancre, v_ajout || v_ancre);
end;
$p$;

notify pgrst, 'reload schema';
