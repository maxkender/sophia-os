-- 0688 : PARCOURS POSTEUR RUUL — version définitive (Max, 12/11).
-- Un seul moteur d'emails pour les posteurs Ruul (fonction ruul, action « parcours », toutes les
-- heures) : bienvenue, relances (une par étape, Ruul tous les 2 jours, 6 au plus), report au lundi
-- suivant, « you start tomorrow », désactivation après 14 jours sans aucune activité, arrêt par le
-- posteur (« I do not wish to continue »). Jamais 2 emails le même jour, STOP toujours respecté.
-- Les anciennes relances Ruul (invitation J+1/J+3, « email Ruul manquant ») se taisent quand ce
-- moteur est sur on : rien n'est supprimé.
-- Interrupteurs (éteints) : ruul_parcours (off | on), ruul_parcours_bienvenue (false).
-- Additif : une table, deux réglages, cinq fonctions, une tâche planifiée.

create table if not exists public.ruul_parcours_envois (
  id         uuid primary key default gen_random_uuid(),
  poster_id  uuid not null references public.profiles(id),
  cle        text not null,
  type       text not null,
  envoye_at  timestamptz not null default now(),
  ok         boolean not null default true,
  canaux     text[] not null default '{}',
  erreur     text,
  unique (poster_id, cle)
);
alter table public.ruul_parcours_envois enable row level security;
create policy ruul_parcours_envois_admin on public.ruul_parcours_envois for select to authenticated using (public.is_admin());
create index if not exists ruul_parcours_envois_poster_idx on public.ruul_parcours_envois (poster_id, envoye_at desc);

insert into public.reglages (cle, valeur)
select v.cle, v.valeur from (values ('ruul_parcours', '"off"'::jsonb), ('ruul_parcours_bienvenue', 'false'::jsonb)) as v(cle, valeur)
 where not exists (select 1 from public.reglages r where r.cle = v.cle);

/* Tout ce que le moteur doit savoir d'un posteur Ruul actif (ne fait que lire). */
create or replace function public.ruul_parcours_etat(p_poster uuid default null)
returns table (
  poster_id uuid, prenom text, login text, email text, cohorte_lundi date, cree_at timestamptz,
  premiere_connexion_at timestamptz, handle text, tiktok_existe boolean, warmup_started_at timestamptz,
  abonnements integer, slack_user_id text, ruul_statut text, ruul_compte text, ruul_email_a_at timestamptz,
  ruul_email_b_at timestamptz, relances_stop_at timestamptz, ruul_jeton uuid, posts integer,
  derniere_activite timestamptz, envois jsonb
)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
begin
  if coalesce(auth.role(), '') <> 'service_role' and not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return query
  with po as (
    select pr.* from public.profiles pr
     where pr.is_active and pr.canal_paie = 'ruul' and (p_poster is null or pr.id = p_poster)
       and exists (select 1 from public.user_roles r where r.user_id = pr.id and r.role = 'poster')
  ),
  cpt as (
    select distinct on (c.poster_id) c.poster_id, c.id, c.handle_tiktok, c.warmup_started_at
      from public.comptes c
     where c.poster_id in (select id from po) and c.is_active
     order by c.poster_id, (c.type_compte = 'perso') desc, c.created_at
  )
  select po.id, po.prenom, po.email,
         coalesce(nullif(po.ruul_email, ''), (select h.email_perso from public.hub_posteurs h where h.profile_id = po.id limit 1), po.email_perso),
         po.cohorte_lundi,
         coalesce((select h.cree_at from public.hub_posteurs h where h.profile_id = po.id limit 1), po.created_at),
         coalesce(po.premiere_connexion_at, u.last_sign_in_at),
         cpt.handle_tiktok, r.existe, cpt.warmup_started_at, r.abonnements, po.slack_user_id,
         po.ruul_statut, po.ruul_compte, po.ruul_email_a_at, po.ruul_email_b_at, po.relances_stop_at, po.ruul_jeton,
         coalesce(pub.n, 0)::integer,
         greatest(coalesce(po.premiere_connexion_at, u.last_sign_in_at), cpt.warmup_started_at, pub.dernier),
         coalesce((select jsonb_agg(jsonb_build_object('cle', e.cle, 'type', e.type, 'at', e.envoye_at, 'ok', e.ok) order by e.envoye_at)
                     from public.ruul_parcours_envois e where e.poster_id = po.id), '[]'::jsonb)
    from po
    left join auth.users u on u.id = po.id
    left join cpt on cpt.poster_id = po.id
    left join lateral (
      select w.existe, w.abonnements from public.ckd_warmup_releves w
       where w.compte_id = cpt.id and w.existe is not null order by w.releve_at desc limit 1
    ) r on true
    left join lateral (
      select count(*) as n, max(pa.publie_at) as dernier from public.passages pa
        join public.comptes c2 on c2.id = pa.compte_id
       where c2.poster_id = po.id and pa.publie_at is not null
    ) pub on true;
end;
$$;
revoke execute on function public.ruul_parcours_etat(uuid) from public, anon;
grant execute on function public.ruul_parcours_etat(uuid) to authenticated, service_role;

/*
 * Désactiver un posteur Ruul, comme un Kill Upwork (sans contrat à fermer) : compte désactivé,
 * comptes TikTok arrêtés (plus de posts), plus aucune relance, « À retirer de Slack », un arrêt
 * noté (Paie → Ruul le montre : dernière semaine due s'il a posté).
 * p_source : 'je_ne_veux_plus' (le posteur), 'manuel' (14 jours inactif), 'kill_samedi'.
 */
create or replace function public.ruul_desactiver(p_poster uuid, p_source text, p_motif text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' and not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_source not in ('je_ne_veux_plus', 'manuel', 'kill_samedi') then raise exception 'source inconnue'; end if;
  if not exists (select 1 from public.profiles where id = p_poster and canal_paie = 'ruul') then return false; end if;
  update public.profiles set is_active = false, relances_stop_at = coalesce(relances_stop_at, now()) where id = p_poster;
  update public.comptes set is_active = false where poster_id = p_poster and is_active;
  update public.relances_prevues set statut = 'perime', maj_at = now() where poster_id = p_poster and statut = 'prevu';
  if not exists (select 1 from public.arrets where poster_id = p_poster and statut in ('a_faire', 'en_cours')) then
    insert into public.arrets (poster_id, source, motif, sans_message) values (p_poster, p_source, p_motif, true);
  end if;
  perform public.slack_retrait_ajouter(p_poster);
  return true;
end;
$$;
revoke execute on function public.ruul_desactiver(uuid, text, text) from public, anon;
grant execute on function public.ruul_desactiver(uuid, text, text) to authenticated, service_role;

/* « I do not wish to continue », confirmé : par le jeton de ses emails. */
create or replace function public.ruul_arret_jeton(p_jeton uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_poster uuid;
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'forbidden' using errcode = '42501'; end if;
  select id into v_poster from public.profiles where ruul_jeton = p_jeton;
  if v_poster is null then return false; end if;
  perform public.ruul_desactiver(v_poster, 'je_ne_veux_plus', 'Arrêté par le posteur (I do not wish to continue)');
  return true;
end;
$$;
revoke execute on function public.ruul_arret_jeton(uuid) from public, anon, authenticated;

/* Pas prêt dimanche minuit : le posteur passe au lundi suivant (pas de décision). */
create or replace function public.ruul_reporter(p_poster uuid, p_lundi date)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'forbidden' using errcode = '42501'; end if;
  update public.profiles set cohorte_lundi = p_lundi where id = p_poster and canal_paie = 'ruul' and is_active and cohorte_lundi < p_lundi;
  return found;
end;
$$;
revoke execute on function public.ruul_reporter(uuid, date) from public, anon, authenticated;

do $c$
begin
  if not exists (select 1 from cron.job where jobname = 'ruul-parcours') then
    perform cron.schedule('ruul-parcours', '7 * * * *', $cmd$
      select net.http_post(url := 'https://mbikecieskoobeizixig.supabase.co/functions/v1/ruul',
        headers := jsonb_build_object('content-type', 'application/json', 'x-cron-secret', public.cron_secret_lire()),
        body := '{"action":"parcours"}'::jsonb, timeout_milliseconds := 140000)
    $cmd$);
  end if;
end
$c$;
