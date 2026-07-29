-- Labels portés par les images de la bibliothèque (= labels du slideshow mère).
-- Permet le remplacement auto « même niche » quand verifyClean détecte du texte.

create table if not exists public.media_labels (
  media_id uuid not null references public.media_library (id) on delete cascade,
  label_id uuid not null references public.labels (id) on delete cascade,
  primary key (media_id, label_id)
);

create index if not exists media_labels_label_idx on public.media_labels (label_id);

alter table public.media_labels enable row level security;

drop policy if exists media_labels_admin on public.media_labels;
create policy media_labels_admin on public.media_labels
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists media_labels_select on public.media_labels;
create policy media_labels_select on public.media_labels
  for select using (
    public.is_admin()
    or exists (
      select 1 from public.media_library m
      where m.id = media_id
    )
  );

grant select, insert, update, delete on public.media_labels to authenticated;
grant all on public.media_labels to service_role;

-- Backfill : chaque media hérite des labels de son contenu mère.
insert into public.media_labels (media_id, label_id)
select m.id, cl.label_id
from public.media_library m
join public.contenu_labels cl on cl.contenu_id = m.contenu_id
where m.contenu_id is not null
on conflict do nothing;
