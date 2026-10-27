-- 0371 : « Semaine prochaine » en étapes, sur le dashboard HM (point D, 27/10).
--
-- La cohorte de `ckd_cohorte_comptes` ne garde que le premier compte de chaque
-- posteur. La semaine prochaine montre aussi les comptes recréés
-- (`ckd_recreations`, jeudi, samedi ou page Shadowban) et les 2ᵉ comptes
-- d'un Double (`ckd_propositions.decision = 'doubler'`), avec leur étiquette.
--
--   hm_comptes_semaine(p_lundi) : les comptes qui font leurs premiers posts le
--     lundi p_lundi : (compte, posteur, type premier / recree / double, ancien
--     compte d'un recréé). Le lundi d'un compte se calcule comme dans
--     `ckd_cohorte_comptes` (0356) ; un 2ᵉ compte au warm-up pas lancé prend
--     le lundi de `premiers_posts_le` (0369). RUUL exclu.
--   hm_semaine_prochaine(p_lundi, p_hm) : ce que la page affiche, compte par
--     compte : création dans l'OS, Start warmup, reposts, relevés TikTok de la
--     semaine. Une HM ne voit que ses posteurs ; admin et Head of Ops : tout,
--     ou la HM demandée.
--   ckd_warmup_a_relever() : relit aussi les recréés et les 2ᵉ comptes (8 h
--     et 20 h), pour leurs follows et likes. Même signature, même sortie.
--
-- Additive : deux fonctions en lecture seule et une fonction de lecture
-- réécrite. Aucune table, aucune donnée touchée. Retour arrière :
--   réappliquer `ckd_warmup_a_relever` de 0356 ;
--   drop function public.hm_semaine_prochaine(date, uuid);
--   drop function public.hm_comptes_semaine(date);

create or replace function public.hm_comptes_semaine(p_lundi date)
returns table (compte_id uuid, poster_id uuid, type text, ancien_compte_id uuid)
language sql
stable
security definer
set search_path = public
as $$
  with auj as (select (now() at time zone 'Europe/Paris')::date as j),
  base as (
    select c.id, c.poster_id,
           rc.ancien_compte_id,
           case when rc.ancien_compte_id is not null then 'recree'
                when exists (select 1 from public.ckd_propositions p
                              where p.nouveau_compte_id = c.id and p.decision = 'doubler') then 'double'
           end as type,
           case
             when pj.premier_jour is not null
               then pj.premier_jour - (extract(isodow from pj.premier_jour)::int - 1)
             when c.warmup_ends_at is null and c.premiers_posts_le is not null
               then c.premiers_posts_le - (extract(isodow from c.premiers_posts_le)::int - 1)
             when c.warmup_ends_at is not null
               then f.jour - (extract(isodow from f.jour)::int - 1)
             when c.is_active and c.created_at >= now() - interval '21 days'
               then a.j + (8 - extract(isodow from a.j)::int)
           end as lundi
      from public.comptes c
      left join public.comptes_premier_jour pj on pj.compte_id = c.id
      left join lateral (
        select r.ancien_compte_id from public.ckd_recreations r
         where r.nouveau_compte_id = c.id order by r.created_at desc limit 1
      ) rc on true
      cross join auj a
      cross join lateral (select (c.warmup_ends_at at time zone 'Europe/Paris')::date as jour) f
     where c.type_compte = 'perso'
       and not coalesce(c.ugc_ai_video, false)
       and not coalesce(c.videos_uniquement, false)
       and not exists (select 1 from public.hub_posteurs h where h.profile_id = c.poster_id)
  )
  -- Les premiers comptes de la cohorte (un recréé ou un 2ᵉ compte peut en
  -- être un : il garde alors son étiquette).
  select m.compte_id, m.poster_id, coalesce(b.type, 'premier'), b.ancien_compte_id
    from public.ckd_cohorte_comptes(p_lundi) m
    left join base b on b.id = m.compte_id
  union all
  select b.id, b.poster_id, b.type, b.ancien_compte_id
    from base b
   where b.type is not null
     and b.lundi = p_lundi
     and not exists (select 1 from public.ckd_cohorte_comptes(p_lundi) m where m.compte_id = b.id);
$$;

revoke execute on function public.hm_comptes_semaine(date) from public, anon, authenticated;
grant execute on function public.hm_comptes_semaine(date) to service_role;

create or replace function public.hm_semaine_prochaine(p_lundi date, p_hm uuid default null)
returns table (
  compte_id       uuid,
  poster_id       uuid,
  hm_id           uuid,
  handle          text,
  pays            text,
  type            text,
  ancien_handle   text,
  is_active       boolean,
  cree_le         timestamptz,
  warmup_lance_le timestamptz,
  warmup_fin      timestamptz,
  reposts_le      timestamptz,
  -- Les relevés de la page TikTok, de la semaine de warm-up au lundi matin.
  releves         jsonb
)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_hm uuid := p_hm;
begin
  if coalesce(auth.role(), '') in ('anon', 'authenticated') and not public.is_admin() then
    if not public.is_hiring_manager() then
      raise exception 'hm_semaine_prochaine : réservé à l''admin et aux HMs';
    end if;
    v_hm := auth.uid();
  end if;
  if extract(isodow from p_lundi) <> 1 then
    raise exception 'hm_semaine_prochaine : % n''est pas un lundi', p_lundi;
  end if;

  return query
  select m.compte_id, c.poster_id, pr.manager_id, c.handle_tiktok, c.pays, m.type,
         a.handle_tiktok, c.is_active, c.created_at, c.warmup_started_at, c.warmup_ends_at,
         c.warmup_reposts_at,
         coalesce((
           select jsonb_agg(jsonb_build_object(
                    'at', r.releve_at,
                    'existe', r.existe,
                    'cree_tiktok_at', r.cree_tiktok_at,
                    'abonnements', r.abonnements,
                    'likes', r.likes,
                    'abonnes', r.abonnes,
                    'videos', r.videos)
                  order by r.releve_at)
             from public.ckd_warmup_releves r
            where r.compte_id = m.compte_id
              and r.releve_at >= ((p_lundi - 7)::timestamp at time zone 'Europe/Paris')
              and r.releve_at < ((p_lundi + 1)::timestamp at time zone 'Europe/Paris')), '[]'::jsonb)
    from public.hm_comptes_semaine(p_lundi) m
    join public.comptes c on c.id = m.compte_id
    join public.profiles pr on pr.id = c.poster_id
    left join public.comptes a on a.id = m.ancien_compte_id
   where v_hm is null or pr.manager_id = v_hm;
end;
$$;

revoke execute on function public.hm_semaine_prochaine(date, uuid) from public, anon;
grant execute on function public.hm_semaine_prochaine(date, uuid) to authenticated, service_role;

-- Le relevé de 8 h et 20 h lit aussi les recréés et les 2ᵉ comptes.
create or replace function public.ckd_warmup_a_relever()
returns table (compte_id uuid, handle text)
language sql
stable
security definer
set search_path = public
as $$
  select m.compte_id, c.handle_tiktok
    from public.hm_comptes_semaine(
           (now() at time zone 'Europe/Paris')::date
           + (8 - extract(isodow from (now() at time zone 'Europe/Paris')::date)::int)) m
    join public.comptes c on c.id = m.compte_id
   where c.is_active
     and nullif(btrim(c.handle_tiktok), '') is not null;
$$;
revoke all on function public.ckd_warmup_a_relever() from public, anon, authenticated;
grant execute on function public.ckd_warmup_a_relever() to service_role;

notify pgrst, 'reload schema';
