-- 0590 : Ruul partie 2, l'email Ruul côté posteur (Max, 10/11).
-- 1. Le bandeau du dashboard : ruul_mon_email / ruul_mon_email_enregistrer
--    (créées en base par 0586, reprises ici) ; un enregistrement met une synchro
--    pour le site dans ruul_site_sync (envoyée par la fonction ruul).
-- 2. Les relances si l'email reste vide : J+1, J+3 après la création du
--    compte, puis le vendredi avant la 1re paie ; un message par relance ;
--    seulement entre 10 h et 20 h, heure du pays du posteur. Interrupteur
--    ruul_email_relances (éteint).
-- Additif : une table, des fonctions remplacées (aucune ligne supprimée ou modifiée).

create table if not exists public.ruul_email_relances (
  poster_id  uuid not null references public.profiles(id),
  etape      text not null check (etape in ('j1', 'j3', 'vendredi')),
  canaux     text[] not null default '{}',
  erreur     text,
  envoye_at  timestamptz not null default now(),
  primary key (poster_id, etape)
);
alter table public.ruul_email_relances enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'ruul_email_relances' and policyname = 'ruul_email_relances_admin') then
    create policy ruul_email_relances_admin on public.ruul_email_relances for select to authenticated using (public.is_admin());
  end if;
end $$;

create table if not exists public.ruul_site_sync (
  id          uuid primary key default gen_random_uuid(),
  poster_id   uuid not null references public.profiles(id),
  action      text not null,
  payload     jsonb not null default '{}',
  statut      text not null default 'a_envoyer' check (statut in ('a_envoyer', 'envoye', 'erreur')),
  tentatives  integer not null default 0,
  erreur      text,
  cree_at     timestamptz not null default now(),
  envoye_at   timestamptz
);
alter table public.ruul_site_sync enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'ruul_site_sync' and policyname = 'ruul_site_sync_admin') then
    create policy ruul_site_sync_admin on public.ruul_site_sync for select to authenticated using (public.is_admin());
  end if;
end $$;

insert into public.reglages (cle, valeur) values ('ruul_email_relances', 'false'::jsonb)
on conflict (cle) do nothing;

create or replace function public.ruul_mon_email()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object('ruul', coalesce(pr.canal_paie = 'ruul', false), 'email', nullif(btrim(coalesce(pr.ruul_email, '')), ''))
    from public.profiles pr where pr.id = auth.uid();
$$;

create or replace function public.ruul_mon_email_enregistrer(p_email text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
begin
  if auth.uid() is null then raise exception 'not signed in' using errcode = '42501'; end if;
  if v_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]{2,}$' then return jsonb_build_object('ok', false, 'erreur', 'Please enter a valid email address.'); end if;
  update public.profiles set ruul_email = v_email where id = auth.uid() and canal_paie = 'ruul';
  if not found then return jsonb_build_object('ok', false, 'erreur', 'Not a Ruul account.'); end if;
  -- Le site est prévenu (fonction ruul, toutes les 15 min).
  insert into public.ruul_site_sync (poster_id, action, payload)
  select pr.id, 'ruul_email',
         jsonb_build_object('application_id', pr.site_application_id, 'hub_id', h.hub_id, 'profile_id', pr.id, 'ruul_email', v_email)
    from public.profiles pr left join public.hub_posteurs h on h.profile_id = pr.id
   where pr.id = auth.uid();
  return jsonb_build_object('ok', true);
end;
$$;

revoke execute on function public.ruul_mon_email() from public, anon;
revoke execute on function public.ruul_mon_email_enregistrer(text) from public, anon;
grant execute on function public.ruul_mon_email() to authenticated;
grant execute on function public.ruul_mon_email_enregistrer(text) to authenticated;

/* Les relances dues maintenant (la plus récente seulement), entre 10 h et 20 h heure du pays. */
create or replace function public.ruul_email_relances_dues()
returns table (poster_id uuid, prenom text, email text, slack_user_id text, etape text)
language sql
stable
security definer
set search_path = public
as $$
  with p as (
    select pr.id, pr.prenom, pr.slack_user_id,
           coalesce(nullif(btrim(h.email_perso), ''), nullif(btrim(pr.email_perso), '')) as email,
           coalesce(h.cree_at, pr.created_at) as cree,
           coalesce(h.debut_le, pr.cohorte_lundi) + 7 as premiere_paie,
           coalesce(public.fuseau_pays(public.paie_pays_posteur(pr.id)), 'Europe/Paris') as fuseau
      from public.profiles pr
      left join public.hub_posteurs h on h.profile_id = pr.id
     where pr.canal_paie = 'ruul' and pr.is_active and pr.relances_stop_at is null
       and nullif(btrim(coalesce(pr.ruul_email, '')), '') is null
       and not coalesce(h.exclu_suivi, false)
  ), d as (
    select p.*, (now() at time zone p.fuseau)::date as auj, extract(hour from now() at time zone p.fuseau) as heure,
           coalesce((select array_agg(r.etape) from public.ruul_email_relances r where r.poster_id = p.id), '{}') as faites
      from p
  ), e as (
    select d.*,
           case
             when d.premiere_paie is not null and d.auj >= d.premiere_paie - 3 and d.auj < d.premiere_paie
                  and not ('vendredi' = any(d.faites)) then 'vendredi'
             when d.cree <= now() - interval '3 days' and not ('j3' = any(d.faites)) and not ('vendredi' = any(d.faites)) then 'j3'
             when d.cree <= now() - interval '1 day' and d.faites = '{}' then 'j1'
           end as etape
      from d
  )
  select e.id, e.prenom, e.email, e.slack_user_id, e.etape
    from e
   where e.etape is not null and e.heure >= 10 and e.heure < 20;
$$;

revoke execute on function public.ruul_email_relances_dues() from public, anon, authenticated;
grant execute on function public.ruul_email_relances_dues() to service_role;
