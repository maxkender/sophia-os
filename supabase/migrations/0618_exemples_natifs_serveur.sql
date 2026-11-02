-- 0618 : Relecture native · la banque d'exemples natifs tourne sur le serveur (30/10).
--
-- Jusqu'ici la page pilotait tout : les comptes collés partaient par paquets
-- de 4, puis les slideshows se lisaient 3 par 3 depuis le navigateur. Fermer
-- l'onglet arrêtait tout. Désormais l'admin colle ses comptes et peut fermer
-- la page : ils sont notés ici, et la tâche planifiée `exemples-natifs` passe
-- chaque minute, seulement s'il reste du travail, pour chercher les comptes en
-- attente et lire les slideshows en attente.
--
-- Un passage prend ses lignes (`pris_le`) : deux passages qui se chevauchent
-- ne font jamais la même ligne deux fois. Une ligne prise trois fois sans
-- aboutir (fonction coupée à 150 s, Apify en panne) est abandonnée, avec son
-- erreur.
--
-- Retour arrière :
--   select cron.unschedule('exemples-natifs');
--   drop function public.exemples_natifs_a_faire();
--   drop function public.exemples_natifs_prendre_comptes(integer);
--   drop function public.exemples_natifs_prendre_lectures(integer);
--   drop table public.exemples_natifs_comptes;
--   alter table public.exemples_natifs drop column pris_le, drop column tentatives;

set lock_timeout = '5s';

-- ---------------------------------------------------------------------------
-- Les comptes collés, à chercher
-- ---------------------------------------------------------------------------
create table if not exists public.exemples_natifs_comptes (
  id          uuid primary key default gen_random_uuid(),
  langue      text not null,
  pseudo      text not null,
  label_id    uuid references public.labels (id) on delete set null,
  statut      text not null default 'en_attente'
                check (statut in ('en_attente', 'fait', 'erreur')),
  posts       integer,
  slideshows  integer,
  verifies    boolean,
  ajoutes     integer,
  erreur      text,
  pris_le     timestamptz,
  tentatives  integer not null default 0,
  created_by  uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.exemples_natifs_comptes is
  'Banque d''exemples natifs (0618) : les comptes collés par l''admin, cherchés par la tâche planifiée exemples-natifs.';
comment on column public.exemples_natifs_comptes.statut is
  'en_attente : à chercher (en cours si pris_le est récent) ; fait : slideshows ajoutés à la banque ; erreur : voir la colonne erreur.';
comment on column public.exemples_natifs_comptes.erreur is
  'Pour une ligne en attente : l''erreur du dernier essai, réessayée au passage suivant.';

create index if not exists exemples_natifs_comptes_file
  on public.exemples_natifs_comptes (statut, created_at);

drop trigger if exists exemples_natifs_comptes_horodater on public.exemples_natifs_comptes;
create trigger exemples_natifs_comptes_horodater
  before update on public.exemples_natifs_comptes
  for each row execute function public.kit_natif_horodater();

alter table public.exemples_natifs_comptes enable row level security;

do $$
begin
  -- L'admin seulement ; la fonction passe par le service.
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'exemples_natifs_comptes'
                  and policyname = 'exemples_natifs_comptes admin') then
    create policy "exemples_natifs_comptes admin" on public.exemples_natifs_comptes
      for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
  end if;
end;
$$;

grant select, insert, update, delete on public.exemples_natifs_comptes to authenticated;
grant all on public.exemples_natifs_comptes to service_role;

-- ---------------------------------------------------------------------------
-- Les slideshows à lire : pris par un passage
-- ---------------------------------------------------------------------------
alter table public.exemples_natifs
  add column if not exists pris_le timestamptz,
  add column if not exists tentatives integer not null default 0;

comment on column public.exemples_natifs.pris_le is
  'Pris par un passage de lecture (0618) ; libre à nouveau après 5 minutes si le passage a été coupé.';

create index if not exists exemples_natifs_file
  on public.exemples_natifs (statut, created_at) where statut = 'en_attente';

-- ---------------------------------------------------------------------------
-- Prendre du travail (service seulement)
-- ---------------------------------------------------------------------------

-- Les comptes à chercher, les plus anciens d'abord.
create or replace function public.exemples_natifs_prendre_comptes(p_n integer)
returns setof public.exemples_natifs_comptes
language plpgsql
set search_path to 'public'
as $$
begin
  -- Pris trois fois sans aboutir : abandonné.
  update exemples_natifs_comptes
     set statut = 'erreur',
         erreur = coalesce(erreur, 'Recherche interrompue trois fois.') || ' Recolle le compte pour réessayer.',
         pris_le = null
   where statut = 'en_attente' and tentatives >= 3
     and (pris_le is null or pris_le < now() - interval '5 minutes');

  return query
  update exemples_natifs_comptes c
     set pris_le = now(), tentatives = c.tentatives + 1
   where c.id in (
           select f.id from exemples_natifs_comptes f
            where f.statut = 'en_attente'
              and (f.pris_le is null or f.pris_le < now() - interval '5 minutes')
            order by f.created_at
            limit p_n
              for update skip locked)
  returning c.*;
end;
$$;

-- Les slideshows à lire, les plus anciens d'abord.
create or replace function public.exemples_natifs_prendre_lectures(p_n integer)
returns table (id uuid, source_url text, tentatives integer)
language plpgsql
set search_path to 'public'
as $$
#variable_conflict use_column
begin
  update exemples_natifs e
     set statut = 'erreur',
         erreur = coalesce(e.erreur, 'Lecture interrompue trois fois.') || ' Clique sur « Relire » pour réessayer.',
         pris_le = null
   where e.statut = 'en_attente' and e.tentatives >= 3
     and (e.pris_le is null or e.pris_le < now() - interval '5 minutes');

  return query
  update exemples_natifs e
     set pris_le = now(), tentatives = e.tentatives + 1
   where e.id in (
           select f.id from exemples_natifs f
            where f.statut = 'en_attente'
              and (f.pris_le is null or f.pris_le < now() - interval '5 minutes')
            order by f.created_at
            limit p_n
              for update skip locked)
  returning e.id, e.source_url, e.tentatives;
end;
$$;

-- Reste-t-il du travail libre ? La tâche planifiée n'appelle la fonction que si oui.
create or replace function public.exemples_natifs_a_faire()
returns boolean
language sql
stable
set search_path to 'public'
as $$
  select exists (select 1 from exemples_natifs_comptes
                  where statut = 'en_attente' and (pris_le is null or pris_le < now() - interval '5 minutes'))
      or exists (select 1 from exemples_natifs
                  where statut = 'en_attente' and (pris_le is null or pris_le < now() - interval '5 minutes'));
$$;

revoke all on function public.exemples_natifs_prendre_comptes(integer) from public, anon, authenticated;
revoke all on function public.exemples_natifs_prendre_lectures(integer) from public, anon, authenticated;
revoke all on function public.exemples_natifs_a_faire() from public, anon, authenticated;
grant execute on function public.exemples_natifs_prendre_comptes(integer) to service_role;
grant execute on function public.exemples_natifs_prendre_lectures(integer) to service_role;
grant execute on function public.exemples_natifs_a_faire() to service_role;

-- ---------------------------------------------------------------------------
-- Tâche planifiée : chaque minute, seulement s'il reste du travail
-- ---------------------------------------------------------------------------
do $cron$
declare
  template text;
  cmd text;
begin
  if exists (select 1 from cron.job where jobname = 'exemples-natifs') then
    perform cron.unschedule('exemples-natifs');
  end if;
  -- L'URL et l'en-tête x-cron-secret d'un cron existant, sans jamais écrire le
  -- secret ici (comme 0373).
  select c.command into template
    from cron.job c
   where position('x-cron-secret' in c.command) > 0
     and position('functions/v1/' in c.command) > 0
   order by case when c.jobname = 'recrues-check' then 0 when c.jobname = 'upwork-verifier' then 1 else 2 end
   limit 1;
  if template is null then
    raise notice 'exemples-natifs : aucun cron modèle avec secret, à planifier à la main';
    return;
  end if;
  cmd := regexp_replace(template, 'functions/v1/[a-z0-9-]+', 'functions/v1/exemples-natifs', 'i');
  cmd := regexp_replace(cmd, 'body\s*:=\s*''[^'']*''::jsonb', 'body := ''{"tourner":{}}''::jsonb', 'i');
  -- Sans travail libre, aucun appel : la tâche ne coûte rien au repos.
  cmd := regexp_replace(cmd, ';\s*$', '') || ' where public.exemples_natifs_a_faire();';
  if position('"tourner"' in cmd) = 0 or position('functions/v1/exemples-natifs' in cmd) = 0 then
    raise notice 'exemples-natifs : réécriture de la commande échouée';
    return;
  end if;
  perform cron.schedule('exemples-natifs', '* * * * *', cmd);
end
$cron$;

notify pgrst, 'reload schema';
