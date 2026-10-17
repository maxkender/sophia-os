-- 0298 : le nom légal des posters de la cohorte Ruul.
--
-- Pour ajouter un poster dans Ruul (Contractors → New Contractor), il faut son
-- prénom et son nom tels qu'ils figurent sur sa pièce d'identité : Ruul les
-- compare à la vérification d'identité. Le « nom complet » du formulaire du
-- site ne suffit pas (surnom, ordre des noms, prénom seul). L'accueil de l'OS
-- les demande donc sur l'écran Payments de la cohorte Ruul, et « Next » reste
-- verrouillé tant qu'ils ne sont pas enregistrés.
--
-- - `hub_enregistrer_identite(prenom, nom)` : le créateur connecté enregistre
--   les siens, et seulement les siens ;
-- - `hub_ma_cohorte()` rend aussi ces deux champs, pour pré-remplir l'écran
--   (changement du type de retour : la fonction est recréée) ;
-- - le site les lit par la fonction hub-posteurs (action `identites`).
--
-- Retour arrière : recréer `hub_ma_cohorte()` telle que dans 0297, puis
-- `drop function public.hub_enregistrer_identite(text, text);` et
-- `alter table public.hub_posteurs drop column prenom_legal,
--  drop column nom_legal, drop column identite_le;`

alter table public.hub_posteurs
  add column if not exists prenom_legal text,
  add column if not exists nom_legal text,
  add column if not exists identite_le timestamptz;

create or replace function public.hub_enregistrer_identite(p_prenom text, p_nom text)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_prenom text := btrim(regexp_replace(coalesce(p_prenom, ''), '\s+', ' ', 'g'));
  v_nom text := btrim(regexp_replace(coalesce(p_nom, ''), '\s+', ' ', 'g'));
begin
  if v_prenom = '' or v_nom = '' then
    raise exception 'prénom et nom requis';
  end if;
  if length(v_prenom) > 80 or length(v_nom) > 80 then
    raise exception 'prénom ou nom trop long (80 caractères au plus)';
  end if;

  update public.hub_posteurs
  set prenom_legal = v_prenom, nom_legal = v_nom, identite_le = now()
  where profile_id = auth.uid()
    and statut = 'cree';

  if not found then
    raise exception 'réservé aux posters de la cohorte Ruul';
  end if;
end;
$$;

revoke all on function public.hub_enregistrer_identite(text, text) from public, anon;
grant execute on function public.hub_enregistrer_identite(text, text) to authenticated;

drop function if exists public.hub_ma_cohorte();

create function public.hub_ma_cohorte()
returns table (cohorte_ruul boolean, email_ruul text, prenom_legal text, nom_legal text)
language sql
stable
security definer
set search_path = public
as $$
  select true, h.email_perso, h.prenom_legal, h.nom_legal
  from public.hub_posteurs h
  where h.profile_id = auth.uid()
    and h.statut = 'cree'
  limit 1;
$$;

revoke all on function public.hub_ma_cohorte() from public, anon;
grant execute on function public.hub_ma_cohorte() to authenticated;
