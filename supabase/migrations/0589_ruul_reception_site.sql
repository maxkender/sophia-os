-- 0589 : Ruul partie 1, réception depuis le site (Max, 10/11).
-- 1. Profil : zone (A/B/C), tarif de la semaine (USD), application du site
--    (déjà ajoutés en base par 0586 : sans effet ici, gardés pour le dépôt).
-- 2. ruul_maj_email_app : l'action hub-posteurs « maj_ruul » retrouve le
--    posteur par l'application du site (repli : hub_id / profile_id).
-- 3. La simulation de la liste de paie Upwork (paie_liste_v2) ne montre plus
--    les posteurs Ruul (la paie réelle les excluait déjà : 0586, paie_generer).
-- Additif : colonnes « if not exists », une fonction, un patch en place.

alter table public.profiles add column if not exists ruul_zone text;
alter table public.profiles add column if not exists ruul_tarif_semaine numeric;
alter table public.profiles add column if not exists site_application_id text;
create index if not exists profiles_site_application_id on public.profiles (site_application_id) where site_application_id is not null;

create or replace function public.ruul_maj_email_app(p_application_id text, p_hub text, p_profile uuid, p_email text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid := coalesce(
    (select pr.id from public.profiles pr where nullif(btrim(coalesce(p_application_id, '')), '') is not null
                                          and pr.site_application_id = btrim(p_application_id) limit 1),
    p_profile,
    (select h.profile_id from public.hub_posteurs h where h.hub_id = p_hub));
  v_email text := nullif(lower(btrim(coalesce(p_email, ''))), '');
begin
  if v_id is null then return jsonb_build_object('ok', false, 'error', 'posteur introuvable'); end if;
  if v_email is not null and v_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]{2,}$' then return jsonb_build_object('ok', false, 'error', 'email invalide'); end if;
  update public.profiles set ruul_email = v_email where id = v_id and canal_paie = 'ruul';
  if not found then return jsonb_build_object('ok', false, 'error', 'pas un posteur Ruul'); end if;
  return jsonb_build_object('ok', true, 'profile_id', v_id, 'ruul_email', v_email);
end;
$$;

revoke execute on function public.ruul_maj_email_app(text, text, uuid, text) from public, anon, authenticated;
grant execute on function public.ruul_maj_email_app(text, text, uuid, text) to service_role;

do $p$
declare
  d text := pg_get_functiondef('public.paie_liste_v2(date,boolean)'::regprocedure);
  avant text := $a$      from public.paie_calculer_v3(p_lundi) c
     where p_simulation$a$;
  apres text := $a$      from public.paie_calculer_v3(p_lundi) c
     where p_simulation
       and not exists (select 1 from public.profiles x where x.id = c.poster_id and x.canal_paie = 'ruul' /* 0589 */)$a$;
begin
  if position('0589' in d) > 0 then return; end if;
  if position(avant in d) = 0 then raise exception '0589 : paie_liste_v2 ne correspond pas'; end if;
  execute replace(d, avant, apres);
end
$p$;
