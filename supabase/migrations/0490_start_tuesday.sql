-- 0490 — « Start Tuesday » le dimanche soir (Weekly decisions → Sunday: warm-up).
--
-- Chaque recrue pas prête a 3 choix : Keep (elle commence lundi), Start Tuesday
-- (elle reste dans la cohorte, ses posts commencent mardi : lundi n'est pas
-- attendu, 12 posts au lieu de 14, même milestone, même paie), Postpone (lundi
-- suivant). Sans choix, l'OS met Start Tuesday au passage de dimanche 22:45
-- (Paris), juste avant l'assignation des posts du lundi (23:00) : aucun post du
-- lundi n'est attribué, rien n'est supprimé.
-- Nouvelle limite : Start warmup cliqué avant lundi 12:00 (Paris). Lundi 23:59,
-- toujours pas → report automatique au lundi suivant (cohorte_reporter_auto).
--
-- 1. debut_choix : le choix (keep / mardi / reporter), d'où il vient (clic ou
--    auto), le message parti (canal, statut).
-- 2. Trigger comptes_warmup_zzz_mardi (après les triggers de warm-up existants,
--    qui repoussent un warm-up lancé un lundi au lundi suivant) : une recrue
--    « Start Tuesday » qui clique Start warmup avant lundi 12:00 (Paris) finit
--    son warm-up mardi 00:00 (Paris).
-- 3. debut_choix_noter (service_role) : note le choix ; Start Tuesday : les
--    comptes dont le warm-up est lancé finissent mardi 00:00 (Paris).
-- 4. debut_choix_liste(lundi), debut_mardi_echus(lundi).
-- 5. posteur_annonces : le pop-up du dashboard de la recrue (même texte que le
--    message) ; mes_annonces(), annonce_vue(id).
--
-- Additive : 2 tables, 1 trigger, 6 fonctions. Aucune ligne supprimée.

create table if not exists public.debut_choix (
  poster_id uuid not null references public.profiles(id),
  lundi date not null,
  choix text not null check (choix in ('keep', 'mardi', 'reporter')),
  source text not null default 'manuel' check (source in ('manuel', 'auto_dimanche', 'auto_lundi')),
  decide_par uuid,
  decide_at timestamptz not null default now(),
  texte text,
  message_canal text,
  message_statut text,
  message_erreur text,
  primary key (poster_id, lundi)
);
alter table public.debut_choix enable row level security;

create table if not exists public.posteur_annonces (
  id uuid primary key default gen_random_uuid(),
  poster_id uuid not null references public.profiles(id),
  cle text not null,
  texte text not null,
  cree_at timestamptz not null default now(),
  vu_at timestamptz,
  unique (poster_id, cle)
);
alter table public.posteur_annonces enable row level security;

-- La fin de lundi midi (Paris) d'une cohorte, et mardi 00:00 (Paris).
create or replace function public.debut_mardi_limites(p_lundi date, out midi timestamptz, out mardi timestamptz)
language sql
immutable
as $$
  select (p_lundi::timestamp + interval '12 hours') at time zone 'Europe/Paris',
         ((p_lundi + 1)::timestamp) at time zone 'Europe/Paris';
$$;

create or replace function public.warmup_debut_mardi()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lundi date;
  l record;
begin
  -- Une fin dans le passé (Skip warmup de l'admin) n'est jamais touchée.
  if new.warmup_ends_at is null or new.warmup_ends_at <= now() or new.warmup_started_at is null or new.poster_id is null
     or new.type_compte is distinct from 'perso' then
    return new;
  end if;
  select pr.cohorte_lundi into v_lundi from public.profiles pr where pr.id = new.poster_id;
  if v_lundi is null
     or not exists (select 1 from public.debut_choix d where d.poster_id = new.poster_id and d.lundi = v_lundi and d.choix = 'mardi') then
    return new;
  end if;
  select * into l from public.debut_mardi_limites(v_lundi);
  -- Lancé avant lundi 12:00 (Paris) : il finit mardi 00:00 (ni le lundi de la cohorte, ni le lundi suivant) ;
  -- après : la règle d'avant (lundi suivant), puis le report de lundi 23:59.
  if new.warmup_started_at <= l.midi then
    new.warmup_ends_at := l.mardi;
  end if;
  return new;
exception when others then
  return new;
end;
$$;

do $t$
begin
  if not exists (select 1 from pg_trigger where tgname = 'comptes_warmup_zzz_mardi' and tgrelid = 'public.comptes'::regclass) then
    create trigger comptes_warmup_zzz_mardi
      before insert or update of warmup_ends_at, warmup_started_at on public.comptes
      for each row execute function public.warmup_debut_mardi();
  end if;
end;
$t$;

-- Le choix. Start Tuesday : les comptes déjà lancés finissent leur warm-up mardi 00:00 (jamais plus tôt qu'avant).
create or replace function public.debut_choix_noter(
  p_poster uuid, p_lundi date, p_choix text, p_source text default 'manuel', p_par uuid default null, p_texte text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  l record;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'debut_choix_noter : réservé à recrues-check' using errcode = '42501';
  end if;
  insert into public.debut_choix (poster_id, lundi, choix, source, decide_par, decide_at, texte)
  values (p_poster, p_lundi, p_choix, p_source, p_par, now(), p_texte)
  on conflict (poster_id, lundi) do update
     set choix = excluded.choix, source = excluded.source, decide_par = excluded.decide_par, decide_at = now(),
         texte = coalesce(excluded.texte, debut_choix.texte);
  -- La décision du dimanche (0474), pour la liste et les autres pages.
  if p_choix in ('keep', 'mardi') then
    insert into public.warmup_checks (poster_id, lundi, decision, decide_par, decide_at)
    values (p_poster, p_lundi, case when p_choix = 'keep' then 'ok' else 'pas_chaud' end, p_par, now())
    on conflict (poster_id, lundi) do update set decision = excluded.decision, decide_par = excluded.decide_par, decide_at = now();
  end if;
  if p_choix = 'mardi' then
    select * into l from public.debut_mardi_limites(p_lundi);
    update public.comptes c
       set warmup_ends_at = l.mardi
     where c.poster_id = p_poster and c.is_active and coalesce(c.type_compte, 'perso') = 'perso'
       and c.warmup_started_at is not null and c.warmup_ends_at is not null and c.warmup_ends_at > now()
       and c.warmup_ends_at is distinct from l.mardi;
  end if;
  perform public.recrue_evenement_noter(p_poster, null, 'debut_choix', now(),
    case p_choix when 'keep' then 'Sunday check: Keep, starts Monday'
                 when 'mardi' then 'Sunday check: Start Tuesday'
                 else 'Sunday check: Postpone to the following Monday' end
      || case when p_source = 'manuel' then '' else ' (automatic)' end,
    'debut:' || p_lundi::text || ':' || p_choix);
end;
$$;
revoke all on function public.debut_choix_noter(uuid, date, text, text, uuid, text) from public, anon, authenticated;
grant execute on function public.debut_choix_noter(uuid, date, text, text, uuid, text) to service_role;

create or replace function public.debut_choix_message(p_poster uuid, p_lundi date, p_canal text, p_statut text, p_erreur text)
returns void
language sql
security definer
set search_path = public
as $$
  update public.debut_choix set message_canal = p_canal, message_statut = p_statut, message_erreur = p_erreur
   where poster_id = p_poster and lundi = p_lundi;
$$;
revoke all on function public.debut_choix_message(uuid, date, text, text, text) from public, anon, authenticated;
grant execute on function public.debut_choix_message(uuid, date, text, text, text) to service_role;

create or replace function public.debut_choix_liste(p_lundi date)
returns table (poster_id uuid, choix text, source text, decide_at timestamptz, texte text, message_canal text, message_statut text, message_erreur text)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
begin
  if not (public.is_admin() or coalesce(auth.role(), '') = 'service_role'
          or exists (select 1 from public.user_roles ur where ur.user_id = auth.uid() and ur.role = 'head_of_ops')) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return query
  select d.poster_id, d.choix, d.source, d.decide_at, d.texte, d.message_canal, d.message_statut, d.message_erreur
    from public.debut_choix d where d.lundi = p_lundi;
end;
$$;
revoke all on function public.debut_choix_liste(date) from public, anon;
grant execute on function public.debut_choix_liste(date) to authenticated, service_role;

-- Lundi 23:59 : les « Start Tuesday » sans Start warmup avant lundi 12:00 (Paris), encore dans la cohorte.
create or replace function public.debut_mardi_echus(p_lundi date)
returns table (poster_id uuid)
language sql
stable
security definer
set search_path = public
as $$
  select d.poster_id
    from public.debut_choix d
    join public.profiles pr on pr.id = d.poster_id and pr.is_active and pr.cohorte_lundi = p_lundi
   where d.lundi = p_lundi and d.choix = 'mardi'
     and not exists (
       select 1 from public.comptes c
        where c.poster_id = d.poster_id and c.is_active and coalesce(c.type_compte, 'perso') = 'perso'
          and c.warmup_started_at is not null
          and c.warmup_started_at <= (select l.midi from public.debut_mardi_limites(p_lundi) l));
$$;
revoke all on function public.debut_mardi_echus(date) from public, anon, authenticated;
grant execute on function public.debut_mardi_echus(date) to service_role;

-- Le pop-up du dashboard : les annonces pas encore vues du posteur connecté.
create or replace function public.mes_annonces()
returns table (id uuid, texte text, cree_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select a.id, a.texte, a.cree_at from public.posteur_annonces a
   where a.poster_id = auth.uid() and a.vu_at is null
   order by a.cree_at desc
   limit 3;
$$;
revoke all on function public.mes_annonces() from public, anon;
grant execute on function public.mes_annonces() to authenticated;

create or replace function public.annonce_vue(p_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.posteur_annonces set vu_at = now() where id = p_id and poster_id = auth.uid() and vu_at is null;
$$;
revoke all on function public.annonce_vue(uuid) from public, anon;
grant execute on function public.annonce_vue(uuid) to authenticated;

notify pgrst, 'reload schema';
