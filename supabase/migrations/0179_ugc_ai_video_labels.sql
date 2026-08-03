-- Labels UGC AI VIDEO : flag sur labels, assignation HM, label_id sur videos.

alter table public.labels
  add column if not exists ugc_ai_video boolean not null default false;

comment on column public.labels.ugc_ai_video is
  'Label du pool UGC AI VIDEO (assignable aux HM vidéo ; requis sur reactions/utilisations).';

create index if not exists labels_ugc_ai_video_idx
  on public.labels (ugc_ai_video)
  where ugc_ai_video;

-- Marque système posée sur tous les créateurs HM UGC AI VIDEO.
insert into public.labels (nom, slug, couleur, ugc_ai_video)
values ('UGC AI VIDEO', 'ugc-ai-video', '#1f6b4a', true)
on conflict (slug) do update
set
  ugc_ai_video = true,
  nom = excluded.nom;

-- Labels thématiques assignés à un hiring manager UGC AI VIDEO.
create table if not exists public.hm_ugc_video_labels (
  profile_id uuid not null references public.profiles (id) on delete cascade,
  label_id uuid not null references public.labels (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (profile_id, label_id)
);

create index if not exists hm_ugc_video_labels_label_idx
  on public.hm_ugc_video_labels (label_id);

comment on table public.hm_ugc_video_labels is
  'Labels UGC AI VIDEO thématiques d’un HM vidéo — propagés à ses créateurs (+ marque ugc-ai-video).';

alter table public.hm_ugc_video_labels enable row level security;

drop policy if exists hm_ugc_video_labels_admin on public.hm_ugc_video_labels;
create policy hm_ugc_video_labels_admin on public.hm_ugc_video_labels
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Lecture : HM voit ses propres labels (utile côté hiring UI).
drop policy if exists hm_ugc_video_labels_hm_select on public.hm_ugc_video_labels;
create policy hm_ugc_video_labels_hm_select on public.hm_ugc_video_labels
  for select to authenticated
  using (profile_id = auth.uid());

grant select, insert, update, delete on public.hm_ugc_video_labels to authenticated;
grant all on public.hm_ugc_video_labels to service_role;

-- Reactions / utilisations : un label UGC AI VIDEO obligatoire à l’enregistrement.
alter table public.ugc_reactions
  add column if not exists label_id uuid null
    references public.labels (id) on delete restrict;

alter table public.ugc_utilisations
  add column if not exists label_id uuid null
    references public.labels (id) on delete restrict;

create index if not exists ugc_reactions_label_idx
  on public.ugc_reactions (label_id)
  where label_id is not null;

create index if not exists ugc_utilisations_label_idx
  on public.ugc_utilisations (label_id)
  where label_id is not null;

comment on column public.ugc_reactions.label_id is
  'Label UGC AI VIDEO choisi à la finalisation.';
comment on column public.ugc_utilisations.label_id is
  'Label UGC AI VIDEO choisi à l’import.';
