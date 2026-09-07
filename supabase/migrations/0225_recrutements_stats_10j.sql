-- Stats phase 2 Recrutements : une RPC (10 j Paris) pour éviter les GET PostgREST trop longs.

create or replace function public.stats_recrutement_10j()
returns table (
  createur_id uuid,
  prevus integer,
  postes integer,
  vues_moy_10 double precision,
  vues_10j bigint,
  cout_mensuel numeric,
  essai boolean
)
language plpgsql
stable
security invoker
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'forbidden';
  end if;

  return query
  with fenetre as (
    select
      (timezone('Europe/Paris', now()))::date as auj,
      (timezone('Europe/Paris', now()))::date - 9 as debut
  ),
  comptes_cre as (
    select
      rc.id as createur_id,
      c.id as compte_id,
      (
        c.warmup_started_at is not null
        and c.warmup_ends_at is not null
        and c.warmup_ends_at <= now()
      ) as apres_warmup
    from public.recrutement_createurs rc
    join public.comptes c
      on c.poster_id = rc.profile_id
     and lower(c.langue) = lower(rc.pays)
     and c.is_active
    left join public.applications a on a.id = c.application_id
    where rc.profile_id is not null
      and coalesce(a.slug, 'sophia') = 'sophia'
  ),
  prevus as (
    select cc.createur_id, count(*)::int as n
    from comptes_cre cc
    join public.passages p on p.compte_id = cc.compte_id
    cross join fenetre f
    where cc.apres_warmup
      and p.statut::text <> 'brouillon'
      and p.date_publication_prevue between f.debut and f.auj
    group by cc.createur_id
  ),
  postes as (
    select
      cc.createur_id,
      count(*)::int as n,
      coalesce(sum(p.vues), 0)::bigint as vues_10j
    from comptes_cre cc
    join public.passages p on p.compte_id = cc.compte_id
    cross join fenetre f
    where p.publie_at is not null
      and (p.publie_at at time zone 'Europe/Paris')::date between f.debut and f.auj
    group by cc.createur_id
  ),
  derniers as (
    select x.createur_id, avg(x.vues)::float8 as vues_moy_10
    from (
      select
        cc.createur_id,
        p.vues,
        row_number() over (partition by cc.createur_id order by p.publie_at desc) as rn
      from comptes_cre cc
      join public.passages p on p.compte_id = cc.compte_id
      where p.publie_at is not null
        and p.vues is not null
    ) x
    where x.rn <= 10
    group by x.createur_id
  ),
  essai as (
    select cc.createur_id, bool_and(not cc.apres_warmup) as essai
    from comptes_cre cc
    group by cc.createur_id
  )
  select
    rc.id,
    coalesce(pr.n, 0),
    coalesce(po.n, 0),
    d.vues_moy_10,
    coalesce(po.vues_10j, 0),
    p.cout_mensuel,
    coalesce(e.essai, false)
  from public.recrutement_createurs rc
  left join prevus pr on pr.createur_id = rc.id
  left join postes po on po.createur_id = rc.id
  left join derniers d on d.createur_id = rc.id
  left join essai e on e.createur_id = rc.id
  left join public.profiles p on p.id = rc.profile_id
  where rc.profile_id is not null;
end;
$$;

revoke all on function public.stats_recrutement_10j() from public;
grant execute on function public.stats_recrutement_10j() to authenticated;
grant execute on function public.stats_recrutement_10j() to service_role;
