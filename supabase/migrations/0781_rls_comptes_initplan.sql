-- 0781 : la base tourne à 97 % de CPU (20/11). Deux lectures de la page
--   calendrier des créateurs font à elles seules l'essentiel du temps de
--   calcul depuis le 24/10 (pg_stat_statements) :
--     · `posts_poster` (2 formes) : 65 700 appels, 1,1 s et 0,7 s en moyenne ;
--     · `comptes` (mesComptes)    : 51 800 appels, 0,7 s en moyenne.
--   Cause : les politiques de `comptes`, `passages`, `contenus`, `sujets` et
--   la vue `posts_poster` appellent `is_admin()`, `is_hiring_manager()`,
--   `is_directing_manager()` et `auth.uid()` À CHAQUE LIGNE (≈ 900 comptes,
--   chacun déclenche plusieurs `has_role`). Écrits `(select …)`, Postgres les
--   calcule UNE fois par requête (InitPlan).
--   Mesuré sur un créateur (transaction annulée) : `comptes` 1 669 ms → 5 ms.
-- Les règles d'accès ne changent pas : mêmes conditions, mêmes lignes.
-- Idempotente (alter policy, create or replace view).
-- ✅ Appliquée le 2026-11-20 (MCP).

-- Ne pas faire la queue derrière une lecture longue : on échoue vite, on relance.
set local lock_timeout = '5s';

alter policy comptes_admin on public.comptes
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

alter policy comptes_select on public.comptes
  using (poster_id = (select auth.uid()) or (select public.is_admin()));

alter policy comptes_select_directing_equipe on public.comptes
  using ((select public.is_directing_manager()) and public.est_createur_equipe_dm(poster_id));

alter policy comptes_select_hiring on public.comptes
  using (
    (select public.is_hiring_manager())
    and exists (
      select 1 from public.profiles pr
      where pr.id = comptes.poster_id and pr.manager_id = (select auth.uid())
    )
  );

alter policy comptes_update_hiring on public.comptes
  using (
    (select public.is_hiring_manager())
    and exists (
      select 1 from public.profiles pr
      where pr.id = comptes.poster_id and pr.manager_id = (select auth.uid())
    )
  )
  with check (
    (select public.is_hiring_manager())
    and exists (
      select 1 from public.profiles pr
      where pr.id = comptes.poster_id and pr.manager_id = (select auth.uid())
    )
  );

alter policy passages_admin on public.passages
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

alter policy passages_select on public.passages
  using (
    (select public.is_admin())
    or exists (
      select 1 from public.comptes c
      where c.id = passages.compte_id and c.poster_id = (select auth.uid())
    )
  );

alter policy passages_update on public.passages
  using (
    (select public.is_admin())
    or exists (
      select 1 from public.comptes c
      where c.id = passages.compte_id and c.poster_id = (select auth.uid())
    )
  );

alter policy contenus_admin on public.contenus
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

alter policy sujets_admin on public.sujets
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

-- La vue : mêmes colonnes, même filtre, `security_invoker` gardé.
create or replace view public.posts_poster
with (security_invoker = true) as
select
  p.id,
  c.poster_id,
  p.compte_id,
  c.type_compte,
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
  and (c.poster_id = (select auth.uid()) or (select public.is_admin()));
