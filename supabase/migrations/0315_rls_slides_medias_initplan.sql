-- 0315 : RLS de `post_slides` et `media_library` rapides pour les HM.
--
-- Le calendrier HM restait vide (19/10, Lucia) : depuis les miniatures de la
-- slide 1, il lit `post_slides` + `media_library(url)` par paquets de 80
-- posts. Pour un HM, ce paquet prenait 28 s et tombait sur le
-- statement_timeout de 8 s (erreur 500) : toute la page échouait.
--
-- Deux causes :
-- 1. `is_admin()`, `is_hiring_manager()`, `auth.uid()` appelés à chaque ligne
--    (comme `posts` avant 0303) : enveloppés dans `(select …)`, évalués une
--    fois. Slides seules : 1 s → 0,07 s.
-- 2. Les deux politiques « média utilisé dans une slide » de `media_library`
--    relançaient, pour chaque média, les RLS de `post_slides`, `posts`,
--    `comptes` et `profiles`, imbriquées. Elles passent par deux fonctions
--    SECURITY DEFINER qui font la même jointure sans ces RLS, avec les mêmes
--    conditions (dont `pipeline_statut = 'done'` côté poster, que la RLS de
--    `posts` imposait). Slides + médias : 28 s → 0,16 s.
--
-- Les droits ne changent pas : sur 300 médias testés, Lucia en voit 242 et un
-- poster 156, avant comme après.
--
-- Retour arrière : les `alter policy` d'origine (sans `(select …)`, EXISTS en
-- ligne pour `media_select_hiring` et `media_select_slides`), puis
-- `drop function public.media_dans_slides_du_manager(uuid),
-- public.media_dans_slides_du_poster(uuid);`

create or replace function public.media_dans_slides_du_manager(p_media uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from post_slides ps
    join posts p on p.id = ps.post_id
    join comptes c on c.id = p.compte_id
    join profiles pr on pr.id = c.poster_id
    where ps.media_id = p_media
      and pr.manager_id = auth.uid()
  );
$$;

create or replace function public.media_dans_slides_du_poster(p_media uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from post_slides ps
    join posts p on p.id = ps.post_id
    join comptes c on c.id = p.compte_id
    where ps.media_id = p_media
      and c.poster_id = auth.uid()
      and p.pipeline_statut = 'done'
  );
$$;

alter policy slides_admin on public.post_slides
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

alter policy slides_select on public.post_slides
  using (
    (select public.is_admin())
    or exists (
      select 1
      from public.posts p
      join public.comptes c on c.id = p.compte_id
      where p.id = post_slides.post_id
        and c.poster_id = (select auth.uid())
        and p.pipeline_statut = 'done'
    )
  );

alter policy post_slides_select_hiring on public.post_slides
  using (
    (select public.is_hiring_manager())
    and exists (
      select 1
      from public.posts p
      join public.comptes c on c.id = p.compte_id
      join public.profiles pr on pr.id = c.poster_id
      where p.id = post_slides.post_id
        and pr.manager_id = (select auth.uid())
    )
  );

alter policy media_admin on public.media_library
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

alter policy media_select on public.media_library
  using (
    (select public.is_admin())
    or exists (
      select 1
      from public.comptes c
      where c.id = media_library.compte_id
        and c.poster_id = (select auth.uid())
    )
  );

alter policy media_select_hiring on public.media_library
  using (
    (select public.is_hiring_manager())
    and public.media_dans_slides_du_manager(media_library.id)
  );

alter policy media_select_slides on public.media_library
  using (public.media_dans_slides_du_poster(media_library.id));
