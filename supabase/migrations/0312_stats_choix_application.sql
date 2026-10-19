-- 0312 : les entrées du choix d'APPLICATION, pour le moteur.
--
-- POURQUOI. Jusqu'ici l'application d'un nouveau compte est cochée à la main
-- par le recruteur. On veut que le moteur la choisisse, comme il choisit déjà
-- le label, à partir de la cible d'admin `reglages.repartition_applications`.
--
-- MÊME PATRON QUE LE LABEL. `stats_choix_label` (0287) rend les ENTRÉES et
-- `_shared/choix_label_equilibre.ts` décide. Ici pareil : cette fonction rend
-- les candidats d'un marché avec leurs comptes, et
-- `_shared/choix_application.ts` applique Sainte-Laguë. Un seul endroit où la
-- règle est écrite, et un test interdit au miroir de la page de diverger.
--
-- CE QU'EST UN MARCHÉ. Le couple (langue, pays), comme partout ailleurs dans
-- la répartition. Pays inconnu : on retombe sur la langue seule, ce qui est
-- plus juste que de ne rien compter. En prod aucun compte actif n'a de langue
-- sans pays, mais la création peut en présenter un.
--
-- LE DÉNOMINATEUR est celui de toute la répartition : comptes actifs servis
-- par l'assignation, hors `cm` et hors UGC vidéo. Comptage FRACTIONNAIRE de
-- `parts_applications` (nulle = 100 % Sophia, cf. 0256), pour qu'un compte
-- réglé 50/50 pèse une moitié de chaque côté au lieu de mentir d'un compte.
--
-- ÉLIGIBILITÉ. Seules les applications actives qui servent la langue sont
-- rendues : `applications.langues` nulle veut dire toutes (c'est Sophia).
-- Une application non servie ne doit pas apparaître, sinon le moteur pourrait
-- envoyer un compte polonais sur Unswipe, qui n'y publie pas.
--
-- Les candidats sans aucun compte sur le marché SONT rendus, avec zéro : ce
-- sont précisément eux que Sainte-Laguë doit servir en premier.
--
-- Réservée à `service_role`, comme `stats_choix_label` : c'est une entrée de
-- moteur, pas une donnée d'écran. La page a ses propres fonctions.
--
-- Additive, lecture seule. Retour arrière :
--   drop function if exists public.stats_choix_application(text, text);

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
  with eligibles as (
    select a.id, a.slug
    from public.applications a
    where a.actif
      and (
        a.langues is null
        or lower(coalesce(p_langue, '')) = any (select lower(x) from unnest(a.langues) x)
      )
  ),
  servis as (
    select co.parts_applications
    from public.comptes co
    where co.is_active
      and coalesce(co.type_compte, '') <> 'cm'
      and coalesce(co.ugc_ai_video, false) = false
      and co.langue is not null
      and lower(co.langue) = lower(coalesce(p_langue, ''))
      and (p_pays is null or upper(co.pays) = upper(p_pays))
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
  'Candidats du marché (langue × pays) pour le choix d''application d''un nouveau compte : les applications actives qui servent la langue, avec leurs comptes fractionnaires sur ce marché. Entrée de _shared/choix_application.ts, qui applique Sainte-Laguë. Réservée à service_role, comme stats_choix_label.';

revoke all on function public.stats_choix_application(text, text) from public, anon, authenticated;
grant execute on function public.stats_choix_application(text, text) to service_role;
