-- 0300 : le calendrier des posters de la cohorte Ruul.
--
-- Leur page calendrier dit noir sur blanc leurs dates : lundi de démarrage,
-- fin du warm-up (jusqu'à ce lundi 00:00, heure de Paris), premier paiement
-- (le dimanche qui clôt leur première semaine de posts). `hub_ma_cohorte()`
-- rend donc aussi `debut_le` (changement du type de retour : la fonction est
-- recréée, comme en 0298).
--
-- Retour arrière : recréer `hub_ma_cohorte()` telle que dans 0298.

drop function if exists public.hub_ma_cohorte();

create function public.hub_ma_cohorte()
returns table (cohorte_ruul boolean, email_ruul text, prenom_legal text, nom_legal text, debut_le date)
language sql
stable
security definer
set search_path = public
as $$
  select true, h.email_perso, h.prenom_legal, h.nom_legal, h.debut_le
  from public.hub_posteurs h
  where h.profile_id = auth.uid()
    and h.statut = 'cree'
  limit 1;
$$;

revoke all on function public.hub_ma_cohorte() from public, anon;
grant execute on function public.hub_ma_cohorte() to authenticated;
