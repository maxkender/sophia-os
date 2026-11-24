-- 0853 : trois éclaireurs au lieu d'un, et une file de sujets de recherche
-- (décision d'Adrien du 24/11).
--
-- Jusqu'ici un seul agent éclaireur cherchait chaque matin, sur les pistes qu'il
-- choisissait, dans un plafond de 20 $ par jour. Adrien veut plusieurs agents
-- indépendants, et pouvoir leur donner des sujets depuis l'OS (« l'art :
-- tableaux, sculptures, dans toutes les langues »). Un agent qui se réveille
-- prend un sujet en attente ; s'il n'y en a pas, il cherche librement dans son
-- couloir.
--
--   * `sources_sujets` : la file. Un sujet (le thème, la consigne libre, les
--     langues, le label visé s'il y en a un, son budget et son nombre de cartes),
--     son statut (`en_attente`, `pris`, `fait`, `annule`), l'agent qui l'a pris
--     et son compte rendu.
--   * `sources_sujet_ajouter` / `sources_sujet_annuler` : l'admin, depuis la
--     Bible des comptes (onglet « Propositions »). Le front ne fait que lire la
--     table.
--   * `sources_sujet_prendre(agent)` : l'agent prend le plus ancien sujet en
--     attente, sans jamais prendre celui d'un autre (`for update skip locked`).
--     Rappelée, elle rend le sujet qu'il tient déjà. `sources_sujet_rendre`
--     ferme le sujet avec le compte rendu.
--   * `sources_recherches` et `sources_candidats` gagnent `agent` et `sujet_id` :
--     qui a dépensé et déposé quoi, pour quel sujet.
--   * `reglages.eclaireur` : plafond du jour à 50 $ pour tous les agents
--     ensemble, la liste des trois agents avec leur couloir, le budget d'une
--     recherche libre (5 $) et celui d'un sujet par défaut (12 $, 15 cartes).
--   * `sources_eclaireur_budget(agent)` remplace `sources_eclaireur_budget()` :
--     sans agent elle rend ce qu'elle rendait (le jour entier) ; avec un agent
--     elle rend aussi son couloir, ce qu'il a dépensé, le sujet qu'il tient et ce
--     qu'il peut encore dépenser (le plus petit du reste du jour et du reste de
--     son sujet ou de sa recherche libre).
--
-- ✅ Appliquée le 2026-11-24 (MCP).
--
-- Retour arrière : drop function sources_eclaireur_budget(text), puis recréer
-- sources_eclaireur_budget() de 0685 ; drop function sources_sujet_prendre(text),
-- sources_sujet_rendre(uuid, text), sources_sujet_ajouter(text, text, text[],
-- uuid, numeric, integer, date), sources_sujet_annuler(uuid) ; alter table
-- sources_recherches drop column agent, drop column sujet_id ; idem
-- sources_candidats ; drop table sources_sujets ; remettre
-- `plafond_usd_jour` à 20 et retirer `agents`, `libre_usd`, `sujet_usd`,
-- `sujet_cartes` de `reglages.eclaireur`.

set lock_timeout = '5s';

-- 1. La file de sujets.
create table public.sources_sujets (
  id uuid primary key default gen_random_uuid(),
  -- Le thème, en quelques mots : « l'art : tableaux, sculptures ».
  sujet text not null check (length(btrim(sujet)) between 3 and 200),
  -- Ce que l'admin veut précisément (formats, exemples de comptes, ce qu'il ne veut pas).
  consigne text check (consigne is null or length(consigne) <= 4000),
  -- Vide : toutes les langues, au choix de l'agent.
  langues text[] not null default '{}',
  -- Le label à nourrir, s'il existe déjà. Null : l'agent propose des concepts ou choisit le label.
  label_id uuid references public.labels(id) on delete set null,
  budget_usd numeric(8, 2) not null check (budget_usd > 0 and budget_usd <= 50),
  cartes_max integer not null check (cartes_max between 1 and 60),
  -- Le premier jour où un agent peut le prendre (heure de Paris).
  jour date not null default ((now() at time zone 'Europe/Paris')::date),
  statut text not null default 'en_attente' check (statut in ('en_attente', 'pris', 'fait', 'annule')),
  agent text,
  pris_le timestamptz,
  fait_le timestamptz,
  compte_rendu text,
  cree_par uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index sources_sujets_file_idx on public.sources_sujets (statut, jour, created_at);
-- Un agent ne tient qu'un sujet à la fois.
create unique index sources_sujets_un_par_agent on public.sources_sujets (agent) where statut = 'pris';

comment on table public.sources_sujets is
  'Sources (0853) : la file des sujets de recherche donnés aux agents éclaireurs depuis la Bible des comptes. Un agent prend le plus ancien sujet en attente, cherche dans son budget, dépose ses cartes et rend son compte rendu.';

alter table public.sources_sujets enable row level security;
create policy sources_sujets_admin on public.sources_sujets
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
-- Le front ne fait que lire : ajouter et annuler passent par les fonctions.
grant select on public.sources_sujets to authenticated;
grant all on public.sources_sujets to service_role;

-- 2. Qui a dépensé et déposé quoi, pour quel sujet.
alter table public.sources_recherches
  add column agent text,
  add column sujet_id uuid references public.sources_sujets(id) on delete set null;
alter table public.sources_candidats
  add column agent text,
  add column sujet_id uuid references public.sources_sujets(id) on delete set null;
create index sources_recherches_sujet_idx on public.sources_recherches (sujet_id) where sujet_id is not null;
create index sources_candidats_sujet_idx on public.sources_candidats (sujet_id) where sujet_id is not null;

comment on column public.sources_recherches.agent is 'Sources (0853) : l''agent éclaireur qui a lancé la recherche (`eclaireur-1`…). Null avant le 24/11.';
comment on column public.sources_recherches.sujet_id is 'Sources (0853) : le sujet de la file pour lequel la recherche a été lancée. Null pour une recherche libre.';
comment on column public.sources_candidats.agent is 'Sources (0853) : l''agent éclaireur qui a déposé la carte. Null avant le 24/11.';
comment on column public.sources_candidats.sujet_id is 'Sources (0853) : le sujet de la file auquel la carte répond. Null pour une recherche libre.';

-- 3. Les réglages : 50 $ par jour pour trois agents.
update public.reglages
   set valeur = valeur || jsonb_build_object(
         'plafond_usd_jour', 50,
         -- Une recherche libre (pas de sujet en attente), par agent et par jour.
         'libre_usd', 5,
         -- Un sujet de la file, quand l'admin ne précise pas.
         'sujet_usd', 12,
         'sujet_cartes', 15,
         'agents', jsonb_build_array(
           jsonb_build_object('cle', 'eclaireur-1', 'couloir', 'labels',
             'consigne', 'Des sources pour les labels qui en manquent : les labels créés récemment et ceux qui ont le moins de sources, par les accroches et les voisins de leurs sources.'),
           jsonb_build_object('cle', 'eclaireur-2', 'couloir', 'concepts',
             'consigne', 'Des concepts nouveaux : des formats de slideshows qu''aucun de nos labels ne couvre, par l''exploration et les mots-clés d''une niche.'),
           jsonb_build_object('cle', 'eclaireur-3', 'couloir', 'langues',
             'consigne', 'Les langues hors anglais : pour nos meilleurs labels, des sources dans les langues ouvertes où ils n''en ont aucune.'))),
       updated_at = now()
 where cle = 'eclaireur';

-- 4. L'admin ajoute ou annule un sujet.
create or replace function public.sources_sujet_ajouter(
  p_sujet text,
  p_consigne text default null,
  p_langues text[] default '{}',
  p_label uuid default null,
  p_budget numeric default null,
  p_cartes integer default null,
  p_jour date default null)
returns public.sources_sujets
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  reg jsonb;
  v_jour date := (now() at time zone 'Europe/Paris')::date;
  s public.sources_sujets;
begin
  if auth.uid() is not null and not public.is_admin() then
    raise exception 'réservé à l''admin' using errcode = '42501';
  end if;
  select valeur into reg from reglages where cle = 'eclaireur';
  insert into sources_sujets (sujet, consigne, langues, label_id, budget_usd, cartes_max, jour)
  values (
    btrim(p_sujet),
    nullif(btrim(coalesce(p_consigne, '')), ''),
    coalesce((select array_agg(distinct lower(btrim(x))) from unnest(coalesce(p_langues, '{}')) x where btrim(x) <> ''), '{}'),
    p_label,
    coalesce(p_budget, (reg->>'sujet_usd')::numeric, 12),
    coalesce(p_cartes, (reg->>'sujet_cartes')::integer, 15),
    greatest(coalesce(p_jour, v_jour), v_jour))
  returning * into s;
  return s;
end;
$function$;

comment on function public.sources_sujet_ajouter(text, text, text[], uuid, numeric, integer, date) is
  'Sources (0853) : l''admin ajoute un sujet à la file des éclaireurs. Budget et nombre de cartes par défaut dans `reglages.eclaireur` (`sujet_usd`, `sujet_cartes`).';

create or replace function public.sources_sujet_annuler(p_id uuid)
returns public.sources_sujets
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  s public.sources_sujets;
begin
  if auth.uid() is not null and not public.is_admin() then
    raise exception 'réservé à l''admin' using errcode = '42501';
  end if;
  update sources_sujets set statut = 'annule', updated_at = now()
   where id = p_id and statut in ('en_attente', 'pris')
  returning * into s;
  if s.id is null then
    raise exception 'sources : ce sujet est déjà fait ou annulé';
  end if;
  return s;
end;
$function$;

comment on function public.sources_sujet_annuler(uuid) is
  'Sources (0853) : l''admin annule un sujet en attente ou en cours. L''agent qui le tenait le voit à son prochain appel du budget et s''arrête.';

-- 5. L'agent prend un sujet, puis le rend.
create or replace function public.sources_sujet_prendre(p_agent text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_jour date := (now() at time zone 'Europe/Paris')::date;
  s public.sources_sujets;
begin
  if auth.uid() is not null and not public.is_admin() then
    raise exception 'réservé à l''admin' using errcode = '42501';
  end if;
  if not exists (select 1 from reglages r, jsonb_array_elements(r.valeur->'agents') a
                  where r.cle = 'eclaireur' and a->>'cle' = p_agent) then
    raise exception 'sources : agent inconnu (%)', p_agent;
  end if;

  -- Il tient déjà un sujet (une routine coupée en route) : il le reprend.
  select * into s from sources_sujets where agent = p_agent and statut = 'pris';
  if s.id is null then
    select * into s from sources_sujets
     where statut = 'en_attente' and jour <= v_jour
     order by jour, created_at
     limit 1
     for update skip locked;
    if s.id is null then
      return null;
    end if;
    update sources_sujets set statut = 'pris', agent = p_agent, pris_le = now(), updated_at = now()
     where id = s.id
    returning * into s;
  end if;

  return to_jsonb(s) || jsonb_build_object(
    'label', (select nom from labels where id = s.label_id),
    'depense_usd', (select coalesce(sum(cout_usd), 0) from sources_recherches where sujet_id = s.id),
    'cartes', (select count(*) from sources_candidats where sujet_id = s.id and statut <> 'ecarte'));
end;
$function$;

comment on function public.sources_sujet_prendre(text) is
  'Sources (0853) : l''agent éclaireur prend le plus ancien sujet en attente (ou reprend celui qu''il tient). Rend le sujet, ce qu''il a déjà coûté et ses cartes ; null s''il n''y a rien à prendre : recherche libre.';

create or replace function public.sources_sujet_rendre(p_id uuid, p_compte_rendu text)
returns public.sources_sujets
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  s public.sources_sujets;
begin
  if auth.uid() is not null and not public.is_admin() then
    raise exception 'réservé à l''admin' using errcode = '42501';
  end if;
  update sources_sujets
     set statut = 'fait', fait_le = now(), compte_rendu = nullif(btrim(coalesce(p_compte_rendu, '')), ''), updated_at = now()
   where id = p_id and statut = 'pris'
  returning * into s;
  if s.id is null then
    raise exception 'sources : ce sujet n''est pas en cours (déjà rendu, ou annulé)';
  end if;
  return s;
end;
$function$;

comment on function public.sources_sujet_rendre(uuid, text) is
  'Sources (0853) : l''agent éclaireur ferme son sujet avec son compte rendu, lu par l''admin dans la Bible des comptes.';

-- 6. Le budget, par jour et par agent.
drop function public.sources_eclaireur_budget();

create or replace function public.sources_eclaireur_budget(p_agent text default null)
returns jsonb
language sql
stable
set search_path to 'public'
as $function$
  with r as (select valeur from reglages where cle = 'eclaireur'),
  j as (select (now() at time zone 'Europe/Paris')::date as jour),
  d as (select coalesce(sum(cout_usd), 0) as depense from sources_recherches, j where sources_recherches.jour = j.jour),
  c as (select count(*) as cartes from sources_candidats, j
         where statut <> 'ecarte' and (created_at at time zone 'Europe/Paris')::date = j.jour),
  -- L'agent : son couloir, sa recherche libre du jour et le sujet qu'il tient.
  a as (select x as agent from r, jsonb_array_elements(r.valeur->'agents') x where x->>'cle' = p_agent),
  al as (select coalesce(sum(cout_usd), 0) as depense from sources_recherches, j
          where sources_recherches.jour = j.jour and agent = p_agent and sujet_id is null),
  ac as (select count(*) as cartes from sources_candidats, j
          where statut <> 'ecarte' and agent = p_agent and sujet_id is null
            and (created_at at time zone 'Europe/Paris')::date = j.jour),
  s as (select su.*, (select nom from labels where id = su.label_id) as label,
               (select coalesce(sum(cout_usd), 0) from sources_recherches where sujet_id = su.id) as depense,
               (select count(*) from sources_candidats where sujet_id = su.id and statut <> 'ecarte') as cartes
          from sources_sujets su where su.agent = p_agent and su.statut = 'pris')
  select jsonb_build_object(
    'jour', j.jour,
    'plafond_usd', (r.valeur->>'plafond_usd_jour')::numeric,
    'depense_usd', d.depense,
    'reste_usd', greatest((r.valeur->>'plafond_usd_jour')::numeric - d.depense, 0),
    'cartes_par_jour', (r.valeur->>'cartes_par_jour')::int,
    'cartes_du_jour', c.cartes,
    'langues', r.valeur->'langues',
    'parts', r.valeur->'parts',
    'sujets_en_attente', (select count(*) from sources_sujets, j j2 where statut = 'en_attente' and sources_sujets.jour <= j2.jour))
  || case when p_agent is null then '{}'::jsonb else jsonb_build_object(
    'agent', p_agent,
    'agent_connu', exists (select 1 from a),
    'couloir', (select agent->>'couloir' from a),
    'consigne_couloir', (select agent->>'consigne' from a),
    'libre', jsonb_build_object(
      'plafond_usd', (r.valeur->>'libre_usd')::numeric,
      'depense_usd', (select depense from al),
      'reste_usd', greatest(least((r.valeur->>'libre_usd')::numeric - (select depense from al),
                                  (r.valeur->>'plafond_usd_jour')::numeric - d.depense), 0),
      'cartes_max', (r.valeur->>'cartes_par_jour')::int,
      'cartes', (select cartes from ac)),
    'sujet', (select jsonb_build_object(
      'id', s.id, 'sujet', s.sujet, 'consigne', s.consigne, 'langues', to_jsonb(s.langues), 'label', s.label,
      'budget_usd', s.budget_usd, 'depense_usd', s.depense,
      'reste_usd', greatest(least(s.budget_usd - s.depense, (r.valeur->>'plafond_usd_jour')::numeric - d.depense), 0),
      'cartes_max', s.cartes_max, 'cartes', s.cartes) from s)) end
  from r, j, d, c;
$function$;

comment on function public.sources_eclaireur_budget(text) is
  'Sources (0685, 0853) : le budget Apify des agents éclaireurs pour aujourd''hui (plafond commun, dépensé, reste) et leurs réglages. Avec un agent : son couloir, sa recherche libre (`libre`) et le sujet qu''il tient (`sujet`), chacun avec ce qu''il peut encore dépenser.';

revoke all on function public.sources_eclaireur_budget(text) from public, anon;
grant execute on function public.sources_eclaireur_budget(text) to authenticated, service_role;
revoke all on function public.sources_sujet_ajouter(text, text, text[], uuid, numeric, integer, date) from public, anon;
grant execute on function public.sources_sujet_ajouter(text, text, text[], uuid, numeric, integer, date) to authenticated, service_role;
revoke all on function public.sources_sujet_annuler(uuid) from public, anon;
grant execute on function public.sources_sujet_annuler(uuid) to authenticated, service_role;
revoke all on function public.sources_sujet_prendre(text) from public, anon, authenticated;
grant execute on function public.sources_sujet_prendre(text) to service_role;
revoke all on function public.sources_sujet_rendre(uuid, text) from public, anon, authenticated;
grant execute on function public.sources_sujet_rendre(uuid, text) to service_role;
