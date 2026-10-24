-- 0347 — La page du poster sait si son post est un original de pod.
--
-- Les « photos d'origine » d'un original de pod sont les slides du TikTok
-- d'inspiration (pods.ts, `reference_url`) : ni la photo ni le texte ne sont
-- ceux du post, exprès. Affichées sous « Photo d'origine », les posters y
-- voient une erreur et ne publient pas. La page change donc de légende pour
-- ces posts.
--
-- Le poster ne lit pas `contenus` (RLS admin) : cette fonction ne lui rend que
-- le pod de SON post (null pour un post importé ou le post d'un autre).

create or replace function public.pod_du_post(p_post_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select ct.pod
    from public.posts po
    join public.comptes c on c.id = po.compte_id
    join public.passages pa on pa.post_id = po.id
    join public.contenus ct on ct.id = pa.contenu_id
   where po.id = p_post_id
     and (c.poster_id = (select auth.uid()) or (select public.is_admin()))
   limit 1;
$$;

revoke all on function public.pod_du_post(uuid) from public, anon;
grant execute on function public.pod_du_post(uuid) to authenticated;
