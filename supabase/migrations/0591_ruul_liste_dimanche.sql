-- 0591 : Ruul partie 3, l'ajout dans Ruul (Max, 10/11).
-- 1. La date d'ajout dans Ruul reste profiles.ruul_ajoute_at (déjà en base).
-- 2. Le dimanche 18 h (Paris) : un email à Max avec les posteurs Ruul à ajouter
--    (nom, email Ruul, pays, zone, tarif) ; un seul par dimanche (ruul_dimanche_envois).
--    Interrupteur ruul_liste_dimanche (éteint).
-- 3. « Marquer ajouté dans Ruul » (un par un ou tous) : ruul_marquer_ajoutes.
--    L'email d'invitation Ruul au posteur qui suivait ce clic passe derrière
--    l'interrupteur ruul_invitation_email (éteint) : rien ne part sans l'OK de Max.
-- ruul_tarif, ruul_a_ajouter_liste et ruul_marquer_ajoutes ont été créées en base
-- par 0586 ; reprises ici à l'identique (la liste est réservée à l'admin).
-- Additif : une table, deux réglages, des fonctions remplacées.

create table if not exists public.ruul_dimanche_envois (
  dimanche   date primary key,
  nb         integer not null default 0,
  ok         boolean not null default false,
  erreur     text,
  envoye_at  timestamptz not null default now()
);
alter table public.ruul_dimanche_envois enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'ruul_dimanche_envois' and policyname = 'ruul_dimanche_envois_admin') then
    create policy ruul_dimanche_envois_admin on public.ruul_dimanche_envois for select to authenticated using (public.is_admin());
  end if;
end $$;

insert into public.reglages (cle, valeur) values ('ruul_liste_dimanche', 'false'::jsonb), ('ruul_invitation_email', 'false'::jsonb)
on conflict (cle) do nothing;

create or replace function public.ruul_tarif(p_poster uuid)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select pr.ruul_tarif_semaine from public.profiles pr where pr.id = p_poster and pr.ruul_tarif_semaine > 0),
    (select zp.tarif from public.zones_paie_pays z join public.zones_paie zp on zp.zone = z.zone
      where upper(z.pays) = upper(public.paie_pays_posteur(p_poster)) and z.retire_at is null limit 1));
$$;

/* Les posteurs Ruul actifs avec un email Ruul, pas encore ajoutés dans Ruul (admin ou service seulement). */
create or replace function public.ruul_a_ajouter_liste()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'poster_id', pr.id, 'nom', coalesce(nullif(btrim(concat_ws(' ', pr.prenom, pr.nom)), ''), pr.email),
           'ruul_email', pr.ruul_email, 'pays', public.paie_pays_posteur(pr.id),
           'zone', coalesce(pr.ruul_zone, (select z.zone from public.zones_paie_pays z
                                            where upper(z.pays) = upper(public.paie_pays_posteur(pr.id)) and z.retire_at is null limit 1)),
           'tarif', public.ruul_tarif(pr.id)) order by pr.prenom), '[]'::jsonb)
    from public.profiles pr
    left join public.hub_posteurs h on h.profile_id = pr.id
   where pr.canal_paie = 'ruul' and pr.is_active and pr.ruul_ajoute_at is null
     and nullif(btrim(coalesce(pr.ruul_email, '')), '') is not null
     and not coalesce(h.exclu_suivi, false)
     and (auth.uid() is null or public.is_admin());
$$;

create or replace function public.ruul_marquer_ajoutes(p_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer;
begin
  if not public.is_admin() then raise exception 'réservé à l''admin et au Head of Ops'; end if;
  update public.profiles
     set ruul_ajoute_at = coalesce(ruul_ajoute_at, now()),
         ruul_statut = case when ruul_statut in ('pret', 'paye_1x') then ruul_statut else 'invite' end
   where id = any(p_ids) and canal_paie = 'ruul' and ruul_ajoute_at is null
     and nullif(btrim(coalesce(ruul_email, '')), '') is not null;
  get diagnostics n = row_count;
  return n;
end;
$$;

revoke execute on function public.ruul_a_ajouter_liste() from public, anon;
revoke execute on function public.ruul_marquer_ajoutes(uuid[]) from public, anon;
grant execute on function public.ruul_a_ajouter_liste() to authenticated, service_role;
grant execute on function public.ruul_marquer_ajoutes(uuid[]) to authenticated;
