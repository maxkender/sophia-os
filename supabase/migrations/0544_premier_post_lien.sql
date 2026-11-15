-- 0544 : le guide « Ta première semaine, en 5 étapes » du dashboard posteur.
-- L'étape 5 se coche dès le 1er post publié avec lien (sur n'importe lequel de
-- ses comptes) et le guide disparaît 24 h après : mon_premier_post_lien() rend
-- l'heure de ce 1er post (null s'il n'y en a pas). Lecture seule.

create or replace function public.mon_premier_post_lien()
returns timestamptz
language sql
stable
security definer
set search_path = public
as $$
  select min(coalesce(p.lien_confirme_at, p.publie_at, p.created_at))
    from public.passages p
    join public.comptes c on c.id = p.compte_id
   where c.poster_id = auth.uid() and p.statut = 'publie' and p.publie_url is not null;
$$;

revoke execute on function public.mon_premier_post_lien() from public, anon;
grant execute on function public.mon_premier_post_lien() to authenticated;
