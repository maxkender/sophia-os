-- 0619 : Relecture native · les fiches langue (30/10).
--
-- Une fiche par langue : comment écrivent les créateurs natifs de cette langue
-- (registre, rythme, accroches, vocabulaire, familles de ton, spécificités
-- locales, ce que notre traduction rate). Elle condense la banque d'exemples
-- natifs (0423) : la réécriture native lira la fiche, jamais les exemples
-- eux-mêmes (trop de tokens, et ils orientent trop le slideshow). Rien ne la
-- lit encore : elle sera branchée sur le comparateur de Tests à l'étape 3.
--
-- Même mécanique que les fiches appli (0376) : l'admin l'écrit ou la colle
-- dans l'OS (Relecture native → Fiches langue), chaque enregistrement qui
-- change le texte garde une version. Brief de rédaction :
-- docs/fiches-langue-brief.md.
--
-- Retour arrière :
--   drop table public.fiches_langue_versions, public.fiches_langue;
--   drop function public.fiches_langue_versionner();

set lock_timeout = '5s';

create table if not exists public.fiches_langue (
  langue      text primary key,
  contenu     text not null default '',
  updated_at  timestamptz not null default now(),
  updated_by  uuid
);

comment on table public.fiches_langue is
  'Fiche langue (0619) : comment écrivent les natifs de la langue, condensé de la banque d''exemples natifs. Lue par la réécriture native.';
comment on column public.fiches_langue.contenu is
  'Fiche complète en Markdown (brief : docs/fiches-langue-brief.md).';

create table if not exists public.fiches_langue_versions (
  id          uuid primary key default gen_random_uuid(),
  langue      text not null,
  contenu     text not null,
  created_at  timestamptz not null default now(),
  created_by  uuid
);

create index if not exists fiches_langue_versions_langue_idx
  on public.fiches_langue_versions (langue, created_at desc);

-- L'auteur et l'heure viennent de la base (même fonction que les fiches appli).
drop trigger if exists fiches_langue_horodater on public.fiches_langue;
create trigger fiches_langue_horodater
  before insert or update on public.fiches_langue
  for each row execute function public.fiches_appli_horodater();

-- Une version par enregistrement qui change vraiment le texte.
create or replace function public.fiches_langue_versionner()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' or new.contenu is distinct from old.contenu then
    insert into public.fiches_langue_versions (langue, contenu, created_by)
    values (new.langue, new.contenu, new.updated_by);
  end if;
  return new;
end;
$$;

drop trigger if exists fiches_langue_versionner on public.fiches_langue;
create trigger fiches_langue_versionner
  after insert or update on public.fiches_langue
  for each row execute function public.fiches_langue_versionner();

alter table public.fiches_langue enable row level security;
alter table public.fiches_langue_versions enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'fiches_langue'
                  and policyname = 'fiches_langue admin') then
    create policy "fiches_langue admin" on public.fiches_langue
      for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'fiches_langue_versions'
                  and policyname = 'fiches_langue_versions lecture admin') then
    create policy "fiches_langue_versions lecture admin" on public.fiches_langue_versions
      for select to authenticated using ((select public.is_admin()));
  end if;
end;
$$;

grant select, insert, update, delete on public.fiches_langue to authenticated;
grant select on public.fiches_langue_versions to authenticated;
grant all on public.fiches_langue, public.fiches_langue_versions to service_role;

notify pgrst, 'reload schema';
