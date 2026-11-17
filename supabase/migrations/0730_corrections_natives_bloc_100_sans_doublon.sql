-- 0730 : le bloc des corrections natives passe à 100 et sans doublon (16/11).
--
-- `corrections_natives_bloc` (0630) n'envoyait au modèle que les 30
-- corrections retenues les plus récentes d'une langue : au 16/11, l'italien en
-- a 52 retenues et l'allemand 38, les plus anciennes ne servaient plus. Et une
-- même faute relevée plusieurs fois prenait autant de places.
--
--  - Une seule ligne par fragment fautif (même texte, sans casse ni espaces
--    autour) : la plus récente gagne, avec sa correction et son explication.
--  - Jusqu'à 100 lignes par défaut (au lieu de 30).
-- Même signature, mêmes appels (moteur et aperçu de l'admin ne passent pas
-- `p_max`), même texte de bloc.
--
-- Retour arrière : rejouer la fonction de 0630.

set lock_timeout = '5s';

create or replace function public.corrections_natives_bloc(p_langue text, p_max integer default 100)
returns text
language sql
stable
security invoker
set search_path to 'public'
as $$
  select case when count(*) = 0 then null else
    E'=== RETOURS DES RELECTEURS NATIFS (' || upper(p_langue) || E') ===\n'
    || E'Des natifs ont relu nos traductions et relevé ceci. Applique ces corrections, et ne refais pas ces erreurs dans des phrases voisines :\n'
    || string_agg(
         '- [' || c.type || '] '
         || case when c.corrige is not null and btrim(c.corrige) <> ''
                 then 'au lieu de « ' || btrim(c.fautif) || ' », écris « ' || btrim(c.corrige) || ' »'
                 else 'évite « ' || btrim(c.fautif) || ' »' end
         || case when c.explication is not null and btrim(c.explication) <> '' then ' (' || btrim(c.explication) || ')' else '' end,
         E'\n' order by c.created_at desc)
  end
  from (select * from (
          select distinct on (lower(btrim(fautif))) *
            from corrections_natives
           where lower(langue) = lower(p_langue) and statut = 'retenue'
           order by lower(btrim(fautif)), created_at desc
        ) uniques
         order by created_at desc
         limit greatest(coalesce(p_max, 100), 1)) c;
$$;

grant execute on function public.corrections_natives_bloc(text, integer) to authenticated, service_role;
