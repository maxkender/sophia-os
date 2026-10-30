-- 0469 — Le lien de la conversation Upwork, partout où il y a un problème.
--
-- - conversations_upwork(posteurs, contrats) : pour chaque posteur (son contrat)
--   ou contrat demandé, la room Upwork connue (upwork_salons). Une room pas encore
--   connue est mise dans salons_a_trouver : la fonction upwork (contexte-upwork,
--   toutes les 2 h) la cherche au prochain passage, avant les autres.
-- - contexte_cibles_upwork : les contrats de salons_a_trouver d'abord (posteur
--   actif ou non, contrat actif ou non), puis les posteurs actifs comme avant.
--
-- Additive : 1 table, 1 fonction, 1 fonction remplacée. Aucune donnée existante modifiée.

create table if not exists public.salons_a_trouver (
  contrat_id text primary key,
  demande_at timestamptz not null default now()
);
alter table public.salons_a_trouver enable row level security;
create policy "salons_a_trouver lecture" on public.salons_a_trouver for select using ((select public.is_admin()));

create or replace function public.conversations_upwork(p_posteurs uuid[] default null, p_contrats text[] default null)
returns table (poster_id uuid, contrat_id text, room_id text)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  -- Les rooms pas encore connues : cherchées au prochain passage de contexte-upwork.
  insert into public.salons_a_trouver (contrat_id)
  select distinct c.contrat_id
    from (select pr.upwork_contract_id as contrat_id from public.profiles pr
           where pr.id = any (coalesce(p_posteurs, '{}')) and pr.upwork_contract_id is not null
          union
          select unnest(coalesce(p_contrats, '{}'))) c
   where c.contrat_id is not null and c.contrat_id <> ''
     and exists (select 1 from public.upwork_contrats uc where uc.contrat_id = c.contrat_id)
     and not exists (select 1 from public.upwork_salons s where s.contrat_id = c.contrat_id and s.room_id is not null)
  on conflict (contrat_id) do nothing;
  return query
  select pr.id, pr.upwork_contract_id, s.room_id
    from public.profiles pr
    left join public.upwork_salons s on s.contrat_id = pr.upwork_contract_id
   where pr.id = any (coalesce(p_posteurs, '{}'))
  union all
  select null::uuid, c.contrat_id, s.room_id
    from unnest(coalesce(p_contrats, '{}')) c(contrat_id)
    left join public.upwork_salons s on s.contrat_id = c.contrat_id;
end;
$$;
revoke all on function public.conversations_upwork(uuid[], text[]) from public, anon;
grant execute on function public.conversations_upwork(uuid[], text[]) to authenticated;

create or replace function public.contexte_cibles_upwork(p_posteurs uuid[] default null, p_max integer default 120)
returns table (poster_id uuid, contrat_id text, organisation_id text, room_id text, freelance_id text)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
begin
  if coalesce(auth.role(), '') <> 'service_role' and not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return query
  select x.poster_id, x.contrat_id, x.organisation_id, x.room_id, x.freelance_id
    from (
      -- 0469 : les rooms demandées par une page (pas encore connues), d'abord.
      (select distinct on (t.contrat_id)
             pr.id as poster_id, t.contrat_id, uc.organisation_id, s.room_id, s.freelance_id, s.lu_at, 0 as rang, t.demande_at
        from public.salons_a_trouver t
        join public.upwork_contrats uc on uc.contrat_id = t.contrat_id
        left join public.profiles pr on pr.upwork_contract_id = t.contrat_id
        left join public.upwork_salons s on s.contrat_id = t.contrat_id
       where p_posteurs is null and s.room_id is null and t.demande_at > now() - interval '14 days'
         and (s.lu_at is null or s.lu_at < now() - interval '6 hours')
       order by t.contrat_id, pr.is_active desc nulls last, pr.created_at)
      union all
      (select distinct on (pr.upwork_contract_id)
             pr.id, pr.upwork_contract_id, uc.organisation_id, s.room_id, s.freelance_id, s.lu_at, 1, null::timestamptz
        from public.profiles pr
        join public.upwork_contrats uc on uc.contrat_id = pr.upwork_contract_id
        left join public.upwork_salons s on s.contrat_id = pr.upwork_contract_id
       where pr.is_active and pr.upwork_contract_id is not null and uc.actif
         and not exists (select 1 from public.hub_posteurs h where h.profile_id = pr.id)
         and (p_posteurs is null or pr.id = any (p_posteurs))
         and not exists (select 1 from public.salons_a_trouver t2 where t2.contrat_id = pr.upwork_contract_id and s.room_id is null
                          and t2.demande_at > now() - interval '14 days' and p_posteurs is null)
       order by pr.upwork_contract_id, pr.created_at)
    ) x
   order by x.rang, x.demande_at nulls last, x.lu_at nulls first, x.contrat_id
   limit greatest(1, least(coalesce(p_max, 120), 400));
end;
$$;
revoke all on function public.contexte_cibles_upwork(uuid[], integer) from public, anon;
grant execute on function public.contexte_cibles_upwork(uuid[], integer) to authenticated, service_role;

notify pgrst, 'reload schema';
