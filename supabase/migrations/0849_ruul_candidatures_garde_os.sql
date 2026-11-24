-- 0849 (24/11) : la copie des candidatures du site garde le lien vers l'OS posé par l'OS.
-- Le rejeu des signés bloqués (hub-posteurs `rejouer_bloques`) note os_cree_at / os_profile_id
-- dans ruul_candidatures : le site, qui n'a jamais reçu la réponse, renvoie ces champs vides
-- toutes les 15 min et les effaçait. Désormais un vide du site n'efface plus une valeur connue.
-- Seule la clause « on conflict » change (coalesce sur os_cree_at et os_profile_id).
create or replace function public.ruul_candidatures_enregistrer(p_lignes jsonb)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  n int;
begin
  if coalesce(auth.role(), '') in ('anon', 'authenticated') then raise exception 'réservé à la fonction ruul'; end if;
  insert into public.ruul_candidatures as c (site_id, nom, email, pays, pays_brut, adulte, deux_telephones, a_telephone, reponses,
         referral, parrain_nom, ref, langue, statut_site, cree_at, accepte_at, signe_at, os_cree_at, os_profile_id,
         start_monday, expire_at, ruul_email, desinscrit_at, sync_at)
  select (e->>'id')::uuid, e->>'full_name', lower(btrim(e->>'email')), nullif(e->>'pays', ''), e->>'country',
         (e->>'is_adult')::boolean, (e->>'deux_telephones')::boolean, coalesce((e->>'has_phone')::boolean, false),
         jsonb_strip_nulls(jsonb_build_object('pays_actuel', e->>'q_country_now', 'heures', e->>'q_hours_per_day',
                                              'tiktok', e->>'q_tiktok_daily', 'contenu', e->>'q_previous_content')),
         coalesce((e->>'referred')::boolean, false) or nullif(e->>'ref', '') is not null, e->>'referral_name', nullif(e->>'ref', ''),
         e->>'langue', e->>'status', (e->>'created_at')::timestamptz, (e->>'accepted_at')::timestamptz,
         (e->>'contract_signed_at')::timestamptz, (e->>'os_created_at')::timestamptz,
         case when (e->>'os_profile_id') ~ '^[0-9a-f-]{36}$' then (e->>'os_profile_id')::uuid end,
         (e->>'start_monday')::date, (e->>'expired_at')::timestamptz, nullif(lower(btrim(e->>'ruul_email')), ''),
         (e->>'unsubscribed_at')::timestamptz, now()
    from jsonb_array_elements(coalesce(p_lignes, '[]'::jsonb)) e
   where (e->>'id') ~ '^[0-9a-f-]{36}$'
  on conflict (site_id) do update
     set nom = excluded.nom, email = excluded.email, pays = coalesce(excluded.pays, c.pays), pays_brut = excluded.pays_brut,
         adulte = excluded.adulte, deux_telephones = excluded.deux_telephones, a_telephone = excluded.a_telephone,
         reponses = excluded.reponses, referral = excluded.referral, parrain_nom = excluded.parrain_nom, ref = excluded.ref,
         langue = excluded.langue, statut_site = excluded.statut_site, cree_at = excluded.cree_at, accepte_at = excluded.accepte_at,
         signe_at = excluded.signe_at, os_cree_at = coalesce(excluded.os_cree_at, c.os_cree_at),
         os_profile_id = coalesce(excluded.os_profile_id, c.os_profile_id),
         start_monday = excluded.start_monday, expire_at = excluded.expire_at, ruul_email = excluded.ruul_email,
         desinscrit_at = excluded.desinscrit_at, sync_at = now();
  get diagnostics n = row_count;
  return n;
end;
$$;
