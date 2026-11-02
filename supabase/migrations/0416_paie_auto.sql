-- Prompt 21, parties B et P : la paie automatique du lundi.
--
-- - paie_auto : une ligne par semaine payée (canari, « Pay now », arrêt,
--   dernier bilan) et un verrou de passage (jamais deux passages à la fois) ;
-- - paie_paiements_api : le plan gardé au verrouillage (un passage interrompu
--   reprend là où il en était), les lignes fusionnées (B8), le complément du
--   2e compte (B9), le type d'erreur et le réessai horaire (P1, B10) ;
-- - a_faire : les lignes « To do » et « Issues » de Logs & to do ;
-- - arrets.motif : « moins6 » (B1) ; compte_arreter_moins6 (Double : un seul
--   compte sous les 6 posts s'arrête) ;
-- - textes modifiables : paie_soumettre_texte (B10), paie_reponse_*_texte (P3) ;
-- - crons : paie-auto (toutes les 10 min le lundi et le mardi),
--   paie-reconcilier-lundi (20 h Paris) et paie-reconcilier-mardi (12 h Paris).
-- Rien ne part tant que paie_api n'est pas sur « on » (Max, dimanche soir).

-- ---------------------------------------------------------------------------
-- 1. L'état de la paie automatique, par semaine
-- ---------------------------------------------------------------------------
create table if not exists public.paie_auto (
  semaine        date primary key,
  statut         text not null default 'attente' check (statut in ('attente', 'en_cours', 'fini', 'arrete')),
  lance_at       timestamptz,
  lance_par      uuid,
  canari_ok      boolean,
  canari_ligne   uuid,
  canari_detail  jsonb,
  arret_raison   text,
  dernier_bilan  jsonb,
  verrou_jusqu_a timestamptz,
  created_at     timestamptz not null default now(),
  maj_at         timestamptz not null default now()
);

comment on table public.paie_auto is
  'Prompt 21, B3-B6 (0416) : la paie automatique de chaque semaine (canari, Pay now, arrêt, bilan, verrou de passage).';

alter table public.paie_auto enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'paie_auto' and policyname = 'paie_auto lecture admin') then
    create policy "paie_auto lecture admin" on public.paie_auto for select to authenticated using ((select public.is_admin()));
  end if;
end $$;

/**
 * Le verrou d'un passage (4 min au plus) ; « Pay now » note l'heure du clic et
 * relance une semaine arrêtée au canari. Rien si un autre passage tient le
 * verrou. Service role seulement (fonction upwork).
 */
create or replace function public.paie_auto_prendre(p_semaine date, p_lancer boolean default false, p_par uuid default null)
returns setof public.paie_auto
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception 'réservé à la fonction upwork';
  end if;
  insert into public.paie_auto (semaine) values (p_semaine) on conflict (semaine) do nothing;
  if p_lancer then
    update public.paie_auto
       set lance_at = coalesce(lance_at, now()), lance_par = coalesce(lance_par, p_par),
           statut = case when statut = 'arrete' then 'attente' else statut end,
           canari_ok = case when statut = 'arrete' then null else canari_ok end,
           arret_raison = case when statut = 'arrete' then null else arret_raison end,
           maj_at = now()
     where semaine = p_semaine;
  end if;
  return query
    update public.paie_auto
       set verrou_jusqu_a = now() + interval '4 minutes', maj_at = now()
     where semaine = p_semaine and (verrou_jusqu_a is null or verrou_jusqu_a < now())
    returning *;
end;
$$;

create or replace function public.paie_auto_rendre(p_semaine date)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception 'réservé à la fonction upwork';
  end if;
  update public.paie_auto set verrou_jusqu_a = null, maj_at = now() where semaine = p_semaine;
end;
$$;

revoke all on function public.paie_auto_prendre(date, boolean, uuid) from public, anon, authenticated;
revoke all on function public.paie_auto_rendre(date) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Un paiement : son plan, ses étapes, ses réessais
-- ---------------------------------------------------------------------------
alter table public.paie_paiements_api
  add column if not exists plan jsonb,
  add column if not exists lignes uuid[],
  add column if not exists jalon_complement text,
  add column if not exists type_erreur text,
  add column if not exists reessai boolean not null default false,
  add column if not exists prochain_essai timestamptz,
  add column if not exists tentatives integer not null default 0,
  add column if not exists soumission_message_at timestamptz;

comment on column public.paie_paiements_api.reessai is
  'Prompt 21, P1 et B10 (0416) : réessayée toutes les heures jusqu''au mardi 20 h (Paris), puis To do.';

create index if not exists paie_paiements_api_reessai on public.paie_paiements_api (prochain_essai) where reessai;

-- ---------------------------------------------------------------------------
-- 3. To do et Issues (Logs & to do)
-- ---------------------------------------------------------------------------
create table if not exists public.a_faire (
  id          uuid primary key default gen_random_uuid(),
  cle         text not null unique,
  type        text not null default 'paie',
  gravite     text not null default 'todo' check (gravite in ('todo', 'issue')),
  titre       text not null,
  detail      text,
  poster_id   uuid references public.profiles(id),
  contrat_id  text,
  semaine     date,
  created_at  timestamptz not null default now(),
  maj_at      timestamptz not null default now(),
  fait_at     timestamptz,
  fait_par    uuid
);

comment on table public.a_faire is
  'Prompt 21 (0416) : ce que l''OS ne peut pas faire seul (To do) et les problèmes urgents (Issues). Une ligne par clé.';

create index if not exists a_faire_ouvertes on public.a_faire (gravite, created_at desc) where fait_at is null;

alter table public.a_faire enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'a_faire' and policyname = 'a_faire lecture admin') then
    create policy "a_faire lecture admin" on public.a_faire for select to authenticated using ((select public.is_admin()));
  end if;
end $$;

/** « Done » (admin, Head of Ops) ; false : rouvrir. */
create or replace function public.a_faire_fait(p_id uuid, p_fait boolean default true)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'réservé à l''admin et au Head of Ops';
  end if;
  update public.a_faire
     set fait_at = case when p_fait then now() end, fait_par = case when p_fait then auth.uid() end, maj_at = now()
   where id = p_id;
end;
$$;

revoke all on function public.a_faire_fait(uuid, boolean) from public, anon;
grant execute on function public.a_faire_fait(uuid, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Moins de 6 posts (B1) : motif de l'arrêt, et le compte seul d'un Double
-- ---------------------------------------------------------------------------
alter table public.arrets add column if not exists motif text;

comment on column public.arrets.motif is
  'Prompt 21, B1 (0416) : « moins6 » quand l''arrêt vient de la règle des 6 posts (source « manuel »).';

/**
 * Un Double dont un seul compte est sous les 6 posts : ce compte (et lui
 * seul) est arrêté, noté dans le Pipeline. Appelée par la paie automatique
 * quand kill_auto = on. Service role seulement.
 */
create or replace function public.compte_arreter_moins6(p_poster uuid, p_lundi date)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_n integer := 0;
  r   record;
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception 'réservé à la fonction upwork';
  end if;
  for r in
    select (d ->> 'compte_id')::uuid as compte_id, d ->> 'handle' as handle
      from public.paie_semaines ps, jsonb_array_elements(coalesce(ps.detail_comptes, '[]'::jsonb)) d
     where ps.poster_id = p_poster and ps.semaine = p_lundi and coalesce((d ->> 'moins6')::boolean, false)
  loop
    update public.comptes set is_active = false where id = r.compte_id and poster_id = p_poster and is_active;
    if found then
      v_n := v_n + 1;
      insert into public.recrue_evenements (poster_id, compte_id, type, at, detail, cle)
      values (p_poster, r.compte_id, 'compte_arrete', now(),
              format('Compte %s sous les 6 posts la semaine du %s : arrêté, semaine suivante au tarif simple', coalesce(r.handle, ''), p_lundi),
              'moins6:' || p_lundi)
      on conflict (poster_id, type, cle) do nothing;
    end if;
  end loop;
  return v_n;
end;
$$;

revoke all on function public.compte_arreter_moins6(uuid, date) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5. Les textes (modifiables dans Settings → Payroll messages)
-- ---------------------------------------------------------------------------
insert into public.reglages (cle, valeur) values
  ('paie_soumettre_texte', to_jsonb('Hi {prenom}, please click Submit on your milestone for week {NN} so we can pay you.'::text)),
  ('paie_reponse_payee_texte', to_jsonb('You''ve been paid ${montant} for week {NN}.'::text)),
  ('paie_reponse_deja_payee_texte', to_jsonb('You were paid ${montant} for week {NN} on {date}. It can take a few days to show in your Upwork balance.'::text)),
  ('paie_reponse_financee_texte', to_jsonb('Your milestone for week {NN} is now funded.'::text))
on conflict (cle) do nothing;

-- ---------------------------------------------------------------------------
-- 6. Les crons (clonés de upwork-verifier : jamais de secret écrit ici)
-- ---------------------------------------------------------------------------
do $$
declare
  v_base text := (select command from cron.job where jobname = 'upwork-verifier');
begin
  if v_base is null then
    raise exception 'cron upwork-verifier introuvable';
  end if;
  perform cron.schedule('paie-auto', '*/10 * * * 1,2',
    regexp_replace(v_base, '"action"\s*:\s*"verifier"', '"action":"paie_auto"'));
  -- 19 h UTC = 20 h à Paris (heure d'hiver) ; 11 h UTC = 12 h.
  perform cron.schedule('paie-reconcilier-lundi', '0 19 * * 1',
    regexp_replace(v_base, '"action"\s*:\s*"verifier"', '"action":"paie_reconcilier"'));
  perform cron.schedule('paie-reconcilier-mardi', '0 11 * * 2',
    regexp_replace(v_base, '"action"\s*:\s*"verifier"', '"action":"paie_reconcilier"'));
end $$;
