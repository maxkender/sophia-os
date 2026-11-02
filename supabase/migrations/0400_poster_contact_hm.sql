-- 0400 — Prompt 15, point 7 : la HM complète le contact de ses posteurs.
--
-- Le lien du contrat Upwork et l'email perso sont obligatoires à la création
-- d'un poster, et modifiables ensuite par sa HM (pas seulement par l'admin).
-- Une HM ne peut pas écrire dans `profiles` (RLS) : cette fonction ne touche
-- que ces trois champs, pour l'admin, le Head of Ops ou la HM du posteur
-- (paie_droit_posteur, 0361). Le lien du contrat donne aussi son id (0394).
--
-- Additive : seule la fonction est nouvelle ; elle n'écrit que sur l'action
-- de la personne qui enregistre.
-- Retour arrière : drop de la fonction.

create or replace function public.poster_maj_contact(
  p_poster uuid,
  p_upwork_url text,
  p_contrat_url text,
  p_email_perso text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_url    text := nullif(btrim(coalesce(p_upwork_url, '')), '');
  v_contrat text := nullif(btrim(coalesce(p_contrat_url, '')), '');
  v_email  text := lower(nullif(btrim(coalesce(p_email_perso, '')), ''));
  v_id     text;
begin
  if not public.paie_droit_posteur(p_poster) then
    raise exception 'poster_maj_contact : réservé à l''admin, au Head of Ops et à la HM du posteur';
  end if;
  if v_contrat is not null and v_contrat !~* '^https?://([a-z0-9-]+\.)*upwork\.com/' then
    raise exception 'poster_maj_contact : le lien du contrat doit être un lien upwork.com';
  end if;
  if v_email is not null and v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'poster_maj_contact : email perso invalide';
  end if;
  v_id := substring(coalesce(v_contrat, '') from '/(?:workroom|contracts?)/([0-9]{6,})');
  update public.profiles
     set upwork_url = v_url,
         upwork_contrat_url = v_contrat,
         email_perso = v_email,
         upwork_contract_id = coalesce(v_id, upwork_contract_id)
   where id = p_poster;
end;
$$;

revoke execute on function public.poster_maj_contact(uuid, text, text, text) from public, anon;
grant execute on function public.poster_maj_contact(uuid, text, text, text) to authenticated;

notify pgrst, 'reload schema';
