-- 0630 : la boucle de correction (08/11).
--
-- Les relecteurs natifs écrivent une remarque par duel (0626), slide par
-- slide : ce qui sonne traduit, pourquoi, ce qu'ils auraient écrit. Jusqu'ici
-- ces remarques ne nourrissaient que le candidat `ancree` des duels, en vrac.
-- Désormais chaque remarque est découpée en corrections atomiques
-- (`corrections_natives` : un fragment fautif, sa correction, un type), que
-- l'admin retient ou écarte (Relecture native → Corrections). Les corrections
-- RETENUES d'une langue entrent dans la chaîne de production :
--  - la traduction (`traduireBaseDeck`, composer) reçoit le bloc
--    `corrections_natives_bloc(langue)` avec ses règles ;
--  - le placement reçoit celles de type `placement` en exemples.
-- L'extraction est faite par `ab-traduction` (action `corrections_extraire`),
-- vote par vote (Gemini), lancée par le cron `ab-corrections` toutes les dix
-- minutes tant qu'il reste des remarques non traitées, ou à la main.
--
-- Retour arrière : drop table public.corrections_natives ;
-- alter table public.ab_traduction_votes drop column corrections_extraites_le,
-- drop column corrections_extraction_erreur ; cron.unschedule('ab-corrections').

set lock_timeout = '5s';

create table if not exists public.corrections_natives (
  id            uuid primary key default gen_random_uuid(),
  langue        text not null,
  vote_id       uuid references public.ab_traduction_votes (id) on delete set null,
  duel_id       uuid references public.ab_traduction_duels (id) on delete set null,
  relecteur_id  uuid references public.relecteurs_natifs (id) on delete set null,
  version       text check (version in ('actuel', 'candidat', 'les_deux')),
  slide         integer,
  type          text not null check (type in ('calque', 'registre', 'vocabulaire', 'placement', 'longueur', 'casse', 'sens', 'autre')),
  fautif        text not null check (length(btrim(fautif)) between 1 and 400),
  corrige       text check (corrige is null or length(corrige) <= 600),
  explication   text check (explication is null or length(explication) <= 600),
  statut        text not null default 'proposee' check (statut in ('proposee', 'retenue', 'ecartee')),
  decide_par    uuid references auth.users (id) on delete set null,
  decide_le     timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

comment on table public.corrections_natives is
  'Boucle de correction (0630) : les remarques des relecteurs natifs découpées en corrections atomiques. `retenue` : entre dans la traduction (bloc corrections_natives_bloc) et, pour le type placement, dans les exemples du placement.';

create index if not exists corrections_natives_langue_statut on public.corrections_natives (langue, statut, created_at desc);

alter table public.corrections_natives enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'corrections_natives' and policyname = 'corrections_natives_admin') then
    create policy corrections_natives_admin on public.corrections_natives for all to authenticated
      using (public.is_admin()) with check (public.is_admin());
  end if;
end $$;
grant select, insert, update, delete on public.corrections_natives to authenticated;
grant all on public.corrections_natives to service_role;

-- Le vote dont les corrections ont été extraites (ou dont l'extraction a échoué).
alter table public.ab_traduction_votes
  add column if not exists corrections_extraites_le timestamptz,
  add column if not exists corrections_extraction_erreur text;

-- Reste-t-il une remarque à découper ? (garde du cron)
create or replace function public.corrections_a_extraire()
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (
    select 1 from ab_traduction_votes v
     where v.remarque is not null and btrim(v.remarque) <> ''
       and v.corrections_extraites_le is null
  );
$$;

-- Le bloc ajouté aux règles de traduction d'une langue : les corrections
-- retenues, les plus récentes d'abord. Une seule source pour le moteur et
-- l'aperçu de l'admin. Vide (null) sans correction retenue.
create or replace function public.corrections_natives_bloc(p_langue text, p_max integer default 30)
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
  from (select * from corrections_natives
         where lower(langue) = lower(p_langue) and statut = 'retenue'
         order by created_at desc
         limit greatest(coalesce(p_max, 30), 1)) c;
$$;

grant execute on function public.corrections_natives_bloc(text, integer) to authenticated, service_role;
grant execute on function public.corrections_a_extraire() to service_role;

-- ---------------------------------------------------------------------------
-- Tâche planifiée : toutes les dix minutes, seulement s'il reste des remarques
-- ---------------------------------------------------------------------------
do $cron$
declare
  template text;
  cmd text;
begin
  if exists (select 1 from cron.job where jobname = 'ab-corrections') then
    perform cron.unschedule('ab-corrections');
  end if;
  select c.command into template
    from cron.job c
   where position('x-cron-secret' in c.command) > 0
     and position('functions/v1/' in c.command) > 0
   order by case when c.jobname = 'ab-lots' then 0 when c.jobname = 'exemples-natifs' then 1 else 2 end
   limit 1;
  if template is null then
    raise notice 'ab-corrections : aucun cron modèle avec secret, à planifier à la main';
    return;
  end if;
  cmd := regexp_replace(template, 'functions/v1/[a-z0-9-]+', 'functions/v1/ab-traduction', 'i');
  cmd := regexp_replace(cmd, 'body\s*:=\s*''[^'']*''::jsonb', 'body := ''{"action":"corrections_extraire"}''::jsonb', 'i');
  cmd := regexp_replace(cmd, '\s+where\s+public\.[a-z_]+\(\)\s*;?\s*$', '', 'i');
  cmd := regexp_replace(cmd, ';\s*$', '') || ' where public.corrections_a_extraire();';
  if position('"corrections_extraire"' in cmd) = 0 or position('functions/v1/ab-traduction' in cmd) = 0 then
    raise notice 'ab-corrections : réécriture de la commande échouée';
    return;
  end if;
  perform cron.schedule('ab-corrections', '*/10 * * * *', cmd);
end
$cron$;

notify pgrst, 'reload schema';
