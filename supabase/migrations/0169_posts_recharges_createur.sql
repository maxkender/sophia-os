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

-- FAQ créateur (FR + EN) : expliquer la recharge uniquement si slideshow buggé.
update public.documents
set
  contenu = contenu || E'\n<h2>8. Mon slideshow est buggé (texte décalé, mal placé…) — que faire ?</h2>\n<p><strong>Uniquement</strong> si le slideshow est vraiment buggé (texte décalé, illisible, images incohérentes), ouvre le post et utilise « Charger un nouveau post entièrement ». Tu as <strong>2 essais maximum</strong> par créneau. Ce n''est pas pour changer de sujet ou « tester autre chose ». Si le problème continue après 2 essais, contacte ton recruteur.</p>\n',
  contenu_en = contenu_en || E'\n<h2>8. My slideshow is broken (misaligned text, wrong placement…) — what do I do?</h2>\n<p><strong>Only</strong> if the slideshow is truly broken (misaligned/unreadable text, incoherent images), open the post and use “Load an entirely new post”. You get <strong>2 attempts maximum</strong> per slot. This is not for changing topic or “trying something else”. If the issue continues after 2 attempts, contact your recruiter.</p>\n',
  updated_at = now()
where cle = 'faq_poster'
  and contenu not like '%Charger un nouveau post entièrement%';
