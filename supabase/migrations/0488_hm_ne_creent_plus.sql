-- 0488 — Les HM ne créent plus de posteurs : l'OS crée le posteur et envoie le
-- welcome quand l'offre est acceptée.
--
-- 1. poster_creation_reserver refuse toute création demandée par une HM ou une
--    DM (p_par « hiring_manager:… » / « directing_manager:… »), avant même de
--    regarder le contrat : statut « refuse_hm », avec le posteur qui existe
--    déjà pour ce contrat s'il y en a un. manage-users l'appelle pour chaque
--    création de posteur (avec ou sans contrat).
-- 2. hm_trouver_posteur(texte) : pour le message affiché à la HM, le posteur qui
--    existe déjà pour un lien de contrat Upwork ou un nom (5 au plus).
--
-- Additive : 1 fonction remplacée (même signature), 1 fonction. Aucune donnée modifiée.

create or replace function public.poster_creation_reserver(p_contrat text, p_par text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existant record;
  v_ok boolean;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  -- 0488 : une HM (ou une DM) ne crée plus de posteur.
  if coalesce(p_par, '') ~ '^(hiring_manager|directing_manager):' then
    select pr.id, nullif(btrim(concat_ws(' ', pr.prenom, pr.nom)), '') as nom, pr.email
      into v_existant
      from public.profiles pr
     where pr.is_active and p_contrat is not null
       and (pr.upwork_contract_id = p_contrat or public.contrat_de_url(pr.upwork_contrat_url) = p_contrat)
       and exists (select 1 from public.user_roles ur where ur.user_id = pr.id and ur.role = 'poster')
     order by pr.created_at
     limit 1;
    return jsonb_build_object('statut', 'refuse_hm', 'poster_id', v_existant.id, 'nom', v_existant.nom, 'email', v_existant.email);
  end if;
  if p_contrat is null or p_contrat !~ '^[0-9]{6,}$' then
    return jsonb_build_object('statut', 'ok');
  end if;
  perform pg_advisory_xact_lock(hashtext('poster_creation:' || p_contrat));
  select pr.id, nullif(btrim(concat_ws(' ', pr.prenom, pr.nom)), '') as nom, pr.email, pr.manager_id
    into v_existant
    from public.profiles pr
   where pr.is_active
     and (pr.upwork_contract_id = p_contrat or public.contrat_de_url(pr.upwork_contrat_url) = p_contrat)
     and exists (select 1 from public.user_roles ur where ur.user_id = pr.id and ur.role = 'poster')
   order by pr.created_at
   limit 1;
  if found then
    return jsonb_build_object('statut', 'existe', 'poster_id', v_existant.id, 'nom', v_existant.nom,
                              'email', v_existant.email, 'hm_id', v_existant.manager_id);
  end if;
  insert into public.poster_creations as pc (contrat_id, par, debut_at, poster_id, fin_at)
  values (p_contrat, p_par, now(), null, null)
  on conflict (contrat_id) do update set par = excluded.par, debut_at = now(), poster_id = null, fin_at = null
   where pc.fin_at is not null or pc.debut_at < now() - interval '3 minutes'
  returning true into v_ok;
  if v_ok is null then
    return jsonb_build_object('statut', 'en_cours', 'par', (select pc.par from public.poster_creations pc where pc.contrat_id = p_contrat));
  end if;
  return jsonb_build_object('statut', 'ok');
end;
$$;

create or replace function public.hm_trouver_posteur(p_recherche text)
returns table (poster_id uuid, nom text, cohorte_lundi date, hm_nom text, contrat_id text)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_txt text := btrim(coalesce(p_recherche, ''));
  v_contrat text;
begin
  if not (public.is_admin() or exists (select 1 from public.user_roles ur where ur.user_id = auth.uid()
                                         and ur.role in ('hiring_manager', 'directing_manager', 'head_of_ops'))) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if length(v_txt) < 3 then
    return;
  end if;
  v_contrat := coalesce(public.contrat_de_url(v_txt), substring(v_txt from '^([0-9]{6,})$'));
  return query
  select pr.id, nullif(btrim(concat_ws(' ', pr.prenom, pr.nom)), ''), pr.cohorte_lundi,
         (select nullif(btrim(concat_ws(' ', h.prenom, h.nom)), '') from public.profiles h where h.id = pr.manager_id),
         pr.upwork_contract_id
    from public.profiles pr
   where pr.is_active
     and exists (select 1 from public.user_roles ur where ur.user_id = pr.id and ur.role = 'poster')
     and (
       (v_contrat is not null and (pr.upwork_contract_id = v_contrat or public.contrat_de_url(pr.upwork_contrat_url) = v_contrat))
       or (v_contrat is null and lower(concat_ws(' ', pr.prenom, pr.nom)) like '%' || lower(v_txt) || '%')
     )
   order by pr.created_at desc
   limit 5;
end;
$$;
revoke all on function public.hm_trouver_posteur(text) from public, anon;
grant execute on function public.hm_trouver_posteur(text) to authenticated;

notify pgrst, 'reload schema';
