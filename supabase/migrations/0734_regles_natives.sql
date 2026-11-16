-- 0734 : les règles natives de chaque langue, consolidées depuis les
-- corrections retenues et lues par la traduction de production (16/11).
--
-- Jusqu'ici une correction retenue (0630) n'entrait dans la traduction que
-- tant qu'elle était parmi les plus récentes (30, puis 100 depuis 0730) : les
-- anciennes finissaient par sortir du bloc. La fiche langue (`bleo_fiches`)
-- ne les reprend pas, et la production ne la lit pas.
--
-- Désormais, chaque langue a ses RÈGLES NATIVES, versionnées :
--  - `regles_natives` : une version par consolidation. Gemini fusionne la
--    version validée précédente et les corrections retenues qu'elle ne couvre
--    pas encore en règles sans doublon (`ab-traduction`, action
--    `regles_consolider`). La version arrive « proposee » ; l'admin la relit,
--    la retouche au besoin et la valide (Relecture native → Règles). Une seule
--    version validée et une seule proposée par langue.
--  - `corrections_ids` : les corrections retenues que la version couvre
--    (celles de la version précédente comprises). Rien n'est perdu : une
--    correction retenue est soit dans les règles validées, soit dans les
--    retours récents du bloc.
--  - `corrections_natives_bloc(langue)` (même signature, mêmes appels) :
--    les règles validées de la langue, puis les corrections retenues qu'elles
--    ne couvrent pas encore (sans doublon, 100 au plus, comme 0730).
--  - cron `regles-natives` : le lundi de 5 h 17 à 10 h 17 UTC, toutes les
--    heures, seulement s'il reste une langue à consolider
--    (`regles_natives_a_consolider()`), après les relectures du samedi et le
--    tri du week-end. Chaque appel consolide ce qui tient dans son budget.
--
-- Retour arrière : select cron.unschedule('regles-natives') ;
--   rejouer corrections_natives_bloc de 0730 ;
--   drop function public.regles_natives_valider(uuid, text), public.regles_natives_a_consolider();
--   drop table public.regles_natives.

set lock_timeout = '5s';

create table if not exists public.regles_natives (
  id              uuid primary key default gen_random_uuid(),
  langue          text not null,
  version         integer not null check (version >= 1),
  contenu         text not null check (length(btrim(contenu)) between 1 and 30000),
  statut          text not null default 'proposee' check (statut in ('proposee', 'validee', 'remplacee', 'rejetee')),
  corrections_ids uuid[] not null default '{}',
  auteur          text,
  modele          text,
  valide_par      uuid references auth.users (id) on delete set null,
  valide_le       timestamptz,
  created_at      timestamptz not null default now(),
  unique (langue, version)
);

comment on table public.regles_natives is
  'Règles natives d''une langue (0734) : les corrections retenues des relecteurs consolidées par Gemini, versionnées, validées par l''admin, lues par la traduction (corrections_natives_bloc).';

create unique index if not exists regles_natives_une_validee on public.regles_natives (langue) where statut = 'validee';
create unique index if not exists regles_natives_une_proposee on public.regles_natives (langue) where statut = 'proposee';

alter table public.regles_natives enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'regles_natives' and policyname = 'regles_natives_admin') then
    create policy regles_natives_admin on public.regles_natives for all to authenticated
      using (public.is_admin()) with check (public.is_admin());
  end if;
end $$;
grant select, insert, update, delete on public.regles_natives to authenticated;
grant all on public.regles_natives to service_role;

-- Valider une version proposée (éventuellement retouchée) : la validée
-- d'avant passe « remplacee ».
create or replace function public.regles_natives_valider(p_id uuid, p_contenu text default null)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v public.regles_natives%rowtype;
begin
  if not public.is_admin() then
    raise exception 'regles_natives_valider : réservé à l''admin' using errcode = '42501';
  end if;
  select * into v from public.regles_natives where id = p_id for update;
  if not found then
    raise exception 'regles_natives_valider : version introuvable' using errcode = '22023';
  end if;
  if v.statut <> 'proposee' then
    raise exception 'regles_natives_valider : seule une version proposée se valide' using errcode = '22023';
  end if;
  if p_contenu is not null and length(btrim(p_contenu)) = 0 then
    raise exception 'regles_natives_valider : les règles sont vides' using errcode = '22023';
  end if;
  update public.regles_natives set statut = 'remplacee'
   where langue = v.langue and statut = 'validee';
  update public.regles_natives
     set statut = 'validee',
         contenu = coalesce(nullif(btrim(p_contenu), ''), contenu),
         valide_par = auth.uid(),
         valide_le = now()
   where id = p_id;
  return p_id;
end;
$$;
revoke all on function public.regles_natives_valider(uuid, text) from public, anon;
grant execute on function public.regles_natives_valider(uuid, text) to authenticated, service_role;

-- Garde du cron : une langue a des corrections retenues que ses règles
-- validées ne couvrent pas, et aucune version n'attend déjà la validation.
create or replace function public.regles_natives_a_consolider()
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (
    select 1
      from corrections_natives c
     where c.statut = 'retenue'
       and not exists (select 1 from regles_natives p where p.langue = lower(c.langue) and p.statut = 'proposee')
       and not exists (select 1 from regles_natives v where v.langue = lower(c.langue) and v.statut = 'validee'
                        and c.id = any (v.corrections_ids))
  );
$$;
revoke all on function public.regles_natives_a_consolider() from public, anon, authenticated;
grant execute on function public.regles_natives_a_consolider() to service_role;

-- Le bloc ajouté aux règles de traduction d'une langue : ses règles natives
-- validées, puis les corrections retenues qu'elles ne couvrent pas encore.
create or replace function public.corrections_natives_bloc(p_langue text, p_max integer default 100)
returns text
language sql
stable
security invoker
set search_path to 'public'
as $$
  with regles as (
    select contenu, corrections_ids from regles_natives
     where langue = lower(p_langue) and statut = 'validee'
     limit 1
  ), recentes as (
    select * from (
      select * from (
        select distinct on (lower(btrim(c.fautif))) c.*
          from corrections_natives c
         where lower(c.langue) = lower(p_langue) and c.statut = 'retenue'
           and not exists (select 1 from regles r where c.id = any (r.corrections_ids))
         order by lower(btrim(c.fautif)), c.created_at desc
      ) u
      order by created_at desc
      limit greatest(coalesce(p_max, 100), 1)
    ) l
  ), bloc_regles as (
    select E'=== RÈGLES DES RELECTEURS NATIFS (' || upper(p_langue) || E') ===\n'
           || E'Des natifs relisent nos posts chaque semaine. Leurs retours, rassemblés en règles. Applique-les toutes :\n'
           || btrim(contenu) as texte
      from regles
  ), bloc_recentes as (
    select case when count(*) = 0 then null else
      E'=== RETOURS DES RELECTEURS NATIFS (' || upper(p_langue) || E') ===\n'
      || E'Des natifs ont relu nos traductions et relevé ceci. Applique ces corrections, et ne refais pas ces erreurs dans des phrases voisines :\n'
      || string_agg(
           '- [' || r.type || '] '
           || case when r.corrige is not null and btrim(r.corrige) <> ''
                   then 'au lieu de « ' || btrim(r.fautif) || ' », écris « ' || btrim(r.corrige) || ' »'
                   else 'évite « ' || btrim(r.fautif) || ' »' end
           || case when r.explication is not null and btrim(r.explication) <> '' then ' (' || btrim(r.explication) || ')' else '' end,
           E'\n' order by r.created_at desc)
    end as texte
      from recentes r
  )
  select nullif(concat_ws(E'\n\n', (select texte from bloc_regles), (select texte from bloc_recentes)), '');
$$;
grant execute on function public.corrections_natives_bloc(text, integer) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Tâche planifiée : le lundi, toutes les heures de 5 h 17 à 10 h 17 UTC,
-- seulement s'il reste une langue à consolider. Même modèle que
-- `ab-corrections` (0630) : la commande d'un cron existant, secret compris.
-- ---------------------------------------------------------------------------
do $cron$
declare
  template text;
  cmd text;
begin
  if exists (select 1 from cron.job where jobname = 'regles-natives') then
    perform cron.unschedule('regles-natives');
  end if;
  select c.command into template
    from cron.job c
   where position('x-cron-secret' in c.command) > 0
     and position('functions/v1/' in c.command) > 0
   order by case when c.jobname = 'ab-corrections' then 0 when c.jobname = 'ab-lots' then 1 else 2 end
   limit 1;
  if template is null then
    raise notice 'regles-natives : aucun cron modèle avec secret, à planifier à la main';
    return;
  end if;
  cmd := regexp_replace(template, 'functions/v1/[a-z0-9-]+', 'functions/v1/ab-traduction', 'i');
  cmd := regexp_replace(cmd, 'body\s*:=\s*''[^'']*''::jsonb', 'body := ''{"action":"regles_consolider"}''::jsonb', 'i');
  cmd := regexp_replace(cmd, '\s+where\s+public\.[a-z_]+\(\)\s*;?\s*$', '', 'i');
  cmd := regexp_replace(cmd, ';\s*$', '') || ' where public.regles_natives_a_consolider();';
  if position('"regles_consolider"' in cmd) = 0 or position('functions/v1/ab-traduction' in cmd) = 0 then
    raise notice 'regles-natives : réécriture de la commande échouée';
    return;
  end if;
  perform cron.schedule('regles-natives', '17 5-10 * * 1', cmd);
end;
$cron$;

notify pgrst, 'reload schema';
