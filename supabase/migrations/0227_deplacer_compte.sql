-- Déplacer un compte TikTok d'un créateur à un autre sans le recréer.
-- UPDATE de comptes.poster_id uniquement : handle, persona, warmup, posts restent.
-- Admin : n'importe quel créateur. HM : uniquement ses propres créateurs.
-- DM : créateurs de son équipe.

create or replace function public.peut_gerer_createur(p_poster_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.is_admin()
    or exists (
      select 1 from public.profiles pr
      where pr.id = p_poster_id and pr.manager_id = auth.uid()
    )
    or (
      public.is_directing_manager()
      and public.est_createur_equipe_dm(p_poster_id)
    );
$$;

grant execute on function public.peut_gerer_createur(uuid) to authenticated, service_role;
revoke execute on function public.peut_gerer_createur(uuid) from public, anon;

create or replace function public.deplacer_compte(p_compte_id uuid, p_dest_poster_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_compte public.comptes%rowtype;
  v_conflit uuid;
begin
  if p_compte_id is null or p_dest_poster_id is null then
    raise exception 'compteId et destPosterId requis';
  end if;

  select * into v_compte from public.comptes where id = p_compte_id;
  if not found then
    raise exception 'compte introuvable';
  end if;

  if v_compte.poster_id = p_dest_poster_id then
    return v_compte.id;
  end if;

  if not exists (
    select 1 from public.user_roles
    where user_id = p_dest_poster_id and role = 'poster'
  ) then
    raise exception 'DEST_PAS_CREATEUR';
  end if;

  if not public.peut_gerer_createur(v_compte.poster_id)
     or not public.peut_gerer_createur(p_dest_poster_id) then
    raise exception 'forbidden';
  end if;

  if v_compte.type_compte = 'cm' then
    select id into v_conflit
      from public.comptes
     where poster_id = p_dest_poster_id
       and type_compte = 'cm'
       and langue = v_compte.langue
       and is_active
     limit 1;
    if v_conflit is not null then
      raise exception 'CM_LANGUE_PRISE';
    end if;
  end if;

  update public.comptes
     set poster_id = p_dest_poster_id
   where id = p_compte_id;

  update public.reviews
     set poster_id = p_dest_poster_id
   where post_id in (select id from public.posts where compte_id = p_compte_id);

  if v_compte.langue is not null and length(trim(v_compte.langue)) > 0 then
    update public.profiles
       set langues = coalesce(langues, '{}') || array[v_compte.langue]
     where id = p_dest_poster_id
       and not (v_compte.langue = any (coalesce(langues, '{}')));
  end if;

  return p_compte_id;
end;
$$;

grant execute on function public.deplacer_compte(uuid, uuid) to authenticated, service_role;
revoke execute on function public.deplacer_compte(uuid, uuid) from public, anon;

comment on function public.deplacer_compte(uuid, uuid) is
  'Rattache un compte TikTok existant à un autre créateur (même id). Admin : tous. HM : ses créateurs.';
