-- 0321 : comment masters (TICKET 002) dans tous les pays de l'OS.
--
-- POURQUOI. Le test tournait sur deux langues (de, it) réglées en dur dans
-- `comment_master_regions`, avec un seuil par LANGUE. Or une langue couvre des
-- pays qui ne font pas les mêmes vues : `en` couvre les États-Unis comme le
-- Royaume-Uni, `ar` les Émirats comme Israël. Et le comment master n'était
-- qu'un texte libre, modifiable seulement en SQL.
--
-- CE QUI CHANGE.
--   * Une RÉGION = une langue, un comment master (un poster de l'OS, plus un
--     texte), un canal Slack privé. Les 24 nouvelles régions naissent
--     INACTIVES : une région ne s'active qu'avec un comment master ET un canal
--     dont la fonction a vérifié que le bot est membre (trigger ci-dessous).
--   * Un SEUIL PAR PAYS rattaché à une région (`comment_master_pays`), avec un
--     cadenas : le recalibrage automatique du lundi (fonction `comment-masters`,
--     cible ~1 post sur 20) ne touche jamais un pays sous cadenas. Modifier un
--     seuil à la main le verrouille.
--   * L'historique des comment masters (`comment_master_mandats`) : qui l'était,
--     de quand à quand. Un « Done » est crédité au comment master en poste à
--     l'heure du clic — c'est ce qui compte pour le bonus (10 $ les 20).
--   * Le suivi des relevés (`comment_master_suivis`, `comment_master_lots`) :
--     un post est relevé toutes les 2 h, abandonné à 6 h s'il fait moins de
--     20 % du seuil de son pays, et les relevés partent en runs Apify
--     asynchrones de 50 liens au plus. Les lots donnent le coût de la semaine.
--
-- ADDITIVE. L'ancien code (relevé horaire de/it à `regions.seuil_vues`) tourne
-- tel quel avec cette migration : les nouvelles régions sont inactives et
-- `seuil_vues` reste en place. À passer AVANT le merge. Le cron passe aux
-- 15 minutes dans 0322, APRÈS le déploiement de la fonction.
--
-- Retour arrière : drop des 5 nouvelles tables et des 3 fonctions, drop des
-- colonnes ajoutées, `alter column comment_master set not null`, et
-- `delete from comment_master_regions where langue not in ('de', 'it')`.

set lock_timeout = '10s';

-- ---------------------------------------------------------------------------
-- 1. Régions : le comment master devient un poster, le canal est vérifié
-- ---------------------------------------------------------------------------

alter table public.comment_master_regions
  add column if not exists comment_master_id uuid references public.profiles (id) on delete set null,
  -- Le canal dont la fonction a vérifié que le bot est membre. Une région ne
  -- s'allume que si c'est le canal en place (trigger plus bas).
  add column if not exists slack_verifie_canal text,
  add column if not exists slack_verifie_at timestamptz,
  add column if not exists slack_canal_nom text,
  -- Dernière erreur Slack (vérification ou envoi), affichée dans la page au
  -- lieu de rester dans les logs. Effacée au prochain succès.
  add column if not exists slack_erreur text,
  add column if not exists slack_erreur_at timestamptz,
  add column if not exists maj_at timestamptz not null default now();

-- Le texte reste, recopié du profil par le trigger : lisible en SQL sans jointure.
alter table public.comment_master_regions alter column comment_master drop not null;

comment on column public.comment_master_regions.comment_master_id is
  'Le comment master : un poster de l''OS. Historique dans comment_master_mandats.';
comment on column public.comment_master_regions.seuil_vues is
  'OBSOLÈTE depuis 0321 : le seuil vit par pays dans comment_master_pays. Gardé pour l''ancien code le temps du déploiement.';

insert into public.comment_master_regions (langue, region, actif) values
  ('tr', 'Turkey', false),
  ('fr', 'France and Belgium', false),
  ('es', 'Spain', false),
  ('es-419', 'Latin America', false),
  ('pt', 'Portugal', false),
  ('pt-BR', 'Brazil', false),
  ('hu', 'Hungary', false),
  ('pl', 'Poland', false),
  ('ro', 'Romania', false),
  ('el', 'Greece', false),
  ('hr', 'Croatia', false),
  ('sr', 'Serbia', false),
  ('sl', 'Slovenia', false),
  ('cs', 'Czechia', false),
  ('sk', 'Slovakia', false),
  ('nl', 'Netherlands', false),
  ('sv', 'Sweden', false),
  ('no', 'Norway', false),
  ('fi', 'Finland', false),
  ('et', 'Estonia', false),
  ('bg', 'Bulgaria', false),
  ('en', 'English-speaking countries', false),
  ('ru', 'Kazakhstan', false),
  ('ar', 'Arabic-speaking countries', false)
on conflict (langue) do nothing;

-- Les deux comment masters du test sont des posters de l'OS : on les rattache
-- par leur nom. Garde-fou : exactement un profil par nom, sinon on s'arrête
-- (la contrainte « actif ⇒ comment master » plus bas échouerait de toute façon).
do $$
declare
  r record;
  n integer;
begin
  for r in select langue, comment_master from public.comment_master_regions
            where comment_master_id is null and comment_master is not null loop
    select count(*) into n from public.profiles p
     where trim(coalesce(p.prenom, '') || ' ' || coalesce(p.nom, '')) = r.comment_master;
    if n <> 1 then
      raise exception '0321 : % profil(s) pour le comment master « % » (%) — à rattacher à la main',
        n, r.comment_master, r.langue;
    end if;
    update public.comment_master_regions g
       set comment_master_id = p.id
      from public.profiles p
     where g.langue = r.langue
       and trim(coalesce(p.prenom, '') || ' ' || coalesce(p.nom, '')) = r.comment_master;
  end loop;
end $$;

-- de et it envoient sur leur canal depuis le 14/10 : le bot en est membre.
update public.comment_master_regions
   set slack_verifie_canal = slack_channel_id,
       slack_verifie_at = now()
 where actif and slack_channel_id is not null and slack_verifie_canal is null;

do $$
begin
  alter table public.comment_master_regions
    add constraint comment_master_regions_actif_complet
    check (not actif or (comment_master_id is not null and slack_channel_id is not null));
exception when duplicate_object then null;
end $$;

-- ---------------------------------------------------------------------------
-- 2. Seuils par pays
-- ---------------------------------------------------------------------------

create table if not exists public.comment_master_pays (
  langue        text not null references public.comment_master_regions (langue) on update cascade,
  pays          text not null check (pays ~ '^[A-Z]{2}$'),
  -- Jamais moins de 3 000, quel que soit l'auteur du changement.
  seuil_vues    integer not null check (seuil_vues >= 3000),
  -- Cadenas : le recalibrage automatique n'y touche pas.
  verrou        boolean not null default false,
  -- initial (valeur du ticket) | provisoire (pays sans historique, 5 000)
  -- | manuel (admin) | auto (recalibrage du lundi)
  seuil_source  text not null default 'initial'
                  check (seuil_source in ('initial', 'provisoire', 'manuel', 'auto')),
  -- Pour un recalibrage : taux mesuré, échantillon, facteur appliqué.
  seuil_detail  jsonb,
  seuil_maj_at  timestamptz,
  seuil_maj_par uuid references auth.users (id) on delete set null,
  created_at    timestamptz not null default now(),
  primary key (langue, pays)
);

comment on table public.comment_master_pays is
  'Seuil de vues (fenêtre de la région) qui déclenche un commentaire, par pays du compte. Clé (langue, pays) : un pays peut parler deux langues. Voir 0321.';

-- Seuils du ticket : ~1 post sur 20 du pays déclenche, comme l'Allemagne
-- (12 posts sur 226 à 8 000 vues). Pays sans assez d'historique : 5 000 en
-- provisoire, que le recalibrage reprendra.
insert into public.comment_master_pays (langue, pays, seuil_vues, seuil_source) values
  ('de', 'DE', 8000, 'initial'),
  ('de', 'AT', 5000, 'provisoire'),
  ('de', 'CH', 5000, 'provisoire'),
  ('it', 'IT', 8000, 'initial'),
  ('tr', 'TR', 11000, 'initial'),
  ('fr', 'FR', 10000, 'initial'),
  ('fr', 'BE', 5000, 'provisoire'),
  ('es', 'ES', 15000, 'initial'),
  ('es-419', 'MX', 5000, 'provisoire'),
  ('es-419', 'AR', 5000, 'provisoire'),
  ('es-419', 'CO', 5000, 'provisoire'),
  ('es-419', 'CL', 5000, 'provisoire'),
  ('es-419', 'UY', 5000, 'provisoire'),
  ('pt', 'PT', 6000, 'initial'),
  ('pt-BR', 'BR', 5000, 'provisoire'),
  ('hu', 'HU', 10000, 'initial'),
  ('pl', 'PL', 10000, 'initial'),
  ('ro', 'RO', 7500, 'initial'),
  ('el', 'GR', 10000, 'initial'),
  ('hr', 'HR', 8500, 'initial'),
  ('sr', 'RS', 7500, 'initial'),
  ('sl', 'SI', 5000, 'initial'),
  ('cs', 'CZ', 8000, 'initial'),
  ('sk', 'SK', 7500, 'initial'),
  ('nl', 'NL', 8000, 'initial'),
  ('sv', 'SE', 10000, 'initial'),
  ('no', 'NO', 11000, 'initial'),
  ('fi', 'FI', 10000, 'initial'),
  ('et', 'EE', 5000, 'provisoire'),
  ('bg', 'BG', 10000, 'initial'),
  ('en', 'US', 5000, 'initial'),
  ('en', 'GB', 3000, 'initial'),
  ('en', 'CA', 5000, 'provisoire'),
  ('en', 'AU', 5000, 'provisoire'),
  ('en', 'NZ', 5000, 'provisoire'),
  ('en', 'IE', 5000, 'provisoire'),
  ('ru', 'KZ', 5000, 'provisoire'),
  ('ar', 'AE', 5000, 'provisoire'),
  ('ar', 'IL', 5000, 'provisoire')
on conflict (langue, pays) do nothing;

create table if not exists public.comment_master_seuils_journal (
  id         bigint generated always as identity primary key,
  langue     text not null,
  pays       text not null,
  ancien     integer,
  nouveau    integer not null,
  source     text not null,
  detail     jsonb,
  par        uuid references auth.users (id) on delete set null,
  at         timestamptz not null default now()
);

create index if not exists comment_master_seuils_journal_idx
  on public.comment_master_seuils_journal (langue, pays, at desc);

-- ---------------------------------------------------------------------------
-- 3. Historique des comment masters
-- ---------------------------------------------------------------------------

create table if not exists public.comment_master_mandats (
  id         uuid primary key default gen_random_uuid(),
  langue     text not null references public.comment_master_regions (langue) on update cascade,
  -- `nom` est recopié : le crédit d'un mois passé reste lisible même si le
  -- profil disparaît.
  profile_id uuid references public.profiles (id) on delete set null,
  nom        text not null,
  debut      timestamptz not null default now(),
  fin        timestamptz,
  check (fin is null or fin >= debut)
);

comment on table public.comment_master_mandats is
  'Qui a été comment master de quelle région, de quand à quand. Un Done est crédité au mandat ouvert à l''heure du clic (bonus). Tenu par trigger sur comment_master_regions.';

create unique index if not exists comment_master_mandats_ouvert_idx
  on public.comment_master_mandats (langue) where fin is null;

-- Mandats de départ : depuis la création des régions du test (14/10), pour que
-- les Done déjà cliqués soient crédités.
insert into public.comment_master_mandats (langue, profile_id, nom, debut)
select g.langue, g.comment_master_id,
       trim(coalesce(p.prenom, '') || ' ' || coalesce(p.nom, '')), g.created_at
  from public.comment_master_regions g
  join public.profiles p on p.id = g.comment_master_id
 where not exists (select 1 from public.comment_master_mandats m where m.langue = g.langue);

-- ---------------------------------------------------------------------------
-- 4. Relevés : lots Apify et suivi de chaque post
-- ---------------------------------------------------------------------------

create table if not exists public.comment_master_lots (
  id            uuid primary key default gen_random_uuid(),
  apify_run_id  text,
  -- lance → termine | echec
  statut        text not null default 'lance' check (statut in ('lance', 'termine', 'echec')),
  nb_liens      integer not null,
  -- Résultats renvoyés par Apify : c'est ce qui est facturé (au post relevé).
  nb_resultats  integer,
  erreur        text,
  lance_at      timestamptz not null default now(),
  termine_at    timestamptz
);

create index if not exists comment_master_lots_lance_idx
  on public.comment_master_lots (lance_at desc);
create index if not exists comment_master_lots_en_cours_idx
  on public.comment_master_lots (lance_at) where statut = 'lance';

-- Pas de clé étrangère vers `passages` ni `comptes` : les poser verrouille les
-- tables les plus écrites de la base (voir 0317). Un passage supprimé laisse
-- une ligne orpheline, sans effet.
create table if not exists public.comment_master_suivis (
  passage_id        uuid primary key,
  compte_id         uuid,
  langue            text not null,
  pays              text not null,
  -- Lien relevé (lien court déjà résolu) et heure de publication de référence
  -- (TikTok si connue, sinon le clic du poster).
  url_releve        text not null,
  publie_at         timestamptz not null,
  -- suivi → declenche | abandonne | termine
  statut            text not null default 'suivi'
                      check (statut in ('suivi', 'declenche', 'abandonne', 'termine')),
  motif             text,
  nb_releves        integer not null default 0,
  vues              integer,
  -- Seuil du pays au dernier relevé (le seuil se règle en direct).
  seuil_vues        integer,
  dernier_releve_at timestamptz,
  -- Lot Apify en vol : le post n'est pas replanifié tant qu'il n'est pas relevé.
  lot_id            uuid references public.comment_master_lots (id) on delete set null,
  created_at        timestamptz not null default now(),
  maj_at            timestamptz not null default now()
);

create index if not exists comment_master_suivis_a_relever_idx
  on public.comment_master_suivis (dernier_releve_at) where statut = 'suivi';
create index if not exists comment_master_suivis_lot_idx
  on public.comment_master_suivis (lot_id) where lot_id is not null;
create index if not exists comment_master_suivis_publie_idx
  on public.comment_master_suivis (publie_at);

-- La demande garde le pays et le seuil qui l'ont déclenchée, et le nombre de
-- commentaires relus à 48 h (facturé au commentaire).
alter table public.comment_master_demandes
  add column if not exists pays text,
  add column if not exists seuil_vues integer,
  add column if not exists mesure_nb_commentaires integer;

-- ---------------------------------------------------------------------------
-- 5. Triggers
-- ---------------------------------------------------------------------------

create or replace function public.comment_master_regions_avant_maj()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nom text;
begin
  new.maj_at := now();
  new.slack_channel_id := nullif(trim(coalesce(new.slack_channel_id, '')), '');

  if new.comment_master_id is distinct from old.comment_master_id then
    if new.comment_master_id is null then
      new.comment_master := null;
    else
      select trim(coalesce(prenom, '') || ' ' || coalesce(nom, '')) into v_nom
        from public.profiles where id = new.comment_master_id;
      new.comment_master := v_nom;
    end if;
  end if;

  -- Une région qui perd son comment master ou change de canal s'éteint : le
  -- nouveau canal doit être vérifié avant de repartir.
  if old.actif and new.actif and (
       new.comment_master_id is null
       or new.slack_channel_id is null
       or new.slack_channel_id is distinct from new.slack_verifie_canal) then
    new.actif := false;
  end if;

  if new.actif and not old.actif and (
       new.comment_master_id is null
       or new.slack_channel_id is null
       or new.slack_channel_id is distinct from new.slack_verifie_canal) then
    raise exception 'COMMENT_MASTER_ACTIVATION: une région ne s''active qu''avec un comment master et un canal Slack vérifié (bot membre)'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

create or replace trigger comment_master_regions_avant_maj
  before update on public.comment_master_regions
  for each row execute function public.comment_master_regions_avant_maj();

create or replace function public.comment_master_regions_mandat()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.comment_master_id is distinct from old.comment_master_id then
    update public.comment_master_mandats
       set fin = now()
     where langue = new.langue and fin is null;
    if new.comment_master_id is not null then
      insert into public.comment_master_mandats (langue, profile_id, nom)
      values (new.langue, new.comment_master_id, coalesce(new.comment_master, ''));
    end if;
  end if;
  return null;
end;
$$;

create or replace trigger comment_master_regions_mandat
  after update of comment_master_id on public.comment_master_regions
  for each row execute function public.comment_master_regions_mandat();

-- SECURITY INVOKER exprès : `current_user` y est le rôle de l'appelant —
-- `authenticated` depuis la page, `service_role` pour le recalibrage de la
-- fonction. Un `auth.uid()` ne suffit pas à les distinguer de façon sûre.
create or replace function public.comment_master_pays_avant_maj()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if new.seuil_vues is distinct from old.seuil_vues then
    new.seuil_maj_at := now();
    -- Depuis la page (un utilisateur connecté) : réglage à la main, et
    -- verrouillé pour que le recalibrage du lundi ne l'écrase pas.
    if current_user = 'authenticated' then
      new.seuil_source := 'manuel';
      new.seuil_maj_par := auth.uid();
      new.seuil_detail := null;
      new.verrou := true;
    end if;
  end if;
  return new;
end;
$$;

create or replace trigger comment_master_pays_avant_maj
  before update on public.comment_master_pays
  for each row execute function public.comment_master_pays_avant_maj();

create or replace function public.comment_master_pays_journal()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.seuil_vues is distinct from old.seuil_vues then
    insert into public.comment_master_seuils_journal (langue, pays, ancien, nouveau, source, detail, par)
    values (new.langue, new.pays, old.seuil_vues, new.seuil_vues, new.seuil_source, new.seuil_detail, new.seuil_maj_par);
  end if;
  return null;
end;
$$;

create or replace trigger comment_master_pays_journal
  after update on public.comment_master_pays
  for each row execute function public.comment_master_pays_journal();

-- ---------------------------------------------------------------------------
-- 6. RLS et droits : admin et Head of Ops (is_admin) lisent ; ils écrivent
--    seulement le comment master, le canal, l'interrupteur, le seuil et le
--    cadenas. Tout le reste passe par la fonction (service_role).
-- ---------------------------------------------------------------------------

alter table public.comment_master_pays enable row level security;
alter table public.comment_master_seuils_journal enable row level security;
alter table public.comment_master_mandats enable row level security;
alter table public.comment_master_lots enable row level security;
alter table public.comment_master_suivis enable row level security;

-- Sans `drop policy if exists` : un NOTICE fige l'outil d'application MCP
-- (voir 0256). On ne crée que ce qui manque.
do $$
declare
  p record;
begin
  for p in
    select * from (values
      ('comment_master_regions', 'comment_master_regions maj admin', 'update'),
      ('comment_master_pays', 'comment_master_pays lecture admin', 'select'),
      ('comment_master_pays', 'comment_master_pays maj admin', 'update'),
      ('comment_master_seuils_journal', 'comment_master_seuils_journal lecture admin', 'select'),
      ('comment_master_mandats', 'comment_master_mandats lecture admin', 'select'),
      ('comment_master_lots', 'comment_master_lots lecture admin', 'select'),
      ('comment_master_suivis', 'comment_master_suivis lecture admin', 'select')
    ) as t(tableau, nom, commande)
  loop
    if not exists (select 1 from pg_policies
                    where schemaname = 'public' and tablename = p.tableau and policyname = p.nom) then
      if p.commande = 'update' then
        execute format(
          'create policy %I on public.%I for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()))',
          p.nom, p.tableau);
      else
        execute format(
          'create policy %I on public.%I for select to authenticated using ((select public.is_admin()))',
          p.nom, p.tableau);
      end if;
    end if;
  end loop;
end $$;

-- Les droits par défaut de Supabase donnent TOUT à anon et authenticated :
-- on les ramène à la lecture, plus les seules colonnes éditables depuis la page.
revoke all on public.comment_master_regions, public.comment_master_demandes,
  public.comment_master_pays, public.comment_master_seuils_journal,
  public.comment_master_mandats, public.comment_master_lots,
  public.comment_master_suivis from anon, authenticated;
grant select on public.comment_master_regions, public.comment_master_demandes,
  public.comment_master_pays, public.comment_master_seuils_journal,
  public.comment_master_mandats, public.comment_master_lots,
  public.comment_master_suivis to authenticated;
grant update (comment_master_id, slack_channel_id, actif) on public.comment_master_regions to authenticated;
grant update (seuil_vues, verrou) on public.comment_master_pays to authenticated;
grant all on public.comment_master_pays, public.comment_master_seuils_journal,
  public.comment_master_mandats, public.comment_master_lots,
  public.comment_master_suivis to service_role;

-- ---------------------------------------------------------------------------
-- 7. Lectures agrégées (PostgREST tronque à 1 000 lignes : on compte en SQL)
-- ---------------------------------------------------------------------------

-- Posts suivis depuis `p_depuis`, par pays : taux de déclenchement (page) et
-- recalibrage du lundi (fonction, sur les suivis conclus).
create or replace function public.comment_masters_taux_pays(p_depuis timestamptz)
returns table (langue text, pays text, suivis integer, conclus integer, declenches integer, abandonnes integer)
language sql
stable
security invoker
set search_path = public
as $$
  select s.langue, s.pays,
         count(*)::integer,
         count(*) filter (where s.statut <> 'suivi')::integer,
         count(*) filter (where s.statut = 'declenche')::integer,
         count(*) filter (where s.statut = 'abandonne')::integer
    from public.comment_master_suivis s
   where s.publie_at >= p_depuis
   group by s.langue, s.pays;
$$;

-- Posters actifs avec un compte actif dans la langue : les comment masters
-- possibles. `compte_id` sert de lien vers la fiche.
create or replace function public.comment_masters_candidats()
returns table (langue text, profile_id uuid, prenom text, nom text, compte_id uuid)
language sql
stable
security invoker
set search_path = public
as $$
  select distinct on (c.langue, p.id) c.langue, p.id, p.prenom, p.nom, c.id
    from public.comptes c
    join public.profiles p on p.id = c.poster_id
   where c.is_active and p.is_active
     and exists (select 1 from public.user_roles r where r.user_id = p.id and r.role = 'poster')
   order by c.langue, p.id, c.created_at;
$$;

-- Le tableau de la page pour un mois (heure de Paris) : commentaires faits par
-- région et par personne (crédités au mandat en cours au clic), et les
-- relevés des 7 derniers jours (coût).
create or replace function public.comment_masters_stats(p_mois date)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  with b as (
    select (date_trunc('month', p_mois)::timestamp at time zone 'Europe/Paris') as debut,
           ((date_trunc('month', p_mois) + interval '1 month')::timestamp at time zone 'Europe/Paris') as fin
  )
  select jsonb_build_object(
    'debut', b.debut,
    'fin', b.fin,
    'faits', coalesce((
      select jsonb_agg(f order by f.langue, f.faits desc)
        from (
          select d.langue, m.profile_id, coalesce(m.nom, '') as nom, count(*)::integer as faits
            from public.comment_master_demandes d
            left join public.comment_master_mandats m
              on m.langue = d.langue and d.fait_at >= m.debut and (m.fin is null or d.fait_at < m.fin)
           where d.fait_at >= b.debut and d.fait_at < b.fin
           group by d.langue, m.profile_id, m.nom
        ) f), '[]'::jsonb),
    'regions', coalesce((
      select jsonb_agg(r)
        from (
          select d.langue,
                 count(*) filter (where d.created_at >= b.debut and d.created_at < b.fin)::integer as envoyes,
                 count(*) filter (where d.fait_at >= b.debut and d.fait_at < b.fin)::integer as faits,
                 count(*) filter (where d.fait_at >= b.debut and d.fait_at < b.fin
                                    and d.mesure_statut = 'trouve')::integer as retrouves,
                 coalesce(sum(d.likes_commentaire) filter (where d.fait_at >= b.debut and d.fait_at < b.fin), 0)::integer as likes
            from public.comment_master_demandes d
           where (d.created_at >= b.debut and d.created_at < b.fin)
              or (d.fait_at >= b.debut and d.fait_at < b.fin)
           group by d.langue
        ) r), '[]'::jsonb),
    'releves_7j', (
      select jsonb_build_object(
               'lots', count(*)::integer,
               'echecs', count(*) filter (where l.statut = 'echec')::integer,
               -- En vol : on compte les liens, facturés dès qu'ils reviennent.
               'releves', coalesce(sum(case when l.statut = 'lance' then l.nb_liens
                                            else coalesce(l.nb_resultats, 0) end), 0)::integer)
        from public.comment_master_lots l
       where l.lance_at > now() - interval '7 days'),
    'commentaires_7j', (
      select coalesce(sum(d.mesure_nb_commentaires), 0)::integer
        from public.comment_master_demandes d
       where d.mesure_at > now() - interval '7 days'),
    'pays_7j', coalesce((
      select jsonb_agg(t) from public.comment_masters_taux_pays(now() - interval '7 days') t), '[]'::jsonb)
  )
  from b;
$$;

revoke all on function public.comment_masters_taux_pays(timestamptz) from public, anon;
revoke all on function public.comment_masters_candidats() from public, anon;
revoke all on function public.comment_masters_stats(date) from public, anon;
grant execute on function public.comment_masters_taux_pays(timestamptz) to authenticated, service_role;
grant execute on function public.comment_masters_candidats() to authenticated, service_role;
grant execute on function public.comment_masters_stats(date) to authenticated, service_role;

notify pgrst, 'reload schema';
