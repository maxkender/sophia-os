-- 0303 : RLS de `posts` évaluée une fois par requête, plus une fois par ligne.
--
-- Le calendrier des HM (18/10, Kris et Rana) restait vide : sa requête sur
-- `posts` (800 derniers posts, comptes et profils imbriqués) prenait 10,6 s
-- et tombait sur le statement_timeout de 8 s (erreur 500). Les politiques
-- appelaient `is_admin()` et `is_hiring_manager()` — fonctions SECURITY
-- DEFINER, donc jamais inlinées — sur chacune des ~13 000 lignes, plusieurs
-- fois par ligne. Enveloppées dans `(select …)`, Postgres les évalue une fois
-- (InitPlan) : 0,22 s pour la même requête, même résultat.
--
-- Les droits ne changent pas : mêmes expressions, mêmes rôles ; seule la
-- façon de les évaluer change (avertissement `auth_rls_initplan`).
--
-- Retour arrière : les mêmes `alter policy` sans les `(select …)`.

alter policy posts_admin_write on public.posts
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

alter policy posts_select on public.posts
  using (
    (select public.is_admin())
    or exists (
      select 1 from public.comptes c
      where c.id = posts.compte_id
        and c.poster_id = (select auth.uid())
        and posts.pipeline_statut = 'done'
    )
  );

alter policy posts_select_hiring on public.posts
  using (
    (select public.is_hiring_manager())
    and exists (
      select 1
      from public.comptes c
      join public.profiles pr on pr.id = c.poster_id
      where c.id = posts.compte_id
        and pr.manager_id = (select auth.uid())
    )
  );

alter policy posts_update on public.posts
  using (
    (select public.is_admin())
    or exists (
      select 1 from public.comptes c
      where c.id = posts.compte_id
        and c.poster_id = (select auth.uid())
    )
  );
