-- 0661 : label UGCV (jamais tiré, posé à la main par l'admin) et ménage de
-- l'ancien système « UGC AI VIDEO ».
--
-- 1. Les colonnes de l'ancien système sont reprises, pas supprimées : 19
--    fonctions SQL et 3 vues les lisent déjà pour mettre un compte hors des
--    slideshows et un label hors des tirages, c'est exactement ce qu'il faut.
--      labels.ugc_ai_video  → labels.manuel  (label jamais tiré : UGCV)
--      comptes.ugc_ai_video → comptes.ugcv   (compte UGCV : posts vidéo à la main)
--    Les vues suivent le renommage d'elles-mêmes ; les corps de fonctions sont
--    du texte, ils sont réécrits ici (même logique, nouveaux noms).
-- 2. Deux exceptions voulues : un compte UGCV compte comme un compte normal
--    pour les relances (nudge_cibles) et les chiffres des HM (hm_*). Il reste
--    hors de tout ce qui distribue ou juge des slideshows (BLEO, CKD,
--    classement, relecture, simulations, sanity).
-- 3. Le label UGCV : `manuel`, relié à aucune application. Seul l'admin peut
--    le poser sur un compte ou l'en retirer (trigger), et `comptes.ugcv` suit
--    tout seul la présence d'un label manuel sur le compte.
-- 4. Ménage : tables de l'ancien pipeline vidéo (Kling), mode « recruteur
--    vidéo » des HM, prompts, et la marque « UGC AI VIDEO ». L'identité UGC
--    des slideshows (ugc_personas, comptes.ugc_ai, prompt ugc_face_swap) et la
--    page UGC IA (ugc_ia_*) ne sont pas touchées.
-- 5. Un persona UGC IA peut être rattaché à un compte (1 persona = 1 compte).
--
-- ⚠️ À appliquer juste avant le merge : les fonctions Edge déployées lisent
-- encore les anciens noms jusqu'au déploiement.

-- 1. Renommages --------------------------------------------------------------

alter table public.labels rename column ugc_ai_video to manuel;
alter table public.comptes rename column ugc_ai_video to ugcv;
alter index if exists public.labels_ugc_ai_video_idx rename to labels_manuel_idx;
alter index if exists public.comptes_ugc_ai_video_idx rename to comptes_ugcv_idx;

comment on column public.labels.manuel is
  'Label manuel (UGCV) : jamais tiré par l''OS (File, BLEO, minuit, repli), posé à la main par l''admin. 0661.';
comment on column public.comptes.ugcv is
  'Compte UGCV : porte un label manuel, ne reçoit aucun slideshow, ses posts vidéo sont posés à la main par l''admin. Tenu par trigger depuis compte_labels. 0661.';

-- 2. Réécriture des fonctions ------------------------------------------------

do $$
declare
  r record;
  v_def text;
  v_new text;
  v_n integer := 0;
begin
  for r in
    select p.oid, p.proname
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.prokind = 'f'
       and pg_get_functiondef(p.oid) ~* 'ugc_ai_video|ugc-ai-video|ugc ai video'
  loop
    v_def := pg_get_functiondef(r.oid);
    v_new := v_def;

    -- Relances : un compte UGCV est relancé comme les autres.
    if r.proname = 'nudge_cibles' then
      v_new := replace(v_new,
        'and not coalesce(c.ugc_ai_video, false) and not coalesce(c.videos_uniquement, false)',
        'and not coalesce(c.videos_uniquement, false)');
    end if;

    -- Chiffres des HM : un compte UGCV est un compte de créateur comme un autre.
    if r.proname in ('hm_anciens', 'hm_comptes_semaine', 'hm_export_donnees') then
      v_new := regexp_replace(v_new, '\n[ \t]*and not coalesce\(c\.ugc_ai_video, false\)', '', 'g');
    end if;

    -- Labels : plus de marque « ugc-ai-video », un label manuel n'est jamais tiré.
    v_new := replace(v_new,
      'coalesce(l.slug, '''') not in (''hook'', ''ugc-ai-video'')',
      'coalesce(l.slug, '''') <> ''hook'' and not coalesce(l.manuel, false)');
    v_new := replace(v_new,
      'coalesce(lower(l.nom), '''') not in (''hook'', ''ugc ai video'')',
      'coalesce(lower(l.nom), '''') <> ''hook''');
    v_new := replace(v_new,
      'l.nom not in (''Hook'', ''UGC AI VIDEO'')',
      'l.nom <> ''Hook'' and not coalesce(l.manuel, false)');

    v_new := replace(v_new, 'UGC AI VIDEO (→ ugc_video_posts)', 'UGCV (posts vidéo posés à la main)');

    -- Comptes : partout ailleurs, même exclusion sous le nouveau nom.
    v_new := replace(v_new, 'c.ugc_ai_video', 'c.ugcv');
    v_new := replace(v_new, 'co.ugc_ai_video', 'co.ugcv');

    if v_new ~* 'ugc_ai_video|ugc-ai-video|ugc ai video' then
      raise exception '0661 : % garde une référence à l''ancien système', r.proname;
    end if;
    if v_new <> v_def then
      execute v_new;
      v_n := v_n + 1;
    end if;
  end loop;
  raise notice '0661 : % fonctions réécrites', v_n;
end;
$$;

-- 3. Label UGCV ---------------------------------------------------------------

insert into public.labels (nom, slug, manuel, genre)
select 'UGCV', 'ugcv', true, null
 where not exists (select 1 from public.labels where slug = 'ugcv');

-- `comptes.ugcv` = le compte porte au moins un label manuel.
create or replace function public.compte_ugcv_recalculer(p_compte uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.comptes c
     set ugcv = exists (
           select 1 from public.compte_labels cl
             join public.labels l on l.id = cl.label_id
            where cl.compte_id = c.id and l.manuel)
   where c.id = p_compte
     and c.ugcv is distinct from exists (
           select 1 from public.compte_labels cl
             join public.labels l on l.id = cl.label_id
            where cl.compte_id = c.id and l.manuel);
$$;

create or replace function public.compte_labels_ugcv_sync()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op in ('INSERT', 'UPDATE') then
    perform public.compte_ugcv_recalculer(new.compte_id);
  end if;
  if tg_op in ('DELETE', 'UPDATE') then
    perform public.compte_ugcv_recalculer(old.compte_id);
  end if;
  return null;
end;
$$;

drop trigger if exists compte_labels_ugcv_sync on public.compte_labels;
create trigger compte_labels_ugcv_sync
  after insert or update or delete on public.compte_labels
  for each row execute function public.compte_labels_ugcv_sync();

-- Un label passe manuel (ou ne l'est plus) : ses comptes suivent.
create or replace function public.labels_manuel_sync()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_compte uuid;
begin
  for v_compte in select cl.compte_id from public.compte_labels cl where cl.label_id = new.id loop
    perform public.compte_ugcv_recalculer(v_compte);
  end loop;
  return null;
end;
$$;

drop trigger if exists labels_manuel_sync on public.labels;
create trigger labels_manuel_sync
  after update of manuel on public.labels
  for each row
  when (old.manuel is distinct from new.manuel)
  execute function public.labels_manuel_sync();

-- Un label manuel ne se pose et ne se retire que par l'admin (ou le service :
-- fonctions Edge, SQL direct). Head of Ops, DM et HM en sont empêchés ici,
-- quel que soit l'écran.
create or replace function public.compte_labels_manuel_garde()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null
     or coalesce(auth.role(), '') = 'service_role'
     or public.is_admin_strict() then
    return coalesce(new, old);
  end if;
  if tg_op in ('INSERT', 'UPDATE')
     and exists (select 1 from public.labels l where l.id = new.label_id and l.manuel) then
    raise exception 'LABEL_MANUEL_ADMIN : seul l''admin pose ce label' using errcode = '42501';
  end if;
  if tg_op in ('DELETE', 'UPDATE')
     and exists (select 1 from public.labels l where l.id = old.label_id and l.manuel)
     -- Suppression du compte (cascade) : le label part avec lui.
     and exists (select 1 from public.comptes c where c.id = old.compte_id) then
    raise exception 'LABEL_MANUEL_ADMIN : seul l''admin retire ce label' using errcode = '42501';
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists compte_labels_manuel_garde on public.compte_labels;
create trigger compte_labels_manuel_garde
  before insert or update or delete on public.compte_labels
  for each row execute function public.compte_labels_manuel_garde();

-- 4. Ménage de l'ancien système ----------------------------------------------

drop table if exists public.ugc_video_posts;
drop table if exists public.ugc_utilisations;
drop table if exists public.ugc_reactions;
drop table if exists public.hm_ugc_video_labels;
drop table if exists public.ugc_profile_refs;

alter table public.profiles drop column if exists hm_ugc_ai_video;

delete from public.prompts
 where cle in (
   'ugc_persona_edit_down', 'ugc_persona_edit_left', 'ugc_persona_edit_right',
   'ugc_persona_face', 'ugc_persona_profile', 'ugc_persona_profile_from_ref',
   'ugc_video_caption', 'ugc_video_face_ref', 'ugc_video_kling_negative', 'ugc_video_kling_prompt'
 );

-- La marque « UGC AI VIDEO » : sur aucun compte ni contenu (vérifié le 6/11).
delete from public.labels where slug = 'ugc-ai-video';

-- 5. Persona UGC IA ↔ compte -------------------------------------------------

alter table public.ugc_ia_personas
  add column if not exists compte_id uuid references public.comptes(id) on delete set null;

create unique index if not exists ugc_ia_personas_compte_unique
  on public.ugc_ia_personas (compte_id)
  where compte_id is not null;

comment on column public.ugc_ia_personas.compte_id is
  'Compte UGCV de ce persona (1 persona = 1 compte), posé depuis la page UGC IA. 0661.';
