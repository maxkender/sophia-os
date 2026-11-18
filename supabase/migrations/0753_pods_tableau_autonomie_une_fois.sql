-- 0753 : la page Podz retombait en « statement timeout » (18/11).
--
-- Dans `pods_tableau`, la CTE `autonomie` (stock du podz + réserve du label,
-- vue `label_application_reserve`) n'est lue qu'une fois, dans une sous-requête
-- corrélée par podz : Postgres l'inlinait, et recalculait toute la réserve des
-- labels pour CHACUN des 17 podz (≈ 100 000 lectures de contenus, 4,2 s sur
-- 4,5 s). Sous charge, la requête dépassait les 8 s des admins.
-- `materialized` : calculée une seule fois. Mêmes colonnes, même résultat.
-- Retour arrière : retirer le mot `materialized`.

do $$
declare
  d text := pg_get_functiondef('public.pods_tableau(integer)'::regprocedure);
  a text := 'autonomie as (';
  n integer := (length(d) - length(replace(d, a, ''))) / length(a);
begin
  if n <> 1 then
    raise exception '0753 : « autonomie as ( » trouvé % fois (attendu 1), rien n''est changé', n;
  end if;
  execute replace(d, a, 'autonomie as materialized (');
end $$;

insert into supabase_migrations.schema_migrations (version, name, statements)
values (to_char(now() at time zone 'UTC', 'YYYYMMDDHH24MISS'), 'pods_tableau_autonomie_une_fois', array['voir 0753']);
