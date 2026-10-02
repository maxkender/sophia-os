-- 0257 : suppression de micabo + label Hook redevenu unique.
--
-- micabo ne tourne plus dans cet OS (0 compte, 0 passage). Il reste : 1 source
-- (@barevanillascent), 19 contenus, 114 médias, 19 lignes de file d'import,
-- 3 labels (copies de Hook et d'UGC AI VIDEO + study_aes), 2 prompts.
--
-- LE BUG QUE ÇA CORRIGE. Depuis 0211, le slug 'hook' existe deux fois (Sophia
-- + copie micabo). Toutes les recherches du label Hook par slug échouent
-- (maybeSingle sur 2 lignes) : 948 médias marqués est_hook depuis le
-- 2026-08-25 n'ont jamais reçu le label Hook, et l'éditeur de labels d'un
-- slideshow effaçait le Hook des images qu'il touchait. propager_labels_source
-- prenait l'un des deux au hasard (`limit 1` sans ordre).
--
-- AVANT D'APPLIQUER :
--   1. Admin → Sources → @barevanillascent → « Oublier la source ». C'est le seul
--      chemin qui supprime aussi les ~113 Mo d'images du bucket (le SQL ne peut
--      pas toucher au stockage). Si on l'oublie, ce script supprime quand même
--      les lignes, et les fichiers restent orphelins dans le bucket.
--   2. Le code multi-app doit être déployé (il ne connaît plus micabo).
--
-- Idempotent, tout ou rien (une seule transaction), avec garde-fous : il refuse
-- de tourner si quoi que ce soit de vivant référence encore micabo.

begin;

do $$
declare
  m constant uuid := '00000000-0000-4000-8000-000000000002';
  n bigint;
begin
  if not exists (select 1 from public.applications where id = m) then
    raise notice 'micabo déjà supprimé — rien à faire';
    return;
  end if;

  select count(*) into n from public.comptes where application_id = m;
  if n > 0 then raise exception 'micabo : % compte(s) encore rattaché(s)', n; end if;

  select count(*) into n
  from public.passages p join public.contenus c on c.id = p.contenu_id
  where c.application_id = m;
  if n > 0 then raise exception 'micabo : % passage(s) sur des contenus micabo', n; end if;

  select count(*) into n from public.papier_masters where application_id = m;
  if n > 0 then raise exception 'micabo : % master(s) papier', n; end if;
  select count(*) into n from public.ugc_personas where application_id = m;
  if n > 0 then raise exception 'micabo : % persona(s) UGC', n; end if;
  select count(*) into n from public.ugc_reactions where application_id = m;
  if n > 0 then raise exception 'micabo : % réaction(s) UGC', n; end if;
  select count(*) into n from public.ugc_utilisations where application_id = m;
  if n > 0 then raise exception 'micabo : % utilisation(s) UGC', n; end if;
  select count(*) into n from public.ugc_video_posts where application_id = m;
  if n > 0 then raise exception 'micabo : % post(s) vidéo UGC', n; end if;

  -- Un label micabo sur un compte, un contenu ou un média NON micabo ?
  select count(*) into n
  from public.compte_labels cl join public.labels l on l.id = cl.label_id
  where l.application_id = m;
  if n > 0 then raise exception 'micabo : % label(s) micabo posé(s) sur des comptes', n; end if;

  select count(*) into n
  from public.contenu_labels cl
  join public.labels l on l.id = cl.label_id
  join public.contenus c on c.id = cl.contenu_id
  where l.application_id = m and c.application_id <> m;
  if n > 0 then raise exception 'micabo : % contenu(s) non micabo portent un label micabo', n; end if;

  select count(*) into n
  from public.media_labels ml
  join public.labels l on l.id = ml.label_id
  join public.media_library md on md.id = ml.media_id
  where l.application_id = m and md.application_id <> m;
  if n > 0 then raise exception 'micabo : % média(s) non micabo portent un label micabo', n; end if;

  select count(*) into n
  from public.post_slides ps join public.media_library md on md.id = ps.media_id
  where md.application_id = m;
  if n > 0 then raise exception 'micabo : % slide(s) de post utilisent un média micabo', n; end if;

  -- Ordre imposé par les FK : media_library.contenu_id est SET NULL, donc les
  -- médias partent AVANT les contenus (sinon ils deviendraient orphelins et
  -- bloqueraient la suppression de l'application, FK NO ACTION).
  delete from public.import_file where application_id = m;
  delete from public.media_library where application_id = m;      -- cascade media_labels
  delete from public.contenus where application_id = m;           -- cascade contenu_labels, contenu_langues, contenu_pertinences
  delete from public.comptes_reference where application_id = m;  -- cascade compte_reference_labels
  delete from public.labels where application_id = m;             -- hook + ugc-ai-video + study_aes
  delete from public.prompts where cle in ('pertinence_micabo', 'placement_micabo');
  update public.reglages
     set valeur = valeur #- '{par_application,micabo}', updated_at = now()
   where cle = 'file_labels_comptes'
     and valeur #> '{par_application,micabo}' is not null;
  delete from public.applications where id = m;
end
$$;

-- Le trigger 0214 imposait « un label = l'application du compte ». Les labels
-- servent désormais plusieurs applications (label_applications) et tous les
-- comptes restent Sophia : il n'a plus de sens.
drop trigger if exists compte_labels_meme_application on public.compte_labels;
drop function if exists public.compte_label_meme_application();

-- Slugs de labels de nouveau uniques globalement (vérifié : 0 doublon une fois
-- micabo parti). Empêche pour de bon le retour d'un second 'hook'.
create unique index if not exists labels_slug_uidx on public.labels (slug);
drop index if exists public.labels_slug_application_uidx;

-- Unicités des sources, contenus et file d'import redeviennent globales : un
-- même post TikTok n'est plus dupliqué par application. Vérifié : 0 doublon.
create unique index if not exists comptes_reference_handle_uidx
  on public.comptes_reference (handle_tiktok);
create unique index if not exists contenus_source_url_uidx
  on public.contenus (source_url)
  where source_url is not null;
create unique index if not exists import_file_pending_url_uidx
  on public.import_file (post_url)
  where statut in ('pending', 'running');
create unique index if not exists ugc_reactions_source_url_uidx
  on public.ugc_reactions (source_url);
drop index if exists public.comptes_reference_handle_application_uidx;
drop index if exists public.contenus_source_url_application_uidx;
drop index if exists public.import_file_pending_url_application_uidx;
drop index if exists public.ugc_reactions_source_url_application_uidx;

-- propager_labels_source : corps live recopié tel quel ; seule la recherche du
-- label Hook change (déterministe : le plus ancien).
create or replace function public.propager_labels_source(p_compte_reference_id uuid)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  n integer := 0;
  hook_id uuid;
begin
  if p_compte_reference_id is null then
    return 0;
  end if;

  select id into hook_id from public.labels where slug = 'hook' order by created_at, id limit 1;

  delete from public.contenu_labels cl
  using public.contenus c
  where cl.contenu_id = c.id
    and c.compte_reference_id = p_compte_reference_id
    and (hook_id is null or cl.label_id is distinct from hook_id);

  insert into public.contenu_labels (contenu_id, label_id)
  select c.id, crl.label_id
  from public.contenus c
  join public.compte_reference_labels crl
    on crl.compte_reference_id = c.compte_reference_id
  where c.compte_reference_id = p_compte_reference_id
    and (hook_id is null or crl.label_id is distinct from hook_id)
  on conflict do nothing;

  delete from public.media_labels ml
  using public.media_library m
  where ml.media_id = m.id
    and (hook_id is null or ml.label_id is distinct from hook_id)
    and (
      m.compte_reference_id = p_compte_reference_id
      or exists (
        select 1
        from public.contenus c
        where c.id = m.contenu_id
          and c.compte_reference_id = p_compte_reference_id
      )
    );

  insert into public.media_labels (media_id, label_id)
  select distinct m.id, cl.label_id
  from public.media_library m
  join public.contenu_labels cl on cl.contenu_id = m.contenu_id
  join public.contenus c on c.id = m.contenu_id
  where c.compte_reference_id = p_compte_reference_id
    and (hook_id is null or cl.label_id is distinct from hook_id)
  on conflict do nothing;

  insert into public.media_labels (media_id, label_id)
  select m.id, crl.label_id
  from public.media_library m
  join public.compte_reference_labels crl
    on crl.compte_reference_id = m.compte_reference_id
  where m.compte_reference_id = p_compte_reference_id
    and m.contenu_id is null
    and (hook_id is null or crl.label_id is distinct from hook_id)
  on conflict do nothing;

  if hook_id is not null then
    insert into public.media_labels (media_id, label_id)
    select m.id, hook_id
    from public.media_library m
    where m.est_hook
      and (
        m.compte_reference_id = p_compte_reference_id
        or exists (
          select 1 from public.contenus c
          where c.id = m.contenu_id
            and c.compte_reference_id = p_compte_reference_id
        )
      )
    on conflict do nothing;
  end if;

  select count(*)::integer into n
  from public.contenus
  where compte_reference_id = p_compte_reference_id;

  return n;
end;
$function$;

-- Rattrapage : chaque média marqué est_hook reçoit le label Hook (≈ 929).
-- Effet visible : le filtre « Hook » de la Bibliothèque redevient complet. La
-- sélection de la slide 1 lit est_hook, pas ce label : l'assignation ne bouge pas.
insert into public.media_labels (media_id, label_id)
select m.id, h.id
from public.media_library m
cross join (
  select id from public.labels where slug = 'hook' order by created_at, id limit 1
) h
where m.est_hook
on conflict do nothing;

-- Contrôles de fin : plus rien de micabo, plus aucun slug en double.
do $$
declare n bigint;
begin
  select count(*) into n from public.applications where slug = 'micabo';
  if n > 0 then raise exception 'micabo encore présent'; end if;
  select count(*) into n from (
    select slug from public.labels group by slug having count(*) > 1
  ) d;
  if n > 0 then raise exception '% slug(s) de label en double', n; end if;
end
$$;

commit;

notify pgrst, 'reload schema';
