-- 0410 — Contrats reliés : le 2e compte d'un posteur, et les fautes de frappe.
--
-- `contrats_relier()` (0409), deux règles de plus et un garde-fou :
--   3b. le nom entier à 2 lettres près (« Dialetchi Anthi » → « Dialechti
--       Anthi ») ;
--   4. le 2e compte : un posteur qui a 2 comptes a 2 fiches (alinat@ et
--      alinat1@) mais un seul contrat Upwork. Une fiche sans contrat, même
--      nom (ou tous les mots de l'un dans l'autre) et même pays qu'une fiche
--      active reliée, prend son contrat (un seul possible, sinon rien) ;
--   - garde-fou : un contrat qui commence plus de 7 jours après le 1er post
--     du posteur n'est pas le sien (« maria m » poste depuis septembre).
-- Côté Upwork (fonction upwork) : arrêter une fiche dont le contrat sert
-- encore à une autre fiche active ne touche pas au contrat (ni message de
-- fin, ni milestone supprimée, ni fermeture).
--
-- Additive : la fonction est remplacée (même signature). Ne remplit que des
-- `upwork_contract_id` vides.
-- Retour arrière : recréer contrats_relier depuis 0409.

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
           regexp_split_to_array(lower(unaccent(btrim(concat_ws(' ', pr.prenom, pr.nom)))), '[^a-z0-9]+') as toks,
           (select min(x.publie_at) from public.passages x join public.comptes k on k.id = x.compte_id
             where k.poster_id = pr.id and x.publie_url is not null) as premier_post
      from public.profiles pr
     where pr.is_active and pr.upwork_contract_id is null
       and exists (select 1 from public.user_roles r where r.user_id = pr.id and r.role = 'poster')
       and not exists (select 1 from public.hub_posteurs h where h.profile_id = pr.id)
  ),
  p2 as (
    select p.id, p.created_at, p.nom_brut, p.premier_post, array_remove(p.toks, '') as toks,
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
             -- Le nom entier à 2 lettres près (« Dialetchi Anthi » → « Dialechti Anthi »).
             when length(array_to_string(p2.toks, '')) >= 8
                  and levenshtein(array_to_string(p2.toks, ''), array_to_string(c.toks, '')) <= 2 then 3
           end as rang,
           abs(extract(epoch from (coalesce(c.debut_at, p2.created_at) - p2.created_at))) / 86400.0 as ecart_j
      from p2 cross join c
     -- Un contrat qui commence plus de 7 jours après son 1er post n'est pas le sien.
     where p2.premier_post is null or c.debut_at is null or c.debut_at <= p2.premier_post + interval '7 days'
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

  -- 2e compte : une 2e fiche du même posteur (même nom, ou tous les mots de
  -- l'un dans l'autre, et même pays) prend le contrat de la 1re.
  return query
  with sans as (
    select pr.id, pr.created_at, nullif(btrim(concat_ws(' ', pr.prenom, pr.nom)), '') as nom_brut,
           array_remove(regexp_split_to_array(lower(unaccent(btrim(concat_ws(' ', pr.prenom, pr.nom)))), '[^a-z0-9]+'), '') as toks,
           (select c.pays from public.comptes c where c.poster_id = pr.id and c.type_compte = 'perso' order by c.created_at limit 1) as pays
      from public.profiles pr
     where pr.is_active and pr.upwork_contract_id is null
       and exists (select 1 from public.user_roles r where r.user_id = pr.id and r.role = 'poster')
       and not exists (select 1 from public.hub_posteurs h where h.profile_id = pr.id)
  ),
  avec as (
    select pr.id, pr.created_at, pr.upwork_contract_id,
           array_remove(regexp_split_to_array(lower(unaccent(btrim(concat_ws(' ', pr.prenom, pr.nom)))), '[^a-z0-9]+'), '') as toks,
           (select c.pays from public.comptes c where c.poster_id = pr.id and c.type_compte = 'perso' order by c.created_at limit 1) as pays
      from public.profiles pr
     where pr.is_active and pr.upwork_contract_id is not null
  ),
  freres as (
    select distinct on (s.id) s.id, s.nom_brut, a.upwork_contract_id
      from sans s
      join avec a on a.pays = s.pays and cardinality(s.toks) >= 2 and cardinality(a.toks) >= 2
                 and (s.toks <@ a.toks or a.toks <@ s.toks)
                 and not exists (select 1 from unnest(s.toks || a.toks) t where length(t) = 1)
     -- Un seul contrat possible, sinon rien.
     where (select count(distinct a2.upwork_contract_id) from avec a2
             where a2.pays = s.pays and cardinality(a2.toks) >= 2 and (s.toks <@ a2.toks or a2.toks <@ s.toks)) = 1
     order by s.id, a.created_at
  ),
  partages as (
    update public.profiles pr
       set upwork_contract_id = f.upwork_contract_id
      from freres f
     where not p_simuler and pr.id = f.id and pr.upwork_contract_id is null
    returning pr.id
  )
  select f.id, f.nom_brut, f.upwork_contract_id, '(2e compte)'::text, 4
    from freres f
   where p_simuler or f.id in (select id from partages);
end;
$$;

revoke execute on function public.contrats_relier(boolean) from public, anon;
grant execute on function public.contrats_relier(boolean) to authenticated, service_role;

notify pgrst, 'reload schema';
