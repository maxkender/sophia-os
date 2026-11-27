-- 0874 : les PALIERS des labels 100 % podz (décision d'Adrien du 27/11).
--
-- Avant : un label 100 % podz restait « en test » (4 comptes au plus, jugé à
-- 30 posts), et ses comptes n'arrivaient qu'au fil des créations : « 0/4
-- comptes · 0/30 posts » pendant des jours.
--
-- Désormais, pour les NOUVEAUX labels 100 % podz (et les anciens qu'on y
-- bascule à la main, sans rien leur retirer) :
--   palier 1 : 7 langues ouvertes, 1 compte par langue (7 comptes) ;
--   palier 2 : une semaine à r > 0,9 → 14 langues, 1 compte par langue ;
--   palier 3 : une semaine à r > 0,9 → 14 langues, 2 comptes par langue (28).
--   Le palier 3 est le dernier automatique : au-delà, Adrien ou Max.
--   Sous 0,9, le label reste à son palier (la fermeture habituelle le juge
--   toujours : perf sous 0,75 à 150 posts).
-- Les comptes viennent des NOUVEAUX comptes : une place libre d'un palier
-- (langue ouverte où le label a moins de comptes que son palier n'en donne)
-- passe avant tout au choix de label (`placeLibrePod`, 0794, généralisée ici à
-- 1 ou 2 comptes par langue). Rien n'est pris aux autres labels.
-- Un label au palier n'est plus « en test » et ne reçoit aucun compte hors de
-- ses places (`palierPlein` dans `_shared/choix_label_equilibre.ts`).
--
-- r de la semaine : la médiane des r de ses passages publiés et mûrs (publiés
-- il y a 3 à 10 jours) ; r = vues ÷ médiane des vues du compte, comme
-- `npm run etat` des podz. Il faut 14 passages au moins, et 7 jours au palier.
--
-- Les langues d'un palier s'ouvrent toutes seules (`podz_langue`, par
-- « claude », raison { palier }) : d'abord celles déjà ouvertes, puis les plus
-- recrutées sur 28 jours (sans ar, he, fa, ur, ja). Le podz les prépare et les
-- livre le jour même (pods/ROUTINE.md §5.6). La soupape du dimanche (0722,
-- 0784) ne touche plus aux labels au palier.
--
-- Qui est au palier : les labels 100 % podz créés depuis le 27/11 (réglage
-- `podz_paliers.depuis`, ceux lancés ce jour-là compris), d'office ; un ancien
-- label par `podz_passer_en_paliers(label)` (bouton de la carte « Labels 100 %
-- podz », page Allocation) : il entre au palier de ses comptes (7 ou moins →
-- 1, 14 ou moins → 2, sinon 3), n'en perd aucun, et ses langues ouvertes
-- restent ouvertes. `podz_passer_en_paliers(label, 0)` le rend à l'ancien test.
--
-- Une tâche horaire (`podz-paliers`) fait entrer les nouveaux labels, monte
-- les paliers et ouvre leurs langues.
--
-- ✅ Appliquée le 2026-11-27 (MCP), après l'accord d'Adrien ; premier passage :
-- ssazem, msclzz, scilla_art et dorian_art au palier 1. Additive : deux colonnes, un journal, un
-- réglage, six fonctions, une tâche ; la soupape exclut les labels au palier.
-- Retour arrière : `select cron.unschedule('podz-paliers')`, mettre
-- `labels.palier_podz` à null partout (le moteur retombe sur l'ancien test),
-- réappliquer `bleo_ouvrir_langues_podz` de 0784.

set lock_timeout = '5s';

-- 1. Le palier d'un label.
alter table public.labels add column if not exists palier_podz smallint;
alter table public.labels add column if not exists palier_podz_depuis timestamptz;
do $p$
begin
  if not exists (select 1 from pg_constraint where conname = 'labels_palier_podz_check') then
    alter table public.labels add constraint labels_palier_podz_check check (palier_podz between 1 and 3);
  end if;
end
$p$;
comment on column public.labels.palier_podz is
  'Palier d''un label 100 % podz (0874) : 1 = 7 langues × 1 compte, 2 = 14 × 1, 3 = 14 × 2 (réglage podz_paliers). Nul : l''ancien test (4 comptes, 30 posts).';
comment on column public.labels.palier_podz_depuis is
  'Depuis quand le label est à son palier (0874) : il faut 7 jours au palier avant de monter.';

-- 2. Le journal des paliers.
create table if not exists public.podz_paliers_journal (
  id bigint generated always as identity primary key,
  label_id uuid not null references public.labels(id) on delete cascade,
  de smallint,
  a smallint,
  par text not null check (par in ('auto', 'admin', 'claude')),
  raison jsonb,
  le timestamptz not null default now()
);
create index if not exists podz_paliers_journal_label_idx on public.podz_paliers_journal (label_id, le desc);
alter table public.podz_paliers_journal enable row level security;
drop policy if exists "admins lisent le journal des paliers" on public.podz_paliers_journal;
create policy "admins lisent le journal des paliers" on public.podz_paliers_journal
  for select to authenticated using (public.is_admin());
comment on table public.podz_paliers_journal is
  'Les entrées et montées de palier des labels 100 % podz (0874) : qui (auto, admin, claude), de quel palier à quel palier, pourquoi (r de la semaine, passages).';

-- 3. Le réglage.
insert into public.reglages (cle, valeur)
values ('podz_paliers', jsonb_build_object(
  'depuis', '2026-11-27T00:00:00Z',
  'paliers', jsonb_build_array(
    jsonb_build_object('langues', 7, 'comptes_par_langue', 1),
    jsonb_build_object('langues', 14, 'comptes_par_langue', 1),
    jsonb_build_object('langues', 14, 'comptes_par_langue', 2)),
  'seuil_r', 0.9,
  'passages_min', 14,
  'jours_min', 7,
  'fenetre_jours', 7,
  'maturite_jours', 3,
  'recrues_jours', 28,
  'exclues', jsonb_build_array('ar', 'he', 'fa', 'ur', 'ja')))
on conflict (cle) do nothing;

-- 4. Ce que donne un palier : { langues, comptes_par_langue }.
create or replace function public.podz_palier_cible(p_palier smallint)
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $function$
  select (select valeur->'paliers'->(p_palier - 1) from reglages where cle = 'podz_paliers')
   where p_palier between 1 and 3;
$function$;

-- 5. Les places des podz dans une langue, pour le choix de label.
--    cible = comptes que le label peut avoir dans cette langue : celle de son
--    palier si la langue est ouverte par un podz actif (1 sans palier, comme
--    0794), 0 pour un label au palier dont la langue n'est pas ouverte.
create or replace function public.podz_places_langue(p_langue text)
returns table (label_id uuid, palier smallint, cible integer)
language sql
stable
security definer
set search_path to 'public'
as $function$
  with l0 as (
    select lower(btrim(p_langue)) as lg
     where nullif(btrim(coalesce(p_langue, '')), '') is not null
  ),
  ouverts as (
    select distinct p.label_id
      from pods p, l0
     where p.actif and p.label_id is not null and p.langues is not null
       and exists (select 1 from unnest(p.langues) x where lower(x) in (l0.lg, split_part(l0.lg, '-', 1)))
  )
  select l.id, l.palier_podz,
         case when o.label_id is null then 0
              else coalesce((public.podz_palier_cible(l.palier_podz)->>'comptes_par_langue')::integer, 1) end
    from labels l
    left join ouverts o on o.label_id = l.id
   where (o.label_id is not null or l.palier_podz is not null)
     and exists (select 1 from l0);
$function$;

-- 6. Le r de la semaine d'un label : médiane des r de ses passages mûrs.
create or replace function public.podz_label_r_semaine(p_label uuid)
returns table (passages integer, r_median numeric)
language sql
stable
security definer
set search_path to 'public'
as $function$
  with cfg as (
    select coalesce((valeur->>'fenetre_jours')::integer, 7) as fenetre,
           coalesce((valeur->>'maturite_jours')::integer, 3) as maturite
      from reglages where cle = 'podz_paliers'
  ),
  p as (
    select pa.compte_id, pa.vues::numeric as v
      from passages pa, cfg
     where pa.statut = 'publie' and pa.vues is not null
       and pa.date_publication_prevue > current_date - (cfg.fenetre + cfg.maturite)
       and pa.date_publication_prevue <= current_date - cfg.maturite
       and exists (select 1 from contenu_labels cl where cl.contenu_id = pa.contenu_id and cl.label_id = p_label)
  ),
  m as (
    select pa.compte_id, percentile_cont(0.5) within group (order by pa.vues) as med
      from passages pa
     where pa.statut = 'publie' and pa.vues is not null
       and pa.compte_id in (select distinct compte_id from p)
     group by pa.compte_id
  )
  select count(*)::integer,
         round((percentile_cont(0.5) within group (order by p.v / m.med))::numeric, 3)
    from p join m using (compte_id)
   where m.med > 0;
$function$;

-- 7. Ouvrir les langues que le palier d'un label demande. Rend les langues ouvertes.
create or replace function public.podz_palier_ouvrir_langues(p_label uuid)
returns text[]
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  cfg jsonb := coalesce((select valeur from reglages where cle = 'podz_paliers'), '{}'::jsonb);
  v_exclues text[] := coalesce(array(select lower(jsonb_array_elements_text(cfg->'exclues'))), array['ar','he','fa','ur','ja']);
  v_jours integer := coalesce((cfg->>'recrues_jours')::integer, 28);
  v_palier smallint;
  v_cible integer;
  v_pod text;
  v_n integer;
  v_langue text;
  v_ouvertes text[] := '{}';
begin
  select palier_podz into v_palier from labels where id = p_label;
  if v_palier is null then
    return v_ouvertes;
  end if;
  v_cible := (public.podz_palier_cible(v_palier)->>'langues')::integer;
  -- Le podz d'images finies du label (le plus ancien s'il y en a deux).
  select slug into v_pod
    from pods where label_id = p_label and actif and langues is not null
   order by created_at nulls last, slug limit 1;
  if v_pod is null or v_cible is null then
    return v_ouvertes;
  end if;
  loop
    select count(*)::integer into v_n
      from pods p cross join lateral unnest(p.langues) x
     where p.label_id = p_label and p.actif and p.langues is not null;
    exit when v_n >= v_cible;
    -- La langue la plus recrutée qui reste au label.
    select x.langue into v_langue
      from (select lower(c.langue) as langue, count(*) as n
              from comptes c
             where c.is_active and c.langue is not null and c.created_at >= now() - make_interval(days => v_jours)
             group by 1) x
     where split_part(x.langue, '-', 1) <> all (v_exclues)
       and not exists (select 1 from pods p2 cross join lateral unnest(p2.langues) d
                        where p2.label_id = p_label and p2.langues is not null
                          and (lower(d) = x.langue or lower(d) = split_part(x.langue, '-', 1)))
     order by x.n desc, x.langue
     limit 1;
    exit when v_langue is null;
    perform public.podz_langue(v_pod, v_langue, 'ouvrir', 'claude',
                               jsonb_build_object('palier', v_palier, 'regle', 'paliers podz (0874)'));
    v_ouvertes := v_ouvertes || v_langue;
  end loop;
  return v_ouvertes;
end;
$function$;

-- 8. La tâche horaire : entrée des nouveaux labels, montées, langues.
create or replace function public.podz_paliers_maj()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  cfg jsonb := coalesce((select valeur from reglages where cle = 'podz_paliers'), '{}'::jsonb);
  v_depuis timestamptz := coalesce((cfg->>'depuis')::timestamptz, now());
  v_seuil numeric := coalesce((cfg->>'seuil_r')::numeric, 0.9);
  v_min integer := coalesce((cfg->>'passages_min')::integer, 14);
  v_jours integer := coalesce((cfg->>'jours_min')::integer, 7);
  v_max smallint := coalesce(jsonb_array_length(cfg->'paliers'), 3)::smallint;
  r record;
  s record;
  v_entres jsonb := '[]';
  v_montes jsonb := '[]';
  v_langues jsonb := '{}';
  v_ouvertes text[];
begin
  if auth.uid() is not null and not public.is_admin() then
    raise exception 'podz : réservé aux admins' using errcode = '42501';
  end if;

  -- Les nouveaux labels 100 % podz entrent au palier 1.
  for r in
    select l.id, l.slug
      from labels_100_podz v join labels l on l.id = v.label_id
     where l.palier_podz is null and v.pod_actif and l.created_at >= v_depuis
  loop
    update labels set palier_podz = 1, palier_podz_depuis = now() where id = r.id;
    insert into podz_paliers_journal (label_id, de, a, par, raison)
    values (r.id, null, 1, 'auto', jsonb_build_object('regle', 'nouveau label 100 % podz'));
    v_entres := v_entres || to_jsonb(r.slug);
  end loop;

  -- Une semaine à r > seuil (7 jours au palier, assez de passages) : palier suivant.
  for r in
    select l.id, l.slug, l.palier_podz
      from labels l
     where l.palier_podz is not null and l.palier_podz < v_max
       and coalesce(l.palier_podz_depuis, now()) <= now() - make_interval(days => v_jours)
  loop
    select * into s from public.podz_label_r_semaine(r.id);
    if coalesce(s.passages, 0) >= v_min and coalesce(s.r_median, 0) > v_seuil then
      update labels set palier_podz = r.palier_podz + 1, palier_podz_depuis = now() where id = r.id;
      insert into podz_paliers_journal (label_id, de, a, par, raison)
      values (r.id, r.palier_podz, r.palier_podz + 1, 'auto',
              jsonb_build_object('r_semaine', s.r_median, 'passages', s.passages, 'seuil', v_seuil));
      v_montes := v_montes || jsonb_build_object('label', r.slug, 'palier', r.palier_podz + 1, 'r', s.r_median, 'passages', s.passages);
    end if;
  end loop;

  -- Les langues que chaque palier demande.
  for r in select l.id, l.slug from labels l where l.palier_podz is not null loop
    v_ouvertes := public.podz_palier_ouvrir_langues(r.id);
    if cardinality(v_ouvertes) > 0 then
      v_langues := v_langues || jsonb_build_object(r.slug, to_jsonb(v_ouvertes));
    end if;
  end loop;

  return jsonb_build_object('entres', v_entres, 'montes', v_montes, 'langues_ouvertes', v_langues);
end;
$function$;

-- 9. Basculer un ancien label aux paliers (ou l'en sortir : p_palier = 0).
create or replace function public.podz_passer_en_paliers(p_label uuid, p_palier smallint default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_avant smallint;
  v_apres smallint;
  v_comptes integer;
  v_ouvertes text[] := '{}';
begin
  if auth.uid() is not null and not public.is_admin() then
    raise exception 'podz : réservé aux admins' using errcode = '42501';
  end if;
  if not exists (select 1 from labels_100_podz where label_id = p_label) then
    raise exception 'podz : ce label n''est pas un label 100 %% podz';
  end if;
  select palier_podz into v_avant from labels where id = p_label for update;
  select count(distinct cl.compte_id)::integer into v_comptes
    from compte_labels cl join comptes c on c.id = cl.compte_id and c.is_active
   where cl.label_id = p_label;
  if p_palier = 0 then
    v_apres := null;
  else
    -- Le palier de ses comptes : il n'en perd aucun.
    v_apres := coalesce(p_palier, case when v_comptes <= 7 then 1 when v_comptes <= 14 then 2 else 3 end);
    if v_apres not between 1 and 3 then
      raise exception 'podz : palier % inconnu (1, 2 ou 3 ; 0 pour revenir à l''ancien test)', v_apres;
    end if;
  end if;
  if v_apres is not distinct from v_avant then
    return jsonb_build_object('ok', true, 'change', false, 'palier', v_avant, 'comptes', v_comptes);
  end if;
  update labels set palier_podz = v_apres, palier_podz_depuis = case when v_apres is null then null else now() end
   where id = p_label;
  insert into podz_paliers_journal (label_id, de, a, par, raison)
  values (p_label, v_avant, v_apres, case when auth.uid() is null then 'claude' else 'admin' end,
          jsonb_build_object('regle', case when v_apres is null then 'retour à l''ancien test' else 'bascule d''un ancien label' end,
                             'comptes', v_comptes));
  if v_apres is not null then
    v_ouvertes := public.podz_palier_ouvrir_langues(p_label);
  end if;
  return jsonb_build_object('ok', true, 'change', true, 'de', v_avant, 'palier', v_apres, 'comptes', v_comptes,
                            'langues_ouvertes', to_jsonb(v_ouvertes));
end;
$function$;

-- 10. L'état des paliers, pour la page Allocation.
create or replace function public.podz_paliers_etat()
returns table (label_id uuid, label text, pod text, palier smallint, depuis timestamptz,
               langues_cible integer, comptes_par_langue integer, langues_ouvertes integer, comptes integer,
               passages_semaine integer, r_semaine numeric, montee_possible_le timestamptz)
language sql
stable
security definer
set search_path to 'public'
as $function$
  select l.id, l.slug, v.pod, l.palier_podz, l.palier_podz_depuis,
         (public.podz_palier_cible(l.palier_podz)->>'langues')::integer,
         (public.podz_palier_cible(l.palier_podz)->>'comptes_par_langue')::integer,
         (select count(*)::integer from pods p cross join lateral unnest(p.langues) x
           where p.label_id = l.id and p.actif and p.langues is not null),
         (select count(distinct cl.compte_id)::integer from compte_labels cl
            join comptes c on c.id = cl.compte_id and c.is_active where cl.label_id = l.id),
         s.passages, s.r_median,
         case when l.palier_podz is not null and l.palier_podz < 3
              then l.palier_podz_depuis + make_interval(days => coalesce(
                     (select (valeur->>'jours_min')::integer from reglages where cle = 'podz_paliers'), 7)) end
    from labels_100_podz v
    join labels l on l.id = v.label_id
    left join lateral public.podz_label_r_semaine(l.id) s on true
   where v.pod_actif and (auth.uid() is null or public.is_admin());
$function$;

revoke all on function public.podz_palier_cible(smallint) from public, anon;
revoke all on function public.podz_places_langue(text) from public, anon;
revoke all on function public.podz_label_r_semaine(uuid) from public, anon;
revoke all on function public.podz_palier_ouvrir_langues(uuid) from public, anon, authenticated;
revoke all on function public.podz_paliers_maj() from public, anon;
revoke all on function public.podz_passer_en_paliers(uuid, smallint) from public, anon;
revoke all on function public.podz_paliers_etat() from public, anon;
grant execute on function public.podz_palier_cible(smallint) to authenticated, service_role;
grant execute on function public.podz_places_langue(text) to authenticated, service_role;
grant execute on function public.podz_label_r_semaine(uuid) to authenticated, service_role;
grant execute on function public.podz_palier_ouvrir_langues(uuid) to service_role;
grant execute on function public.podz_paliers_maj() to authenticated, service_role;
grant execute on function public.podz_passer_en_paliers(uuid, smallint) to authenticated, service_role;
grant execute on function public.podz_paliers_etat() to authenticated, service_role;

comment on function public.podz_places_langue(text) is
  'Les places des podz dans une langue (0874) : label, palier, et combien de comptes il peut y avoir (palier, 1 sans palier, 0 hors de ses langues). Lue par le choix de label.';
comment on function public.podz_paliers_maj() is
  'Tâche horaire des paliers podz (0874) : nouveaux labels au palier 1, montée après une semaine à r > 0,9, langues du palier ouvertes.';
comment on function public.podz_passer_en_paliers(uuid, smallint) is
  'Bascule un ancien label 100 % podz aux paliers (0874), au palier de ses comptes sans en retirer aucun ; 0 le rend à l''ancien test.';

-- 11. La soupape du dimanche ne touche plus aux labels au palier.
do $p$
declare
  d text := pg_get_functiondef('public.bleo_ouvrir_langues_podz(boolean)'::regprocedure);
  avant text := E'     where p.actif and p.langues is not null\n     -- Le label le plus performant choisit d''abord.';
  apres text := E'     where p.actif and p.langues is not null\n       and l.palier_podz is null  -- 0874 : les paliers ouvrent leurs langues eux-mêmes\n     -- Le label le plus performant choisit d''abord.';
begin
  if position('l.palier_podz is null' in d) > 0 then
    return;
  end if;
  if position(avant in d) = 0 then
    raise exception '0874 : soupape introuvable telle qu''attendue, rien n''est changé';
  end if;
  execute replace(d, avant, apres);
end
$p$;

-- 12. La tâche horaire.
do $p$
begin
  if exists (select 1 from cron.job where jobname = 'podz-paliers') then
    perform cron.unschedule('podz-paliers');
  end if;
  perform cron.schedule('podz-paliers', '23 * * * *', 'select public.podz_paliers_maj();');
end
$p$;
