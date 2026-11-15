-- 0727 : les vues de chaque podz jour par jour (demande d'Adrien du 15/11),
-- pour voir quand un podz s'épuise ou tient.
--
-- `pods_series(p_jours)` : par podz et par jour de publication (heure de
-- Paris), les posts publiés (hors rappels), leurs vues moyennes à J+1, J+2,
-- J+3 et J+7 (`passage_vues_jalons`, comparables d'un jour à l'autre), leurs
-- vues moyennes actuelles et le nombre de posts à 10 000 vues ou plus. Lue par
-- la page Pods (carte « Vues par jour, par podz », sélecteur J+1 à J+7).
-- Le relevé de nuit photographie aussi J+2 désormais (à partir de cette nuit).

-- J+2 dans les jalons.
alter table public.passage_vues_jalons drop constraint if exists passage_vues_jalons_age_jours_check;
alter table public.passage_vues_jalons add constraint passage_vues_jalons_age_jours_check check (age_jours in (1, 2, 3, 7));

do $$
declare d text := pg_get_functiondef('public.passage_vues_photographier()'::regprocedure);
begin
  if position('(v_auj - 1, v_auj - 3, v_auj - 7)' in d) = 0 then
    raise exception '0727 : bloc des jalons introuvable, rien n''est changé';
  end if;
  execute replace(d, '(v_auj - 1, v_auj - 3, v_auj - 7)', '(v_auj - 1, v_auj - 2, v_auj - 3, v_auj - 7)');
end $$;

create or replace function public.pods_series(p_jours integer default 21)
returns table (pod text, jour date, posts integer, moy_j1 integer, moy_j2 integer, moy_j3 integer, moy_j7 integer, moy integer, p10k integer)
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
begin
  if auth.uid() is not null and not public.is_admin() then
    raise exception 'pods : réservé aux admins' using errcode = '42501';
  end if;
  return query
  with base as (
    select c.pod, (pa.publie_at at time zone 'Europe/Paris')::date as jour, pa.vues,
           j1.vues as vues_j1, j2.vues as vues_j2, j3.vues as vues_j3, j7.vues as vues_j7
      from passages pa
      join contenus c on c.id = pa.contenu_id and c.pod is not null
      left join passage_vues_jalons j1 on j1.passage_id = pa.id and j1.age_jours = 1
      left join passage_vues_jalons j2 on j2.passage_id = pa.id and j2.age_jours = 2
      left join passage_vues_jalons j3 on j3.passage_id = pa.id and j3.age_jours = 3
      left join passage_vues_jalons j7 on j7.passage_id = pa.id and j7.age_jours = 7
     where pa.statut = 'publie' and not coalesce(pa.est_rappel, false)
       and pa.publie_at >= ((current_date - greatest(1, least(coalesce(p_jours, 21), 60)))::timestamp at time zone 'Europe/Paris')
  )
  select b.pod, b.jour, count(*)::int, round(avg(b.vues_j1))::int, round(avg(b.vues_j2))::int,
         round(avg(b.vues_j3))::int, round(avg(b.vues_j7))::int, round(avg(b.vues))::int,
         (count(*) filter (where b.vues >= 10000))::int
    from base b
   group by b.pod, b.jour
   order by b.pod, b.jour;
end;
$function$;

comment on function public.pods_series(integer) is
  'Page Pods (0727) : par podz et par jour de publication, posts, vues moyennes à J+1, J+2, J+3, J+7 et actuelles, posts à 10 000 vues ou plus.';

revoke all on function public.pods_series(integer) from public, anon;
grant execute on function public.pods_series(integer) to authenticated, service_role;

insert into supabase_migrations.schema_migrations (version, name, statements)
values (to_char(now() at time zone 'UTC', 'YYYYMMDDHH24MISS'), 'pods_series_jour', array['voir 0727']);
