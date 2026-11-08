-- Page « À retirer de Slack » (Recruitment automation).
--
-- Toutes les personnes désactivées dans l'OS (Kill, STOP, Portugal, contrat
-- fermé…) qui ont encore un compte Slack actif. La fonction Edge
-- `slack-retrait` vérifie chaque compte (users.info : deleted), retire des
-- canaux (conversations.kick) et désactive le compte quand un jeton SCIM est
-- configuré ; sinon, « à désactiver à la main » avec le lien du profil.
--
-- - slack_retraits : une ligne par personne désactivée reliée à Slack ;
-- - slack_retrait_ajouter() : à chaque désactivation (trigger profiles) et à
--   chaque arrêt (trigger arrets) ;
-- - slack_retraits_liste() : la page (comptes encore actifs dans Slack) ;
-- - les cartes « Remove from Slack » ne sont plus créées (Problèmes, To do) :
--   tout passe par la page ; celles encore ouvertes sont fermées.

create table if not exists public.slack_retraits (
  poster_id         uuid primary key references public.profiles(id),
  slack_user_id     text not null,
  raison            text,
  arret_at          timestamptz,
  ajoute_at         timestamptz not null default now(),
  -- users.info : true = encore membre actif ; false = compte désactivé.
  actif_slack       boolean,
  verifie_at        timestamptz,
  canaux_retires_at timestamptz,
  canaux_bilan      jsonb,
  desactive_at      timestamptz,
  desactive_par     text,
  erreur            text,
  maj_at            timestamptz not null default now()
);

alter table public.slack_retraits enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'slack_retraits' and policyname = 'slack_retraits_admin') then
    create policy slack_retraits_admin on public.slack_retraits for select to authenticated using (public.is_admin());
  end if;
end $$;

/** La raison lisible d'un arrêt : Kill, STOP, Portugal, contrat fermé… */
create or replace function public.slack_retrait_raison(p_motif text, p_source text)
returns text
language sql
immutable
as $$
  select case
    when p_motif ilike '%portugal%' then 'Portugal'
    when p_motif ilike 'contract ended by freelancer%' then 'Contrat fermé (par le posteur)'
    when p_motif ilike 'contract ended%' then 'Contrat fermé'
    when p_motif ilike '%stop%' or p_motif = 'je_ne_veux_plus' then 'STOP'
    when p_motif ilike 'jamais démarré%' then 'Jamais démarré'
    when p_motif ilike 'kill%' or p_motif in ('kill_48h', 'kill_samedi', 'moins6') or p_source = 'kill_samedi' then 'Kill'
    when p_motif is not null and p_motif <> 'desactivation' then p_motif
    else 'Désactivé'
  end;
$$;

/**
 * Ajoute (ou met à jour) une personne désactivée reliée à Slack : son id
 * Slack (profil, hub, sinon email connu de Slack), la raison et la date du
 * dernier arrêt. Rien si elle est active ou sans Slack.
 */
create or replace function public.slack_retrait_ajouter(p_poster uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_slack text;
  v_motif text;
  v_source text;
  v_at timestamptz;
begin
  select coalesce(p.slack_user_id, h.slack_user_id,
                  (select m.slack_user_id from public.slack_membres m
                    where not m.bot and m.email is not null
                      and lower(m.email) in (lower(p.email), lower(p.email_perso))
                    order by m.supprime, m.vu_at desc limit 1))
    into v_slack
    from public.profiles p
    left join public.hub_posteurs h on h.profile_id = p.id
   where p.id = p_poster
     and p.is_active is false
     and exists (select 1 from public.user_roles ur where ur.user_id = p.id and ur.role = 'poster')
   limit 1;
  if v_slack is null then
    return false;
  end if;
  select a.motif, a.source, a.created_at into v_motif, v_source, v_at
    from public.arrets a
   where a.poster_id = p_poster and a.annule_at is null
   order by a.created_at desc limit 1;
  insert into public.slack_retraits (poster_id, slack_user_id, raison, arret_at)
  values (p_poster, v_slack, public.slack_retrait_raison(v_motif, v_source), v_at)
  on conflict (poster_id) do update
     set slack_user_id = excluded.slack_user_id,
         raison = excluded.raison,
         arret_at = coalesce(excluded.arret_at, slack_retraits.arret_at),
         maj_at = now();
  return true;
end;
$$;

revoke all on function public.slack_retrait_ajouter(uuid) from public, anon, authenticated;

/** Toutes les personnes désactivées reliées à Slack (rattrapage, et cron). */
create or replace function public.slack_retraits_remplir()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_n integer := 0;
  r record;
begin
  for r in
    select p.id from public.profiles p
     where p.is_active is false
       and exists (select 1 from public.user_roles ur where ur.user_id = p.id and ur.role = 'poster')
  loop
    if public.slack_retrait_ajouter(r.id) then
      v_n := v_n + 1;
    end if;
  end loop;
  return v_n;
end;
$$;

revoke all on function public.slack_retraits_remplir() from public, anon, authenticated;

/** Chaque désactivation (Kill immédiat, samedi, STOP…) ajoute la personne. */
create or replace function public.slack_retraits_profil()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.is_active is false and coalesce(old.is_active, true) is true then
    perform public.slack_retrait_ajouter(new.id);
  end if;
  return new;
end;
$$;

create or replace trigger slack_retraits_profil
  after update of is_active on public.profiles
  for each row execute function public.slack_retraits_profil();

create or replace function public.slack_retraits_arret()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.slack_retrait_ajouter(new.poster_id);
  return new;
end;
$$;

create or replace trigger slack_retraits_arret
  after insert or update of statut on public.arrets
  for each row execute function public.slack_retraits_arret();

/**
 * La page : les personnes désactivées dans l'OS encore membres actifs de
 * Slack (dernière vérification users.info, à défaut la synchro du jour).
 * Une personne réactivée dans l'OS ou désactivée dans Slack disparaît.
 */
create or replace function public.slack_retraits_liste()
returns table (
  poster_id uuid,
  nom text,
  raison text,
  arret_at timestamptz,
  slack_user_id text,
  lien_slack text,
  canaux_retires_at timestamptz,
  canaux_bilan jsonb,
  erreur text,
  verifie_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'réservé à l''admin et au Head of Ops';
  end if;
  return query
  select s.poster_id,
         coalesce(nullif(btrim(concat_ws(' ', p.prenom, p.nom)), ''), m.nom_reel, p.email)::text,
         s.raison, s.arret_at, s.slack_user_id,
         'https://sophia-system.slack.com/team/' || s.slack_user_id,
         s.canaux_retires_at, s.canaux_bilan, s.erreur, s.verifie_at
    from public.slack_retraits s
    join public.profiles p on p.id = s.poster_id
    left join public.slack_membres m on m.slack_user_id = s.slack_user_id
   where p.is_active is false
     and s.desactive_at is null
     and coalesce(s.actif_slack, m.slack_user_id is not null and not m.supprime)
   order by s.arret_at desc nulls last, 2;
end;
$$;

revoke all on function public.slack_retraits_liste() from public, anon;
grant execute on function public.slack_retraits_liste() to authenticated;

-- Plus de liste « To remove from Slack » le lundi : la page la remplace.
create or replace function public.slack_a_retirer_lundi()
returns integer
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.slack_retraits_remplir();
  return 0;
end;
$$;

revoke all on function public.slack_a_retirer_lundi() from public, anon, authenticated;

-- Les cartes encore ouvertes sont fermées (rien n'est supprimé).
update public.a_faire
   set fait_at = now(), maj_at = now()
 where type = 'slack' and fait_at is null;

update public.problemes
   set statut = 'ferme_auto', ferme_raison = 'Géré dans la page « À retirer de Slack »', ferme_at = now(), maj_at = now()
 where categorie = 'retirer_slack' and statut = 'ouvert';

select public.slack_retraits_remplir();

-- Vérification Slack (users.info) toutes les heures, à :37.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'slack-retrait-verifier') then
    perform cron.unschedule('slack-retrait-verifier');
  end if;
end $$;

select cron.schedule('slack-retrait-verifier', '37 * * * *', $c$
  select net.http_post(
    url := 'https://mbikecieskoobeizixig.supabase.co/functions/v1/slack-retrait',
    headers := jsonb_build_object('content-type', 'application/json', 'x-cron-secret', public.cron_secret_lire()),
    body := '{"action":"verifier"}'::jsonb,
    timeout_milliseconds := 120000
  );
$c$);
