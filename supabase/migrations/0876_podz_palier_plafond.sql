-- 0876 : un label au palier ne dépasse jamais le total de son palier (suite
--   de 0874 et 0875, 27/11).
--
-- 0874 donnait une place dans CHAQUE langue ouverte, jusqu'à 1 ou 2 comptes
-- par langue. Un label avec plus de langues ouvertes que son palier n'en
-- compte (les 4 labels du 27/11 ont 8 langues au palier 1) aurait pu prendre
-- 8 comptes au lieu de 7 ; au palier 3, un label à 24 langues en aurait pris
-- 48 au lieu de 28. Désormais : dès que le label a ses comptes du palier
-- (langues × comptes par langue, comptes actifs), plus aucune place
-- (`cible` 0) ; il attend sa semaine à r > 0,9.
--
-- Les anciens labels 100 % podz ne changent pas (Adrien, 27/11 : « rien pour
-- l'instant, ouvre juste pour les prochains labels 100 % podz ») : sans
-- palier, une place par langue ouverte, comme 0794.
--
-- ✅ Appliquée le 2026-11-27 (MCP). Une fonction remplacée (même signature).
-- Retour arrière : réappliquer `podz_places_langue` de 0874.

set lock_timeout = '5s';

create or replace function public.podz_places_langue(p_langue text)
returns table (label_id uuid, palier smallint, cible integer)
language sql
stable
security definer
set search_path to 'public'
as $function$
  with l0 as (
    select lower(btrim(p_langue)) as lg
     where nullif(btrim(coalesce(p_langue, '')), '') is not null
  ),
  ouverts as (
    select distinct p.label_id
      from pods p, l0
     where p.actif and p.label_id is not null and p.langues is not null
       and exists (select 1 from unnest(p.langues) x where lower(x) in (l0.lg, split_part(l0.lg, '-', 1)))
  ),
  base as (
    select l.id, l.palier_podz, o.label_id is not null as ouverte,
           public.podz_palier_cible(l.palier_podz) as cible_palier
      from labels l
      left join ouverts o on o.label_id = l.id
     where (o.label_id is not null or l.palier_podz is not null)
       and exists (select 1 from l0)
  )
  select b.id, b.palier_podz,
         case
           when not b.ouverte then 0
           when b.palier_podz is null then 1
           -- Palier complet (comptes actifs ≥ langues × comptes par langue) : plus de place.
           when (select count(distinct cl.compte_id) from compte_labels cl
                   join comptes c on c.id = cl.compte_id and c.is_active
                  where cl.label_id = b.id)
                >= coalesce((b.cible_palier->>'langues')::integer, 7) * coalesce((b.cible_palier->>'comptes_par_langue')::integer, 1)
             then 0
           else coalesce((b.cible_palier->>'comptes_par_langue')::integer, 1)
         end
    from base b;
$function$;

comment on function public.podz_places_langue(text) is
  'Les places des podz dans une langue (0874, 0876) : label, palier, et combien de comptes il peut y avoir dans cette langue (celle du palier, 1 sans palier ; 0 hors de ses langues ou quand le palier a tous ses comptes). Lue par le choix de label.';
