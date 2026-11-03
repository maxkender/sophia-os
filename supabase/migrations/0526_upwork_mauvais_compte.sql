-- 0526 — Upwork : les messages automatiques partent du compte de Max seulement (03/11).
--
-- Garde-fou : avant chaque message automatique sur Upwork, la fonction upwork
-- vérifie que le compte connecté est Maximilien Kender (1908160914854122443).
-- Sinon rien ne part, et cette fonction ouvre (une fois par jour) un problème
-- urgent « Upwork connecté avec le mauvais compte » sur la page Problèmes.
--
-- Additif : une fonction. N'écrit que dans problemes / problemes_sources.

create or replace function public.probleme_upwork_mauvais_compte(p_utilisateur jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_qui text := coalesce(p_utilisateur->>'name', '?') || ' (' || coalesce(p_utilisateur->>'id', 'id inconnu') || ')';
begin
  if coalesce(auth.role(), '') not in ('', 'service_role') then
    raise exception 'probleme_upwork_mauvais_compte : réservé à la fonction upwork' using errcode = '42501';
  end if;
  v_id := public.probleme_ajouter(
    'upwork_compte', 'upwork_compte:' || to_char(now() at time zone 'Europe/Paris', 'YYYY-MM-DD'), null, null, 'upwork_mauvais_compte',
    'Upwork connecté avec le mauvais compte : ' || v_qui,
    'Le compte Upwork connecté (' || v_qui || ') n''est pas Maximilien Kender (1908160914854122443) : aucun message automatique ne part. '
      || 'Reconnecte Upwork depuis Réglages → Upwork, connecté avec le compte de Max.',
    now(), null, null, 'os');
  if v_id is not null then
    update public.problemes
       set niveau = 'urgent', niveau_force = true, groupe = 'actifs', proprietaire = 'control_bot',
           diagnostic = 'Upwork est connecté avec ' || v_qui || ' au lieu de Maximilien Kender (1908160914854122443) : les messages automatiques sont bloqués.',
           diagnostic_par = 'os'
     where id = v_id and statut = 'ouvert';
  end if;
  return v_id;
end;
$$;
revoke all on function public.probleme_upwork_mauvais_compte(jsonb) from public, anon, authenticated;
grant execute on function public.probleme_upwork_mauvais_compte(jsonb) to service_role;
