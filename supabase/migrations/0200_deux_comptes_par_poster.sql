-- Un poster peut avoir jusqu'à 2 comptes TikTok (identités distinctes).
-- L'assignation minuit reste par compte (quota posts_par_jour indépendant).

create or replace function public.interdire_trop_de_comptes_poster()
returns trigger
language plpgsql
as $$
declare
  n int;
begin
  select count(*) into n
  from public.comptes
  where poster_id = new.poster_id;
  if n >= 2 then
    raise exception 'MAX_COMPTES_POSTER'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists comptes_max_deux_par_poster on public.comptes;
create trigger comptes_max_deux_par_poster
  before insert on public.comptes
  for each row
  execute function public.interdire_trop_de_comptes_poster();

-- Mise à jour du @ d'UN compte du poster connecté (2 comptes possibles).
create or replace function public.maj_mon_handle_compte(p_compte_id uuid, nouveau text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.comptes
     set handle_tiktok = nullif(trim(both from replace(nouveau, '@', '')), '')
   where id = p_compte_id
     and poster_id = auth.uid();
end;
$$;

grant execute on function public.maj_mon_handle_compte(uuid, text) to authenticated;

-- Ancien RPC : n'écrase plus tous les comptes, seulement le plus ancien.
create or replace function public.maj_mon_handle(nouveau text)
returns void
language sql
security definer
set search_path = public
as $$
  update public.comptes
     set handle_tiktok = nullif(trim(both from replace(nouveau, '@', '')), '')
   where id = (
     select c.id
     from public.comptes c
     where c.poster_id = auth.uid()
     order by c.created_at asc
     limit 1
   );
$$;
