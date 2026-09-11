-- Mots de passe Gmail/IG : le créateur ne les lit qu'après signature.
-- Le staff (admin / HM / DM) les voit toujours via SELECT table + RPC.

drop policy if exists papier_cm_contrats_select on public.papier_cm_contrats;
create policy papier_cm_contrats_select on public.papier_cm_contrats
  for select using (public.peut_ecrire_identifiants_compte(profile_id));

create or replace function public.lister_papier_cm_contrats(p_profile_id uuid default null)
returns setof public.papier_cm_contrats
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  cible uuid := coalesce(p_profile_id, auth.uid());
  staff boolean;
begin
  if auth.uid() is null or cible is null then
    raise exception 'NON_AUTHENTIFIE';
  end if;

  staff := public.peut_ecrire_identifiants_compte(cible);

  if cible <> auth.uid() and not staff then
    raise exception 'INTERDIT';
  end if;

  return query
  select
    c.id,
    c.profile_id,
    c.compte_id,
    c.langue,
    c.statut,
    c.contrat_version,
    c.gmail_adresse,
    case
      when staff or c.statut = 'signe' then c.gmail_password
      else ''
    end,
    c.instagram_handle,
    case
      when staff or c.statut = 'signe' then c.instagram_password
      else ''
    end,
    c.nom_legal,
    c.pays_residence,
    c.signature_texte,
    c.signe_at,
    c.signature_ip,
    c.signature_user_agent,
    c.envoye_par,
    c.envoye_at,
    c.created_at,
    c.updated_at
  from public.papier_cm_contrats c
  where c.profile_id = cible
    and c.statut <> 'annule'
  order by c.envoye_at desc;
end;
$$;

grant execute on function public.lister_papier_cm_contrats(uuid) to authenticated;
