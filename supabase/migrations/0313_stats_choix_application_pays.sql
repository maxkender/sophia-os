-- 0313 : le choix d'application doit viser LE MÊME MARCHÉ que le label.
--
-- CE QUI CLOCHAIT DANS 0312. Elle prenait le pays tel qu'on le lui donnait, et
-- retombait sur la langue seule quand il manquait. Or à la création d'un
-- compte le pays N'EST PAS ENCORE CONNU : `paysSaisi` (manage-users) rend null
-- pour les 23 langues à marché unique, et la colonne est remplie APRÈS
-- l'insert par le trigger `comptes_pays_defaut` (0281). Tous les comptes en
-- base portent pourtant un pays.
--
-- Conséquence : le choix d'application aurait compté toute la langue pendant
-- que le choix de label, lui, compte le marché (langue × pays) résolu par
-- `pays_defaut_langue`. Deux étages qui ne regardent pas le même terrain, et
-- un écart invisible tant qu'une langue n'a qu'un pays — c'est-à-dire
-- invisible sur 23 langues et faux sur les trois autres (en, es-419, ar).
--
-- LE CORRECTIF. La même résolution que `stats_choix_label` (0287) :
--   coalesce(upper(trim(p_pays)), public.pays_defaut_langue(p_langue))
-- Un seul marché pour les deux étages, par construction.
--
-- Remplace la fonction de 0312, même signature et mêmes colonnes, donc un
-- simple `create or replace`. Retour arrière : réappliquer 0312.

create or replace function public.stats_choix_application(
  p_langue text,
  p_pays text default null
)
returns table (
  application_id uuid,
  slug text,
  comptes numeric
)
language sql
stable
set search_path = public
as $$
  -- Les entrées du choix d'APPLICATION. Même patron que stats_choix_label
  -- (0287) : le SQL rend les candidats, _shared/choix_application.ts applique
  -- Sainte-Laguë. Comptage FRACTIONNAIRE de parts_applications (nulle =
  -- 100 % Sophia, cf. 0256). Seules les applications actives qui servent la
  -- langue sont rendues, y compris à zéro compte : ce sont justement elles
  -- que Sainte-Laguë doit servir en premier.
  with cible as (
    select
      lower(nullif(trim(coalesce(p_langue, '')), '')) as langue,
      coalesce(
        upper(nullif(trim(coalesce(p_pays, '')), '')),
        public.pays_defaut_langue(nullif(trim(coalesce(p_langue, '')), ''))
      ) as pays
  ),
  eligibles as (
    select a.id, a.slug
    from public.applications a, cible c
    where a.actif
      and (
        a.langues is null
        or c.langue = any (select lower(x) from unnest(a.langues) x)
      )
  ),
  servis as (
    select co.parts_applications
    from public.comptes co, cible c
    where co.is_active
      and coalesce(co.type_compte, '') <> 'cm'
      and coalesce(co.ugc_ai_video, false) = false
      and co.langue is not null
      and lower(co.langue) = c.langue
      -- Marché inconnu même après résolution : on compte toute la langue
      -- plutôt que rien, un marché vide donnerait le siège à la plus grosse
      -- cible quoi qu'il arrive.
      and (c.pays is null or upper(co.pays) = c.pays)
  ),
  eclate as (
    select 'sophia'::text as slug, 1.0::numeric as part
    from servis where parts_applications is null
    union all
    select e.key, (e.value)::numeric / 100.0
    from servis cross join lateral jsonb_each_text(parts_applications) e
    where parts_applications is not null and (e.value)::numeric > 0
  ),
  par_app as (select slug, sum(part) as comptes from eclate group by 1)
  select e.id, e.slug, coalesce(pa.comptes, 0)::numeric
  from eligibles e
  left join par_app pa on pa.slug = e.slug
  order by e.slug;
$$;

comment on function public.stats_choix_application(text, text) is
  'Candidats du marché (langue × pays) pour le choix d''application d''un nouveau compte : les applications actives qui servent la langue, avec leurs comptes fractionnaires sur ce marché. Le pays est résolu comme dans stats_choix_label (pays_defaut_langue), pour que les deux étages visent le même marché. Entrée de _shared/choix_application.ts. Réservée à service_role.';

revoke all on function public.stats_choix_application(text, text) from public, anon, authenticated;
grant execute on function public.stats_choix_application(text, text) to service_role;
