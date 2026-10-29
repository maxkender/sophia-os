-- 0440 — Prompt 25 v4, partie 4 : les contrats de test.
--
-- - contrats_test : la liste des contrats Upwork de test (Overview → « Test
--   contracts », admin). Retirer un contrat le marque retiré (retire_at), rien
--   n'est effacé. poster_id : le posteur « TEST {prénom} » relié.
-- - contrat_test_ajouter(contrat ou lien) : refusé si le contrat est relié à
--   un vrai posteur actif (pas un posteur de test).
-- - contrat_test_retirer(contrat), contrats_test_liste().
-- Sur ces contrats, la bienvenue et les relances partent pour de vrai même sur
-- Test ou Approve (recrues-check, upwork accueil).
--
-- Additive : 1 table, 3 fonctions. Aucune donnée existante modifiée.

create table if not exists public.contrats_test (
  contrat_id  text primary key,
  poster_id   uuid references public.profiles(id) on delete set null,
  ajoute_par  uuid references auth.users(id) on delete set null,
  ajoute_at   timestamptz not null default now(),
  retire_at   timestamptz
);
comment on table public.contrats_test is
  'Prompt 25 v4 (0440) : contrats Upwork de test ; bienvenue et relances partent pour de vrai même sur Test ou Approve.';

alter table public.contrats_test enable row level security;
do $p$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'contrats_test' and policyname = 'contrats_test_admin_lit') then
    create policy contrats_test_admin_lit on public.contrats_test for select to authenticated using (public.is_admin());
  end if;
end;
$p$;

create or replace function public.contrat_test_ajouter(p_contrat text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id text := coalesce(substring(btrim(coalesce(p_contrat, '')) from '([0-9]{6,})'), '');
  v_reel text;
begin
  if not public.is_admin_strict() then
    raise exception 'contrat_test_ajouter : réservé à l''admin';
  end if;
  if v_id = '' then
    raise exception 'contrat_test_ajouter : id de contrat introuvable dans « % »', p_contrat;
  end if;
  select nullif(btrim(concat_ws(' ', pr.prenom, pr.nom)), '') into v_reel
    from public.profiles pr
   where pr.upwork_contract_id = v_id and pr.is_active
     and not exists (select 1 from public.contrats_test t where t.poster_id = pr.id)
   limit 1;
  if found then
    raise exception 'contrat_test_ajouter : le contrat % est relié à un vrai posteur actif (%)', v_id, coalesce(v_reel, '?');
  end if;
  insert into public.contrats_test (contrat_id, ajoute_par) values (v_id, auth.uid())
  on conflict (contrat_id) do update set retire_at = null, ajoute_par = excluded.ajoute_par, ajoute_at = now();
  return v_id;
end;
$$;
revoke all on function public.contrat_test_ajouter(text) from public, anon;
grant execute on function public.contrat_test_ajouter(text) to authenticated;

create or replace function public.contrat_test_retirer(p_contrat text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin_strict() then
    raise exception 'contrat_test_retirer : réservé à l''admin';
  end if;
  update public.contrats_test set retire_at = now() where contrat_id = p_contrat and retire_at is null;
end;
$$;
revoke all on function public.contrat_test_retirer(text) from public, anon;
grant execute on function public.contrat_test_retirer(text) to authenticated;

create or replace function public.contrats_test_liste()
returns table (contrat_id text, ajoute_at timestamptz, poster_id uuid, poster_nom text, poster_actif boolean, cohorte_lundi date,
               slack boolean, email text)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
begin
  if not public.is_admin() then
    raise exception 'contrats_test_liste : réservé à l''admin' using errcode = '42501';
  end if;
  return query
  select t.contrat_id, t.ajoute_at, t.poster_id, nullif(btrim(concat_ws(' ', pr.prenom, pr.nom)), ''), pr.is_active, pr.cohorte_lundi,
         pr.slack_user_id is not null, pr.email
    from public.contrats_test t
    left join public.profiles pr on pr.id = t.poster_id
   where t.retire_at is null
   order by t.ajoute_at;
end;
$$;
revoke all on function public.contrats_test_liste() from public, anon;
grant execute on function public.contrats_test_liste() to authenticated;

notify pgrst, 'reload schema';
