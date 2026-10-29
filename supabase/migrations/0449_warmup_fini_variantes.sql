-- 0449 — Prompt 25 MAJ, point 7 b-c : rendre fiables le @ TikTok et le « warm-up fini ».
--
-- 1. « Warm-up fini » (compte_pret) : la définition de toujours (le dernier relevé
--    lisible : compte trouvé, Start warmup cliqué, au moins 5 abonnements, pas de
--    vidéo avant la cohorte) OU une déclaration « Warm-up done » avec capture,
--    validée par Lucia. La déclaration n'est possible que si le compte a été trouvé
--    au moins une fois après le clic (les relevés suivants ont échoué).
-- 2. warmup_declarations + warmup_declarer() : la capture est dans
--    submission-media/{uid}/warmup/… ; Needs you « warmup_capture: » (Valider /
--    Refuser). L'admin et la Head of Ops lisent les captures de ce bucket.
-- 3. handles_variantes : un @ toujours introuvable, l'OS essaie les @ proches
--    (une voyelle, un point, un tiret bas). Une variante créée récemment :
--    Needs you « @ probable : sara.studio746, confirmer ? ».
-- 4. derniers_releves(comptes) : le dernier relevé TikTok lisible de chaque
--    compte (la carte « dernier relevé TikTok : il y a X h » et la règle des 12 h
--    des relances sur le compte).

create table if not exists public.warmup_declarations (
  id uuid primary key default gen_random_uuid(),
  compte_id uuid not null references public.comptes(id),
  poster_id uuid not null,
  capture_path text not null,
  statut text not null default 'a_verifier' check (statut in ('a_verifier', 'valide', 'refuse')),
  declare_at timestamptz not null default now(),
  decide_at timestamptz,
  decide_par uuid,
  note text
);
create unique index if not exists warmup_declarations_une_ouverte
  on public.warmup_declarations (compte_id) where statut = 'a_verifier';
create index if not exists warmup_declarations_compte on public.warmup_declarations (compte_id, statut);
alter table public.warmup_declarations enable row level security;
drop policy if exists warmup_declarations_lire on public.warmup_declarations;
create policy warmup_declarations_lire on public.warmup_declarations
  for select to authenticated using (poster_id = auth.uid() or public.is_admin());
comment on table public.warmup_declarations is
  '0449 : « Warm-up done » déclaré par la recrue avec une capture de son profil, vérifiée par Lucia dans Needs you.';

-- La recrue déclare son warm-up fini (sa capture déjà envoyée dans son dossier).
create or replace function public.warmup_declarer(p_compte uuid, p_capture text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_c public.comptes%rowtype;
  v_id uuid;
begin
  select * into v_c from public.comptes where id = p_compte;
  if v_c.id is null or v_c.poster_id is distinct from auth.uid() then
    raise exception 'warmup_declarer : compte introuvable';
  end if;
  if coalesce(p_capture, '') = '' or split_part(p_capture, '/', 1) <> auth.uid()::text then
    raise exception 'warmup_declarer : capture attendue dans ton dossier';
  end if;
  if v_c.warmup_started_at is null then
    return jsonb_build_object('ok', false, 'error', 'warmup_pas_demarre');
  end if;
  if public.compte_pret(p_compte) then
    return jsonb_build_object('ok', true, 'deja', true);
  end if;
  if not exists (select 1 from public.ckd_warmup_releves r
                  where r.compte_id = p_compte and r.existe and r.releve_at >= v_c.warmup_started_at - interval '1 hour') then
    return jsonb_build_object('ok', false, 'error', 'compte_jamais_trouve');
  end if;
  update public.warmup_declarations set capture_path = p_capture, declare_at = now()
   where compte_id = p_compte and statut = 'a_verifier'
  returning id into v_id;
  if v_id is null then
    insert into public.warmup_declarations (compte_id, poster_id, capture_path)
    values (p_compte, v_c.poster_id, p_capture) returning id into v_id;
  end if;
  return jsonb_build_object('ok', true, 'id', v_id);
end;
$$;
revoke all on function public.warmup_declarer(uuid, text) from public, anon;
grant execute on function public.warmup_declarer(uuid, text) to authenticated;

-- La dernière déclaration d'un compte (le dashboard de la recrue).
create or replace function public.warmup_declaration(p_compte uuid)
returns table (statut text, declare_at timestamptz, decide_at timestamptz, trouve_une_fois boolean, pret boolean)
language sql
stable
security definer
set search_path = public
as $$
  select d.statut, d.declare_at, d.decide_at,
         exists (select 1 from public.ckd_warmup_releves r
                  where r.compte_id = c.id and r.existe and r.releve_at >= c.warmup_started_at - interval '1 hour'),
         public.compte_pret(c.id)
    from public.comptes c
    left join lateral (
      select x.statut, x.declare_at, x.decide_at from public.warmup_declarations x
       where x.compte_id = c.id order by x.declare_at desc limit 1) d on true
   where c.id = p_compte and (c.poster_id = auth.uid() or public.is_admin());
$$;
revoke all on function public.warmup_declaration(uuid) from public, anon;
grant execute on function public.warmup_declaration(uuid) to authenticated;

-- « Warm-up fini » : la définition de toujours, ou une déclaration validée.
create or replace function public.compte_pret(p_compte uuid, p_avant timestamptz default null)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select w.existe
       and c.warmup_started_at is not null
       and (p_avant is null or c.warmup_started_at < p_avant)
       and coalesce(w.abonnements, 0) >= 5
       and (coalesce(w.videos, 0) = 0 or w.releve_at >= public.compte_debut(c.id))
      from public.comptes c
      join lateral (
        select x.existe, x.abonnements, x.videos, x.releve_at
          from public.ckd_warmup_releves x
         where x.compte_id = c.id and x.existe is not null
           and (p_avant is null or x.releve_at < p_avant)
         order by x.releve_at desc
         limit 1
      ) w on true
     where c.id = p_compte), false)
  or exists (
    select 1 from public.warmup_declarations d
      join public.comptes c on c.id = d.compte_id
     where d.compte_id = p_compte and d.statut = 'valide'
       and c.warmup_started_at is not null
       and (p_avant is null or d.decide_at < p_avant));
$$;

-- Les captures : lues par l'admin et la Head of Ops (Needs you).
drop policy if exists submission_media_select_admin on storage.objects;
create policy submission_media_select_admin on storage.objects
  for select to authenticated using (bucket_id = 'submission-media' and public.is_admin());
drop policy if exists submission_media_select_own on storage.objects;
create policy submission_media_select_own on storage.objects
  for select to authenticated using (bucket_id = 'submission-media' and (storage.foldername(name))[1] = auth.uid()::text);

-- Les @ proches d'un @ introuvable.
create table if not exists public.handles_variantes (
  id uuid primary key default gen_random_uuid(),
  compte_id uuid not null references public.comptes(id),
  poster_id uuid not null,
  handle_attendu text not null,
  essais integer not null default 0,
  illisibles integer not null default 0,
  variante text,
  cree_tiktok_at timestamptz,
  statut text not null check (statut in ('propose', 'aucune', 'incomplet', 'confirme', 'ignore')),
  cherche_at timestamptz not null default now(),
  decide_at timestamptz,
  unique (compte_id, handle_attendu)
);
alter table public.handles_variantes enable row level security;
drop policy if exists handles_variantes_admin on public.handles_variantes;
create policy handles_variantes_admin on public.handles_variantes
  for select to authenticated using (public.is_admin());
comment on table public.handles_variantes is
  '0449 : les @ proches essayés pour un @ introuvable ; une variante créée récemment est proposée dans Needs you.';

-- Le dernier relevé lisible de chaque compte (et la dernière tentative, lisible ou non).
create or replace function public.derniers_releves(p_comptes uuid[])
returns table (compte_id uuid, releve_at timestamptz, existe boolean, abonnements integer, tentative_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select c.id, l.releve_at, l.existe, l.abonnements,
         (select max(t.releve_at) from public.ckd_warmup_releves t where t.compte_id = c.id)
    from unnest(p_comptes) as c(id)
    left join lateral (
      select x.releve_at, x.existe, x.abonnements from public.ckd_warmup_releves x
       where x.compte_id = c.id and x.existe is not null
       order by x.releve_at desc limit 1) l on true
   where public.is_admin() or coalesce(auth.jwt() ->> 'role', '') = 'service_role'
      or exists (select 1 from public.comptes k where k.id = c.id and k.poster_id = auth.uid());
$$;
revoke all on function public.derniers_releves(uuid[]) from public, anon;
grant execute on function public.derniers_releves(uuid[]) to authenticated, service_role;

-- La carte d'Onboarding posters : « dernier relevé TikTok : il y a X h » (tous ses comptes).
create or replace function public.derniers_releves_posteurs(p_posteurs uuid[])
returns table (poster_id uuid, releve_at timestamptz, tentative_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select p.id,
         (select max(x.releve_at) from public.ckd_warmup_releves x join public.comptes c on c.id = x.compte_id
           where c.poster_id = p.id and x.existe is not null),
         (select max(x.releve_at) from public.ckd_warmup_releves x join public.comptes c on c.id = x.compte_id
           where c.poster_id = p.id)
    from unnest(p_posteurs) as p(id)
   where public.is_admin();
$$;
revoke all on function public.derniers_releves_posteurs(uuid[]) from public, anon;
grant execute on function public.derniers_releves_posteurs(uuid[]) to authenticated;

-- Needs you : la capture à vérifier, le @ probable.
do $ny$
declare
  v_def text := pg_get_functiondef('public.needs_you()'::regprocedure);
  v_avant text := $q$    union all
    select 'samedi:' || cp.id$q$;
  v_apres text := $q$    union all
    select 'warmup_capture:' || wd.id, 'a_la_main', 'warmup_capture', wd.poster_id, null,
           '@' || coalesce(c.handle_tiktok, '?') || ' · capture du profil envoyée le '
             || to_char(wd.declare_at at time zone 'Europe/Paris', 'DD/MM HH24:MI'),
           'Warm-up done déclaré : compte trouvé au Start warmup, relevés suivants illisibles. Vérifier la capture (au moins 5 abonnements, aucun post)',
           null, 'lundi', wd.declare_at,
           array['capture_valider', 'capture_refuser'], wd.id::text, null, wd.capture_path, 1
      from public.warmup_declarations wd
      join public.comptes c on c.id = wd.compte_id
     where wd.statut = 'a_verifier'
    union all
    select 'handle_probable:' || hv.id, 'pas_sur', 'handle_probable', hv.poster_id, null,
           'Attendu @' || hv.handle_attendu || ' (introuvable) · trouvé @' || hv.variante
             || coalesce(', créé le ' || to_char(hv.cree_tiktok_at at time zone 'Europe/Paris', 'DD/MM'), ''),
           '@ probable : ' || hv.variante || ', confirmer ?',
           null, 'lundi', hv.cherche_at,
           array['confirmer_handle', 'ignorer'], hv.id::text, 'https://www.tiktok.com/@' || hv.variante, hv.variante, 1
      from public.handles_variantes hv
      join public.comptes c on c.id = hv.compte_id
     where hv.statut = 'propose' and lower(coalesce(c.handle_tiktok, '')) = hv.handle_attendu
    union all
    select 'samedi:' || cp.id$q$;
begin
  if position(v_avant in v_def) = 0 then raise exception '0449 : bloc « samedi » introuvable dans needs_you()'; end if;
  execute replace(v_def, v_avant, v_apres);
end;
$ny$;

do $ag$
declare
  v_def text := pg_get_functiondef('public.needs_you_agir(text,text,text)'::regprocedure);
  v_avant text := $q$    return 'ignoré';
  end if;$q$;
  v_apres text := $q$    return 'ignoré';
  end if;
  if v_type = 'warmup_capture' and p_action in ('capture_valider', 'capture_refuser') then
    update public.warmup_declarations
       set statut = case when p_action = 'capture_valider' then 'valide' else 'refuse' end,
           decide_at = now(), decide_par = auth.uid(), note = nullif(btrim(coalesce(p_valeur, '')), '')
     where id = v_ref::uuid and statut = 'a_verifier';
    if not found then raise exception 'déclaration déjà traitée'; end if;
    return case when p_action = 'capture_valider' then 'warm-up validé' else 'capture refusée' end;
  end if;
  if v_type = 'handle_probable' and p_action = 'confirmer_handle' then
    update public.handles_variantes set statut = 'confirme', decide_at = now()
     where id = v_ref::uuid and statut = 'propose'
    returning variante, compte_id into v_cas, v_ref;
    if v_cas is null then raise exception 'variante déjà traitée'; end if;
    update public.comptes set handle_tiktok = v_cas where id = v_ref::uuid;
    return 'handle corrigé';
  end if;$q$;
begin
  if position(v_avant in v_def) = 0 then raise exception '0449 : bloc « ignorer » introuvable dans needs_you_agir()'; end if;
  execute replace(v_def, v_avant, v_apres);
end;
$ag$;

-- « Ignorer » sur un @ probable : la variante n'est plus proposée.
create or replace function public.handles_variantes_ignorer()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.cle like 'handle_probable:%' then
    update public.handles_variantes set statut = 'ignore', decide_at = now()
     where id = substr(new.cle, length('handle_probable:') + 1)::uuid and statut = 'propose';
  end if;
  return new;
end;
$$;
drop trigger if exists needs_you_ignores_variantes on public.needs_you_ignores;
create trigger needs_you_ignores_variantes after insert on public.needs_you_ignores
  for each row execute function public.handles_variantes_ignorer();

notify pgrst, 'reload schema';
