-- 0293 : banc d'essai de l'agent de relecture — le jugement de l'admin.
--
-- POURQUOI. Avant de laisser l'agent proposer ses reviews (voir 0290), l'admin
-- le fait tourner « à blanc » sur un lot de vrais posts (`relecture_enfiler`
-- avec origine 'test') et juge chaque résultat sur /admin/banc-relecture :
--   ✓ / ✗ pour chaque point relevé par l'agent ;
--   « raté » pour un défaut que l'agent n'a pas vu, avec ce qui ne va pas ;
--   « rien à signaler » quand l'agent n'a rien relevé et qu'il a raison.
-- On en tire la justesse de chaque règle et ce qu'elle laisse passer. Rien
-- n'est envoyé au créateur.

create table if not exists public.relecture_avis (
  id uuid primary key default gen_random_uuid(),
  relecture_id uuid not null references public.relectures_auto (id) on delete cascade,
  -- Le point jugé : « code|slides » d'un défaut relevé, « aucun » (l'agent n'a
  -- rien relevé et c'est juste), ou un identifiant libre pour un raté.
  cle text not null,
  -- Règle concernée (justification, largeur…) ; « aucun » ; « autre » pour un
  -- raté qu'aucune règle ne couvre.
  code text not null,
  verdict text not null check (verdict in ('juste', 'faux', 'rate')),
  -- ✗ : pourquoi le point est faux · raté : ce qui ne va pas sur le post.
  commentaire text,
  -- Le constat de l'agent au moment du jugement : une relecture rejugée peut
  -- changer de points, le jugement garde ce qu'il a jugé.
  detail text,
  admin_id uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  maj_at timestamptz not null default now(),
  unique (relecture_id, cle)
);

comment on table public.relecture_avis is
  'Jugement de l''admin sur une relecture automatique (banc d''essai) : ✓/✗ par point, défauts ratés. Voir migration 0293.';

alter table public.relecture_avis enable row level security;

drop policy if exists relecture_avis_admin on public.relecture_avis;
create policy relecture_avis_admin on public.relecture_avis
  for all using (public.is_admin()) with check (public.is_admin());

grant select, insert, update, delete on public.relecture_avis to authenticated;
grant all on public.relecture_avis to service_role;
