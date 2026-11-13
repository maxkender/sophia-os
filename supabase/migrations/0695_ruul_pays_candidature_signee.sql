-- 0695 (Max, 13/11) : Agent Ruul, « À inviter dans Ruul » montre le pays de chaque personne.
-- Le pays d'un posteur Ruul vient d'abord de sa candidature SIGNÉE (la plus récente), puis d'une
-- autre candidature, puis du pays de paie. Additif : une fonction redéfinie (même signature).
create or replace function public.ruul_pays_posteur(p_poster uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select upper(c.pays) from public.ruul_candidatures c
                    where c.os_profile_id = p_poster and c.pays is not null
                    order by (c.signe_at is not null) desc, c.signe_at desc nulls last, c.cree_at desc nulls last
                    limit 1),
                  public.paie_pays_posteur(p_poster));
$$;
