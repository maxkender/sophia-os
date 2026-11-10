-- 0667 : BLEO, la mise à jour des sources chaque lundi (règle A11, partie de L3 ;
-- décision d'Adrien du 10/11).
--
-- Plus aucun import depuis le 25/10 : la mise à jour des sources est un bouton
-- (page Sources, « Mettre à jour les sources »), personne ne l'a lancé, et le
-- lundi automatique de la spec (L3, `bleo-lundi`) n'avait pas été construit.
-- Or les imports gagnants portent 60 % de la récolte, et les 218 imports encore
-- testables (moins de 30 jours) seront tous trop vieux vers le 24/11.
--
-- Chaque lundi à 6 h 07 (Paris), `bleo_lundi_sources` :
--   1. juge chaque source active sur ses posts chez nous (`source_performance` :
--      r médian des posts de ses contenus publiés il y a 3 à 30 jours, et ce r
--      face à celui de tout son label). Règle A11, seuils dans
--      `reglages.bleo.sources` :
--        * moins de `posts_min` (5) posts mesurés : mise à jour (`peu_de_mesures`),
--          une source neuve doit pouvoir faire ses preuves ;
--        * r médian > `r_min` (1) ou r face au label > `r_vs_label_min` (1) : `maj` ;
--        * sinon `pas_maj` : pas de mise à jour cette semaine ; la source reste
--          active, ses contenus aussi, elle sera rejugée lundi prochain.
--      Une source listée dans `toujours` (handles) est mise à jour quoi qu'il arrive.
--   2. écrit chaque décision dans `bleo_sources_decisions` (une ligne par source
--      et par semaine) ;
--   3. lance la mise à jour des sources retenues par le circuit du bouton
--      (`maj_sources_demarrer`) : une source à la fois, seulement ses posts
--      publiés depuis le dernier relevé (`nouveauxSeulement`), les drains
--      `import-contenu-drain-N` font avancer la séquence. Si une mise à jour est
--      déjà en cours, rien n'est lancé et le résumé le dit.
--
-- Le compte rendu : la vue `bleo_sources_semaine_ui` (page Sources, panneau
-- « Lundi : mise à jour des sources ») donne pour chaque source de la semaine
-- sa décision, son r et ce que l'import a rapporté (contenus importés, validés).
--
-- Retour arrière : `select cron.unschedule('bleo-lundi-sources')` ; la fonction,
-- la vue et le réglage peuvent rester.

set lock_timeout = '5s';

-- 1. Les seuils.
update public.reglages
   set valeur = jsonb_set(valeur, '{sources}', jsonb_build_object(
     'posts_min', 5,
     'r_min', 1,
     'r_vs_label_min', 1,
     'toujours', '[]'::jsonb
   ), true)
 where cle = 'bleo' and not (valeur ? 'sources');

-- 2. La règle du lundi.
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
  v_toujours text[];
  v_comptes jsonb;
  v_demarrage jsonb;
  v_lancee text;
  v_compte jsonb;
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
  v_toujours := coalesce((select array_agg(lower(x)) from jsonb_array_elements_text(reg->'toujours') x), '{}');

  insert into bleo_sources_decisions (semaine, compte_reference_id, posts, r_mediane, r_vs_label, decision)
  select v_semaine, cr.id, coalesce(sp.posts, 0), sp.r_mediane, sp.r_vs_label,
         case when lower(cr.handle_tiktok) = any (v_toujours) then 'maj'
              when coalesce(sp.posts, 0) < v_posts_min then 'peu_de_mesures'
              when coalesce(sp.r_mediane, 0) > v_r_min or coalesce(sp.r_vs_label, 0) > v_rl_min then 'maj'
              else 'pas_maj' end
    from comptes_reference cr
    left join source_performance sp on sp.compte_reference_id = cr.id
   where cr.is_active
  on conflict (semaine, compte_reference_id) do update
     set posts = excluded.posts,
         r_mediane = excluded.r_mediane,
         r_vs_label = excluded.r_vs_label,
         decision = excluded.decision;

  -- Les sources retenues, la meilleure d'abord.
  select jsonb_agg(jsonb_build_object('id', cr.id, 'handle', cr.handle_tiktok, 'langue', cr.langue)
                   order by d.r_mediane desc nulls last, cr.handle_tiktok)
    into v_comptes
    from bleo_sources_decisions d
    join comptes_reference cr on cr.id = d.compte_reference_id
   where d.semaine = v_semaine and d.decision in ('maj', 'peu_de_mesures') and cr.is_active;

  if v_comptes is null then
    v_lancee := 'aucune source retenue';
  else
    v_demarrage := public.maj_sources_demarrer(v_comptes);
    v_lancee := case when v_demarrage->>'action' = 'deja' then 'une mise à jour était déjà en cours : rien lancé'
                     else 'lancée' end;
  end if;

  return jsonb_build_object(
    'semaine', v_semaine,
    'mise_a_jour', v_lancee,
    'decisions', coalesce((select jsonb_object_agg(decision, n) from (
      select decision, count(*) as n from bleo_sources_decisions where semaine = v_semaine group by 1) z), '{}'::jsonb),
    'sources', coalesce(jsonb_array_length(v_comptes), 0)
  );
end;
$function$;

comment on function public.bleo_lundi_sources(boolean) is
  'BLEO, règle des sources A11 (0667) : chaque lundi à 6 h 07 (cron `bleo-lundi-sources`), juge chaque source active sur ses posts chez nous (r médian > 1 ou r face au label > 1, ou moins de 5 posts mesurés), écrit la décision dans `bleo_sources_decisions` et lance la mise à jour des sources retenues (`maj_sources_demarrer`, nouveaux posts seulement). `p_forcer` : hors du lundi 6 h (essai, rattrapage).';

revoke all on function public.bleo_lundi_sources(boolean) from public, anon;
grant execute on function public.bleo_lundi_sources(boolean) to authenticated, service_role;

-- 3. Le compte rendu de la semaine.
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
  'BLEO (0667) : le compte rendu de la mise à jour des sources du lundi, par source et par semaine (décision A11, r, contenus importés et validés dans la semaine).';

grant select on public.bleo_sources_semaine_ui to authenticated, service_role;

-- 4. Chaque lundi à 6 h 07 à Paris (deux horaires UTC, la fonction garde l'heure de Paris).
select cron.unschedule('bleo-lundi-sources') where exists (select 1 from cron.job where jobname = 'bleo-lundi-sources');
select cron.schedule('bleo-lundi-sources', '7 4,5 * * 1', 'select public.bleo_lundi_sources()');
