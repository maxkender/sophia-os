-- 0484 — Weekly decisions (samedi) : les choix ne se perdent plus ; la vue montre tout le monde.
--
-- 1. samedi_brouillons : chaque choix (Kill & pay, Kill & don't pay et sa raison,
--    Double, Keep, Recreate, pause…) est enregistré au clic, par semaine (lundi) et
--    par compte. Un rechargement les reprend. Validate fait les décisions comme
--    avant ; le brouillon reste (trace de ce qui a été choisi).
-- 2. samedi_couverture : la cohorte qui arrive est de nouveau comptée (elle est
--    visible le samedi, en Keep, et Validate ne la touche pas).
--
-- Additive : 1 table, 2 fonctions, 1 fonction remplacée. Aucune donnée modifiée.

create table if not exists public.samedi_brouillons (
  lundi date not null,
  compte_id uuid not null references public.comptes(id),
  choix text not null check (choix in ('kill', 'kill_np', 'double', 'keep', 'repondre', 'recreate', 'pause')),
  raison jsonb,
  par uuid,
  maj_at timestamptz not null default now(),
  primary key (lundi, compte_id)
);
alter table public.samedi_brouillons enable row level security;

create or replace function public.samedi_brouillons_lire(p_lundi date)
returns table (compte_id uuid, choix text, raison jsonb, par_nom text, maj_at timestamptz)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return query
  select b.compte_id, b.choix, b.raison,
         (select nullif(btrim(concat_ws(' ', p.prenom, p.nom)), '') from public.profiles p where p.id = b.par), b.maj_at
    from public.samedi_brouillons b
   where b.lundi = p_lundi;
end;
$$;
revoke all on function public.samedi_brouillons_lire(date) from public, anon;
grant execute on function public.samedi_brouillons_lire(date) to authenticated;

-- Un clic : le choix (et la raison d'un Kill & don't pay) du compte pour la semaine.
create or replace function public.samedi_brouillon_noter(p_lundi date, p_compte uuid, p_choix text, p_raison jsonb default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin_strict() then
    raise exception 'samedi_brouillon_noter : réservé à l''admin' using errcode = '42501';
  end if;
  insert into public.samedi_brouillons (lundi, compte_id, choix, raison, par, maj_at)
  values (p_lundi, p_compte, p_choix, p_raison, auth.uid(), now())
  on conflict (lundi, compte_id) do update
    set choix = excluded.choix, raison = coalesce(excluded.raison, samedi_brouillons.raison),
        par = excluded.par, maj_at = now();
end;
$$;
revoke all on function public.samedi_brouillon_noter(date, uuid, text, jsonb) from public, anon;
grant execute on function public.samedi_brouillon_noter(date, uuid, text, jsonb) to authenticated;

create or replace function public.samedi_couverture(p_lundi date)
returns table (poster_id uuid, nom text, comptes integer, raison text)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return query
  select pr.id, nullif(btrim(concat_ws(' ', pr.prenom, pr.nom)), ''),
         (select count(*) from public.comptes c where c.poster_id = pr.id and c.is_active)::int,
         case when exists (select 1 from public.hub_posteurs h where h.profile_id = pr.id) then 'ruul'
              when not exists (select 1 from public.comptes c where c.poster_id = pr.id and c.is_active) then 'sans_compte'
              when not exists (select 1 from public.comptes c where c.poster_id = pr.id and c.is_active and c.type_compte = 'perso') then 'pas_perso'
         end
    from public.profiles pr
   where pr.is_active
     and exists (select 1 from public.user_roles ur where ur.user_id = pr.id and ur.role = 'poster');
end;
$$;

notify pgrst, 'reload schema';
