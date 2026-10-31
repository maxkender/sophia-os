-- 0482 — Le pays de chaque nouvelle recrue, vérifié ; « Country to check » sur Onboarding posters.
--
-- Les annonces passent à une par zone et par semaine : le titre de l'annonce
-- donne au mieux la zone, plus le pays. Pour chaque recrue récente (active,
-- créée depuis 21 jours ou cohorte à venir), on compare :
--   - le pays choisi par la HM (pays de son compte) ;
--   - où vit le freelance (lu à l'API Upwork, upwork_contrats.freelancer_pays) ;
--   - l'annonce : sa zone (« Zone A/B/C » dans le titre) ou son pays (annonces_pays).
-- Tout concorde → OK. Lieu pas encore lu → « en lecture » (l'OS le lit, 10
-- contrats par passage). Sinon (lieu illisible, autre pays, autre zone, pas de
-- pays choisi) → « Country to check » avec la raison, jusqu'au clic « Country is right ».
--
-- Additive : 2 tables, 2 fonctions. Aucune donnée existante modifiée.

create table if not exists public.pays_confirmations (
  poster_id uuid primary key references public.profiles(id),
  pays text,
  confirme_par uuid,
  confirme_at timestamptz not null default now()
);
alter table public.pays_confirmations enable row level security;

-- Les lectures du lieu du freelance déjà tentées (une toutes les 12 h au plus par contrat).
create table if not exists public.localisations_essais (
  contrat_id text primary key,
  essaye_at timestamptz not null default now(),
  resultat text
);
alter table public.localisations_essais enable row level security;

create or replace function public.onboarding_pays()
returns table (poster_id uuid, contrat_id text, pays_hm text, zone_hm text, pays_vit text, ville text, lu boolean,
               annonce_titre text, annonce_zone text, annonce_pays text, verdict text, raisons text[],
               confirme_pays text, confirme_par_nom text, confirme_at timestamptz)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
begin
  if not (public.is_admin() or coalesce(auth.role(), '') = 'service_role'
          or exists (select 1 from public.user_roles ur where ur.user_id = auth.uid() and ur.role = 'head_of_ops')) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return query
  with r as (
    select pr.id, pr.upwork_contract_id as contrat,
           (select c.pays from comptes c where c.poster_id = pr.id and c.is_active and c.pays is not null
             order by (coalesce(c.type_compte, 'perso') = 'perso') desc, c.created_at limit 1) as pays_hm
      from profiles pr
     where pr.is_active
       -- Les cohortes à venir (et les recrues sans cohorte créées depuis 14 jours).
       and (pr.cohorte_lundi > date_trunc('week', now() at time zone 'Europe/Paris')::date
            or (pr.cohorte_lundi is null and pr.created_at > now() - interval '14 days'))
       and exists (select 1 from user_roles ur where ur.user_id = pr.id and ur.role = 'poster')
       and not exists (select 1 from hub_posteurs h where h.profile_id = pr.id)
  ),
  d as (
    select r.*, zpp.zone as zone_hm,
           coalesce(u.freelancer_pays, a.freelance_pays) as freelancer_pays,
           coalesce(u.freelancer_ville, a.freelance_ville) as freelancer_ville,
           coalesce(u.titre, a.job_titre) as titre,
           exists (select 1 from localisations_essais e where e.contrat_id = r.contrat)
             or a.freelance_lu_at is not null or coalesce(u.freelancer_pays, a.freelance_pays) is not null as lu,
           upper(substring(coalesce(u.titre, a.job_titre) from '(?i)zone\s*([abc])\M')) as annonce_zone,
           (select ap.pays from annonces_pays ap where ap.job_id = a.job_id and not ap.generique and ap.pays is not null limit 1) as annonce_pays,
           pc.pays as confirme_pays, pc.confirme_at,
           (select nullif(btrim(concat_ws(' ', f.prenom, f.nom)), '') from profiles f where f.id = pc.confirme_par) as confirme_par_nom
      from r
      left join zones_paie_pays zpp on zpp.pays = r.pays_hm
      left join lateral (select x.freelancer_pays, x.freelancer_ville, x.titre from upwork_contrats x
                          where x.contrat_id = r.contrat order by x.actif desc, x.lu_at desc nulls last limit 1) u on true
      left join accueils a on a.contrat_id = r.contrat
      left join pays_confirmations pc on pc.poster_id = r.id
  ),
  v as (
    select d.*,
           array_remove(array[
             case when d.pays_hm is null then 'No country chosen for the account' end,
             case when d.contrat is null then 'No Upwork contract linked' end,
             case when d.contrat is not null and d.freelancer_pays is null and d.lu then 'Can''t read where the freelancer lives' end,
             case when d.freelancer_pays is not null and d.pays_hm is not null and d.freelancer_pays <> d.pays_hm
                  then format('Lives in %s, account set to %s', d.freelancer_pays, d.pays_hm) end,
             case when d.annonce_zone is not null and d.zone_hm is not null and d.annonce_zone <> d.zone_hm
                  then format('Job post is zone %s, %s is zone %s', d.annonce_zone, d.pays_hm, d.zone_hm) end,
             case when d.annonce_pays is not null and d.pays_hm is not null and d.annonce_pays <> d.pays_hm
                  then format('Job post is for %s, account set to %s', d.annonce_pays, d.pays_hm) end
           ], null) as raisons
      from d
  )
  select v.id, v.contrat, v.pays_hm, v.zone_hm, v.freelancer_pays, v.freelancer_ville, v.lu,
         v.titre, v.annonce_zone, v.annonce_pays,
         case when cardinality(v.raisons) = 0 and v.contrat is not null and v.freelancer_pays is null then 'en_lecture'
              when cardinality(v.raisons) = 0 then 'ok'
              when v.confirme_at is not null and v.confirme_pays is not distinct from v.pays_hm then 'confirme'
              else 'a_verifier' end,
         v.raisons, v.confirme_pays, v.confirme_par_nom, v.confirme_at
    from v;
end;
$$;
revoke all on function public.onboarding_pays() from public, anon;
grant execute on function public.onboarding_pays() to authenticated, service_role;

-- « Country is right » : le pays du compte est confirmé (il reste confirmé tant qu'il ne change pas).
create or replace function public.pays_confirmer(p_poster uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not (public.is_admin() or exists (select 1 from public.user_roles ur where ur.user_id = auth.uid() and ur.role = 'head_of_ops')) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  insert into pays_confirmations (poster_id, pays, confirme_par, confirme_at)
  values (p_poster,
          (select c.pays from comptes c where c.poster_id = p_poster and c.is_active and c.pays is not null
            order by (coalesce(c.type_compte, 'perso') = 'perso') desc, c.created_at limit 1),
          auth.uid(), now())
  on conflict (poster_id) do update set pays = excluded.pays, confirme_par = excluded.confirme_par, confirme_at = now();
end;
$$;
revoke all on function public.pays_confirmer(uuid) from public, anon;
grant execute on function public.pays_confirmer(uuid) to authenticated;

notify pgrst, 'reload schema';
