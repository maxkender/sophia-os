-- 0466 — Contracts with no poster : les contrats qui ne sont pas du posting TikTok.
--
-- 17 contrats VIk Studios sans profil OS sont des rédacteurs (« Expert writers… »,
-- « Specialists to write short … courses ») : 0464 les proposait « ancien
-- posteur à fermer ». Nouvelle proposition « autre » (pas un poste de posting,
-- rien à fermer depuis l'OS). Un contrat TikTok de plus de 3 semaines toujours
-- sans profil : « ancien », avec « payer ou rembourser d'abord » s'il est financé.
--
-- Fonction remplacée à l'identique, sauf la proposition. Aucune donnée modifiée.

create or replace function public.contrats_sans_posteur()
returns table (contrat_id text, organisation_id text, nom text, titre text, type text, debut_at timestamptz,
               dernier_message jsonb, salon_lu_at timestamptz, finances jsonb, jalons_lus_at timestamptz,
               proposition text, raison text)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
begin
  if coalesce(auth.role(), '') <> 'service_role' and not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return query
  with c as (
    select uc.contrat_id, uc.organisation_id, uc.freelancer_nom, uc.titre, uc.type, uc.debut_at
      from public.upwork_contrats uc
     where uc.actif and uc.contrat_id is not null and uc.organisation_nom = 'VIk Studios'
       and not exists (select 1 from public.profiles p where p.upwork_contract_id = uc.contrat_id)
  ),
  x as (
    select c.*,
           s.messages -> 0 as dernier, s.lu_at as salon_lu_at,
           coalesce((select jsonb_agg(jsonb_build_object('nom', m ->> 'nom', 'depot', m -> 'depot', 'etat', m ->> 'etat'))
                       from jsonb_array_elements(case when jsonb_typeof(j.jalons) = 'array' then j.jalons else '[]'::jsonb end) m
                      where m ->> 'etat' in ('Active', 'Submitted', 'Rejected')), '[]'::jsonb) as finances,
           j.lu_at as jalons_lus_at,
           exists (select 1 from public.profiles p join public.user_roles r on r.user_id = p.id
                    where r.role in ('hiring_manager', 'directing_manager', 'head_of_ops', 'admin')
                      and public.noms_proches(p.prenom, p.nom, c.freelancer_nom)) as est_hm,
           (select concat_ws(' ', p.prenom, p.nom) from public.profiles p
             where not p.is_active and public.noms_proches(p.prenom, p.nom, c.freelancer_nom)
               and exists (select 1 from public.user_roles r where r.user_id = p.id and r.role = 'poster')
             limit 1) as ancien,
           (select a.statut from public.accueils a where a.contrat_id = c.contrat_id) as accueil
      from c
      left join public.upwork_salons s on s.contrat_id = c.contrat_id
      left join public.upwork_jalons j on j.contrat_id = c.contrat_id
  )
  select x.contrat_id, x.organisation_id, x.freelancer_nom, x.titre, x.type, x.debut_at,
         x.dernier, x.salon_lu_at, x.finances, x.jalons_lus_at,
         case when x.type = 'Hourly' or x.est_hm or x.titre ~* '(hiring|manager|recruit)' then 'hm'
              when coalesce(x.titre, '') !~* '(tiktok|slideshow|poster|posting)' then 'autre'
              when x.ancien is not null then 'ancien'
              when x.debut_at < now() - interval '21 days' then 'ancien'
              else 'relier' end,
         case when x.type = 'Hourly' then 'hourly contract'
              when x.est_hm then 'same name as an HM / admin profile'
              when x.titre ~* '(hiring|manager|recruit)' then 'job title: ' || x.titre
              when coalesce(x.titre, '') !~* '(tiktok|slideshow|poster|posting)' then 'not a TikTok posting job: ' || coalesce(x.titre, '?')
              when x.ancien is not null then 'same name as a stopped poster: ' || x.ancien
              when x.debut_at < now() - interval '21 days'
                then 'started more than 3 weeks ago, still no OS profile'
                     || case when jsonb_array_length(x.finances) > 0 then ' (funded: pay or refund first)' else '' end
              when x.accueil is not null then 'welcome: ' || x.accueil
              else 'recent contract, no profile yet' end
    from x
   order by x.debut_at desc;
end;
$$;
revoke all on function public.contrats_sans_posteur() from public, anon;
grant execute on function public.contrats_sans_posteur() to authenticated, service_role;

notify pgrst, 'reload schema';
