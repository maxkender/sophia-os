-- 0583 : URGENT, mot de passe des posteurs créés par le site (9/11).
--
-- Depuis le 31/10, manage-users tire un mot de passe aléatoire, mais
-- hub-posteurs (creer_posteur) renvoyait au site la constante « 12345678 » :
-- l'email du site donnait un mot de passe faux (« Invalid login credentials »).
--
-- 1. hub_posteurs.mdp_reel : vrai quand le mot de passe renvoyé au site est
--    celui réellement en place (posé par le code corrigé). mdp_rattrape_at :
--    quand le rattrapage a remis « 12345678 ».
-- 2. hub_mdp_rattrapage() : les posteurs du site créés depuis le 31/10, jamais
--    connectés, sans mdp_reel → mot de passe « 12345678 » (celui de l'email),
--    must_change_password = true. Une fois par posteur.
-- 3. Tâche toutes les 15 min (hub-mdp-rattrapage) jusqu'au déploiement de la
--    correction, puis désactivée.
-- Additif : 2 colonnes, une fonction, une tâche (aucune ligne supprimée).

alter table public.hub_posteurs add column if not exists mdp_reel boolean not null default false;
alter table public.hub_posteurs add column if not exists mdp_rattrape_at timestamptz;

create or replace function public.hub_mdp_rattrapage()
returns int
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  n int := 0;
  r record;
begin
  if coalesce(auth.role(), '') in ('anon', 'authenticated') and not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  for r in
    select h.hub_id, h.profile_id
      from public.hub_posteurs h
      join public.profiles p on p.id = h.profile_id
      join auth.users u on u.id = h.profile_id
     where h.statut = 'cree' and h.cree_at >= '2026-10-31'
       and not h.mdp_reel and h.mdp_rattrape_at is null
       and p.premiere_connexion_at is null and u.last_sign_in_at is null
  loop
    update auth.users set encrypted_password = extensions.crypt('12345678', extensions.gen_salt('bf')), updated_at = now()
     where id = r.profile_id;
    update public.profiles set must_change_password = true where id = r.profile_id;
    update public.hub_posteurs set mdp_rattrape_at = now() where hub_id = r.hub_id;
    n := n + 1;
  end loop;
  return n;
end;
$$;

revoke execute on function public.hub_mdp_rattrapage() from public, anon;
grant execute on function public.hub_mdp_rattrapage() to authenticated, service_role;

do $c$
begin
  if not exists (select 1 from cron.job where jobname = 'hub-mdp-rattrapage') then
    perform cron.schedule('hub-mdp-rattrapage', '*/15 * * * *', 'select public.hub_mdp_rattrapage()');
  end if;
end
$c$;

select public.hub_mdp_rattrapage();
