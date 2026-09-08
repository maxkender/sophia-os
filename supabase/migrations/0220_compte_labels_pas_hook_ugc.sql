-- Hook et la marque « UGC AI VIDEO » ne sont jamais des labels de créateur.
-- Hook = 1ʳᵉ slide (média). UGC AI VIDEO = checkmark compte/HM, pas un label.

create or replace function public.compte_label_pas_systeme()
returns trigger
language plpgsql
as $$
declare
  lab_slug text;
  lab_nom text;
  lab_ugc_video boolean;
  compte_video boolean;
begin
  select lower(trim(slug)), lower(trim(nom)), coalesce(ugc_ai_video, false)
    into lab_slug, lab_nom, lab_ugc_video
  from public.labels
  where id = new.label_id;

  if lab_slug in ('hook', 'ugc-ai-video')
     or lab_nom in ('hook', 'ugc ai video') then
    raise exception 'LABEL_SYSTEME_INTERDIT_COMPTE';
  end if;

  select coalesce(ugc_ai_video, false) into compte_video
  from public.comptes
  where id = new.compte_id;

  if lab_ugc_video and not coalesce(compte_video, false) then
    raise exception 'LABEL_UGC_AI_VIDEO_HORS_COMPTE_VIDEO';
  end if;

  return new;
end;
$$;

drop trigger if exists compte_labels_pas_systeme on public.compte_labels;
create trigger compte_labels_pas_systeme
  before insert or update on public.compte_labels
  for each row
  execute function public.compte_label_pas_systeme();

-- Nettoyage : retirer Hook / marque système déjà collés sur des créateurs.
delete from public.compte_labels cl
using public.labels l
where cl.label_id = l.id
  and (
    lower(trim(l.slug)) in ('hook', 'ugc-ai-video')
    or lower(trim(l.nom)) in ('hook', 'ugc ai video')
  );

delete from public.hm_ugc_video_labels h
using public.labels l
where h.label_id = l.id
  and (
    lower(trim(l.slug)) in ('hook', 'ugc-ai-video')
    or lower(trim(l.nom)) in ('hook', 'ugc ai video')
  );

-- Slideshow : un compte non-vidéo ne doit pas porter un label du pool vidéo.
delete from public.compte_labels cl
using public.labels l, public.comptes c
where cl.label_id = l.id
  and cl.compte_id = c.id
  and coalesce(l.ugc_ai_video, false)
  and not coalesce(c.ugc_ai_video, false);

notify pgrst, 'reload schema';
