-- 0745 : « Bible des comptes » (Max, 18/11). L'espace de stockage AVANT l'import : chaque compte TikTok repéré,
-- avec son app, son label (ou un nouveau label proposé), la note pour l'import, l'angle de placement, la niche,
-- ses stats et 3 posts de référence (miniatures copiées dans medias/bible/<handle>/, jamais d'URL TikTok directe).
-- Les comptes déjà importés (comptes_reference) s'y affichent aussi, avec 3 slides tirées de nos médias.
-- 1. labels_proposes : un nouveau label n'entre dans `labels` qu'au clic « Valider » d'un admin.
-- 2. bible_comptes + bible_historique (chaque modification, champ par champ).
-- 3. Doublons : bible_doublon (dans la bible ou dans comptes_reference).
-- 4. Import : la logique d'import ne change pas ; un trigger relie la fiche au compte de référence créé
--    (même handle) et la passe « importé ».
-- Accès : admin au sens strict (is_admin_strict) ; ni le Head of Ops, ni les managers, ni les posteurs.
-- Additif : nouvelles tables, fonctions, un trigger AFTER INSERT sur comptes_reference (qui n'écrit que dans la bible).

create table if not exists public.labels_proposes (
  id uuid primary key default gen_random_uuid(),
  nom text not null check (nom ~ '^[a-z0-9]+(_[a-z0-9]+)*$' and length(nom) <= 60),
  description_da text,
  application_ids uuid[] not null default '{}',
  apps_attente text[] not null default '{}',
  statut text not null default 'a_valider' check (statut in ('a_valider', 'valide', 'refuse')),
  label_id uuid references public.labels(id) on delete set null,
  propose_par uuid,
  propose_at timestamptz not null default now(),
  decide_par uuid,
  decide_at timestamptz
);
create unique index if not exists labels_proposes_nom_actif on public.labels_proposes (nom) where statut <> 'refuse';

create table if not exists public.bible_comptes (
  id uuid primary key default gen_random_uuid(),
  handle text not null unique check (handle ~ '^[a-z0-9._]{1,40}$'),
  profil_url text,
  statut text not null default 'a_trier' check (statut in ('a_trier', 'a_importer', 'importe', 'refuse', 'en_pause')),
  application_ids uuid[] not null default '{}',
  apps_attente text[] not null default '{}',
  label_id uuid references public.labels(id) on delete set null,
  label_propose_id uuid references public.labels_proposes(id) on delete set null,
  note_import text,
  angle text,
  niche_statut text check (niche_statut in ('oui', 'non', 'partiel')),
  niche text,
  polyvalent boolean not null default false,
  polyvalent_regles jsonb not null default '[]'::jsonb,
  langue text,
  pays text,
  abonnes integer,
  vues_mediane integer,
  meilleur_post_url text,
  meilleur_post_vues integer,
  dernier_post_le date,
  stats_source text check (stats_source in ('manuel', 'auto')),
  stats_at timestamptz,
  posts jsonb not null default '[]'::jsonb,
  miniatures_statut text check (miniatures_statut in ('a_faire', 'ok', 'partiel', 'sans_liens', 'erreur')),
  miniatures_at timestamptz,
  miniatures_erreur text,
  compte_reference_id uuid references public.comptes_reference(id) on delete set null,
  ajoute_par uuid,
  ajoute_at timestamptz not null default now(),
  modifie_par uuid,
  modifie_at timestamptz not null default now()
);
create index if not exists bible_comptes_ref on public.bible_comptes (compte_reference_id);

create table if not exists public.bible_historique (
  id bigserial primary key,
  bible_id uuid not null references public.bible_comptes(id) on delete cascade,
  at timestamptz not null default now(),
  par uuid,
  quoi text not null,
  avant jsonb,
  apres jsonb
);
create index if not exists bible_historique_fiche on public.bible_historique (bible_id, at desc);

alter table public.labels_proposes enable row level security;
alter table public.bible_comptes enable row level security;
alter table public.bible_historique enable row level security;

do $p$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'bible_comptes' and policyname = 'bible_comptes_admin') then
    create policy bible_comptes_admin on public.bible_comptes for all using (public.is_admin_strict()) with check (public.is_admin_strict());
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'labels_proposes' and policyname = 'labels_proposes_admin') then
    create policy labels_proposes_admin on public.labels_proposes for all using (public.is_admin_strict()) with check (public.is_admin_strict());
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'bible_historique' and policyname = 'bible_historique_admin') then
    create policy bible_historique_admin on public.bible_historique for select using (public.is_admin_strict());
  end if;
end
$p$;
grant select, insert, update on public.bible_comptes, public.labels_proposes to authenticated;
grant select on public.bible_historique to authenticated;

-- Le handle tel qu'on le range : minuscules, sans @, sans espace.
create or replace function public.bible_handle(p text)
returns text
language sql
immutable
as $$
  select nullif(lower(regexp_replace(btrim(coalesce(p, '')), '^@+', '')), '');
$$;

-- Qui ajoute, qui modifie, et l'historique champ par champ.
create or replace function public.bible_comptes_journal()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  k text;
  avant jsonb := '{}'::jsonb;
  apres jsonb := '{}'::jsonb;
begin
  new.handle := public.bible_handle(new.handle);
  if tg_op = 'INSERT' then
    new.ajoute_par := coalesce(new.ajoute_par, auth.uid());
    new.modifie_par := coalesce(new.modifie_par, auth.uid());
    return new;
  end if;
  new.modifie_at := now();
  new.modifie_par := coalesce(auth.uid(), new.modifie_par);
  for k in select jsonb_object_keys(to_jsonb(new)) loop
    if k in ('modifie_at', 'modifie_par') then continue; end if;
    if (to_jsonb(old) -> k) is distinct from (to_jsonb(new) -> k) then
      avant := avant || jsonb_build_object(k, to_jsonb(old) -> k);
      apres := apres || jsonb_build_object(k, to_jsonb(new) -> k);
    end if;
  end loop;
  if apres <> '{}'::jsonb then
    insert into public.bible_historique (bible_id, par, quoi, avant, apres)
    values (new.id, auth.uid(), 'modification', avant, apres);
  end if;
  return new;
end;
$function$;

create or replace trigger bible_comptes_journal
before insert or update on public.bible_comptes
for each row execute function public.bible_comptes_journal();

create or replace function public.bible_comptes_creation()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  insert into public.bible_historique (bible_id, par, quoi, apres)
  values (new.id, new.ajoute_par, 'ajout', jsonb_build_object('handle', new.handle, 'statut', new.statut));
  return null;
end;
$function$;

create or replace trigger bible_comptes_creation
after insert on public.bible_comptes
for each row execute function public.bible_comptes_creation();

-- Doublon : la fiche de la bible et/ou le compte de référence qui portent déjà ce handle.
create or replace function public.bible_doublon(p_handle text)
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $$
  select case when not public.is_admin_strict() then null else jsonb_build_object(
    'handle', public.bible_handle(p_handle),
    'bible_id', (select b.id from public.bible_comptes b where b.handle = public.bible_handle(p_handle)),
    'compte_reference_id', (select r.id from public.comptes_reference r where public.bible_handle(r.handle_tiktok) = public.bible_handle(p_handle) limit 1)) end;
$$;

-- Les comptes déjà importés : label(s) actuel(s), app, et 3 slides de nos médias (la 1re slide des 3 posts
-- les plus vus), plus la fiche de la bible si elle existe.
create or replace function public.bible_importes()
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $$
  select coalesce(jsonb_agg(x order by x->>'handle'), '[]'::jsonb) from (
    select jsonb_build_object(
      'compte_reference_id', r.id,
      'handle', public.bible_handle(r.handle_tiktok),
      'langue', r.langue,
      'niche', r.niche,
      'actif', r.is_active,
      'application_id', r.application_id,
      'ajoute_at', r.created_at,
      'labels', coalesce((select jsonb_agg(jsonb_build_object('id', l.id, 'nom', l.nom) order by l.nom)
                            from public.compte_reference_labels crl join public.labels l on l.id = crl.label_id
                           where crl.compte_reference_id = r.id), '[]'::jsonb),
      'slides', coalesce((select jsonb_agg(s.url order by s.vues desc nulls last) from (
                            select c.structure_slides -> 0 ->> 'raw_url' as url, c.vues_source as vues
                              from public.contenus c
                             where c.compte_reference_id = r.id and c.parent_id is null
                               and c.structure_slides -> 0 ->> 'raw_url' like 'https://%/storage/v1/object/public/medias/%'
                             order by c.vues_source desc nulls last limit 3) s), '[]'::jsonb),
      'posts', (select count(*) from public.contenus c where c.compte_reference_id = r.id and c.parent_id is null),
      'vues_mediane', (select percentile_cont(0.5) within group (order by c.vues_source)::int
                         from public.contenus c where c.compte_reference_id = r.id and c.parent_id is null and c.vues_source is not null),
      'bible_id', (select b.id from public.bible_comptes b
                    where b.compte_reference_id = r.id or b.handle = public.bible_handle(r.handle_tiktok) limit 1)) x
      from public.comptes_reference r
     where public.is_admin_strict()) t;
$$;

-- Valider un label proposé : il entre dans `labels` (app principale = la 1re app choisie) et dans
-- label_applications pour chaque app ; les fiches qui l'utilisaient prennent le vrai label.
create or replace function public.label_propose_valider(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  p public.labels_proposes;
  v_label uuid;
  v_app uuid;
begin
  if not public.is_admin_strict() then raise exception 'réservé à l''admin' using errcode = '42501'; end if;
  select * into p from public.labels_proposes where id = p_id for update;
  if p.id is null then raise exception 'label proposé introuvable'; end if;
  if p.statut = 'valide' then return jsonb_build_object('ok', true, 'label_id', p.label_id, 'deja', true); end if;
  if p.statut = 'refuse' then raise exception 'ce label a été refusé'; end if;
  if cardinality(p.application_ids) = 0 then
    raise exception 'Choisis d''abord une app existante pour ce label%',
      case when cardinality(p.apps_attente) > 0 then ' (' || array_to_string(p.apps_attente, ', ') || ' n''existe pas encore)' else '' end;
  end if;
  select id into v_label from public.labels where lower(nom) = p.nom limit 1;
  if v_label is null then
    v_app := p.application_ids[1];
    insert into public.labels (nom, slug, style_theme, application_id)
    values (p.nom, replace(p.nom, '_', '-'), nullif(btrim(coalesce(p.description_da, '')), ''), v_app)
    returning id into v_label;
  end if;
  insert into public.label_applications (label_id, application_id)
  select v_label, a from unnest(p.application_ids) a
  on conflict do nothing;
  update public.labels_proposes set statut = 'valide', label_id = v_label, decide_par = auth.uid(), decide_at = now() where id = p.id;
  update public.bible_comptes set label_id = coalesce(label_id, v_label), label_propose_id = null where label_propose_id = p.id;
  return jsonb_build_object('ok', true, 'label_id', v_label);
end;
$function$;

create or replace function public.label_propose_refuser(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if not public.is_admin_strict() then raise exception 'réservé à l''admin' using errcode = '42501'; end if;
  update public.labels_proposes set statut = 'refuse', decide_par = auth.uid(), decide_at = now() where id = p_id and statut = 'a_valider';
  return jsonb_build_object('ok', found);
end;
$function$;

-- Import fait (n'importe quel chemin de l'import existant) : la fiche de la bible au même handle se relie
-- au compte de référence créé et passe « importé ».
create or replace function public.bible_lier_import()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  update public.bible_comptes
     set compte_reference_id = new.id, statut = 'importe'
   where handle = public.bible_handle(new.handle_tiktok) and compte_reference_id is null;
  return null;
end;
$function$;

create or replace trigger bible_lier_import
after insert on public.comptes_reference
for each row execute function public.bible_lier_import();

-- Réservé au serveur (fonction Edge « bible ») : écrire les posts et miniatures copiés, et les stats auto.
create or replace function public.bible_miniatures_ecrire(p_id uuid, p_posts jsonb, p_statut text, p_erreur text, p_stats jsonb)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'réservé au serveur'; end if;
  update public.bible_comptes b
     set posts = coalesce(p_posts, b.posts),
         miniatures_statut = p_statut,
         miniatures_erreur = p_erreur,
         miniatures_at = now(),
         abonnes = case when p_stats ? 'abonnes' and coalesce(b.stats_source, 'auto') = 'auto' then (p_stats->>'abonnes')::int else b.abonnes end,
         vues_mediane = case when p_stats ? 'vues_mediane' and coalesce(b.stats_source, 'auto') = 'auto' then (p_stats->>'vues_mediane')::int else b.vues_mediane end,
         meilleur_post_url = case when p_stats ? 'meilleur_post_url' and coalesce(b.stats_source, 'auto') = 'auto' then p_stats->>'meilleur_post_url' else b.meilleur_post_url end,
         meilleur_post_vues = case when p_stats ? 'meilleur_post_vues' and coalesce(b.stats_source, 'auto') = 'auto' then (p_stats->>'meilleur_post_vues')::int else b.meilleur_post_vues end,
         dernier_post_le = case when p_stats ? 'dernier_post_le' and coalesce(b.stats_source, 'auto') = 'auto' then (p_stats->>'dernier_post_le')::date else b.dernier_post_le end,
         stats_source = case when p_stats is not null and p_stats <> '{}'::jsonb and b.stats_source is null then 'auto' else b.stats_source end,
         stats_at = case when p_stats is not null and p_stats <> '{}'::jsonb and coalesce(b.stats_source, 'auto') = 'auto' then now() else b.stats_at end
   where b.id = p_id;
end;
$function$;

revoke all on function public.bible_doublon(text) from public, anon;
revoke all on function public.bible_importes() from public, anon;
revoke all on function public.label_propose_valider(uuid) from public, anon;
revoke all on function public.label_propose_refuser(uuid) from public, anon;
revoke all on function public.bible_miniatures_ecrire(uuid, jsonb, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.bible_doublon(text) to authenticated;
grant execute on function public.bible_importes() to authenticated;
grant execute on function public.label_propose_valider(uuid) to authenticated;
grant execute on function public.label_propose_refuser(uuid) to authenticated;
grant execute on function public.bible_miniatures_ecrire(uuid, jsonb, text, text, jsonb) to service_role;
