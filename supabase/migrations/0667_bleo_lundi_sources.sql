-- 0667 : BLEO, la mise à jour des sources chaque lundi (règle A11, partie de L3 ;
-- décisions d'Adrien du 10/11 : « automatique tous les lundis, avec compte
-- rendu, uniquement les comptes qui ont un r correct », « avec la règle des
-- 100k en plus », « progressif, pas tout d'un coup, il faut pas que Supabase
-- saute »).
--
-- Plus aucun import depuis le 25/10 : la mise à jour des sources est un bouton
-- (page Sources, « Mettre à jour les sources »), personne ne l'a lancé, et le
-- lundi automatique de la spec (L3, `bleo-lundi`) n'avait pas été construit.
-- Or les imports gagnants portent 60 % de la récolte, et les 218 imports encore
-- testables (moins de 30 jours) seront tous trop vieux vers le 24/11.
--
-- 1. LE LUNDI À 6 H 07 (Paris), `bleo_lundi_sources` juge chaque source active
--    sur ses posts chez nous, publiés il y a 3 à 30 jours, hors rappels.
--    Seuils dans `reglages.bleo.sources` :
--      * listée dans `toujours` (handles)            → retenue (`toujours`) ;
--      * moins de `posts_min` (5) posts mesurés       → retenue (`neuve`) ;
--      * r médian > `r_min` (1)                       → retenue (`r`) ;
--      * r face à son label > `r_vs_label_min` (1)    → retenue (`label`) ;
--      * un post à `vues_coup` (100 000) vues ou plus → retenue (`100k`) ;
--      * sinon `pas_maj` : pas cette semaine ; la source reste active, ses
--        contenus aussi, elle est rejugée le lundi suivant.
--    Chaque décision est écrite dans `bleo_sources_decisions` (une ligne par
--    source et par semaine), avec sa raison et le meilleur post de la source.
-- 2. PAR LOTS, PAS TOUT D'UN COUP. `bleo_sources_lot` lance au plus `lot_max`
--    (6) sources retenues par jour, la meilleure d'abord : le lundi juste après
--    les décisions, puis chaque jour à 6 h 37 tant qu'il en reste, et seulement
--    si le lot de la veille est fini. Dans un lot, le circuit du bouton
--    (`maj_sources_demarrer`) prend une source à la fois et attend que la file
--    d'import soit vide avant la suivante ; seuls les posts publiés depuis le
--    dernier relevé sont importés (`nouveauxSeulement`). Les drains
--    `import-contenu-drain-N` (2 actifs) font avancer la file.
-- 3. LE COMPTE RENDU : la vue `bleo_sources_semaine_ui` (page Sources, panneau
--    « Lundi : mise à jour des sources ») donne pour chaque source de la semaine
--    sa décision, sa raison, son r, son lot et ce que l'import a rapporté.
--
-- Retour arrière : `select cron.unschedule('bleo-lundi-sources')`,
-- `select cron.unschedule('bleo-sources-lot')` ; arrêter un lot en cours avec
-- `maj_sources_annuler()`. Fonctions, vue, colonnes et réglage peuvent rester.

set lock_timeout = '5s';

-- 1. Les seuils.
update public.reglages
   set valeur = jsonb_set(valeur, '{sources}', jsonb_build_object(
     'posts_min', 5,
     'r_min', 1,
     'r_vs_label_min', 1,
     'vues_coup', 100000,
     'lot_max', 6,
     'toujours', '[]'::jsonb
   ), true)
 where cle = 'bleo' and not (valeur ? 'sources');

-- 2. La raison, le meilleur post et le lot de chaque décision.
alter table public.bleo_sources_decisions
  add column if not exists raison text,
  add column if not exists meilleur_vues integer,
  add column if not exists lancee_le timestamptz;

comment on column public.bleo_sources_decisions.raison is
  'Pourquoi la source est retenue (0667) : toujours, neuve, r, label, 100k ; nulle pour pas_maj.';
comment on column public.bleo_sources_decisions.meilleur_vues is
  'Meilleur post de la source chez nous, publié il y a 3 à 30 jours, hors rappels (0667).';
comment on column public.bleo_sources_decisions.lancee_le is
  'Quand son lot a lancé la mise à jour de la source (0667) ; nulle : pas encore (ou pas retenue).';

-- 3. Un lot : au plus `lot_max` sources retenues de la semaine, pas encore lancées.
create or replace function public.bleo_sources_lot(p_forcer boolean default false)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_paris timestamp := now() at time zone 'Europe/Paris';
  v_semaine date := date_trunc('week', now() at time zone 'Europe/Paris')::date;
  v_lot_max integer;
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

  v_lot_max := greatest(1, coalesce((select (valeur->'sources'->>'lot_max')::integer from reglages where cle = 'bleo'), 6));

  select array_agg(id order by rang) into v_ids
    from (select d.compte_reference_id as id,
                 row_number() over (order by d.r_mediane desc nulls last, d.meilleur_vues desc nulls last, cr.handle_tiktok) as rang
            from bleo_sources_decisions d
            join comptes_reference cr on cr.id = d.compte_reference_id and cr.is_active
           where d.semaine = v_semaine and d.decision in ('maj', 'peu_de_mesures') and d.lancee_le is null) z
   where rang <= v_lot_max;

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
  'BLEO (0667) : lance la mise à jour d''au plus `reglages.bleo.sources.lot_max` sources retenues de la semaine, pas encore lancées, la meilleure d''abord, si aucune mise à jour n''est en cours. Chaque jour à 6 h 37 (cron `bleo-sources-lot`), et le lundi juste après les décisions. `p_forcer` : hors de 6 h.';

-- 4. La règle du lundi.
create or replace function public.bleo_lundi_sources(p_forcer boolean default false)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  reg jsonb;
  v_paris timestamp := now() at time zone 'Europe/Paris';
  v_semaine date := date_trunc('week', now() at time zone 'Europe/Paris')::date;
  v_posts_min integer;
  v_r_min numeric;
  v_rl_min numeric;
  v_coup integer;
  v_toujours text[];
  v_lot jsonb;
begin
  if auth.uid() is not null and not public.is_admin() then
    raise exception 'bleo : réservé aux admins' using errcode = '42501';
  end if;
  -- Lundi 6 h à Paris (le cron passe à 4 h 07 et 5 h 07 UTC, heure d'été et d'hiver).
  if not p_forcer and (extract(isodow from v_paris) <> 1 or extract(hour from v_paris) <> 6) then
    return jsonb_build_object('ignore', 'pas lundi 6 h à Paris');
  end if;

  reg := coalesce((select valeur->'sources' from reglages where cle = 'bleo'), '{}'::jsonb);
  v_posts_min := coalesce((reg->>'posts_min')::integer, 5);
  v_r_min := coalesce((reg->>'r_min')::numeric, 1);
  v_rl_min := coalesce((reg->>'r_vs_label_min')::numeric, 1);
  v_coup := coalesce((reg->>'vues_coup')::integer, 100000);
  v_toujours := coalesce((select array_agg(lower(x)) from jsonb_array_elements_text(reg->'toujours') x), '{}');

  with meilleur as (
    select c.compte_reference_id, max(p.vues) as vues
      from passages p
      join contenus c on c.id = p.contenu_id and c.compte_reference_id is not null
     where p.statut = 'publie' and not coalesce(p.est_rappel, false) and p.vues is not null
       and p.publie_at >= now() - interval '30 days' and p.publie_at <= now() - interval '3 days'
     group by 1
  ),
  jugees as (
    select cr.id, coalesce(sp.posts, 0) as posts, sp.r_mediane, sp.r_vs_label, m.vues as meilleur,
           case when lower(cr.handle_tiktok) = any (v_toujours) then 'toujours'
                when coalesce(sp.posts, 0) < v_posts_min then 'neuve'
                when coalesce(sp.r_mediane, 0) > v_r_min then 'r'
                when coalesce(sp.r_vs_label, 0) > v_rl_min then 'label'
                when coalesce(m.vues, 0) >= v_coup then '100k'
           end as raison
      from comptes_reference cr
      left join source_performance sp on sp.compte_reference_id = cr.id
      left join meilleur m on m.compte_reference_id = cr.id
     where cr.is_active
  )
  insert into bleo_sources_decisions (semaine, compte_reference_id, posts, r_mediane, r_vs_label, decision, raison, meilleur_vues)
  select v_semaine, j.id, j.posts, j.r_mediane, j.r_vs_label,
         case when j.raison = 'neuve' then 'peu_de_mesures' when j.raison is not null then 'maj' else 'pas_maj' end,
         j.raison, j.meilleur
    from jugees j
  on conflict (semaine, compte_reference_id) do update
     set posts = excluded.posts,
         r_mediane = excluded.r_mediane,
         r_vs_label = excluded.r_vs_label,
         decision = excluded.decision,
         raison = excluded.raison,
         meilleur_vues = excluded.meilleur_vues;

  -- Le premier lot, tout de suite.
  v_lot := public.bleo_sources_lot(true);

  return jsonb_build_object(
    'semaine', v_semaine,
    'decisions', coalesce((select jsonb_object_agg(coalesce(raison, 'pas_maj'), n) from (
      select raison, count(*) as n from bleo_sources_decisions where semaine = v_semaine group by 1) z), '{}'::jsonb),
    'premier_lot', v_lot
  );
end;
$function$;

comment on function public.bleo_lundi_sources(boolean) is
  'BLEO, règle des sources A11 (0667) : chaque lundi à 6 h 07 (cron `bleo-lundi-sources`), juge chaque source active sur ses posts chez nous (r médian > 1, r face au label > 1, un post à 100 000 vues, ou moins de 5 posts mesurés : retenue), écrit la décision dans `bleo_sources_decisions` et lance le premier lot (`bleo_sources_lot`). `p_forcer` : hors du lundi 6 h (essai, rattrapage).';

revoke all on function public.bleo_sources_lot(boolean) from public, anon;
revoke all on function public.bleo_lundi_sources(boolean) from public, anon;
grant execute on function public.bleo_sources_lot(boolean) to authenticated, service_role;
grant execute on function public.bleo_lundi_sources(boolean) to authenticated, service_role;

-- 5. Le compte rendu de la semaine.
create or replace view public.bleo_sources_semaine_ui
with (security_invoker = true) as
select d.semaine,
       d.compte_reference_id,
       cr.handle_tiktok as handle,
       cr.langue,
       (select min(l.nom) from compte_reference_labels crl join labels l on l.id = crl.label_id
         where crl.compte_reference_id = cr.id) as label,
       d.posts,
       d.r_mediane,
       d.r_vs_label,
       d.decision,
       d.raison,
       d.meilleur_vues,
       d.lancee_le,
       (select count(*) from contenus c
         where c.compte_reference_id = d.compte_reference_id
           and c.created_at >= d.semaine and c.created_at < d.semaine + 7) as importes,
       (select count(*) from contenus c
         where c.compte_reference_id = d.compte_reference_id
           and c.created_at >= d.semaine and c.created_at < d.semaine + 7
           and c.statut = 'valide' and c.import_statut = 'done') as valides,
       cr.dernier_scrape_at
  from bleo_sources_decisions d
  join comptes_reference cr on cr.id = d.compte_reference_id;

comment on view public.bleo_sources_semaine_ui is
  'BLEO (0667) : le compte rendu de la mise à jour des sources du lundi, par source et par semaine (décision A11 et sa raison, r, meilleur post, lot, contenus importés et validés dans la semaine).';

grant select on public.bleo_sources_semaine_ui to authenticated, service_role;

-- 6. Les crons : le lundi à 6 h 07 (décisions et premier lot), puis un lot par
-- jour à 6 h 37 tant qu'il en reste (deux horaires UTC, les fonctions gardent
-- l'heure de Paris).
select cron.unschedule('bleo-lundi-sources') where exists (select 1 from cron.job where jobname = 'bleo-lundi-sources');
select cron.schedule('bleo-lundi-sources', '7 4,5 * * 1', 'select public.bleo_lundi_sources()');
select cron.unschedule('bleo-sources-lot') where exists (select 1 from cron.job where jobname = 'bleo-sources-lot');
select cron.schedule('bleo-sources-lot', '37 4,5 * * *', 'select public.bleo_sources_lot()');
