-- 0255 : `signalements_texte` — un poster signale une photo encore écrite.
--
-- POURQUOI. `verifyClean` est en pause (coût Gemini) : une sortie Fal/Replicate
-- qui rate un texte (mot stylisé, citation écrite dans la scène, signature)
-- part en `propre/` avec `texte_restant = false`, et la page poster la présente
-- comme prête à publier. Le 01/10, un poster a reçu deux slots dont toutes les
-- photos portaient des citations ou le mot « supermaxing ». Le poster est le
-- seul à regarder chaque image : on lui donne de quoi le dire.
--
-- CE QUE FAIT UN SIGNALEMENT (fonction `signaler-texte`) :
--   - `media_library.texte_restant = true` : la photo sort de tous les pools
--     propres (composition, remplacements, avatars…), qui filtrent déjà dessus ;
--   - la slide du poster reçoit un remplaçant propre du même label ;
--   - le remplaçant est propagé, PAR media_id et jamais par position, aux
--     slides des posts NON PUBLIÉS et aux `structure_slides` des contenus qui
--     portaient la photo. Un post publié n'est jamais réécrit.
--
-- POURQUOI UNE TABLE ET PAS DEUX COLONNES SUR `media_library`. Le flag est un
-- effet global déclenché par un poster : une recharge créateur qui rejetait
-- globalement son slideshow a déjà vidé les pools (243 slideshows perdus, voir
-- `revoquer-post`). Ici l'effet reste réversible et chaque signalement garde
-- qui, quand, sur quel post, avec quel remplaçant, jusqu'à ce que l'admin
-- tranche :
--   - `corrige`  : l'admin a renettoyé la photo, elle revient dans les pools ;
--   - `confirme` : la photo reste exclue ;
--   - `rejete`   : il n'y avait pas de texte, la photo revient dans les pools.
-- Les remplacements déjà faits restent en place dans les trois cas : ils ne
-- coûtent rien et défaire une slide qu'un poster a peut-être déjà enregistrée
-- serait pire.
--
-- Écriture par la fonction (service_role) uniquement ; lecture et traitement
-- par l'admin. Le poster n'en a pas besoin.

create table if not exists public.signalements_texte (
  id uuid primary key default gen_random_uuid(),
  media_id uuid not null references public.media_library (id) on delete cascade,
  post_id uuid references public.posts (id) on delete set null,
  post_slide_id uuid references public.post_slides (id) on delete set null,
  signale_par uuid references auth.users (id) on delete set null,
  remplace_par uuid references public.media_library (id) on delete set null,
  -- Slides réécrites au-delà de celle du poster (autres posts non publiés).
  slides_propagees integer not null default 0,
  -- Positions de `structure_slides` réécrites, tous contenus confondus.
  contenus_propages integer not null default 0,
  statut text not null default 'ouvert'
    check (statut in ('ouvert', 'corrige', 'confirme', 'rejete')),
  traite_par uuid references auth.users (id) on delete set null,
  traite_le timestamptz,
  created_at timestamptz not null default now()
);

comment on table public.signalements_texte is
  'Photo propre signalée par un poster comme portant encore du texte. Voir migration 0255.';

create index if not exists signalements_texte_ouverts_idx
  on public.signalements_texte (created_at desc)
  where statut = 'ouvert';

create index if not exists signalements_texte_media_idx
  on public.signalements_texte (media_id);

alter table public.signalements_texte enable row level security;

drop policy if exists signalements_texte_admin on public.signalements_texte;
create policy signalements_texte_admin on public.signalements_texte
  for all using (public.is_admin()) with check (public.is_admin());

revoke all on public.signalements_texte from anon;
