-- Casse canonique des codes langue dans les tableaux tenus par manage-users.
--
-- `etendreLanguesManager` / `ajouterLangueProfil` passaient la langue en
-- minuscules : un recrutement au Brésil écrivait `pt-br` dans
-- `profiles.langues` et `recrutement_hms.pays`, que ni `LANGUES_CIBLES` ni la
-- carte pays Recrutements ne connaissent (`pt-BR`). Le code canonise
-- désormais à l'entrée (`canoniserLangue`) ; ici on répare l'existant, sans
-- doublon si le code canonique y était déjà, ordre conservé.

create or replace function pg_temp.canoniser_langues(t text[]) returns text[]
language sql immutable as $$
  select coalesce(array_agg(code order by premier), '{}')
  from (
    select code, min(ord) as premier
    from (
      select
        case lower(trim(v))
          when 'pt-br' then 'pt-BR'
          when 'es-419' then 'es-419'
          else v
        end as code,
        ord
      from unnest(t) with ordinality as u(v, ord)
    ) c
    group by code
  ) d
$$;

update public.profiles
set langues = pg_temp.canoniser_langues(langues)
where exists (select 1 from unnest(langues) v where lower(trim(v)) in ('pt-br', 'es-419') and v not in ('pt-BR', 'es-419'));

update public.recrutement_hms
set pays = pg_temp.canoniser_langues(pays)
where exists (select 1 from unnest(pays) v where lower(trim(v)) in ('pt-br', 'es-419') and v not in ('pt-BR', 'es-419'));
