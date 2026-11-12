-- 0685 : la mémoire et le budget de l'agent éclaireur (suite de 0684).
--
--   * `sources_candidats.statut` gagne `ecarte` : un compte que l'agent a
--     relevé puis laissé de côté, avec la raison dans `pourquoi`. Il ne
--     s'affiche pas sur la page Sources ; il sert à ne pas payer deux fois le
--     relevé du même compte.
--   * `sources_recherches` : le journal de l'agent. Une ligne par lancement
--     Apify (une recherche par mots-clés ou un relevé de profils), avec ce
--     qu'il a coûté et ce qu'il a rendu.
--   * `reglages.eclaireur` : le plafond par jour (20 $, décision d'Adrien du
--     12/11), le nombre de cartes par jour, les langues et la part de chaque
--     piste. `sources_eclaireur_budget()` rend ce qui reste aujourd'hui.
--   * `sources_eclaireur_memoire` : par piste, langue et requête, ce qui a été
--     dépensé et ce que ça a donné (proposés, validés, refusés, écartés, r réel
--     des sources validées). L'agent la relit avant de choisir ses requêtes.
--   * `sources_candidats_rendement` ne compte plus les écartés comme proposés.
--
-- ✅ Appliquée le 2026-11-12 (MCP).
--
-- Retour arrière : drop view sources_eclaireur_memoire ; drop function
-- sources_eclaireur_budget ; drop table sources_recherches ; delete from
-- reglages where cle = 'eclaireur' ; delete from sources_candidats where
-- statut = 'ecarte', puis remettre la contrainte de statut de 0684.

set lock_timeout = '5s';

alter table public.sources_candidats drop constraint sources_candidats_statut_check;
alter table public.sources_candidats add constraint sources_candidats_statut_check
  check (statut in ('propose', 'plus_tard', 'valide', 'refuse', 'ecarte'));

create table public.sources_recherches (
  id uuid primary key default gen_random_uuid(),
  jour date not null default ((now() at time zone 'Europe/Paris')::date),
  sorte text not null check (sorte in ('recherche', 'profils')),
  piste text not null check (piste in ('ancien_agent', 'accroches', 'voisins', 'mots_cles', 'exploration')),
  langue text,
  pays text,
  -- Les mots-clés d'une recherche ; vide pour un relevé de profils.
  requete text,
  posts integer not null default 0,
  slideshows integer not null default 0,
  -- Comptes jamais vus (ni sources, ni comptes de publication, ni candidats).
  comptes_nouveaux integer not null default 0,
  cout_usd numeric(8, 2) not null default 0,
  note text,
  created_at timestamptz not null default now()
);
create index sources_recherches_jour_idx on public.sources_recherches (jour desc);

comment on table public.sources_recherches is
  'Sources (0685) : le journal de l''agent éclaireur, une ligne par lancement Apify, avec son coût et ce qu''il a rendu.';

alter table public.sources_recherches enable row level security;
create policy sources_recherches_admin on public.sources_recherches
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
grant select on public.sources_recherches to authenticated;
grant all on public.sources_recherches to service_role;

insert into public.reglages (cle, valeur)
values ('eclaireur', jsonb_build_object(
  'plafond_usd_jour', 20,
  'cartes_par_jour', 5,
  'langues', jsonb_build_array('en', 'de', 'it', 'tr', 'es', 'es-419'),
  'parts', jsonb_build_object('accroches', 40, 'voisins', 20, 'mots_cles', 20, 'exploration', 20)))
on conflict (cle) do nothing;

create or replace function public.sources_eclaireur_budget()
returns jsonb
language sql
stable
set search_path to 'public'
as $function$
  with r as (select valeur from reglages where cle = 'eclaireur'),
  j as (select (now() at time zone 'Europe/Paris')::date as jour),
  d as (select coalesce(sum(cout_usd), 0) as depense from sources_recherches, j where sources_recherches.jour = j.jour),
  c as (select count(*) as cartes from sources_candidats, j
         where statut <> 'ecarte' and (created_at at time zone 'Europe/Paris')::date = j.jour)
  select jsonb_build_object(
    'jour', j.jour,
    'plafond_usd', (r.valeur->>'plafond_usd_jour')::numeric,
    'depense_usd', d.depense,
    'reste_usd', greatest((r.valeur->>'plafond_usd_jour')::numeric - d.depense, 0),
    'cartes_par_jour', (r.valeur->>'cartes_par_jour')::int,
    'cartes_du_jour', c.cartes,
    'langues', r.valeur->'langues',
    'parts', r.valeur->'parts')
  from r, j, d, c;
$function$;

comment on function public.sources_eclaireur_budget() is
  'Sources (0685) : le budget Apify de l''agent éclaireur pour aujourd''hui (plafond, dépensé, reste) et ses réglages.';

revoke all on function public.sources_eclaireur_budget() from public, anon;
grant execute on function public.sources_eclaireur_budget() to authenticated, service_role;

create or replace view public.sources_candidats_rendement
  with (security_invoker = true)
as
  select c.piste,
         coalesce(c.requete, '') as requete,
         c.langue,
         count(*) filter (where c.statut <> 'ecarte') as proposes,
         count(*) filter (where c.statut = 'valide') as valides,
         count(*) filter (where c.statut = 'refuse') as refuses,
         count(sp.r_mediane) as sources_mesurees,
         round(avg(sp.r_mediane), 2) as r_moyen,
         string_agg(distinct c.raison_refus, ' · ') filter (where c.raison_refus is not null) as raisons_refus,
         count(*) filter (where c.statut = 'ecarte') as ecartes
    from public.sources_candidats c
    left join public.source_performance sp on sp.compte_reference_id = c.compte_reference_id
   group by c.piste, coalesce(c.requete, ''), c.langue;

create or replace view public.sources_eclaireur_memoire
  with (security_invoker = true)
as
  with r as (
    select piste, coalesce(langue, '') as langue, coalesce(requete, '') as requete,
           count(*) as lancements, sum(cout_usd) as cout_usd, sum(slideshows) as slideshows,
           sum(comptes_nouveaux) as comptes_nouveaux, max(jour) as dernier_jour
      from public.sources_recherches
     where sorte = 'recherche'
     group by 1, 2, 3
  )
  select coalesce(r.piste, c.piste) as piste,
         coalesce(r.langue, c.langue) as langue,
         coalesce(r.requete, c.requete) as requete,
         coalesce(r.lancements, 0) as lancements,
         coalesce(r.cout_usd, 0) as cout_usd,
         coalesce(r.slideshows, 0) as slideshows,
         coalesce(r.comptes_nouveaux, 0) as comptes_nouveaux,
         r.dernier_jour,
         coalesce(c.proposes, 0) as proposes,
         coalesce(c.valides, 0) as valides,
         coalesce(c.refuses, 0) as refuses,
         coalesce(c.ecartes, 0) as ecartes,
         c.r_moyen,
         c.raisons_refus
    from r
    full join public.sources_candidats_rendement c
      on c.piste = r.piste and c.langue = r.langue and c.requete = r.requete;

comment on view public.sources_eclaireur_memoire is
  'Sources (0685) : par piste, langue et requête, ce que l''agent éclaireur a dépensé et ce que ça a donné. À relire avant de choisir les requêtes du jour.';

grant select on public.sources_eclaireur_memoire to authenticated, service_role;
