-- 0782 : allocation des podz, étape 4 du chantier « clarifier les podz »
-- (décisions d'Adrien du 20/11 : rien d'automatique, c'est lui qui décide ; un
-- compte existant peut changer de label, sans se limiter aux comptes jeunes ou
-- faibles).
--
-- LE PROBLÈME. Un compte ne reçoit son label qu'à sa création. Un podz neuf
-- attend donc les recrues de ses langues (Milly et les trois podz Atala :
-- aucun compte), pendant que les labels en texte + banque empilent (alpha_male :
-- 10 comptes en allemand, les mêmes posts traduits). Changer un compte de label
-- se faisait à la main, compte par compte, sur la page Posters, sans trace.
--
-- CE QUE CETTE MIGRATION AJOUTE (lecture, plus un geste journalisé) :
--   1. `podz_places()` : les PLACES LIBRES, une ligne par langue ouverte d'un
--      podz actif en images finies où aucun compte de son label ne poste.
--   2. `podz_candidats(label, langue)` : les comptes actifs de cette langue qui
--      pourraient y aller (ils servent une application du label, ne portent pas
--      déjà ce label), avec leur label actuel, l'EMPILEMENT (combien de comptes
--      de ce label dans cette langue), leurs posts et leurs vues sur 15 jours.
--      Les plus empilés d'abord. L'OS ne choisit pas : il montre.
--   3. `compte_deplacer(compte, de, vers, raison)` : le geste. Retire le label
--      `de` (nul : le compte n'en avait pas), pose `vers`, garde les autres
--      labels du compte, et note le tout dans `comptes_deplacements`. Refuse un
--      label qui ne sert aucune application du compte, et un label manuel.
--   4. `compte_deplacement_annuler(id)` : remet les labels d'avant, si le
--      compte n'a pas changé depuis.
--
-- Le geste écrit dans `compte_labels` comme la page Posters le fait déjà
-- (`setLabelsCompte`) : mêmes effets sur la suite (les posts déjà tirés pour le
-- compte restent, les tirages suivants lisent son nouveau label). Rien d'autre
-- n'est touché : ni le choix de label à la création, ni la File des créateurs,
-- ni BLEO.
--
-- ✅ Appliquée le 2026-11-20 (MCP), après un essai complet dans une transaction
-- annulée (places, candidats, déplacer, annuler, refus).
--
-- Additive : une table, quatre fonctions. Retour arrière : `drop function
-- public.compte_deplacement_annuler(bigint), public.compte_deplacer(uuid, uuid,
-- uuid, text), public.podz_candidats(uuid, text), public.podz_places()` ; la
-- table peut rester.

set lock_timeout = '5s';

create table if not exists public.comptes_deplacements (
  id bigint generated always as identity primary key,
  compte_id uuid not null references public.comptes(id) on delete cascade,
  label_de uuid references public.labels(id) on delete set null,
  label_vers uuid not null references public.labels(id) on delete cascade,
  labels_avant uuid[] not null,
  labels_apres uuid[] not null,
  raison text,
  par uuid,
  deplace_le timestamptz not null default now(),
  annule_le timestamptz,
  annule_par uuid
);
create index if not exists comptes_deplacements_compte on public.comptes_deplacements (compte_id, deplace_le desc);

comment on table public.comptes_deplacements is
  'Journal des changements de label d''un compte faits par compte_deplacer() (0782) : labels avant et après, par qui, quand, et l''annulation éventuelle.';

alter table public.comptes_deplacements enable row level security;
do $p$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'comptes_deplacements'
                   and policyname = 'comptes_deplacements_admin') then
    create policy comptes_deplacements_admin on public.comptes_deplacements
      for select to authenticated using (public.is_admin());
  end if;
end
$p$;
revoke all on public.comptes_deplacements from public, anon;
grant select on public.comptes_deplacements to authenticated, service_role;

-- Les applications d'un compte : sa répartition (`parts_applications`), sinon Sophia.
create or replace function public.compte_applications(p_compte public.comptes)
returns uuid[]
language sql
stable
set search_path to 'public'
as $function$
  select coalesce(
    (select array_agg(a.id) from applications a
      where p_compte.parts_applications is not null
        and jsonb_typeof(p_compte.parts_applications) = 'object'
        and p_compte.parts_applications ? a.slug
        and coalesce((p_compte.parts_applications ->> a.slug)::numeric, 0) > 0),
    array['00000000-0000-4000-8000-000000000001'::uuid]);
$function$;

-- Les applications qu'un label sert : `label_applications`, sinon celle du label.
create or replace function public.label_applications_ids(p_label uuid)
returns uuid[]
language sql
stable
set search_path to 'public'
as $function$
  select coalesce(
    (select array_agg(la.application_id) from label_applications la where la.label_id = p_label),
    (select array[l.application_id] from labels l where l.id = p_label and l.application_id is not null),
    '{}'::uuid[]);
$function$;

-- 1. Les places libres.
create or replace function public.podz_places()
returns table (pod text, pod_nom text, label_id uuid, label text, applications text[], langue text, prete boolean,
               comptes_label integer, ouverte_le timestamptz, ouverte_par text)
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
begin
  if auth.uid() is not null and not public.is_admin() then
    raise exception 'podz : réservé aux admins' using errcode = '42501';
  end if;

  return query
  with ouvertes as (
    select p.slug, p.nom, p.label_id, l.nom as label, x.langue, x.n,
           p.langues, p.langues_pretes
      from pods p
      join labels l on l.id = p.label_id
     cross join lateral unnest(p.langues) with ordinality as x(langue, n)
     where p.actif and p.langues is not null
  ),
  comptes_l as (
    select cl.label_id, lower(c.langue) as langue, count(*)::integer as n
      from compte_labels cl
      join comptes c on c.id = cl.compte_id and c.is_active and c.langue is not null
     group by 1, 2
  )
  select o.slug, o.nom, o.label_id, o.label,
         (select array_agg(a.slug order by a.slug) from applications a where a.id = any (public.label_applications_ids(o.label_id))),
         o.langue,
         o.langues_pretes is null or exists (select 1 from unnest(o.langues_pretes) y where lower(y) = lower(o.langue)),
         coalesce((select sum(c.n)::integer from comptes_l c where c.label_id = o.label_id), 0),
         j.ouvert_le, j.par
    from ouvertes o
    left join lateral (
      select b.ouvert_le, b.par from bleo_langues_ouvertes b
       where b.pod = o.slug and lower(b.langue) = lower(o.langue) and b.action = 'ouverte'
       order by b.ouvert_le desc limit 1) j on true
   -- Libre : aucun compte dans la langue, ni dans une variante qu'elle sert (« es » sert « es-419 »
   -- quand « es-419 » n'est pas ouverte à part), comme `pod_langues`.
   where not exists (
           select 1 from comptes_l c
            where c.label_id = o.label_id
              and (c.langue = lower(o.langue)
                   or (split_part(c.langue, '-', 1) = lower(o.langue)
                       and not exists (select 1 from unnest(o.langues) y where lower(y) = c.langue))))
   order by o.label, o.slug, o.n;
end;
$function$;

comment on function public.podz_places() is
  'Les places libres des podz (0782) : chaque langue ouverte d''un podz actif en images finies où aucun compte de son label ne poste. prete = l''atelier sait la produire.';

-- 2. Les comptes qui pourraient prendre une place.
create or replace function public.podz_candidats(p_label uuid, p_langue text)
returns table (compte_id uuid, handle text, langue text, pays text, cree_le date, poster text,
               labels jsonb, empilement integer, posts_15j integer, vues_moyenne integer, vues_max integer, dernier_post date)
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v_apps uuid[] := public.label_applications_ids(p_label);
begin
  if auth.uid() is not null and not public.is_admin() then
    raise exception 'podz : réservé aux admins' using errcode = '42501';
  end if;

  return query
  with empiles as (
    -- Combien de comptes actifs portent chaque label dans chaque langue.
    select cl.label_id, lower(c.langue) as langue, count(*)::integer as n
      from compte_labels cl
      join comptes c on c.id = cl.compte_id and c.is_active and c.langue is not null
     group by 1, 2
  ),
  candidats as (
    select c.*
      from comptes c
     where c.is_active
       and (lower(c.langue) = lower(p_langue) or split_part(lower(c.langue), '-', 1) = lower(p_langue))
       and coalesce(c.type_compte, 'perso') = 'perso'
       and not c.ugc_ai and not c.ugcv and not c.videos_uniquement
       and public.compte_applications(c) && v_apps
       and not exists (select 1 from compte_labels cl where cl.compte_id = c.id and cl.label_id = p_label)
       -- Un compte tenu par un label manuel (UGCV, MOTION) ne se déplace pas ici.
       and not exists (select 1 from compte_labels cl join labels l on l.id = cl.label_id
                        where cl.compte_id = c.id and l.manuel)
  )
  select c.id, c.handle_tiktok, c.langue, c.pays, c.created_at::date,
         nullif(trim(coalesce(pr.prenom, '') || ' ' || coalesce(pr.nom, '')), ''),
         coalesce((select jsonb_agg(jsonb_build_object('id', l.id, 'nom', l.nom) order by l.nom)
                     from compte_labels cl join labels l on l.id = cl.label_id where cl.compte_id = c.id), '[]'::jsonb),
         coalesce((select max(e.n) from compte_labels cl join empiles e on e.label_id = cl.label_id and e.langue = lower(c.langue)
                    where cl.compte_id = c.id), 0),
         count(pa.id) filter (where pa.statut = 'publie')::int,
         round(avg(pa.vues) filter (where pa.statut = 'publie' and pa.publie_at <= now() - interval '3 days'))::int,
         max(pa.vues)::int,
         (max(pa.publie_at) filter (where pa.statut = 'publie') at time zone 'Europe/Paris')::date
    from candidats c
    left join profiles pr on pr.id = c.poster_id
    left join passages pa
           on pa.compte_id = c.id
          and pa.publie_at >= now() - interval '15 days'
          and not coalesce(pa.est_rappel, false)
   group by c.id, c.handle_tiktok, c.langue, c.pays, c.created_at, pr.prenom, pr.nom
   order by 8 desc, 10 asc nulls first, c.created_at desc
   limit 200;
end;
$function$;

comment on function public.podz_candidats(uuid, text) is
  'Les comptes actifs d''une langue qui pourraient prendre un label (0782) : ils servent une application du label et ne le portent pas. empilement = comptes de leur label actuel dans leur langue. Les plus empilés d''abord, puis les vues les plus basses. L''OS montre, l''admin choisit.';

-- 3. Le geste.
create or replace function public.compte_deplacer(p_compte uuid, p_de uuid, p_vers uuid, p_raison text default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  c public.comptes;
  v_vers public.labels;
  v_avant uuid[];
  v_apres uuid[];
  v_id bigint;
  v_pod record;
  v_langue_ouverte boolean;
begin
  if auth.uid() is not null and not public.is_admin() then
    raise exception 'comptes : réservé aux admins' using errcode = '42501';
  end if;

  select * into c from comptes where id = p_compte for update;
  if not found then
    raise exception 'comptes : compte inconnu';
  end if;
  select * into v_vers from labels where id = p_vers;
  if not found then
    raise exception 'comptes : label d''arrivée inconnu';
  end if;
  if v_vers.manuel then
    raise exception 'comptes : % est un label manuel, il se pose sur la page Posters', v_vers.nom;
  end if;
  if not (public.compte_applications(c) && public.label_applications_ids(p_vers)) then
    raise exception 'comptes : le label % ne sert aucune application de ce compte', v_vers.nom;
  end if;

  select coalesce(array_agg(cl.label_id order by cl.label_id), '{}') into v_avant from compte_labels cl where cl.compte_id = p_compte;
  if p_de is not null and not (p_de = any (v_avant)) then
    raise exception 'comptes : ce compte ne porte plus le label de départ (il a changé entre-temps)';
  end if;
  if p_de is null and cardinality(v_avant) > 0 then
    raise exception 'comptes : ce compte porte déjà un label, dis lequel il quitte';
  end if;
  if p_vers = any (v_avant) then
    return jsonb_build_object('ok', true, 'change', false, 'compte', p_compte);
  end if;

  if p_de is not null then
    delete from compte_labels where compte_id = p_compte and label_id = p_de;
  end if;
  insert into compte_labels (compte_id, label_id) values (p_compte, p_vers);

  select coalesce(array_agg(cl.label_id order by cl.label_id), '{}') into v_apres from compte_labels cl where cl.compte_id = p_compte;
  insert into comptes_deplacements (compte_id, label_de, label_vers, labels_avant, labels_apres, raison, par)
  values (p_compte, p_de, p_vers, v_avant, v_apres, nullif(trim(p_raison), ''), auth.uid())
  returning id into v_id;

  -- Un label nourri par un podz en images finies : la langue du compte est-elle ouverte ?
  v_langue_ouverte := null;
  for v_pod in select p.langues from pods p where p.label_id = p_vers and p.actif and p.langues is not null loop
    v_langue_ouverte := coalesce(v_langue_ouverte, false) or exists (
      select 1 from unnest(v_pod.langues) x
       where lower(x) = lower(c.langue) or lower(x) = split_part(lower(c.langue), '-', 1));
  end loop;

  return jsonb_build_object('ok', true, 'change', true, 'id', v_id, 'compte', p_compte,
                            'label', v_vers.nom, 'langue_ouverte', v_langue_ouverte);
end;
$function$;

comment on function public.compte_deplacer(uuid, uuid, uuid, text) is
  'Change un compte de label (0782) : retire p_de (nul : il n''en avait pas), pose p_vers, garde ses autres labels, note le geste dans comptes_deplacements. Refuse un label manuel et un label qui ne sert aucune application du compte. langue_ouverte : faux si le label est en images finies et que la langue du compte n''est pas ouverte chez son podz (nul : label sans podz en images finies).';

-- 4. L'annulation.
create or replace function public.compte_deplacement_annuler(p_id bigint)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  d public.comptes_deplacements;
  v_actuels uuid[];
begin
  if auth.uid() is not null and not public.is_admin() then
    raise exception 'comptes : réservé aux admins' using errcode = '42501';
  end if;

  select * into d from comptes_deplacements where id = p_id for update;
  if not found then
    raise exception 'comptes : déplacement inconnu';
  end if;
  if d.annule_le is not null then
    return jsonb_build_object('ok', true, 'change', false, 'id', p_id);
  end if;

  select coalesce(array_agg(cl.label_id order by cl.label_id), '{}') into v_actuels from compte_labels cl where cl.compte_id = d.compte_id;
  if v_actuels <> d.labels_apres then
    raise exception 'comptes : les labels de ce compte ont changé depuis ce déplacement, il ne s''annule plus tout seul';
  end if;

  delete from compte_labels where compte_id = d.compte_id;
  insert into compte_labels (compte_id, label_id)
  select d.compte_id, x from unnest(d.labels_avant) x where exists (select 1 from labels l where l.id = x);
  update comptes_deplacements set annule_le = now(), annule_par = auth.uid() where id = p_id;

  return jsonb_build_object('ok', true, 'change', true, 'id', p_id, 'compte', d.compte_id);
end;
$function$;

comment on function public.compte_deplacement_annuler(bigint) is
  'Annule un déplacement de compte_deplacer() (0782) : remet les labels d''avant, si ceux du compte n''ont pas changé depuis.';

revoke all on function public.podz_places() from public, anon;
revoke all on function public.podz_candidats(uuid, text) from public, anon;
revoke all on function public.compte_deplacer(uuid, uuid, uuid, text) from public, anon;
revoke all on function public.compte_deplacement_annuler(bigint) from public, anon;
revoke all on function public.compte_applications(public.comptes) from public, anon;
revoke all on function public.label_applications_ids(uuid) from public, anon;
grant execute on function public.podz_places(), public.podz_candidats(uuid, text),
  public.compte_deplacer(uuid, uuid, uuid, text), public.compte_deplacement_annuler(bigint),
  public.compte_applications(public.comptes), public.label_applications_ids(uuid) to authenticated, service_role;
