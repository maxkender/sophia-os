-- 0742 : vue tableau des posteurs (Max, 17/11) — les vues moyennes par post de chaque compte actif, au dernier
-- relevé (compte_metrics : vues des derniers posts / nombre de posts), pour colorer les cases par tranche de vues.
-- compte_metrics n'a pas de lecture directe depuis le navigateur : cette fonction (admin) la remplace.
-- Additif : une fonction en lecture seule.

create or replace function public.comptes_vues_par_post()
returns table (compte_id uuid, vues_post integer, collecte_at timestamptz)
language sql
stable
security definer
set search_path to 'public'
as $$
  select distinct on (m.compte_id) m.compte_id, round(m.vues::numeric / m.nb_posts)::int, m.collecte_at
    from public.compte_metrics m
    join public.comptes c on c.id = m.compte_id and c.is_active
   where public.is_admin() and m.nb_posts > 0
   order by m.compte_id, m.collecte_at desc;
$$;

revoke all on function public.comptes_vues_par_post() from public, anon;
grant execute on function public.comptes_vues_par_post() to authenticated;
