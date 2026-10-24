-- 0349 : la vue de 0348 mettait TRENTE SECONDES. Corrigé le jour même.
--
-- CE QUI S'EST PASSÉ. `label_application_reserve_livre` (0348) construisait sa
-- carte des langues avec une sous-requête CORRÉLÉE (`jsonb_object_agg` dans le
-- select final, filtrée sur `t.label_id`). PostgreSQL la rejoue une fois par
-- ligne de sortie, et comme rien ne restreignait `contenu_langues`, chaque
-- rejeu balayait les 35 200 lignes de la table en évaluant `deck_livre_pret`
-- sur chaque deck : 29,9 s pour cinq lignes. `stats_choix_label` étant appelée
-- à CHAQUE création de compte, c'était un défaut de production, pas une
-- lenteur de page.
--
-- LE CORRECTIF, à résultat identique :
--   * `vises` : la liste des contenus livrés qui nous intéressent (59), posée
--     une fois ; les deux lectures de decks partent de là et passent par
--     l'index `contenu_id` au lieu du balayage complet ;
--   * la carte par langue devient une agrégation en deux temps (`par_langue`
--     puis `carte`) jointe à plat, plus aucune corrélation.
-- 29 916 ms -> 102 ms, les cinq lignes et leurs valeurs sont les mêmes.
-- `stats_choix_label` passe de ~400 ms à ~500 ms, ce que coûte la vue.
--
-- Retour arrière : réappliquer la vue de 0348 (et retrouver les 30 s).

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
-- deux lectures ci-dessous balaient toute la table des traductions.
vises as (
  select distinct contenu_id from livres
),
-- Les langues réellement servables, application par application, comme les
-- lit l'assignation : `contenu_langues` pour Sophia, le deck `pret` de la
-- variante pour les autres (`pods.ts`).
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
par_langue as (
  select x.label_id, x.application_id, d.langue, sum(x.restants) as restants
  from livres x
  join decks d on d.contenu_id = x.contenu_id and d.application_id = x.application_id
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
  'Part LIVRÉE par un pod de la réserve d''un label pour une application (même périmètre que label_application_reserve), et ce qui en est servable dans chaque langue livrée. Sert à rendre le choix de label conscient de la langue (0348, accélérée en 0349).';

revoke all on public.label_application_reserve_livre from public;
grant select on public.label_application_reserve_livre to authenticated, service_role;
