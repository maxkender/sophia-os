-- 0743 : corrections du bot support (Max, 17/11). N'altère ni l'onboarding ni le système de tickets d'Adrien.
-- 1. upwork_a_ajouter : la page « À ajouter sur Upwork – nouvelle cohorte » (exception de paie Upwork).
-- 2. support_incidents : un incident groupé par bug et par jour (liens de posts, bug technique, écart dashboard).
-- 3. support_demandes : verdict de fermeture (toujours rempli à la fermeture), rattachement à un incident ou à une
--    demande d'origine (doublon), résumé d'escalade, action proposée, statut du posteur, suivi d'un arrêt.
-- 4. support_etat_reel : ce que le dashboard montre au posteur (mêmes tables, mêmes filtres) et la vraie situation
--    (comptes, arrêt / kill, contrat Upwork, Ruul, paie), lus au même endroit par le bot avant de répondre.
-- Additif : tables, colonnes, fonctions, un déclencheur sur la fermeture. Aucune donnée existante modifiée.

-- 1. Exception Upwork --------------------------------------------------------------------------------------------
create table if not exists public.upwork_a_ajouter (
  id uuid primary key default gen_random_uuid(),
  poster_id uuid references public.profiles(id) on delete set null,
  nom text,
  email text,
  pays text,
  cohorte date,
  profil_url text,
  demande_at timestamptz not null default now(),
  lien_at timestamptz,
  source text not null default 'help' check (source in ('help', 'slack', 'email', 'upwork')),
  statut text not null default 'lien_attendu' check (statut in ('lien_attendu', 'a_inviter', 'invite', 'contrat_signe', 'refuse')),
  demande_id uuid,
  note text,
  maj_at timestamptz not null default now(),
  maj_par uuid references auth.users(id)
);
create unique index if not exists upwork_a_ajouter_un_actif on public.upwork_a_ajouter (poster_id)
  where statut in ('lien_attendu', 'a_inviter', 'invite');
alter table public.upwork_a_ajouter enable row level security;
drop policy if exists upwork_a_ajouter_lire on public.upwork_a_ajouter;
create policy upwork_a_ajouter_lire on public.upwork_a_ajouter for select using (public.is_admin());
drop policy if exists upwork_a_ajouter_modifier on public.upwork_a_ajouter;
create policy upwork_a_ajouter_modifier on public.upwork_a_ajouter for update using (public.is_admin()) with check (public.is_admin());
grant select, update on public.upwork_a_ajouter to authenticated;

-- La demande (le posteur veut être payé par Upwork) : une ligne « lien attendu », une seule active par posteur.
create or replace function public.upwork_exception_demander(p_poster uuid, p_source text, p_demande uuid default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v public.upwork_a_ajouter;
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'réservé au serveur'; end if;
  select * into v from public.upwork_a_ajouter where poster_id = p_poster and statut in ('lien_attendu', 'a_inviter', 'invite') limit 1;
  if v.id is not null then return jsonb_build_object('id', v.id, 'statut', v.statut, 'deja', true); end if;
  insert into public.upwork_a_ajouter (poster_id, nom, email, pays, cohorte, source, demande_id)
  select pr.id, coalesce(nullif(btrim(concat_ws(' ', pr.prenom, pr.nom)), ''), pr.email), coalesce(nullif(btrim(pr.ruul_email), ''), pr.email),
         upper(public.paie_pays_posteur(pr.id)), pr.cohorte_lundi,
         case when p_source in ('help', 'slack', 'email', 'upwork') then p_source else 'help' end, p_demande
    from public.profiles pr where pr.id = p_poster
  returning * into v;
  return jsonb_build_object('id', v.id, 'statut', v.statut, 'deja', false);
end;
$function$;

-- Le lien du profil Upwork reçu : la ligne passe « à inviter ».
create or replace function public.upwork_exception_lien(p_poster uuid, p_url text, p_source text default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v public.upwork_a_ajouter;
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'réservé au serveur'; end if;
  if p_url !~* '^https?://(www\.)?upwork\.com/freelancers/[~a-z0-9_./?=&-]+$' then
    return jsonb_build_object('ok', false, 'erreur', 'lien invalide');
  end if;
  update public.upwork_a_ajouter
     set profil_url = p_url, lien_at = now(), statut = case when statut = 'lien_attendu' then 'a_inviter' else statut end, maj_at = now()
   where poster_id = p_poster and statut in ('lien_attendu', 'a_inviter')
  returning * into v;
  if v.id is null then
    perform public.upwork_exception_demander(p_poster, coalesce(p_source, 'help'));
    update public.upwork_a_ajouter set profil_url = p_url, lien_at = now(), statut = 'a_inviter', maj_at = now()
     where poster_id = p_poster and statut = 'lien_attendu' returning * into v;
  end if;
  return jsonb_build_object('ok', v.id is not null, 'id', v.id, 'statut', v.statut);
end;
$function$;

-- 2. Incidents groupés ------------------------------------------------------------------------------------------
create table if not exists public.support_incidents (
  id uuid primary key default gen_random_uuid(),
  cle text not null,
  jour date not null default (now() at time zone 'Europe/Paris')::date,
  titre text not null,
  categorie text,
  posteurs uuid[] not null default '{}',
  demandes uuid[] not null default '{}',
  statut text not null default 'ouvert' check (statut in ('ouvert', 'resolu')),
  ticket_at timestamptz,
  ticket_ts text,
  cree_at timestamptz not null default now(),
  maj_at timestamptz not null default now(),
  unique (cle, jour)
);
alter table public.support_incidents enable row level security;
drop policy if exists support_incidents_lire on public.support_incidents;
create policy support_incidents_lire on public.support_incidents for select using (public.is_admin());

create or replace function public.support_incident_ajouter(p_cle text, p_titre text, p_categorie text, p_poster uuid, p_demande uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v public.support_incidents;
  v_nouveau boolean;
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'réservé au serveur'; end if;
  insert into public.support_incidents (cle, titre, categorie)
  values (left(p_cle, 80), left(p_titre, 200), p_categorie)
  on conflict (cle, jour) do nothing;
  select * into v from public.support_incidents where cle = left(p_cle, 80) and jour = (now() at time zone 'Europe/Paris')::date for update;
  v_nouveau := p_poster is not null and not (p_poster = any (v.posteurs));
  update public.support_incidents
     set posteurs = case when v_nouveau then posteurs || p_poster else posteurs end,
         demandes = case when p_demande is not null and not (p_demande = any (demandes)) then demandes || p_demande else demandes end,
         maj_at = now()
   where id = v.id
  returning * into v;
  if p_demande is not null then
    update public.support_demandes set incident_id = v.id where id = p_demande;
  end if;
  return jsonb_build_object('id', v.id, 'nb', cardinality(v.posteurs), 'nouveau_posteur', v_nouveau, 'ticket_at', v.ticket_at, 'ticket_ts', v.ticket_ts);
end;
$function$;

-- La liste des posteurs d'un incident (pour le ticket groupé).
create or replace function public.support_incident_lire(p_id uuid)
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $$
  select jsonb_build_object('id', i.id, 'cle', i.cle, 'titre', i.titre, 'jour', i.jour, 'ticket_ts', i.ticket_ts,
    'posteurs', coalesce((select jsonb_agg(jsonb_build_object('nom', coalesce(nullif(btrim(concat_ws(' ', pr.prenom, pr.nom)), ''), pr.email),
                                                               'plateforme', case when pr.canal_paie = 'ruul' then 'ruul' else 'upwork' end))
                          from public.profiles pr where pr.id = any (i.posteurs)), '[]'::jsonb),
    'messages', coalesce((select jsonb_agg(left(d.texte, 160) order by d.cree_at) from public.support_demandes d where d.id = any (i.demandes)), '[]'::jsonb))
    from public.support_incidents i
   where i.id = p_id and (coalesce(auth.role(), '') = 'service_role' or public.is_admin());
$$;

-- 3. support_demandes : fermeture, rattachements, escalade ---------------------------------------------------------
alter table public.support_demandes
  add column if not exists verdict_fermeture text check (verdict_fermeture in ('regle_bot', 'regle_equipe', 'pas_un_probleme', 'doublon')),
  add column if not exists incident_id uuid references public.support_incidents(id) on delete set null,
  add column if not exists doublon_de uuid references public.support_demandes(id) on delete set null,
  add column if not exists resume text,
  add column if not exists action_proposee text,
  add column if not exists statut_posteur text,
  add column if not exists suivi text,
  add column if not exists rouverte_at timestamptz;

-- À chaque fermeture, le verdict est rempli (doublon, réglé par l'équipe, sinon réglé par le bot).
create or replace function public.support_demandes_verdict_fermeture()
returns trigger
language plpgsql
as $function$
begin
  if new.statut = 'resolu' and new.verdict_fermeture is null then
    new.verdict_fermeture := case
      when new.doublon_de is not null then 'doublon'
      when new.resolu_par is not null and not coalesce(new.resolu_par_bot, false) then 'regle_equipe'
      else 'regle_bot' end;
  end if;
  return new;
end;
$function$;
drop trigger if exists support_demandes_verdict_fermeture on public.support_demandes;
create trigger support_demandes_verdict_fermeture before insert or update of statut, verdict_fermeture on public.support_demandes
  for each row execute function public.support_demandes_verdict_fermeture();

-- 4. La vraie situation du posteur, lue au même endroit que le dashboard -----------------------------------------
create or replace function public.support_etat_reel(p_poster uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  pr public.profiles%rowtype;
  v_lundi date := date_trunc('week', (now() at time zone 'Europe/Paris'))::date;
  v_jour date := (now() at time zone 'Europe/Paris')::date;
begin
  if not (coalesce(auth.role(), '') = 'service_role' or public.is_admin()) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select * into pr from public.profiles where id = p_poster;
  if not found then return null; end if;
  return jsonb_build_object(
    'actif', pr.is_active,
    'canal_paie', case when pr.canal_paie = 'ruul' then 'ruul' else 'upwork' end,
    'cohorte', pr.cohorte_lundi,
    -- Les comptes : ceux du dashboard (actifs), et l'arrêt éventuel de chacun.
    'comptes', coalesce((select jsonb_agg(jsonb_build_object('handle', c.handle_tiktok, 'actif', c.is_active, 'non_renouveler', c.non_renouveler,
                                                             'raison', c.non_renouveler_raison, 'le', c.non_renouveler_at) order by c.created_at)
                          from public.comptes c where c.poster_id = p_poster and coalesce(c.type_compte, 'perso') = 'perso'), '[]'::jsonb),
    'comptes_actifs', (select count(*) from public.comptes c where c.poster_id = p_poster and c.is_active),
    -- Le warm-up : exactement mon_warmup (premier compte perso actif, compte_pret, dernier relevé).
    'warmup', (select jsonb_build_object('pret', public.compte_pret(c.id), 'abonnements', w.abonnements, 'existe', w.existe,
                                         'releve_at', w.releve_at, 'debut', c.warmup_started_at)
                 from public.comptes c
                 left join lateral (
                   select x.existe, x.abonnements, x.releve_at from public.ckd_warmup_releves x
                    where x.compte_id = c.id and x.existe is not null and (x.existe or public.releve_methode(x.erreur) = 'page+apify')
                    order by x.releve_at desc limit 1) w on true
                where c.poster_id = p_poster and c.is_active and coalesce(c.type_compte, 'perso') = 'perso'
                order by c.created_at limit 1),
    -- Les posts : la vue posts_poster du dashboard (pipeline fini, hors tests), pour ce posteur.
    'posts_aujourdhui', (select jsonb_build_object('prevus', count(*), 'publies', count(*) filter (where p.publie_at is not null))
                           from public.posts p join public.comptes c on c.id = p.compte_id
                          where c.poster_id = p_poster and p.pipeline_statut = 'done' and not coalesce(p.est_test, false)
                            and p.date_publication_prevue = v_jour),
    'posts_semaine', (select jsonb_build_object('prevus', count(*), 'publies', count(*) filter (where p.publie_at is not null),
                                                'liens', count(*) filter (where p.publie_url is not null))
                        from public.posts p join public.comptes c on c.id = p.compte_id
                       where c.poster_id = p_poster and p.pipeline_statut = 'done' and not coalesce(p.est_test, false)
                         and p.date_publication_prevue between v_lundi and v_lundi + 6),
    -- L'arrêt / kill : le dernier arrêt non annulé (source, motif, date, statut).
    'arret', (select jsonb_build_object('source', a.source, 'motif', a.motif, 'le', a.created_at, 'statut', a.statut, 'semaine', a.semaine)
                from public.arrets a where a.poster_id = p_poster and a.annule_at is null order by a.created_at desc limit 1),
    'pause', (select jsonb_build_object('jusqu_au', max(pp.jusqu_au)) from public.posteur_pauses pp
               where pp.poster_id = p_poster and now() between pp.debut and coalesce(pp.jusqu_au, now())),
    -- Le contrat Upwork (s'il y en a un) : état et actif, tels que lus chez Upwork.
    'contrat_upwork', (select jsonb_build_object('id', uc.contrat_id, 'etat', uc.etat, 'actif', uc.actif, 'lu_at', uc.lu_at)
                         from public.upwork_contrats uc where uc.contrat_id = pr.upwork_contract_id limit 1),
    'ruul', case when pr.canal_paie = 'ruul' then jsonb_build_object('onboarding', pr.ruul_onboarding, 'statut', pr.ruul_statut, 'compte', pr.ruul_compte) end,
    -- La paie : ce que la page Payments du posteur montre (Ruul), ou ses semaines Upwork.
    'paie', case when pr.canal_paie = 'ruul'
      then coalesce((select jsonb_agg(jsonb_build_object('semaine', rp.semaine, 'total', rp.montant + rp.bonus, 'statut', rp.statut,
                                                          'ruul_statut', rp.ruul_statut, 'paye_at', rp.paye_at) order by rp.semaine desc)
                       from (select * from public.ruul_paiements x where x.poster_id = p_poster and x.statut <> 'annule' order by x.semaine desc limit 4) rp), '[]'::jsonb)
      else coalesce((select jsonb_agg(jsonb_build_object('semaine', ps.semaine, 'montant', coalesce(ps.montant_corrige, ps.montant), 'statut', ps.statut,
                                                          'action', ps.action, 'paye_at', ps.paye_at) order by ps.semaine desc)
                       from (select * from public.paie_semaines x where x.poster_id = p_poster order by x.semaine desc limit 4) ps), '[]'::jsonb)
      end,
    'upwork_exception', (select jsonb_build_object('statut', u.statut, 'lien', u.profil_url is not null)
                           from public.upwork_a_ajouter u where u.poster_id = p_poster order by u.demande_at desc limit 1)
  );
end;
$function$;

revoke all on function public.upwork_exception_demander(uuid, text, uuid) from public, anon, authenticated;
revoke all on function public.upwork_exception_lien(uuid, text, text) from public, anon, authenticated;
revoke all on function public.support_incident_ajouter(text, text, text, uuid, uuid) from public, anon, authenticated;
revoke all on function public.support_incident_lire(uuid) from public, anon;
revoke all on function public.support_etat_reel(uuid) from public, anon;
grant execute on function public.upwork_exception_demander(uuid, text, uuid) to service_role;
grant execute on function public.upwork_exception_lien(uuid, text, text) to service_role;
grant execute on function public.support_incident_ajouter(text, text, text, uuid, uuid) to service_role;
grant execute on function public.support_incident_lire(uuid) to authenticated, service_role;
grant execute on function public.support_etat_reel(uuid) to authenticated, service_role;
