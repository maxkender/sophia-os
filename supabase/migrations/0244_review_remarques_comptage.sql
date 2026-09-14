-- Comptage des remarques génériques par CRÉATEUR (poster), pas par compte
-- TikTok : chaque review garde la liste des remarques utilisées à l'envoi.
-- Copie figée [{id, titre}], comme `reviews.videos` : l'historique reste
-- lisible même si la remarque est renommée ou supprimée ensuite, et le
-- regroupement se fait sur l'id.

alter table public.reviews
  add column if not exists remarques jsonb not null default '[]'::jsonb;

comment on column public.reviews.remarques is
  'Liste [{id, titre}] des remarques génériques utilisées pour cette review — comptage « 3× Texte illisible » par créateur dans la file du jour.';

-- La file du jour lit les remarques de tous les créateurs de la file, du plus
-- récent au plus ancien.
create index if not exists reviews_poster_created_idx
  on public.reviews (poster_id, created_at desc);

-- Comptage par créateur, en SQL : la file du jour lit l'historique de tous ses
-- créateurs d'un coup (une ligne par remarque, pas une par review).
-- `n` = nombre de REVIEWS portant la remarque, quel que soit le compte TikTok.
create or replace function public.compter_remarques_createurs(p_posters uuid[])
returns table (
  poster_id uuid,
  remarque_id text,
  titre text,
  n bigint
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
  with utilisees as (
    select
      r.poster_id as poster,
      r.id as review_id,
      r.created_at,
      e ->> 'id' as rid,
      coalesce(trim(e ->> 'titre'), '') as titre
    from public.reviews r
    cross join lateral jsonb_array_elements(
      case when jsonb_typeof(r.remarques) = 'array' then r.remarques else '[]'::jsonb end
    ) as e
    where r.poster_id = any (p_posters)
      and coalesce(e ->> 'id', '') <> ''
  ),
  -- Titre figé le plus récent : une remarque renommée ne scinde pas le compte,
  -- le regroupement se faisant sur l'id.
  dernier as (
    select distinct on (u.poster, u.rid) u.poster, u.rid, u.titre
    from utilisees u
    order by u.poster, u.rid, u.created_at desc
  )
  select d.poster, d.rid, d.titre, count(distinct u.review_id)::bigint
  from utilisees u
  join dernier d on d.poster = u.poster and d.rid = u.rid
  group by d.poster, d.rid, d.titre
  order by count(distinct u.review_id) desc, d.titre;
end;
$$;

revoke all on function public.compter_remarques_createurs(uuid[]) from public;
grant execute on function public.compter_remarques_createurs(uuid[]) to authenticated;
grant execute on function public.compter_remarques_createurs(uuid[]) to service_role;
