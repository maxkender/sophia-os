-- 0363 : un seul tag d'étape par compte (page Posters, dashboard HM, Cohort
-- tracking), et un tag de qualité à part.
--
-- L'étape se calcule dans l'interface (src/features/moteur/etapes.ts) :
--   Account not created → Not warming up → Warming up → Ready
--   → Posting · week N → Stopped / Dormant.
-- Il lui manquait, compte par compte, ce que seule la base sait :
--   - tiktok_existe : le compte TikTok existe — dernier relevé du warm-up
--     (`ckd_warmup_releves`, 0356), sinon un profil lu (`compte_profils`,
--     0325) ou un post publié ; null : on ne sait pas ;
--   - premier_jour : premier jour de posts prévu (`comptes_premier_jour`, 0333) ;
--   - dernier_publie : dernier jour avec un post publié ;
--   - arrete : compte arrêté pour de bon (« ne pas renouveler », ou arrêt fait
--     par Check, Kill or Double) — « Stopped » ; un compte inactif sinon est
--     en veille — « Dormant », le mot déjà utilisé sur la page Posters ;
--   - qualite : shadowban / poor_views d'après Check, Kill or Double →
--     Shadowban (0362), sinon good s'il a des posts relevés sur 14 jours.
--
-- Lecture seule, une fonction. Admin et Head of Ops : tous les comptes ;
-- HM / DM : ceux de ses posteurs (profiles.manager_id).
-- Retour arrière : drop function public.etapes_comptes(uuid[]).

create or replace function public.etapes_comptes(p_comptes uuid[] default null)
returns table (
  compte_id      uuid,
  tiktok_existe  boolean,
  premier_jour   date,
  dernier_publie date,
  arrete         boolean,
  qualite        text
)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_hm uuid;
begin
  if coalesce(auth.role(), '') in ('anon', 'authenticated') and not public.is_admin() then
    if not public.is_hiring_manager() then
      raise exception 'etapes_comptes : réservé à l''admin et aux HMs';
    end if;
    v_hm := auth.uid();
  end if;

  return query
  with cpt as (
    select c.id, coalesce(c.non_renouveler, false) as non_renouveler
      from public.comptes c
      join public.profiles pr on pr.id = c.poster_id
     where (v_hm is null or pr.manager_id = v_hm)
       and (p_comptes is null or c.id = any(p_comptes))
  ),
  pub as (
    select p.compte_id,
           max(p.date_publication_prevue) filter (where p.publie_url is not null) as dernier,
           bool_or(p.publie_url is not null and p.vues is not null
                   and p.date_publication_prevue >= (now() at time zone 'Europe/Paris')::date - 14) as releve14
      from public.passages p
      join cpt on cpt.id = p.compte_id
     where not coalesce(p.est_rappel, false)
       and p.statut <> 'brouillon'
     group by p.compte_id
  )
  select cpt.id,
         coalesce(
           (select r.existe from public.ckd_warmup_releves r
             where r.compte_id = cpt.id and r.existe is not null
             order by r.releve_at desc limit 1),
           case when exists (select 1 from public.compte_profils cp where cp.compte_id = cpt.id)
                  or pub.dernier is not null then true end),
         pj.premier_jour,
         pub.dernier,
         cpt.non_renouveler
           or exists (select 1 from public.ckd_arrets a where a.compte_id = cpt.id and a.fait_at is not null),
         case (select s.type from public.ckd_shadowban s where s.compte_id = cpt.id)
           when 'shadowban' then 'shadowban'
           when 'vues_basses' then 'poor_views'
           else case when coalesce(pub.releve14, false) then 'good' end
         end
    from cpt
    left join pub on pub.compte_id = cpt.id
    left join public.comptes_premier_jour pj on pj.compte_id = cpt.id;
end;
$$;

revoke execute on function public.etapes_comptes(uuid[]) from public, anon;
grant execute on function public.etapes_comptes(uuid[]) to authenticated, service_role;

notify pgrst, 'reload schema';
