-- 0483 — Le samedi ne traite que les posteurs qui ont eu une semaine de posting.
--
-- Bug du 31/10 : la cohorte du lundi qui arrive (cohorte_lundi après le lundi de
-- la semaine) apparaissait dans Weekly decisions avec « Steps missing before
-- Monday → Postpone » (56 lignes), et Validate les aurait toutes reportées. Leur
-- warm-up est vérifié le dimanche soir (check warm-up + report à 23:59) ; elles
-- restent à Onboarding posters.
--
-- Ici, côté base :
--   - samedi_forces : plus de posteur « toujours montré » de la cohorte à venir
--     (une demande d'arrêt d'une recrue se traite à Onboarding posters) ;
--   - samedi_couverture : la cohorte à venir n'est plus comptée (ni « absente »).
-- La page (liste des comptes, onglets, récap, Validate) filtre de même.
--
-- Additive : 2 fonctions remplacées (même signature). Aucune donnée modifiée.

create or replace function public.samedi_forces(p_lundi date)
returns table (poster_id uuid, raison text, detail text, depuis timestamptz)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return query
  with f as (
    select d.poster_id, 'demande_arret'::text as raison,
           concat_ws(' · ', d.source, left(d.raison, 300)) as detail, d.demande_at as depuis
      from public.demandes_arret d
     where d.decision is null
    union all
    select e.poster_id, 'reporte_2', format('%s postponements', count(*)), max(e.at)
      from public.recrue_evenements e
     where e.type = 'reporte'
     group by e.poster_id
    having count(*) >= 2
    union all
    select k.poster_id, 'kill_jeudi', k.phrase, k.marque_at
      from public.jeudi_kills k
     where k.lundi = p_lundi and k.annule_at is null
    union all
    select p.id, 'sans_canal', 'No Slack, no Upwork contract', p.created_at
      from public.profiles p
     where p.slack_user_id is null and p.upwork_contract_id is null
       and concat_ws(' ', p.prenom, p.nom) !~* 'test'
       and not public.hors_upwork(p.id)
  )
  select f.poster_id, f.raison, f.detail, f.depuis
    from f
    join public.profiles pr on pr.id = f.poster_id and pr.is_active
   where exists (select 1 from public.user_roles ur where ur.user_id = f.poster_id and ur.role = 'poster')
     and not exists (select 1 from public.hub_posteurs h where h.profile_id = f.poster_id)
     -- 0483 : la cohorte à venir n'est pas traitée le samedi.
     and (pr.cohorte_lundi is null or pr.cohorte_lundi <= p_lundi);
end;
$$;

create or replace function public.samedi_couverture(p_lundi date)
returns table (poster_id uuid, nom text, comptes integer, raison text)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return query
  select pr.id, nullif(btrim(concat_ws(' ', pr.prenom, pr.nom)), ''),
         (select count(*) from public.comptes c where c.poster_id = pr.id and c.is_active)::int,
         case when exists (select 1 from public.hub_posteurs h where h.profile_id = pr.id) then 'ruul'
              when not exists (select 1 from public.comptes c where c.poster_id = pr.id and c.is_active) then 'sans_compte'
              when not exists (select 1 from public.comptes c where c.poster_id = pr.id and c.is_active and c.type_compte = 'perso') then 'pas_perso'
         end
    from public.profiles pr
   where pr.is_active
     and exists (select 1 from public.user_roles ur where ur.user_id = pr.id and ur.role = 'poster')
     -- 0483 : la cohorte à venir n'est pas traitée le samedi.
     and (pr.cohorte_lundi is null or pr.cohorte_lundi <= p_lundi);
end;
$$;

notify pgrst, 'reload schema';
