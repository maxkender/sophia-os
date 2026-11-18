-- 0758 : refonte de la Bible des comptes (Max, 19/11). Ne touche QUE bible_comptes, bible_historique (par le journal
-- existant) et labels_proposes. Ni labels, ni comptes_reference, ni rien d'autre.
-- 1. bible_comptes.etape : le process en 3 étapes (a_importer → prochain_batch → importe), à part de l'ancien statut
--    (que l'import vers comptes_reference continue d'écrire sans rien changer ici). Tous les comptes : « à importer ».
--    autres_cartes : un compte peut aussi apparaître sous un 2e label (crushedethereal).
-- 2. labels_proposes : les cartes de la page. section (runvik, micabo, sophia, idees), badge (existe, nouveau, propose,
--    a_confirmer, idee), titre (groupes d'idées), ordre. Un label qui n'existe pas dans labels = proposition a_valider ;
--    un label existant = une ligne « valide » qui pointe vers lui (label_id), sans le modifier.
-- 3. Le contenu de Max : les cartes et les comptes (mise à jour si le handle est déjà dans la Bible, jamais de doublon).
-- 4. bible_batch_importe : « Marquer le batch comme importé » (ne change que l'étape dans la Bible).
-- Additif : des colonnes, des lignes, une fonction. Aucune donnée supprimée.

alter table public.bible_comptes add column if not exists etape text not null default 'a_importer';
alter table public.bible_comptes add column if not exists etape_at timestamptz;
alter table public.bible_comptes add column if not exists autres_cartes uuid[] not null default '{}';
do $p$
begin
  if not exists (select 1 from pg_constraint where conname = 'bible_comptes_etape_check') then
    alter table public.bible_comptes add constraint bible_comptes_etape_check check (etape in ('a_importer', 'prochain_batch', 'importe'));
  end if;
end
$p$;

alter table public.labels_proposes add column if not exists section text;
alter table public.labels_proposes add column if not exists badge text;
alter table public.labels_proposes add column if not exists titre text;
alter table public.labels_proposes add column if not exists ordre integer;
do $p$
begin
  if not exists (select 1 from pg_constraint where conname = 'labels_proposes_section_check') then
    alter table public.labels_proposes add constraint labels_proposes_section_check
      check (section is null or section in ('runvik', 'micabo', 'sophia', 'idees'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'labels_proposes_badge_check') then
    alter table public.labels_proposes add constraint labels_proposes_badge_check
      check (badge is null or badge in ('existe', 'nouveau', 'propose', 'a_confirmer', 'idee'));
  end if;
end
$p$;

-- Tous les comptes repérés passent « à importer » (a_trier et importe compris).
update public.bible_comptes set etape = 'a_importer' where etape is distinct from 'a_importer';

-- 3. Les cartes.
with cartes (nom, section, badge, titre, description, ordre, label_existant) as (values
  ('classic_girl_run', 'runvik', 'propose', null, 'Coureuse en photo iPhone + texte blanc TikTok, modèle @arunnersmind : conseil en liste + « my training plan is from [appli] » en légende', 1, null),
  ('white_female_run', 'runvik', 'nouveau', null, 'Coureuse, texte blanc', 2, null),
  ('white_bg_run', 'runvik', 'nouveau', null, 'Fond blanc (podz, avec white_bg)', 3, null),
  ('male_run', 'runvik', 'nouveau', null, 'Running homme', 4, null),
  ('clean_girl_run', 'runvik', 'propose', null, 'Clean girl, calme', 5, null),
  ('manga_tok', 'runvik', 'nouveau', null, 'Manga / anime, sur Sophia et running', 6, null),
  ('anxiety_run', 'runvik', 'propose', null, 'Courir contre l''anxiété', 7, null),
  ('study_series', 'micabo', 'propose', null, 'Captures de séries (Rory Gilmore) + petit texte blanc centré', 1, null),
  ('study_dark_yellow', 'micabo', 'nouveau', null, 'Photos d''ambiance chaudes (nuit ambrée, Pinterest beige-marron) + titre jaune ; remplace study_pinterest_beige', 2, null),
  ('study_scrapbook', 'micabo', 'nouveau', null, 'Collage scrapbook kawaii (stickers Smiski, grenouilles, papier déchiré) + titre noir', 3, null),
  ('study_notes', 'micabo', 'nouveau', null, 'Photos iPhone de fiches / bureau + texte blanc TikTok (classic_study resserré)', 4, null),
  ('fathomly', 'sophia', 'existe', null, null, 1, 'Fathomly'),
  ('clean_girl', 'sophia', 'propose', null, 'Clean girl : tons beiges, photos esthétiques, petit texte blanc, vibe calme et soignée', 2, null),
  ('white_bg', 'sophia', 'existe', null, null, 3, 'white_bg'),
  ('smart_girl', 'sophia', 'existe', null, null, 4, 'smart_girl'),
  ('beau_smart_girl', 'sophia', 'existe', null, null, 5, 'beau_smart_girl'),
  ('alpha_male', 'sophia', 'existe', null, 'On peut cross-poster « get in shape », « general knowledge » et mettre du running dessus', 6, 'alpha_male'),
  ('alpha_male_yellow', 'sophia', 'existe', null, 'Photos ciné/paparazzi d''hommes + texte jaune', 7, 'alpha_male_yellow'),
  ('alpha_male_film', 'sophia', 'existe', null, null, 8, 'alpha_male_film'),
  ('label_a_confirmer', 'sophia', 'a_confirmer', 'Label à confirmer', 'Même DA que beau_smart_girl (photos Pinterest de filles + petit texte blanc)', 9, null),
  ('podz_page', 'idees', 'nouveau', null, 'Nouveau label avec page podz', 1, null),
  ('a_podzer_sophia', 'idees', 'idee', 'À podzer pour Sophia', null, 2, null),
  ('autre_idee', 'idees', 'idee', 'Autre', null, 3, null),
  ('photos_asie', 'idees', 'idee', 'Photos Japon / Corée / Taïwan ?', null, 4, null)
),
maj as (
  update public.labels_proposes lp
     set section = c.section, badge = c.badge, titre = c.titre, ordre = c.ordre,
         description_da = coalesce(c.description, lp.description_da)
    from cartes c
   where lp.nom = c.nom and lp.statut <> 'refuse'
  returning lp.nom
)
insert into public.labels_proposes (nom, description_da, application_ids, apps_attente, statut, label_id, section, badge, titre, ordre)
select c.nom, c.description,
       case c.section when 'micabo' then array['00000000-0000-4000-8000-000000000002'::uuid]
                      when 'sophia' then array['00000000-0000-4000-8000-000000000001'::uuid] else '{}'::uuid[] end,
       case c.section when 'runvik' then array['Runvik – running'] else '{}'::text[] end,
       case when c.label_existant is not null then 'valide' else 'a_valider' end,
       (select l.id from public.labels l where l.nom = c.label_existant limit 1),
       c.section, c.badge, c.titre, c.ordre
  from cartes c
 where not exists (select 1 from public.labels_proposes lp where lp.nom = c.nom and lp.statut <> 'refuse')
   and c.nom not in (select nom from maj);

-- 3. Les comptes (handle, carte, note de Max).
with comptes (handle, carte, note) as (values
  ('arunnersmind', 'classic_girl_run', null), ('milesapp.run', 'classic_girl_run', null), ('runclubgirl', 'classic_girl_run', null),
  ('aly.vate', 'classic_girl_run', null), ('balancedbycait', 'classic_girl_run', null),
  ('worldthroughjx', 'classic_girl_run', 'refaire avec d''autres photos (vraie personne)'),
  ('corredora.50', 'classic_girl_run', 'Brésil, portugais, méd. 85k, pic 722k, dernier post 31/08'),
  ('hannah.run5', 'white_female_run', null), ('katrina.run', 'white_female_run', null),
  ('honestmiles.run', 'white_bg_run', null), ('ablufzofficial', 'white_bg_run', null),
  ('strava.files', 'male_run', null), ('mondorunning', 'male_run', null), ('aro.club', 'male_run', null), ('shift_sprint', 'male_run', null),
  ('wellnesss.with.leah', 'clean_girl_run', null), ('healthy_with_emma6', 'clean_girl_run', null),
  ('crushedethereal', 'clean_girl_run', 'pic 800k · aussi sur Sophia clean_girl'),
  ('vinlandiscipline', 'manga_tok', null), ('sslowrisee', 'manga_tok', null),
  ('lifeiswonderfullllllll', 'manga_tok', 'Day X of… : intégrer l''appli running dedans'),
  ('sydneysynced', 'anxiety_run', 'pic 4,8 M'),
  ('sally.htg', 'study_series', null), ('wroteinpink', 'study_series', null), ('vrqzlils', 'study_series', 'nouveau, pic 317k'),
  ('gilmoreobssesed', 'study_series', 'aujourd''hui sur Sophia smart_girl'),
  ('renaraise', 'study_dark_yellow', null), ('mia.study5', 'study_dark_yellow', null), ('icedlattebrunette', 'study_dark_yellow', null),
  ('lorraine5931', 'study_dark_yellow', null),
  ('studyingsmiski', 'study_scrapbook', 'méd. 105k, pic 678k, inactif depuis le 29/07'),
  ('jeena_study_tips', 'study_notes', null), ('katy._.studies', 'study_notes', null), ('studyy.hackz', 'study_notes', null),
  ('ellionrevision', 'study_notes', null), ('studycraft.alevels', 'study_notes', null), ('soci.apuntes', 'study_notes', null),
  ('studylab__', 'study_notes', 'pic 3,9 M, dans l''OS sans label'),
  ('uselockedinapp', 'fathomly', 'compte d''appli'),
  ('polytay', 'white_bg', null),
  ('chiaramente.ch', 'smart_girl', 'pic 371k'),
  ('ang4lics0ul', 'beau_smart_girl', 'pic 707k'),
  ('trusttheprocces1', 'alpha_male', 'pic 307k'),
  ('aesthetico7647', 'alpha_male_yellow', 'méd. 26k, pic 164k'),
  ('daily.geez', 'alpha_male_film', 'pic 2,4 M'),
  ('emmaproductivity_', 'label_a_confirmer', 'méd. 5k, actif'),
  ('victoire.km24', 'podz_page', 'pic 106k'),
  ('corpseprize', 'a_podzer_sophia', 'collage rose made by, méd. 21k, pic 212k'),
  ('become.max', 'a_podzer_sophia', 'paysage minimaliste + petit texte, méd. 19k'),
  ('kaja.learn', 'a_podzer_sophia', '10/10 skills to get girls, méd. 27k'),
  ('winnerswellnessonly', 'autre_idee', 'fond blanc éditorial, pic 960k'),
  ('bdnf.milly', 'autre_idee', 'idée de podz, ou tout copier sur un compte'),
  ('dearestny', 'photos_asie', null)
),
c as (
  select x.handle, x.note, lp.id as carte_id, lp.label_id, lp.section
    from comptes x
    join lateral (select l.* from public.labels_proposes l where l.nom = x.carte and l.statut <> 'refuse' order by l.propose_at limit 1) lp on true
),
maj as (
  update public.bible_comptes b
     set label_propose_id = c.carte_id, label_id = c.label_id, note_import = c.note, etape = 'a_importer',
         application_ids = case c.section when 'micabo' then array['00000000-0000-4000-8000-000000000002'::uuid]
                                          when 'sophia' then array['00000000-0000-4000-8000-000000000001'::uuid] else '{}'::uuid[] end,
         apps_attente = case c.section when 'runvik' then array['Runvik – running'] else '{}'::text[] end
    from c where b.handle = c.handle
  returning b.handle
)
insert into public.bible_comptes (handle, profil_url, statut, etape, label_propose_id, label_id, note_import, application_ids, apps_attente, miniatures_statut)
select c.handle, 'https://www.tiktok.com/@' || c.handle, 'a_trier', 'a_importer', c.carte_id, c.label_id, c.note,
       case c.section when 'micabo' then array['00000000-0000-4000-8000-000000000002'::uuid]
                      when 'sophia' then array['00000000-0000-4000-8000-000000000001'::uuid] else '{}'::uuid[] end,
       case c.section when 'runvik' then array['Runvik – running'] else '{}'::text[] end,
       'a_faire'
  from c
 where c.handle not in (select handle from maj);

-- crushedethereal apparaît aussi sous Sophia clean_girl.
update public.bible_comptes
   set autres_cartes = array[(select id from public.labels_proposes where nom = 'clean_girl' and statut <> 'refuse' order by propose_at limit 1)]
 where handle = 'crushedethereal';

-- 4. « Marquer le batch comme importé » : seulement l'étape dans la Bible.
create or replace function public.bible_batch_importe()
returns integer
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_n integer;
begin
  if not public.is_admin_strict() then raise exception 'forbidden' using errcode = '42501'; end if;
  update public.bible_comptes set etape = 'importe', etape_at = now() where etape = 'prochain_batch';
  get diagnostics v_n = row_count;
  return v_n;
end;
$function$;
revoke all on function public.bible_batch_importe() from public, anon;
grant execute on function public.bible_batch_importe() to authenticated;
