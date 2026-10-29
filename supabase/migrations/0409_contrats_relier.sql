-- 0409 — Les contrats Upwork toujours reliés à leur posteur, automatiquement.
--
-- `contrats_relier()` : chaque posteur actif sans contrat (`upwork_contract_id`
-- vide, créé à la main ou ancien) est relié au contrat Upwork actif
-- (`upwork_contrats`, relus à chaque passage de l'accueil) qui porte son nom :
--   1. même nom complet (accents, majuscules et espaces ignorés) ;
--   2. tous les mots de son nom dans celui du contrat (« Maria Holguin » →
--      « Maria Alejandra Holguin » ; une initiale vaut un mot qui commence
--      par elle) ;
--   3. même prénom et nom à 2 lettres près (« Dobreba » → « Dobreva »).
-- Plusieurs contrats possibles : le plus proche de la création du posteur,
-- à 21 jours au plus (un nom avec une initiale : un seul contrat possible) ;
-- sinon rien. Un contrat déjà relié n'est jamais repris ;
-- deux posteurs pour un contrat : le plus proche gagne. Un contrat relié
-- n'est jamais changé.
-- Appelée par l'accueil automatique (fonction upwork, toutes les heures),
-- même en test : relier ne fait rien partir.
--
-- Additive : deux extensions (unaccent, fuzzystrmatch), une fonction. Ne
-- remplit que des `upwork_contract_id` vides.
-- Retour arrière : drop function contrats_relier.

create extension if not exists unaccent with schema extensions;
create extension if not exists fuzzystrmatch with schema extensions;

create or replace function public.contrats_relier(p_simuler boolean default false)
returns table (poster_id uuid, poster_nom text, contrat_id text, freelancer_nom text, regle integer)
language plpgsql
security definer
set search_path = public, extensions
as $$
#variable_conflict use_column
begin
  if coalesce(auth.role(), '') <> 'service_role' and not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return query
  with p as (
    select pr.id, pr.created_at, nullif(btrim(concat_ws(' ', pr.prenom, pr.nom)), '') as nom_brut,
           regexp_split_to_array(lower(unaccent(btrim(concat_ws(' ', pr.prenom, pr.nom)))), '[^a-z0-9]+') as toks
      from public.profiles pr
     where pr.is_active and pr.upwork_contract_id is null
       and exists (select 1 from public.user_roles r where r.user_id = pr.id and r.role = 'poster')
       and not exists (select 1 from public.hub_posteurs h where h.profile_id = pr.id)
  ),
  p2 as (
    select p.id, p.created_at, p.nom_brut, array_remove(p.toks, '') as toks,
           exists (select 1 from unnest(p.toks) t where length(t) = 1) as initiale
      from p
  ),
  c as (
    select u.contrat_id, u.debut_at, u.freelancer_nom,
           array_remove(regexp_split_to_array(lower(unaccent(btrim(u.freelancer_nom))), '[^a-z0-9]+'), '') as toks
      from public.upwork_contrats u
     where u.actif and u.contrat_id is not null and u.freelancer_nom is not null
       and not exists (select 1 from public.profiles x where x.upwork_contract_id = u.contrat_id)
  ),
  paires as (
    select p2.id, p2.nom_brut, p2.created_at, p2.initiale, c.contrat_id, c.freelancer_nom,
           case
             when p2.toks = c.toks then 1
             when cardinality(p2.toks) >= 2 and not exists (
                    select 1 from unnest(p2.toks) t
                     where not (t = any (c.toks)
                                or (length(t) = 1 and exists (select 1 from unnest(c.toks[2:]) v where left(v, 1) = t)))) then 2
             when cardinality(p2.toks) >= 2 and cardinality(c.toks) >= 2 and p2.toks[1] = c.toks[1]
                  and length(p2.toks[cardinality(p2.toks)]) >= 5
                  and exists (select 1 from unnest(c.toks[2:]) v
                               where levenshtein(v, p2.toks[cardinality(p2.toks)]) <= 2) then 3
           end as rang,
           abs(extract(epoch from (coalesce(c.debut_at, p2.created_at) - p2.created_at))) / 86400.0 as ecart_j
      from p2 cross join c
  ),
  candidats as (
    select pa.*,
           row_number() over (partition by pa.id order by pa.rang, pa.ecart_j) as n_p,
           count(*) over (partition by pa.id, pa.rang) as nb_rang,
           min(pa.rang) over (partition by pa.id) as meilleur
      from paires pa
     where pa.rang is not null
  ),
  choix_p as (
    -- Le meilleur contrat du posteur : seul à ce rang, ou le plus proche à 21
    -- jours au plus (jamais pour un nom avec une initiale : « Maria M »).
    select * from candidats
     where n_p = 1 and rang = meilleur and (nb_rang = 1 or (ecart_j <= 21 and not initiale))
  ),
  choix as (
    select distinct on (ch.contrat_id) ch.*
      from choix_p ch
     order by ch.contrat_id, ch.rang, ch.ecart_j
  ),
  faits as (
    update public.profiles pr
       set upwork_contract_id = ch.contrat_id
      from choix ch
     where not p_simuler and pr.id = ch.id and pr.upwork_contract_id is null
    returning pr.id
  )
  select ch.id, ch.nom_brut, ch.contrat_id, ch.freelancer_nom, ch.rang
    from choix ch
   where p_simuler or ch.id in (select id from faits)
   order by ch.rang, ch.nom_brut;
end;
$$;

revoke execute on function public.contrats_relier(boolean) from public, anon;
grant execute on function public.contrats_relier(boolean) to authenticated, service_role;

notify pgrst, 'reload schema';
