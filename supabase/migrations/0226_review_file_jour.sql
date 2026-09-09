-- File quotidienne de reviews TikTok : un retour par post publié, passe,
-- remarques génériques (titre / corps) éditables par l'admin.

alter table public.reviews
  add column if not exists post_id uuid references public.posts (id) on delete set null,
  add column if not exists publie_url text,
  add column if not exists source_url text,
  add column if not exists handle_tiktok text,
  add column if not exists compte_label text,
  add column if not exists date_publication date;

create unique index if not exists reviews_post_id_uidx
  on public.reviews (post_id)
  where post_id is not null;

create index if not exists posts_publie_at_idx
  on public.posts (publie_at)
  where publie_at is not null and est_test = false;

-- Skip « rien à dire » : le post sort de la file et n'y revient pas.
create table if not exists public.review_passes (
  post_id uuid primary key references public.posts (id) on delete cascade,
  admin_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.review_passes enable row level security;

drop policy if exists review_passes_admin on public.review_passes;
create policy review_passes_admin on public.review_passes
  for all using (public.is_admin()) with check (public.is_admin());

grant select, insert, delete on public.review_passes to authenticated;
grant all on public.review_passes to service_role;

-- Remarques génériques : le titre s'affiche, le corps s'insère dans la review.
create table if not exists public.review_remarques (
  id uuid primary key default gen_random_uuid(),
  titre text not null,
  corps text not null,
  ordre integer not null default 0,
  created_at timestamptz not null default now()
);

alter table public.review_remarques enable row level security;

drop policy if exists review_remarques_admin on public.review_remarques;
create policy review_remarques_admin on public.review_remarques
  for all using (public.is_admin()) with check (public.is_admin());

grant select, insert, update, delete on public.review_remarques to authenticated;
grant all on public.review_remarques to service_role;

insert into public.review_remarques (titre, corps, ordre)
select v.titre, v.corps, v.ordre
from (
  values
    (
      'Hook trop lent',
      'The hook is too slow. You need to grab attention on the first slide or people swipe away.',
      10
    ),
    (
      'Texte illisible',
      'The text is too long or too small on some slides. Shorten it so it can be read in two seconds.',
      20
    ),
    (
      'Pas fidèle à l''original',
      'This post strays too far from the original. Match the pacing and structure of the reference TikTok.',
      30
    ),
    (
      'Timing',
      'The posting slot was not respected. Publish at the scheduled time.',
      40
    ),
    (
      'Bien joué',
      'Great post — faithful to the original and clean. Keep it up.',
      50
    )
) as v(titre, corps, ordre)
where not exists (select 1 from public.review_remarques);
