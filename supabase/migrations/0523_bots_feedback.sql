-- 0523 — Page Problèmes : le feedback aux bots et leurs règles (03/11).
--
-- 1. bot_feedback : sur une carte proposée par un bot (ou fermée par lui avec
--    « close »), l'admin donne un verdict — juste, pas un problème, mauvais
--    diagnostic, mauvaise action / réponse — et sa raison (obligatoire sauf
--    « juste »). Le feedback ne change rien à la carte.
-- 2. regles_bots : des règles courtes (1-2 phrases + un exemple) pour un bot
--    ou pour « tous », actives ou non, souvent tirées d'un feedback.
-- 3. bots_apprentissage (rôle bots_lecture) : pour chaque bot, ses règles
--    actives (+ « tous ») et ses feedbacks des 30 derniers jours.
-- 4. bots_stats() : par bot, % de « juste » sur 7 jours et les catégories où
--    il se trompe le plus.
--
-- Additif : 2 tables, 1 vue, des fonctions. Aucune ligne existante modifiée.

create table if not exists public.bot_feedback (
  id                uuid primary key default gen_random_uuid(),
  probleme_id       uuid references public.problemes(id) on delete set null,
  bot               text not null check (bot in ('new_cohort_bot', 'control_bot', 'pay_bot')),
  categorie         text,
  groupe            text,
  verdict           text not null check (verdict in ('juste', 'pas_un_probleme', 'mauvais_diagnostic', 'mauvaise_action')),
  raison            text,
  diagnostic_du_bot text,
  action_du_bot     text,
  donne_par         uuid,
  created_at        timestamptz not null default now(),
  check (verdict = 'juste' or coalesce(btrim(raison), '') <> '')
);
create index if not exists bot_feedback_bot_at on public.bot_feedback (bot, created_at desc);
create index if not exists bot_feedback_probleme on public.bot_feedback (probleme_id);
alter table public.bot_feedback enable row level security;

create table if not exists public.regles_bots (
  id                  uuid primary key default gen_random_uuid(),
  bot                 text not null check (bot in ('new_cohort_bot', 'control_bot', 'pay_bot', 'tous')),
  regle               text not null check (length(btrim(regle)) between 1 and 500),
  exemple             text,
  source_feedback_ids uuid[] not null default '{}',
  active              boolean not null default true,
  creee_par           uuid,
  created_at          timestamptz not null default now(),
  maj_at              timestamptz not null default now()
);
create index if not exists regles_bots_bot on public.regles_bots (bot, active);
alter table public.regles_bots enable row level security;

do $p$
begin
  if not exists (select 1 from pg_policies where tablename = 'bot_feedback' and policyname = 'bot_feedback_admin') then
    create policy bot_feedback_admin on public.bot_feedback for select to authenticated using (public.is_admin());
  end if;
  if not exists (select 1 from pg_policies where tablename = 'regles_bots' and policyname = 'regles_bots_admin') then
    create policy regles_bots_admin on public.regles_bots for select to authenticated using (public.is_admin());
  end if;
end
$p$;

-- Donner un feedback : le bot, la catégorie, le groupe, son diagnostic et son action sont copiés de la carte.
create or replace function public.bot_feedback_donner(p_probleme uuid, p_verdict text, p_raison text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  p public.problemes;
  v_id uuid;
begin
  if not public.is_admin() then
    raise exception 'bot_feedback_donner : réservé à l''admin' using errcode = '42501';
  end if;
  select * into p from public.problemes where id = p_probleme;
  if not found then raise exception 'problème introuvable'; end if;
  if coalesce(p.propose_par, '') not in ('new_cohort_bot', 'control_bot', 'pay_bot') then
    raise exception 'cette carte n''a pas été proposée par un bot';
  end if;
  if p_verdict not in ('juste', 'pas_un_probleme', 'mauvais_diagnostic', 'mauvaise_action') then
    raise exception 'verdict inconnu';
  end if;
  if p_verdict <> 'juste' and coalesce(btrim(p_raison), '') = '' then
    raise exception 'raison obligatoire (sauf pour « juste »)';
  end if;
  insert into public.bot_feedback (probleme_id, bot, categorie, groupe, verdict, raison, diagnostic_du_bot, action_du_bot, donne_par)
  values (p.id, p.propose_par, p.categorie, p.groupe, p_verdict, nullif(left(btrim(p_raison), 1000), ''), p.diagnostic,
          coalesce(p.proposition_action, left(p.proposition_reponse, 300)), auth.uid())
  returning id into v_id;
  return (select to_jsonb(f) from public.bot_feedback f where f.id = v_id);
end;
$$;
revoke all on function public.bot_feedback_donner(uuid, text, text) from public, anon;
grant execute on function public.bot_feedback_donner(uuid, text, text) to authenticated;

-- Les feedbacks récents (la page : dernier verdict par carte, « En faire une règle »).
create or replace function public.bot_feedback_liste(p_jours int default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'bot_feedback_liste : réservé à l''admin' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', f.id, 'probleme_id', f.probleme_id, 'bot', f.bot, 'categorie', f.categorie, 'groupe', f.groupe,
             'verdict', f.verdict, 'raison', f.raison, 'diagnostic_du_bot', f.diagnostic_du_bot, 'action_du_bot', f.action_du_bot,
             'created_at', f.created_at,
             'nom', (select nullif(btrim(concat_ws(' ', pr.prenom, pr.nom)), '') from public.problemes pb
                       join public.profiles pr on pr.id = pb.poster_id where pb.id = f.probleme_id),
             'en_regle', exists (select 1 from public.regles_bots r where f.id = any (r.source_feedback_ids)))
           order by f.created_at desc)
      from public.bot_feedback f
     where f.created_at > now() - make_interval(days => greatest(1, least(coalesce(p_jours, 30), 365)))
  ), '[]'::jsonb);
end;
$$;
revoke all on function public.bot_feedback_liste(int) from public, anon;
grant execute on function public.bot_feedback_liste(int) to authenticated;

-- Les règles : liste, créer / modifier, activer / désactiver.
create or replace function public.regles_bots_liste()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'regles_bots_liste : réservé à l''admin' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(to_jsonb(r) order by r.active desc, r.created_at desc) from public.regles_bots r
  ), '[]'::jsonb);
end;
$$;
revoke all on function public.regles_bots_liste() from public, anon;
grant execute on function public.regles_bots_liste() to authenticated;

create or replace function public.regle_bot_enregistrer(
  p_id uuid, p_bot text, p_regle text, p_exemple text default null, p_sources uuid[] default '{}', p_active boolean default true)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid := p_id;
begin
  if not public.is_admin() then
    raise exception 'regle_bot_enregistrer : réservé à l''admin' using errcode = '42501';
  end if;
  if p_bot not in ('new_cohort_bot', 'control_bot', 'pay_bot', 'tous') then raise exception 'bot inconnu'; end if;
  if coalesce(btrim(p_regle), '') = '' then raise exception 'règle obligatoire'; end if;
  if length(btrim(p_regle)) > 500 then raise exception 'règle trop longue (1-2 phrases, 500 caractères au plus)'; end if;
  if v_id is null then
    insert into public.regles_bots (bot, regle, exemple, source_feedback_ids, active, creee_par)
    values (p_bot, btrim(p_regle), nullif(btrim(p_exemple), ''), coalesce(p_sources, '{}'), coalesce(p_active, true), auth.uid())
    returning id into v_id;
  else
    update public.regles_bots set bot = p_bot, regle = btrim(p_regle), exemple = nullif(btrim(p_exemple), ''),
           source_feedback_ids = coalesce(p_sources, source_feedback_ids), active = coalesce(p_active, active), maj_at = now()
     where id = v_id;
    if not found then raise exception 'règle introuvable'; end if;
  end if;
  return (select to_jsonb(r) from public.regles_bots r where r.id = v_id);
end;
$$;
revoke all on function public.regle_bot_enregistrer(uuid, text, text, text, uuid[], boolean) from public, anon;
grant execute on function public.regle_bot_enregistrer(uuid, text, text, text, uuid[], boolean) to authenticated;

create or replace function public.regle_bot_activer(p_id uuid, p_active boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'regle_bot_activer : réservé à l''admin' using errcode = '42501';
  end if;
  update public.regles_bots set active = p_active, maj_at = now() where id = p_id;
  if not found then raise exception 'règle introuvable'; end if;
end;
$$;
revoke all on function public.regle_bot_activer(uuid, boolean) from public, anon;
grant execute on function public.regle_bot_activer(uuid, boolean) to authenticated;

-- Le compteur par bot : % de « juste » sur 7 jours, catégories où il se trompe le plus.
create or replace function public.bots_stats()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'bots_stats : réservé à l''admin' using errcode = '42501';
  end if;
  return (
    select jsonb_agg(jsonb_build_object(
             'bot', b.bot,
             'total', (select count(*) from public.bot_feedback f where f.bot = b.bot and f.created_at > now() - interval '7 days'),
             'justes', (select count(*) from public.bot_feedback f where f.bot = b.bot and f.verdict = 'juste' and f.created_at > now() - interval '7 days'),
             'erreurs', coalesce((select jsonb_agg(jsonb_build_object('categorie', x.categorie, 'n', x.n) order by x.n desc, x.categorie)
                                    from (select coalesce(f.categorie, '—') as categorie, count(*) n from public.bot_feedback f
                                           where f.bot = b.bot and f.verdict <> 'juste' and f.created_at > now() - interval '7 days'
                                           group by 1 order by 2 desc, 1 limit 3) x), '[]'::jsonb))
           order by b.bot)
      from (values ('new_cohort_bot'), ('control_bot'), ('pay_bot')) as b(bot)
  );
end;
$$;
revoke all on function public.bots_stats() from public, anon;
grant execute on function public.bots_stats() to authenticated;

-- La vue des bots : leurs règles actives (+ « tous ») et leurs feedbacks des 30 derniers jours.
create or replace view public.bots_apprentissage as
select b.bot, 'regle'::text as type, r.created_at as at, r.regle, r.exemple,
       null::text as verdict, null::text as raison, null::text as diagnostic_du_bot, null::text as action_du_bot, null::text as categorie,
       (r.bot = 'tous') as pour_tous
  from (values ('new_cohort_bot'), ('control_bot'), ('pay_bot')) as b(bot)
  join public.regles_bots r on r.active and (r.bot = b.bot or r.bot = 'tous')
union all
select f.bot, 'feedback', f.created_at, null, null, f.verdict, f.raison, f.diagnostic_du_bot, f.action_du_bot, f.categorie, false
  from public.bot_feedback f
 where f.created_at > now() - interval '30 days';
revoke all on public.bots_apprentissage from public, anon, authenticated;
grant select on public.bots_apprentissage to bots_lecture;

notify pgrst, 'reload schema';
