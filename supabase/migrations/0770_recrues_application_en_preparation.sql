-- 0770 : une application EN PRÉPARATION peut recevoir les nouvelles recrues.
--
-- LE BESOIN (19/11). Atala a ses labels (classic_girl_run, clean_girl_run,
-- male_run…) mais elle est inactive : ses deux prompts sont des brouillons et
-- elle n'a pas encore de stock. On veut pourtant que les prochaines recrues
-- soient des comptes Atala. Un compte neuf commence par son warm-up : autant
-- le lancer pendant que le contenu se prépare.
--
-- CE QUI BLOQUAIT. `stats_choix_application` (0313) ne rendait que les
-- applications ACTIVES. La page Allocation ne montrait donc pas Atala dans
-- « Répartition entre applis », et aucune cible ne pouvait lui donner de part.
-- L'activer pour pouvoir recruter n'est pas la réponse : l'activation ouvre la
-- PUBLICATION, et elle est refusée tant que les prompts sont des brouillons
-- (0764).
--
-- LA RÈGLE. Recruter et publier sont deux choses.
--   - `applications.actif` reste l'interrupteur de la publication, inchangé :
--     une application inactive ne publie rien (`applicationsEligiblesCompte`,
--     multi_app.ts).
--   - une application EN PRÉPARATION (inactive, servie par au moins un label
--     slideshow) devient candidate au choix d'application d'un nouveau compte.
--     Elle n'en reçoit un que si la cible `reglages.repartition_applications`
--     lui donne une part : c'est ce geste, fait à l'écran (Allocation →
--     Répartition entre applis), qui décide.
--
-- CE QUE DEVIENT UN TEL COMPTE. Il naît comme un compte micabo ou Unswipe :
-- `parts_applications = {"<slug>": 100}`, un label de l'application (File, puis
-- choix équilibré : sans stock, ses labels pèsent pareil et les comptes se
-- répartissent entre eux), son identité, son warm-up. Ensuite la nuit le
-- passe : « application désactivée », sans baisse de quota, jusqu'à
-- l'activation. Il ne publie jamais pour une autre application.
--
-- RIEN NE CHANGE À L'APPLICATION DE CETTE MIGRATION. La cible vaut
-- {"sophia": 100} : une application en préparation est candidate avec une part
-- de 0, et `classerApplications` écarte une part nulle. Additive, à appliquer
-- AVANT le merge du front (le front d'avant ne lit pas la nouvelle fonction).
-- Hors fenêtres de nuit (21:50–23:15 UTC, 03:55–04:15 UTC).
--
-- À SAVOIR. Désactiver une application qui garde des labels ET une part dans
-- la cible ne coupe plus son recrutement : elle redevient « en préparation ».
-- Pour l'arrêter tout à fait, remettre sa part à 0 (la page la montre
-- « Inactive » tant qu'elle y figure).
--
-- Retour arrière : remettre `where a.actif` dans `stats_choix_application`
-- (le corps de 0313, avec `co.ugcv` à la place de `co.ugc_ai_video` depuis
-- 0661), puis `drop function public.applications_en_preparation();`.

-- Les applications en préparation. UNE SEULE définition, lue par le moteur
-- (`stats_choix_application`, ci-dessous) et par la page Allocation : les deux
-- ne peuvent pas se contredire.
--
-- « Label slideshow » : ni Hook ni manuel (UGCV), le même filtre que
-- `simulation_repartition` et que `estLabelFileSlideshow` côté code. Un label
-- que la création de compte n'a pas le droit de poser ne fait pas une
-- application recrutable.
create or replace function public.applications_en_preparation()
returns table (application_id uuid)
language sql
stable
set search_path = public
as $$
  select a.id
  from public.applications a
  where not a.actif
    and exists (
      select 1
      from public.label_applications la
      join public.labels l on l.id = la.label_id
      where la.application_id = a.id
        and coalesce(l.slug, '') <> 'hook'
        and coalesce(lower(l.nom), '') <> 'hook'
        and not coalesce(l.manuel, false)
    );
$$;

comment on function public.applications_en_preparation() is
  'Applications EN PRÉPARATION : inactives, mais déjà servies par au moins un label slideshow. Elles peuvent recevoir de nouveaux comptes (si la cible reglages.repartition_applications leur donne une part) sans rien publier avant leur activation. Lue par stats_choix_application et par la page Allocation.';

-- Droits de l'appelant : les trois tables sont lisibles par tout utilisateur
-- connecté, la fonction ne montre rien de plus.
revoke all on function public.applications_en_preparation() from public, anon;
grant execute on function public.applications_en_preparation() to authenticated, service_role;

-- Même signature et mêmes colonnes que 0313 : un simple `create or replace`.
-- Seule la liste des candidates change (actives OU en préparation).
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
  -- 0313 : le choix d'application vise LE MÊME MARCHÉ que le choix de label.
  --
  -- À la création, le pays n'est pas encore connu : paysSaisi rend null pour
  -- les 23 langues à marché unique, et la colonne est remplie après l'insert
  -- par le trigger comptes_pays_defaut (0281). On résout donc le pays comme
  -- stats_choix_label (0287) : coalesce(upper(trim(p_pays)),
  -- pays_defaut_langue(p_langue)). Sans ça, les deux étages ne regarderaient
  -- pas le même terrain, et l'écart serait invisible sur les 23 langues à un
  -- seul pays, faux sur les trois autres.
  --
  -- Comptage FRACTIONNAIRE de parts_applications (nulle = 100 % Sophia, cf.
  -- 0256). Sont rendues les applications qui servent la langue, actives OU en
  -- préparation (0770 : inactives mais déjà dotées d'un label), y compris à
  -- zéro compte : ce sont justement elles que Sainte-Laguë doit servir en
  -- premier. Une application en préparation ne reçoit un compte que si la
  -- cible lui donne une part ; ce compte ne publie rien avant l'activation.
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
    where (
        a.actif
        or a.id in (select ep.application_id from public.applications_en_preparation() ep)
      )
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
      and coalesce(co.ugcv, false) = false
      and co.langue is not null
      and lower(co.langue) = c.langue
      -- Marché inconnu même après résolution (l'anglais a sept pays) : on
      -- compte toute la langue plutôt que rien, un marché vide donnerait le
      -- siège à la plus grosse cible quoi qu'il arrive.
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
  'Candidats du marché (langue × pays) pour le choix d''application d''un nouveau compte : les applications qui servent la langue, actives ou en préparation (applications_en_preparation, 0770), avec leurs comptes fractionnaires sur ce marché. Le pays est résolu comme dans stats_choix_label (pays_defaut_langue), pour que les deux étages visent le même marché. Entrée de _shared/choix_application.ts. Réservée à service_role.';

revoke all on function public.stats_choix_application(text, text) from public, anon, authenticated;
grant execute on function public.stats_choix_application(text, text) to service_role;
