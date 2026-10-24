-- 0350 : un deck livré en langue de base couvre aussi ses variantes
-- régionales, dans la réserve du choix de label comme dans l'assignation.
--
-- LE TROU. Depuis 0348, la réserve d'un label livré par un pod ne compte que
-- dans les langues où le pod a livré un deck. Mais la langue d'un compte peut
-- être régionale (`pt-BR` pour nos 5 comptes brésiliens, `es-419` pour 15
-- comptes d'Amérique latine), alors que les pods livrent en `pt` et en `es`.
-- Résultat : Fathomly et that_girl_study, livrés en `pt`, comptaient pour zéro
-- auprès d'un compte `pt-BR` ; white_bg et mentalmaxxing, livrés en `es`,
-- comptaient pour zéro auprès d'un compte `es-419`. Et l'assignation, qui
-- cherchait le deck à la langue exacte, ne les aurait pas servis non plus.
--
-- LE CORRECTIF. Une variante régionale se replie sur sa langue de base, et
-- seulement dans ce sens : un deck `pt` sert un compte `pt-BR`, un deck
-- `pt-BR` ne sert pas un compte `pt`. C'est la règle de `languesDeckLivre`
-- (`_shared/pods.ts`), que le filtrage du pool et la lecture du deck suivent
-- aussi depuis le même changement. Seuls les contenus LIVRÉS sont concernés :
-- le contenu ordinaire est traduit dans la langue exacte du compte.
--
-- COMMENT. La carte « langue -> passages » de la vue gagne, pour chaque deck
-- en langue de base, une entrée par variante régionale que la flotte utilise
-- (lue dans `comptes`, rien d'écrit en dur : un compte `fr-CA` demain serait
-- couvert par les decks `fr` sans toucher à la vue). Un contenu qui a À LA
-- FOIS un deck `pt-BR` et un deck `pt` n'est compté qu'une fois pour `pt-br`.
--
-- Rien d'autre ne change : `stats_choix_label` et `simulation_repartition`
-- lisent la carte à la langue du compte (en minuscules) comme avant.
--
-- Retour arrière : réappliquer la vue de 0349.

create or replace view public.label_application_reserve_livre as
with liens as (
  select l.id as label_id, la.application_id
  from public.labels l
  join public.label_applications la on la.label_id = l.id
  where lower(trim(l.slug)) <> all (array['hook', 'ugc-ai-video'])
),
livres as (
  -- Sophia : le stock sort de `contenu_tier_etat`, la pertinence par
  -- application vaut « oui » par défaut.
  select li.label_id, li.application_id, c.id as contenu_id, e.restants::numeric as restants
  from liens li
  join public.contenu_labels cl on cl.label_id = li.label_id
  join public.contenus c on c.id = cl.contenu_id
   and c.statut = 'valide'::contenu_statut and c.import_statut = 'done' and c.livre
  join public.contenu_tier_etat e on e.contenu_id = c.id
  left join public.contenu_pertinences cp on cp.contenu_id = c.id and cp.application_id = li.application_id
  where li.application_id = public.application_id_sophia() and coalesce(cp.eligible, true)
  union all
  -- Les autres applications ont leur propre état de tier, déjà filtré.
  select li.label_id, li.application_id, c.id, ea.restants::numeric
  from liens li
  join public.contenu_labels cl on cl.label_id = li.label_id
  join public.contenus c on c.id = cl.contenu_id
   and c.statut = 'valide'::contenu_statut and c.import_statut = 'done' and c.livre
  join public.contenu_application_tier_etat ea on ea.contenu_id = c.id and ea.application_id = li.application_id
  where li.application_id <> public.application_id_sophia() and ea.eligible
),
-- Les seuls contenus dont les decks nous intéressent. Sans ce filtre, les
-- lectures ci-dessous balaient toute la table des traductions (0349).
vises as (
  select distinct contenu_id from livres
),
-- Les langues réellement livrées, application par application, comme les lit
-- l'assignation : `contenu_langues` pour Sophia, le deck `pret` de la variante
-- pour les autres (`pods.ts`).
decks as (
  select cl.contenu_id, public.application_id_sophia() as application_id, lower(cl.langue) as langue
  from public.contenu_langues cl
  join vises v on v.contenu_id = cl.contenu_id
  where cl.langue is not null and public.deck_livre_pret(cl.slides)
  union all
  select d.contenu_id, a.id, lower(d.langue)
  from public.contenu_langue_decks d
  join vises v on v.contenu_id = d.contenu_id
  join public.applications a on a.slug = d.variante and a.id <> public.application_id_sophia()
  where d.langue is not null and d.statut = 'pret' and public.deck_livre_pret(d.slides)
),
-- Les variantes régionales que la flotte utilise, et leur langue de base.
variantes as (
  select distinct lower(c.langue) as langue, split_part(lower(c.langue), '-', 1) as base
  from public.comptes c
  where c.langue like '%-%'
),
-- Les langues de COMPTE qu'un contenu peut servir : celles de ses decks, plus
-- les variantes régionales de chaque deck en langue de base. `union` (et non
-- `union all`) : un contenu servi deux fois dans la même langue compte une fois.
servies as (
  select contenu_id, application_id, langue from decks
  union
  select d.contenu_id, d.application_id, v.langue
  from decks d
  join variantes v on v.base = d.langue
),
par_langue as (
  select x.label_id, x.application_id, s.langue, sum(x.restants) as restants
  from livres x
  join servies s on s.contenu_id = x.contenu_id and s.application_id = x.application_id
  group by 1, 2, 3
),
carte as (
  select label_id, application_id, jsonb_object_agg(langue, restants) as par_langue
  from par_langue
  group by 1, 2
),
totaux as (
  select label_id, application_id, sum(restants) as restants
  from livres
  group by 1, 2
)
select
  t.label_id,
  t.application_id,
  t.restants as restants_livres,
  coalesce(c.par_langue, '{}'::jsonb) as restants_par_langue
from totaux t
left join carte c on c.label_id = t.label_id and c.application_id = t.application_id;

comment on view public.label_application_reserve_livre is
  'Part LIVRÉE par un pod de la réserve d''un label pour une application (même périmètre que label_application_reserve), et ce qui en est servable dans chaque langue de compte : les langues livrées, plus les variantes régionales d''une langue de base livrée (0350). Sert à rendre le choix de label conscient de la langue (0348).';

revoke all on public.label_application_reserve_livre from public;
grant select on public.label_application_reserve_livre to authenticated, service_role;
