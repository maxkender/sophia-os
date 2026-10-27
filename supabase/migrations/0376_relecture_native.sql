-- 0376 : Relecture native · étape 1, les espaces d'écriture (27/10).
--
-- Prépare la réécriture native (page Notion « Révolution placement/traduction »)
-- sans rien brancher sur la production :
--  A) `relecteurs_natifs` : les posteurs choisis comme relecteurs natifs, un
--     par langue en principe. Statut : invite (choisi, il remplit son
--     questionnaire), actif, pause, retire.
--  B) `fiches_appli` : la fiche de chaque application, écrite par l'admin. Le
--     `contenu` est la vérité produit lue plus tard par les agents de langue ;
--     la `presentation_relecteur` est le texte court montré aux relecteurs.
--     `fiches_appli_versions` garde chaque version enregistrée.
--  C) `relecteur_questionnaire` : les réponses au questionnaire « Your country,
--     part by part » (une ligne par question ; `choix` pour la liste de mots).
--  D) `reglages.relecture_native` : l'espace relecteur est FERMÉ (même un
--     relecteur désigné ne voit rien et ne peut rien écrire tant que l'admin ne
--     l'ouvre pas) et la production est COUPÉE (aucune fonction ne la lit).
--
-- Additive : quatre tables, deux fonctions, une ligne de réglages créée
-- seulement si elle n'existe pas. Aucune donnée existante modifiée.
-- Retour arrière :
--   drop table public.relecteur_questionnaire, public.fiches_appli_versions,
--     public.fiches_appli, public.relecteurs_natifs;
--   drop function public.fiches_appli_horodater(), public.fiches_appli_versionner(),
--     public.relecteur_peut_ecrire(uuid), public.terminer_questionnaire_relecteur(uuid);
--   delete from public.reglages where cle = 'relecture_native';

-- ---------------------------------------------------------------------------
-- D) Les interrupteurs, coupés
-- ---------------------------------------------------------------------------
insert into public.reglages (cle, valeur)
values ('relecture_native', jsonb_build_object('espace_ouvert', false, 'production', false))
on conflict (cle) do nothing;

-- ---------------------------------------------------------------------------
-- A) Les relecteurs natifs
-- ---------------------------------------------------------------------------
create table if not exists public.relecteurs_natifs (
  id                       uuid primary key default gen_random_uuid(),
  profile_id               uuid not null references public.profiles (id) on delete cascade,
  langue                   text not null,
  statut                   text not null default 'invite'
                             check (statut in ('invite', 'actif', 'pause', 'retire')),
  note                     text,
  questionnaire_termine_at timestamptz,
  created_at               timestamptz not null default now(),
  created_by               uuid,
  updated_at               timestamptz not null default now(),
  unique (profile_id, langue)
);

comment on table public.relecteurs_natifs is
  'Posteurs choisis comme relecteurs natifs (0376). invite : choisi, remplit son questionnaire ; actif : validé ; pause ; retire.';

create index if not exists relecteurs_natifs_langue_idx on public.relecteurs_natifs (langue);

-- ---------------------------------------------------------------------------
-- B) Les fiches des applications, et leurs versions
-- ---------------------------------------------------------------------------
create table if not exists public.fiches_appli (
  application_id         uuid primary key references public.applications (id) on delete cascade,
  contenu                text not null default '',
  presentation_relecteur text not null default '',
  updated_at             timestamptz not null default now(),
  updated_by             uuid
);

comment on column public.fiches_appli.contenu is
  'Fiche complète en Markdown, écrite par l''admin : ce que fait l''appli, ce qu''on peut affirmer ou non, son nom par langue, ses concurrents. Lue par les agents de langue (0376).';
comment on column public.fiches_appli.presentation_relecteur is
  'Texte court montré aux relecteurs natifs (« What is Sophia? »).';

create table if not exists public.fiches_appli_versions (
  id                     uuid primary key default gen_random_uuid(),
  application_id         uuid not null references public.applications (id) on delete cascade,
  contenu                text not null,
  presentation_relecteur text not null,
  created_at             timestamptz not null default now(),
  created_by             uuid
);

create index if not exists fiches_appli_versions_appli_idx
  on public.fiches_appli_versions (application_id, created_at desc);

-- L'auteur et l'heure viennent de la base, pas du navigateur.
create or replace function public.fiches_appli_horodater()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  new.updated_by := coalesce(auth.uid(), new.updated_by);
  return new;
end;
$$;

drop trigger if exists fiches_appli_horodater on public.fiches_appli;
create trigger fiches_appli_horodater
  before insert or update on public.fiches_appli
  for each row execute function public.fiches_appli_horodater();

-- Une version par enregistrement qui change vraiment le texte.
create or replace function public.fiches_appli_versionner()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT'
     or new.contenu is distinct from old.contenu
     or new.presentation_relecteur is distinct from old.presentation_relecteur then
    insert into public.fiches_appli_versions (application_id, contenu, presentation_relecteur, created_by)
    values (new.application_id, new.contenu, new.presentation_relecteur, new.updated_by);
  end if;
  return new;
end;
$$;

drop trigger if exists fiches_appli_versionner on public.fiches_appli;
create trigger fiches_appli_versionner
  after insert or update on public.fiches_appli
  for each row execute function public.fiches_appli_versionner();

-- ---------------------------------------------------------------------------
-- C) Les réponses au questionnaire
-- ---------------------------------------------------------------------------
create table if not exists public.relecteur_questionnaire (
  relecteur_id uuid not null references public.relecteurs_natifs (id) on delete cascade,
  question_cle text not null,
  choix        text check (choix is null or choix in ('anglais', 'notre_mot', 'personne')),
  reponse      text not null default '',
  updated_at   timestamptz not null default now(),
  primary key (relecteur_id, question_cle)
);

comment on table public.relecteur_questionnaire is
  'Réponses au questionnaire « Your country, part by part » (0376). question_cle : clé stable de src/features/relectureNative/questionnaire.ts ; choix : seulement pour la liste de mots.';

-- Le relecteur écrit seulement ses propres réponses, seulement s'il est invité
-- ou actif, et seulement quand l'admin a ouvert l'espace.
create or replace function public.relecteur_peut_ecrire(p_relecteur_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
           select 1
           from public.relecteurs_natifs r
           where r.id = p_relecteur_id
             and r.profile_id = auth.uid()
             and r.statut in ('invite', 'actif')
         )
     and coalesce(
           (select (g.valeur ->> 'espace_ouvert')::boolean
            from public.reglages g
            where g.cle = 'relecture_native'),
           false
         );
$$;

-- « J'ai fini » : le relecteur ne modifie pas sa ligne de relecteur, il passe
-- par cette fonction, qui vérifie les mêmes conditions.
create or replace function public.terminer_questionnaire_relecteur(p_relecteur_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.relecteur_peut_ecrire(p_relecteur_id) then
    raise exception 'Espace relecteur fermé ou relecteur inconnu';
  end if;
  update public.relecteurs_natifs
     set questionnaire_termine_at = now(), updated_at = now()
   where id = p_relecteur_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Droits
-- ---------------------------------------------------------------------------
alter table public.relecteurs_natifs enable row level security;
alter table public.fiches_appli enable row level security;
alter table public.fiches_appli_versions enable row level security;
alter table public.relecteur_questionnaire enable row level security;

do $$
begin
  -- Relecteurs : l'admin gère tout, le posteur lit ses propres lignes.
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'relecteurs_natifs'
                  and policyname = 'relecteurs_natifs admin') then
    create policy "relecteurs_natifs admin" on public.relecteurs_natifs
      for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'relecteurs_natifs'
                  and policyname = 'relecteurs_natifs lecture soi') then
    create policy "relecteurs_natifs lecture soi" on public.relecteurs_natifs
      for select to authenticated using (profile_id = (select auth.uid()));
  end if;

  -- Fiches appli : l'admin seulement (les agents passent par le service).
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'fiches_appli'
                  and policyname = 'fiches_appli admin') then
    create policy "fiches_appli admin" on public.fiches_appli
      for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'fiches_appli_versions'
                  and policyname = 'fiches_appli_versions lecture admin') then
    create policy "fiches_appli_versions lecture admin" on public.fiches_appli_versions
      for select to authenticated using ((select public.is_admin()));
  end if;

  -- Questionnaire : l'admin lit tout ; le relecteur lit ses réponses et les
  -- écrit seulement quand il en a le droit (relecteur_peut_ecrire).
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'relecteur_questionnaire'
                  and policyname = 'relecteur_questionnaire admin') then
    create policy "relecteur_questionnaire admin" on public.relecteur_questionnaire
      for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'relecteur_questionnaire'
                  and policyname = 'relecteur_questionnaire lecture soi') then
    create policy "relecteur_questionnaire lecture soi" on public.relecteur_questionnaire
      for select to authenticated using (
        exists (select 1 from public.relecteurs_natifs r
                where r.id = relecteur_id and r.profile_id = (select auth.uid()))
      );
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'relecteur_questionnaire'
                  and policyname = 'relecteur_questionnaire ecriture soi') then
    create policy "relecteur_questionnaire ecriture soi" on public.relecteur_questionnaire
      for insert to authenticated with check (public.relecteur_peut_ecrire(relecteur_id));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'relecteur_questionnaire'
                  and policyname = 'relecteur_questionnaire modification soi') then
    create policy "relecteur_questionnaire modification soi" on public.relecteur_questionnaire
      for update to authenticated
      using (public.relecteur_peut_ecrire(relecteur_id))
      with check (public.relecteur_peut_ecrire(relecteur_id));
  end if;
end $$;

revoke all on public.relecteurs_natifs, public.fiches_appli, public.fiches_appli_versions,
  public.relecteur_questionnaire from public, anon;
grant select, insert, update, delete on public.relecteurs_natifs, public.fiches_appli,
  public.relecteur_questionnaire to authenticated;
grant select on public.fiches_appli_versions to authenticated;
grant all on public.relecteurs_natifs, public.fiches_appli, public.fiches_appli_versions,
  public.relecteur_questionnaire to service_role;

revoke all on function public.relecteur_peut_ecrire(uuid) from public, anon;
revoke all on function public.terminer_questionnaire_relecteur(uuid) from public, anon;
grant execute on function public.relecteur_peut_ecrire(uuid) to authenticated, service_role;
grant execute on function public.terminer_questionnaire_relecteur(uuid) to authenticated, service_role;
