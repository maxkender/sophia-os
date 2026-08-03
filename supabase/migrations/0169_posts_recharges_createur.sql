-- Compteur de recharges « post entier » initiées par le créateur (max 2).
-- Sert quand un slideshow est buggé (texte décalé, etc.) : le créateur peut
-- demander un nouveau post pour le même jour, au plus deux fois.

alter table public.posts
  add column if not exists recharges_createur integer not null default 0;

alter table public.posts
  drop constraint if exists posts_recharges_createur_check;

alter table public.posts
  add constraint posts_recharges_createur_check
  check (recharges_createur >= 0 and recharges_createur <= 2);

comment on column public.posts.recharges_createur is
  'Nombre de recharges complètes demandées par le créateur pour ce créneau (max 2).';

-- Expose le compteur dans la vue poster (lecture seule).
-- DROP requis : CREATE OR REPLACE ne peut pas insérer une colonne au milieu.
drop view if exists public.posts_poster;

create view public.posts_poster as
  select
    p.id,
    c.poster_id,
    p.compte_id,
    c.persona_nom,
    c.handle_tiktok,
    c.langue,
    p.date_publication_prevue,
    p.type,
    p.statut,
    p.musique_url,
    p.musique_titre,
    p.musique_plateforme,
    p.publie_at,
    p.publie_url,
    p.recharges_createur,
    coalesce(s.titre, cont.titre) as sujet_titre,
    p.created_at
  from public.posts p
  join public.comptes c on c.id = p.compte_id
  left join public.sujets s on s.id = p.sujet_id
  left join public.passages pas on pas.post_id = p.id
  left join public.contenus cont on cont.id = pas.contenu_id
  where p.pipeline_statut = 'done'
    and coalesce(p.est_test, false) = false
    and (c.poster_id = auth.uid() or public.is_admin());

grant select on public.posts_poster to authenticated;
