-- 0686 : la file d'import des sources, étalée dans les jours (demande d'Adrien
-- du 12/11 : « il faudrait une file qui étale les imports dans les jours »,
-- « une file complète »).
--
-- Avant : une source ajoutée ou validée importait tout son profil (jusqu'à 600
-- slideshows), tout de suite si rien ne tournait, sinon EN TÊTE du lot du
-- lendemain, devant les mises à jour du lundi, à 6 par jour.
--
-- 1. L'ESSAI. Une source neuve n'importe d'abord que ses 30 meilleurs posts
--    (`comptes_reference.essai_max`). Le lundi à 6 h 02, `sources_essais_juger`
--    lit ses posts chez nous : avec 10 posts mesurés ou plus, elle « tient »
--    (r au-dessus de 1, ou au-dessus de son label : l'essai est levé) ou « ne
--    tient pas » (le plafond reste, la source aussi). `sources_essai_lever`
--    lève un essai à la main.
-- 2. LA TRANCHE. Une mise à jour n'enfile jamais plus de 100 slideshows par
--    source, les plus vus d'abord (`reglages.bleo.sources.posts_max_par_maj`,
--    lu par la fonction d'import). Un gros catalogue s'étale donc sur
--    plusieurs lundis, et seulement tant que la source est retenue (A11).
-- 3. DEUX SOURCES NEUVES PAR JOUR, DERRIÈRE LES MISES À JOUR
--    (`nouvelles_par_jour`). `maj_sources_ajouter` ne lance tout de suite que
--    si rien ne tourne et que le quota du jour n'est pas pris ;
--    `bleo_sources_lot` met les mises à jour d'abord (6 au plus), puis les
--    sources neuves, la plus ancienne d'abord.
-- 4. LA FILE VISIBLE. `sources_file()` rend ce qui tourne, ce qui attend avec
--    son jour au plus tôt, et les essais en cours (page Sources).
--
-- Réglages : `reglages.bleo.sources` (essai_posts 30, essai_mesures_min 10,
-- posts_max_par_maj 100, nouvelles_par_jour 2). Mettre essai_posts ou
-- posts_max_par_maj à 0 retire le plafond correspondant.
--
-- ✅ Appliquée le 2026-11-12 (MCP).
--
-- Retour arrière : remettre `maj_sources_ajouter` et `bleo_sources_lot` de
-- 0669, `sources_candidats_valider` de 0684 ; `select cron.unschedule(
-- 'sources-essais-juger')` ; `update comptes_reference set essai_max = null` ;
-- mettre posts_max_par_maj à 0. Colonnes et fonctions peuvent rester.

set lock_timeout = '5s';

alter table public.comptes_reference
  add column if not exists essai_max integer,
  add column if not exists essai_depuis timestamptz,
  add column if not exists essai_verdict text check (essai_verdict in ('tient', 'ne_tient_pas')),
  add column if not exists essai_juge_le timestamptz;

comment on column public.comptes_reference.essai_max is
  'Essai d''une source neuve (0686) : tant qu''il est posé, la source n''a jamais plus de tant de slideshows importés. Nul : pas de plafond.';
comment on column public.comptes_reference.essai_verdict is
  'Verdict de l''essai (0686) : tient (plafond levé) ou ne_tient_pas (plafond gardé). Nul : essai en cours, ou source d''avant les essais.';

update public.reglages
   set valeur = jsonb_set(valeur, '{sources}',
     jsonb_build_object('essai_posts', 30, 'essai_mesures_min', 10, 'posts_max_par_maj', 100, 'nouvelles_par_jour', 2)
       || coalesce(valeur->'sources', '{}'::jsonb), true)
 where cle = 'bleo';

-- Le jour du prochain lot : aujourd'hui avant 6 h 37 (Paris), sinon demain.
create or replace function public.sources_file_prochain_lot()
returns date
language sql
stable
set search_path to 'public'
as $function$
  select case when (now() at time zone 'Europe/Paris')::time < time '06:37'
              then (now() at time zone 'Europe/Paris')::date
              else (now() at time zone 'Europe/Paris')::date + 1 end;
$function$;

-- La file complète : ce qui tourne, ce qui attend (avec son jour au plus tôt), les essais.
create or replace function public.sources_file()
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  reg jsonb := coalesce((select valeur->'sources' from reglages where cle = 'bleo'), '{}'::jsonb);
  v_lot_max integer := greatest(1, coalesce((reg->>'lot_max')::integer, 6));
  v_npj integer := greatest(0, coalesce((reg->>'nouvelles_par_jour')::integer, 2));
  v_semaine date := date_trunc('week', now() at time zone 'Europe/Paris')::date;
  v_jour date := (now() at time zone 'Europe/Paris')::date;
  v_base date := public.sources_file_prochain_lot();
  v_lancees integer;
  v_dispo integer;
  run jsonb := (select valeur from reglages where cle = 'maj_sources_run');
  v_en_cours jsonb;
  v_attente jsonb;
  v_essais jsonb;
begin
  if auth.uid() is not null and not public.is_admin() then
    raise exception 'sources : réservé aux admins' using errcode = '42501';
  end if;

  select count(*) into v_lancees from bleo_sources_decisions
   where raison = 'ajout' and (lancee_le at time zone 'Europe/Paris')::date = v_jour;
  -- Les places de sources neuves du prochain lot : celles déjà prises aujourd'hui comptent s'il part aujourd'hui.
  v_dispo := greatest(v_npj - case when v_base = v_jour then v_lancees else 0 end, 0);

  if coalesce(run->>'statut', '') = 'running' then
    v_en_cours := jsonb_build_object(
      'handle', run->>'handle',
      'phase', run->>'phase',
      'restant', coalesce((run->>'restant')::integer, 0),
      'faits', coalesce((run->>'faits')::integer, 0),
      'total', jsonb_array_length(coalesce(run->'comptes', '[]'::jsonb)),
      'a_suivre', coalesce((select jsonb_agg(c->>'handle' order by o)
                              from jsonb_array_elements(run->'comptes') with ordinality as t(c, o)
                             where o > coalesce((run->>'index')::integer, 0)), '[]'::jsonb));
  end if;

  with attente as (
    select d.compte_reference_id, cr.handle_tiktok, cr.langue, cr.essai_max, d.raison, d.r_mediane,
           (d.raison = 'ajout') as neuve,
           row_number() over (partition by (d.raison = 'ajout')
                              order by case when d.raison = 'ajout' then cr.created_at end,
                                       d.r_mediane desc nulls last, d.meilleur_vues desc nulls last, cr.handle_tiktok) as rang
      from bleo_sources_decisions d
      join comptes_reference cr on cr.id = d.compte_reference_id and cr.is_active
     where d.semaine = v_semaine and d.decision in ('maj', 'peu_de_mesures') and d.lancee_le is null
  ),
  datee as (
    select a.*,
           case when not a.neuve then v_base + ((a.rang - 1) / v_lot_max)::integer
                when v_npj = 0 then null
                when a.rang <= v_dispo then v_base
                else v_base + 1 + ((a.rang - v_dispo - 1) / v_npj)::integer end as prevu_le
      from attente a
  )
  select jsonb_agg(jsonb_build_object(
           'compte_reference_id', compte_reference_id, 'handle', handle_tiktok, 'langue', langue,
           'sorte', case when neuve then 'neuve' else 'maj' end, 'raison', raison,
           'essai_max', essai_max, 'r', r_mediane, 'prevu_le', prevu_le)
         order by prevu_le nulls last, neuve, rang)
    into v_attente from datee;

  select jsonb_agg(jsonb_build_object(
           'compte_reference_id', cr.id, 'handle', cr.handle_tiktok, 'langue', cr.langue,
           'label', (select min(l.nom) from compte_reference_labels crl join labels l on l.id = crl.label_id
                      where crl.compte_reference_id = cr.id),
           'essai_max', cr.essai_max, 'essai_depuis', cr.essai_depuis,
           'verdict', cr.essai_verdict, 'juge_le', cr.essai_juge_le,
           'importes', (select count(*) from contenus c where c.compte_reference_id = cr.id),
           'valides', (select count(*) from contenus c where c.compte_reference_id = cr.id
                        and c.statut = 'valide' and c.import_statut = 'done'),
           'posts', coalesce(sp.posts, 0), 'r', sp.r_mediane, 'r_vs_label', sp.r_vs_label)
         order by cr.essai_depuis desc)
    into v_essais
    from comptes_reference cr
    left join source_performance sp on sp.compte_reference_id = cr.id
   where cr.essai_depuis is not null and cr.is_active
     and (cr.essai_juge_le is null or cr.essai_juge_le > now() - interval '30 days');

  return jsonb_build_object(
    'en_cours', v_en_cours,
    'attente', coalesce(v_attente, '[]'::jsonb),
    'essais', coalesce(v_essais, '[]'::jsonb),
    'prochain_lot', v_base,
    'reglages', jsonb_build_object(
      'lot_max', v_lot_max, 'nouvelles_par_jour', v_npj,
      'essai_posts', coalesce((reg->>'essai_posts')::integer, 30),
      'essai_mesures_min', coalesce((reg->>'essai_mesures_min')::integer, 10),
      'posts_max_par_maj', coalesce((reg->>'posts_max_par_maj')::integer, 100)));
end;
$function$;

comment on function public.sources_file() is
  'Sources (0686) : la file d''import. Rend {en_cours, attente[] avec prevu_le (jour au plus tôt), essais[], prochain_lot, reglages}.';

-- Une source ajoutée : en essai si elle est neuve, puis dans la file, 2 par jour au plus.
create or replace function public.maj_sources_ajouter(p_compte uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  reg jsonb := coalesce((select valeur->'sources' from reglages where cle = 'bleo'), '{}'::jsonb);
  v_semaine date := date_trunc('week', now() at time zone 'Europe/Paris')::date;
  v_jour date := (now() at time zone 'Europe/Paris')::date;
  v_npj integer := greatest(0, coalesce((reg->>'nouvelles_par_jour')::integer, 2));
  v_essai integer := coalesce((reg->>'essai_posts')::integer, 30);
  v_compte jsonb;
  v_demarrage jsonb;
  v_lancees integer;
  v_essai_pose integer;
begin
  if auth.uid() is not null and not public.is_admin() then
    raise exception 'sources : réservé aux admins' using errcode = '42501';
  end if;

  select jsonb_build_object('id', id, 'handle', handle_tiktok, 'langue', langue) into v_compte
    from comptes_reference where id = p_compte and is_active;
  if v_compte is null then
    raise exception 'sources : source introuvable ou inactive';
  end if;

  -- L'essai : seulement pour une source qui n'a encore rien en stock et jamais été jugée.
  update comptes_reference
     set essai_max = v_essai, essai_depuis = now()
   where id = p_compte and v_essai > 0 and essai_max is null and essai_verdict is null
     and not exists (select 1 from contenus c where c.compte_reference_id = p_compte);
  select essai_max into v_essai_pose from comptes_reference where id = p_compte;

  insert into bleo_sources_decisions (semaine, compte_reference_id, posts, decision, raison)
  values (v_semaine, p_compte, 0, 'peu_de_mesures', 'ajout')
  on conflict (semaine, compte_reference_id) do update
     set decision = 'peu_de_mesures', raison = 'ajout', lancee_le = null;

  select count(*) into v_lancees from bleo_sources_decisions
   where raison = 'ajout' and (lancee_le at time zone 'Europe/Paris')::date = v_jour;

  if v_lancees < v_npj
     and coalesce((select valeur->>'statut' from reglages where cle = 'maj_sources_run'), '') <> 'running' then
    v_demarrage := public.maj_sources_demarrer(jsonb_build_array(v_compte));
    if v_demarrage->>'action' <> 'deja' then
      update bleo_sources_decisions set lancee_le = now()
       where semaine = v_semaine and compte_reference_id = p_compte;
      return jsonb_build_object('file', 'lancee', 'essai_max', v_essai_pose);
    end if;
  end if;

  return jsonb_build_object(
    'file', 'attente',
    'essai_max', v_essai_pose,
    'prevu_le', (select e->>'prevu_le' from jsonb_array_elements(public.sources_file()->'attente') e
                  where e->>'compte_reference_id' = p_compte::text));
end;
$function$;

comment on function public.maj_sources_ajouter(uuid) is
  'Sources (0669, 0686) : une source ajoutée passe par la file. Neuve, elle est mise en essai (ses meilleurs posts d''abord). Lancée tout de suite si rien ne tourne et que le quota de sources neuves du jour n''est pas pris, sinon elle attend. Rend {file: lancee | attente, essai_max, prevu_le}.';

-- Le lot du jour : les mises à jour d'abord, puis les sources neuves dans leur quota.
create or replace function public.bleo_sources_lot(p_forcer boolean default false)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  reg jsonb := coalesce((select valeur->'sources' from reglages where cle = 'bleo'), '{}'::jsonb);
  v_paris timestamp := now() at time zone 'Europe/Paris';
  v_semaine date := date_trunc('week', now() at time zone 'Europe/Paris')::date;
  v_lot_max integer := greatest(1, coalesce((reg->>'lot_max')::integer, 6));
  v_npj integer := greatest(0, coalesce((reg->>'nouvelles_par_jour')::integer, 2));
  v_lancees integer;
  v_ids uuid[];
  v_comptes jsonb;
  v_demarrage jsonb;
begin
  if auth.uid() is not null and not public.is_admin() then
    raise exception 'bleo : réservé aux admins' using errcode = '42501';
  end if;
  if not p_forcer and extract(hour from v_paris) <> 6 then
    return jsonb_build_object('ignore', 'pas 6 h à Paris');
  end if;
  -- Un lot à la fois : celui d'avant doit être fini.
  if (select valeur->>'statut' from reglages where cle = 'maj_sources_run') = 'running' then
    return jsonb_build_object('lot', 'attend : une mise à jour est en cours');
  end if;

  select count(*) into v_lancees from bleo_sources_decisions
   where raison = 'ajout' and (lancee_le at time zone 'Europe/Paris')::date = v_paris::date;

  -- 0686 : les mises à jour d'abord (lot_max), puis les sources neuves, la
  -- plus ancienne d'abord, dans ce qui reste du quota du jour.
  select array_agg(id order by neuve, rang) into v_ids
    from (select d.compte_reference_id as id, (d.raison = 'ajout') as neuve,
                 row_number() over (partition by (d.raison = 'ajout')
                                    order by case when d.raison = 'ajout' then cr.created_at end,
                                             d.r_mediane desc nulls last, d.meilleur_vues desc nulls last, cr.handle_tiktok) as rang
            from bleo_sources_decisions d
            join comptes_reference cr on cr.id = d.compte_reference_id and cr.is_active
           where d.semaine = v_semaine and d.decision in ('maj', 'peu_de_mesures') and d.lancee_le is null) z
   where (not neuve and rang <= v_lot_max) or (neuve and rang <= greatest(v_npj - v_lancees, 0));

  if v_ids is null then
    return jsonb_build_object('lot', 'rien à lancer');
  end if;

  select jsonb_agg(jsonb_build_object('id', cr.id, 'handle', cr.handle_tiktok, 'langue', cr.langue)
                   order by array_position(v_ids, cr.id))
    into v_comptes
    from comptes_reference cr where cr.id = any (v_ids);

  v_demarrage := public.maj_sources_demarrer(v_comptes);
  if v_demarrage->>'action' = 'deja' then
    return jsonb_build_object('lot', 'attend : une mise à jour est en cours');
  end if;

  update bleo_sources_decisions set lancee_le = now()
   where semaine = v_semaine and compte_reference_id = any (v_ids);

  return jsonb_build_object(
    'lot', 'lancé',
    'sources', (select jsonb_agg(c->>'handle') from jsonb_array_elements(v_comptes) c),
    'restent', (select count(*) from bleo_sources_decisions
                 where semaine = v_semaine and decision in ('maj', 'peu_de_mesures') and lancee_le is null)
  );
end;
$function$;

comment on function public.bleo_sources_lot(boolean) is
  'BLEO (0667, 0686) : lance le lot du jour si aucune mise à jour n''est en cours : au plus `lot_max` mises à jour retenues de la semaine, la meilleure d''abord, puis les sources neuves dans le quota `nouvelles_par_jour`. Chaque jour à 6 h 37 (cron `bleo-sources-lot`), et le lundi juste après les décisions. `p_forcer` : hors de 6 h.';

-- Le verdict des essais, le lundi avant la règle des sources.
create or replace function public.sources_essais_juger(p_forcer boolean default false)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  reg jsonb := coalesce((select valeur->'sources' from reglages where cle = 'bleo'), '{}'::jsonb);
  v_paris timestamp := now() at time zone 'Europe/Paris';
  v_mesures integer := greatest(1, coalesce((reg->>'essai_mesures_min')::integer, 10));
  v_r_min numeric := coalesce((reg->>'r_min')::numeric, 1);
  v_rl_min numeric := coalesce((reg->>'r_vs_label_min')::numeric, 1);
  v_juges jsonb;
begin
  if auth.uid() is not null and not public.is_admin() then
    raise exception 'sources : réservé aux admins' using errcode = '42501';
  end if;
  if not p_forcer and (extract(isodow from v_paris) <> 1 or extract(hour from v_paris) <> 6) then
    return jsonb_build_object('ignore', 'pas lundi 6 h à Paris');
  end if;

  with juges as (
    update comptes_reference cr
       set essai_verdict = case when coalesce(sp.r_mediane, 0) > v_r_min or coalesce(sp.r_vs_label, 0) > v_rl_min
                                then 'tient' else 'ne_tient_pas' end,
           essai_juge_le = now(),
           essai_max = case when coalesce(sp.r_mediane, 0) > v_r_min or coalesce(sp.r_vs_label, 0) > v_rl_min
                            then null else cr.essai_max end
      from source_performance sp
     where sp.compte_reference_id = cr.id and cr.essai_max is not null and cr.essai_verdict is null
       and sp.posts >= v_mesures
    returning cr.handle_tiktok, cr.essai_verdict)
  select jsonb_object_agg(handle_tiktok, essai_verdict) into v_juges from juges;

  return jsonb_build_object('juges', coalesce(v_juges, '{}'::jsonb));
end;
$function$;

comment on function public.sources_essais_juger(boolean) is
  'Sources (0686) : le lundi à 6 h 02 (cron `sources-essais-juger`), juge les sources en essai qui ont assez de posts mesurés chez nous : r au-dessus de 1 ou au-dessus de son label, l''essai est levé ; sinon le plafond reste.';

-- Lever un essai à la main : la suite s'importe par la file, par tranches.
create or replace function public.sources_essai_lever(p_compte uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if auth.uid() is not null and not public.is_admin() then
    raise exception 'sources : réservé aux admins' using errcode = '42501';
  end if;
  update comptes_reference
     set essai_max = null, essai_verdict = 'tient', essai_juge_le = now()
   where id = p_compte and essai_depuis is not null;
  if not found then
    raise exception 'sources : cette source n''est pas en essai';
  end if;
  return public.maj_sources_ajouter(p_compte);
end;
$function$;

comment on function public.sources_essai_lever(uuid) is
  'Sources (0686) : lève l''essai d''une source à la main et la remet dans la file ; la suite de son catalogue s''importe par tranches.';

-- Valider une proposition : la réponse dit aussi quand l'import partira.
create or replace function public.sources_candidats_valider(p_id uuid, p_label uuid, p_langue text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_candidat sources_candidats;
  v_label text;
  v_source uuid;
  v_file jsonb;
begin
  if auth.uid() is not null and not public.is_admin() then
    raise exception 'sources : réservé aux admins' using errcode = '42501';
  end if;

  select * into v_candidat from sources_candidats where id = p_id for update;
  if v_candidat.id is null then
    raise exception 'sources : proposition introuvable';
  end if;
  if v_candidat.statut = 'valide' then
    raise exception 'sources : @% est déjà validé', v_candidat.handle_tiktok;
  end if;

  select nom into v_label from labels where id = p_label;
  if v_label is null then
    raise exception 'sources : choisis un label';
  end if;
  if coalesce(btrim(p_langue), '') = '' then
    raise exception 'sources : choisis une langue';
  end if;
  if exists (select 1 from comptes_reference
              where lower(ltrim(btrim(handle_tiktok), '@')) = v_candidat.handle_tiktok) then
    raise exception 'sources : @% est déjà une source', v_candidat.handle_tiktok;
  end if;

  insert into comptes_reference (handle_tiktok, niche, langue)
  values (v_candidat.handle_tiktok, v_label, p_langue)
  returning id into v_source;

  perform public.set_labels_source(v_source, array[p_label]);
  v_file := public.maj_sources_ajouter(v_source);

  update sources_candidats
     set statut = 'valide', label_id = p_label, langue = p_langue, raison_refus = null,
         compte_reference_id = v_source, decide_par = auth.uid(), decide_le = now(), updated_at = now()
   where id = p_id;

  return jsonb_build_object('compte_reference_id', v_source, 'handle', v_candidat.handle_tiktok,
                            'file', v_file->>'file', 'essai_max', v_file->'essai_max', 'prevu_le', v_file->>'prevu_le');
end;
$function$;

revoke all on function public.sources_file() from public, anon;
revoke all on function public.sources_file_prochain_lot() from public, anon;
revoke all on function public.sources_essais_juger(boolean) from public, anon;
revoke all on function public.sources_essai_lever(uuid) from public, anon;
grant execute on function public.sources_file() to authenticated, service_role;
grant execute on function public.sources_file_prochain_lot() to authenticated, service_role;
grant execute on function public.sources_essais_juger(boolean) to authenticated, service_role;
grant execute on function public.sources_essai_lever(uuid) to authenticated, service_role;

select cron.unschedule('sources-essais-juger') where exists (select 1 from cron.job where jobname = 'sources-essais-juger');
select cron.schedule('sources-essais-juger', '2 4,5 * * 1', 'select public.sources_essais_juger()');
