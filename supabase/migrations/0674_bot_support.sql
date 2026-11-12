-- 0674 : « Support propre » (Max, 12/11). Le socle du bot v2 et de la page /admin/bot.
-- Rien ne change en ligne avec cette migration : la mise en ligne du bot v2 et le tri
-- des cartes (0675) attendent l'OK de Max après les 30 tests.
-- 1. support_infos : les « Infos à connaître » (faits simples modifiés par Max), avec
--    leur historique. Le bot s'y tient pour les dates, montants, liens et règles.
-- 2. reponses_officielles (le catalogue) : plusieurs formulations, une action, un niveau
--    d'escalade (bot / adrien / max), et un historique (qui, quoi, quand) avec retour arrière.
-- 3. support_demandes : niveau, risque, action faite, règle utilisée, raison, langue.
-- 4. bot_tests : les messages de test (au départ les 30 du point E), attendu et dernier résultat.
-- Additif : trois tables, des colonnes, des fonctions, un déclencheur d'historique.

-- 1. Infos à connaître ---------------------------------------------------------
create table if not exists public.support_infos (
  cle      text primary key,
  titre    text not null,
  valeur   text not null,
  ordre    integer not null default 100,
  maj_at   timestamptz not null default now(),
  maj_par  uuid
);
create table if not exists public.support_infos_historique (
  id        uuid primary key default gen_random_uuid(),
  cle       text not null,
  avant     text,
  apres     text,
  par       uuid,
  at        timestamptz not null default now()
);
alter table public.support_infos enable row level security;
alter table public.support_infos_historique enable row level security;
revoke all on public.support_infos, public.support_infos_historique from anon;
grant select on public.support_infos, public.support_infos_historique to authenticated;
do $p$
begin
  if not exists (select 1 from pg_policies where tablename = 'support_infos' and policyname = 'support_infos_admin') then
    create policy support_infos_admin on public.support_infos for select to authenticated using (public.is_admin());
  end if;
  if not exists (select 1 from pg_policies where tablename = 'support_infos_historique' and policyname = 'support_infos_historique_admin') then
    create policy support_infos_historique_admin on public.support_infos_historique for select to authenticated using (public.is_admin());
  end if;
end
$p$;

insert into public.support_infos (cle, titre, valeur, ordre) values
  ('paie_upwork', 'Paie Upwork', 'Upwork: each week of posts is paid through the milestone of that week on the Upwork contract, released the Monday after the week.', 10),
  ('paie_ruul', 'Paie Ruul', 'Ruul: paid every Monday through Ruul for the week of posts that just ended. First Ruul payment: Monday 23 November.', 20),
  ('tarifs_zones', 'Tarifs par zone (par compte et par semaine)', 'Zone A: 14 $ · Zone B: 10 $ · Zone C: 7 $ per account per week.', 30),
  ('pays_fermes', 'Pays fermés', 'Portugal (PT) is closed: no new posters.', 40),
  ('lien_guide', 'Lien du guide', 'https://star-water-a0e.notion.site/Vik-Studios-TikTok-Poster-Guide-3f4241308d6681f8ad41dc507f2c8505', 50),
  ('lien_slack', 'Lien Slack', 'https://join.slack.com/t/sophia-system/shared_invite/zt-4e853lm47-rZcsBVSNXS88LGanfagACQ', 60),
  ('posts_manques', 'Règle des posts manqués', 'At least 6 posts with link per week. Below 6 by Sunday midnight, the collaboration stops. No post at all by Friday: the contract ends on Saturday.', 70),
  ('ou_poser', 'Où poser ses questions', 'Questions about posting → #posting-help. Anything personal (account, pay, contract) → Help on the dashboard.', 80)
on conflict (cle) do nothing;

create or replace function public.support_info_modifier(p_cle text, p_titre text, p_valeur text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_avant text;
begin
  if not public.is_admin_strict() then raise exception 'réservé aux admins' using errcode = '42501'; end if;
  if length(btrim(coalesce(p_valeur, ''))) < 1 then raise exception 'valeur vide'; end if;
  select valeur into v_avant from public.support_infos where cle = p_cle;
  insert into public.support_infos (cle, titre, valeur, maj_at, maj_par)
  values (p_cle, coalesce(nullif(btrim(p_titre), ''), p_cle), btrim(p_valeur), now(), auth.uid())
  on conflict (cle) do update set titre = excluded.titre, valeur = excluded.valeur, maj_at = now(), maj_par = auth.uid();
  insert into public.support_infos_historique (cle, avant, apres, par) values (p_cle, v_avant, btrim(p_valeur), auth.uid());
end;
$$;

-- 2. Catalogue ---------------------------------------------------------------
alter table public.reponses_officielles add column if not exists formulations text[] not null default '{}';
alter table public.reponses_officielles add column if not exists action text;
alter table public.reponses_officielles add column if not exists niveau text not null default 'bot';
do $c$
begin
  if not exists (select 1 from pg_constraint where conname = 'reponses_officielles_niveau_check') then
    alter table public.reponses_officielles add constraint reponses_officielles_niveau_check check (niveau in ('bot', 'adrien', 'max'));
  end if;
end
$c$;

create table if not exists public.reponses_officielles_historique (
  id         uuid primary key default gen_random_uuid(),
  reponse_id uuid not null,
  avant      jsonb,
  apres      jsonb,
  par        uuid,
  at         timestamptz not null default now()
);
alter table public.reponses_officielles_historique enable row level security;
revoke all on public.reponses_officielles_historique from anon;
grant select on public.reponses_officielles_historique to authenticated;
do $p$
begin
  if not exists (select 1 from pg_policies where tablename = 'reponses_officielles_historique' and policyname = 'reponses_officielles_historique_admin') then
    create policy reponses_officielles_historique_admin on public.reponses_officielles_historique for select to authenticated using (public.is_admin());
  end if;
end
$p$;

create or replace function public.reponses_officielles_journal()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.reponses_officielles_historique (reponse_id, avant, apres, par)
  values (new.id, case when tg_op = 'UPDATE' then to_jsonb(old) end, to_jsonb(new), auth.uid());
  return new;
end;
$$;
revoke execute on function public.reponses_officielles_journal() from public, anon, authenticated;
create or replace trigger reponses_officielles_journal
  after insert or update on public.reponses_officielles
  for each row execute function public.reponses_officielles_journal();

/* Retour arrière : la fiche reprend son état d'avant une modification (l'historique garde la trace). */
create or replace function public.reponse_officielle_restaurer(p_historique uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  h public.reponses_officielles_historique%rowtype;
begin
  if not public.is_admin_strict() then raise exception 'réservé aux admins' using errcode = '42501'; end if;
  select * into h from public.reponses_officielles_historique where id = p_historique;
  if not found or h.avant is null then raise exception 'rien à restaurer'; end if;
  update public.reponses_officielles set
    question = h.avant->>'question', reponse = h.avant->>'reponse',
    portee = coalesce(h.avant->>'portee', 'tous'), categorie = h.avant->>'categorie',
    formulations = coalesce(array(select jsonb_array_elements_text(h.avant->'formulations')), '{}'),
    action = h.avant->>'action', niveau = coalesce(h.avant->>'niveau', 'bot'),
    actif = coalesce((h.avant->>'actif')::boolean, true),
    valide_at = (h.avant->>'valide_at')::timestamptz
  where id = h.reponse_id;
end;
$$;

-- 3. Demandes ----------------------------------------------------------------
alter table public.support_demandes add column if not exists niveau text;
alter table public.support_demandes add column if not exists risque text[] not null default '{}';
alter table public.support_demandes add column if not exists action_faite text;
alter table public.support_demandes add column if not exists regle text;
alter table public.support_demandes add column if not exists raison text;
alter table public.support_demandes add column if not exists langue text;

-- 4. Tests du bot ------------------------------------------------------------
create table if not exists public.bot_tests (
  id               uuid primary key default gen_random_uuid(),
  message          text not null,
  poster_id        uuid references public.profiles(id),
  profil           jsonb,
  source           text not null default 'help' check (source in ('help', 'slack_salon')),
  attendu_niveau   text check (attendu_niveau in ('bot', 'adrien', 'max')),
  attendu_contient text[] not null default '{}',
  attendu_action   text,
  note             text,
  actif            boolean not null default true,
  cree_at          timestamptz not null default now(),
  dernier          jsonb,
  dernier_ok       boolean,
  dernier_at       timestamptz
);
alter table public.bot_tests enable row level security;
revoke all on public.bot_tests from anon;
grant select on public.bot_tests to authenticated;
do $p$
begin
  if not exists (select 1 from pg_policies where tablename = 'bot_tests' and policyname = 'bot_tests_admin') then
    create policy bot_tests_admin on public.bot_tests for select to authenticated using (public.is_admin_strict());
  end if;
end
$p$;

revoke execute on function public.support_info_modifier(text, text, text) from public, anon;
revoke execute on function public.reponse_officielle_restaurer(uuid) from public, anon;
grant execute on function public.support_info_modifier(text, text, text) to authenticated;
grant execute on function public.reponse_officielle_restaurer(uuid) to authenticated;
