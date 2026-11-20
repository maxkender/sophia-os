-- 0797 : KILL AUTOMATIQUE DES INACTIFS (Max, 20/11) + liste « ne plus contacter ». Additif.
--
-- 1. ne_plus_contacter : tout posteur arrêté (arrets non annulé, inactif automatique compris). Chaque envoi
--    (email, Upwork, Slack, bandeau, pop-up, relance HM) la lit juste avant de partir ; seul le message de fin passe.
--    Remplie par un trigger sur arrets (et reprise des arrêts déjà faits) ; levée (leve_at) si l'arrêt est annulé.
-- 2. Les écritures SQL vers le posteur (compte_nudges, posteur_messages, posteur_annonces, questionnaire_popups,
--    posteur_textes sauf la page de fin, relances_prevues) ne partent plus pour un posteur de la liste.
-- 3. inactifs_detecter(jour) : chaque samedi,
--      A. jamais connecté : contrat signé (compte créé) depuis 14 jours ou plus, jamais connecté à l'OS ;
--      B. connecté mais n'a jamais posté : démarrage prévu il y a 14 jours ou plus, des posts prévus, aucun publié ;
--      alerte « bug d'assignation » : un compte sorti du warm-up qui n'a jamais eu un seul post prévu (pas arrêté).
--    Jamais : un posteur qui a publié dans les 14 derniers jours, en warm-up, dans sa semaine de warm-up ou sa
--    première semaine de posts ; jamais un compte interne ou de test (Upwork sans contrat, Ruul sans email Ruul).
-- 4. inactifs_auto : le journal (une ligne par posteur et par samedi : catégorie, étapes, reprise le lendemain).
-- 5. Cron samedi 18:07 UTC = 19:07 Paris (avant le rapport des kills de 21:13) et dimanche même heure (reprise).

-- 1. La liste.
create table if not exists public.ne_plus_contacter (
  poster_id uuid primary key references public.profiles(id) on delete cascade,
  depuis timestamptz not null default now(),
  source text not null,
  arret_id uuid,
  message_fin_at timestamptz,
  message_fin_canal text,
  leve_at timestamptz,
  maj_at timestamptz not null default now()
);
alter table public.ne_plus_contacter enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'ne_plus_contacter' and policyname = 'ne_plus_contacter_admin') then
    create policy ne_plus_contacter_admin on public.ne_plus_contacter for select to authenticated using (public.is_admin());
  end if;
end $$;

create or replace function public.ne_plus_contacter_bloque(p_poster uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.ne_plus_contacter n where n.poster_id = p_poster and n.leve_at is null);
$$;

create or replace function public.ne_plus_contacter_contrat(p_contrat text)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(p_contrat, '') <> '' and exists (
    select 1 from public.ne_plus_contacter n join public.profiles p on p.id = n.poster_id
     where n.leve_at is null and p.upwork_contract_id = p_contrat
       -- Un contrat encore porté par un autre profil actif n'est pas bloqué.
       and not exists (select 1 from public.profiles o where o.upwork_contract_id = p_contrat and o.is_active
                         and not exists (select 1 from public.ne_plus_contacter m where m.poster_id = o.id and m.leve_at is null)));
$$;

create or replace function public.ne_plus_contacter_email(p_email text)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(btrim(p_email), '') <> '' and exists (
    select 1 from public.ne_plus_contacter n join public.profiles p on p.id = n.poster_id
     where n.leve_at is null
       and (lower(btrim(p_email)) in (lower(p.email), lower(coalesce(p.email_perso, '')), lower(coalesce(p.ruul_email, '')))
            -- L'email perso du site (posteurs Ruul).
            or exists (select 1 from public.hub_posteurs h where h.profile_id = p.id and lower(h.email_perso) = lower(btrim(p_email)))));
$$;

create or replace function public.ne_plus_contacter_slack(p_user text)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(p_user, '') <> '' and exists (
    select 1 from public.ne_plus_contacter n join public.profiles p on p.id = n.poster_id
     where n.leve_at is null and p.slack_user_id = p_user);
$$;
revoke execute on function public.ne_plus_contacter_bloque(uuid) from public, anon;
revoke execute on function public.ne_plus_contacter_contrat(text) from public, anon;
revoke execute on function public.ne_plus_contacter_email(text) from public, anon;
revoke execute on function public.ne_plus_contacter_slack(text) from public, anon;
grant execute on function public.ne_plus_contacter_bloque(uuid) to authenticated, service_role;
grant execute on function public.ne_plus_contacter_contrat(text) to service_role;
grant execute on function public.ne_plus_contacter_email(text) to service_role;
grant execute on function public.ne_plus_contacter_slack(text) to service_role;

-- Ce qui attendait de partir vers lui ne part plus (statut, rien n'est effacé).
create or replace function public.ne_plus_contacter_purger(p_poster uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.relances_prevues set statut = 'perime', maj_at = now()
   where poster_id = p_poster and statut in ('prevu', 'main');
end;
$$;
revoke execute on function public.ne_plus_contacter_purger(uuid) from public, anon, authenticated;

create or replace function public.ne_plus_contacter_ajouter(p_poster uuid, p_source text, p_arret uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.ne_plus_contacter (poster_id, source, arret_id)
  values (p_poster, p_source, p_arret)
  on conflict (poster_id) do update
     set leve_at = null, source = excluded.source, arret_id = coalesce(excluded.arret_id, public.ne_plus_contacter.arret_id),
         depuis = case when public.ne_plus_contacter.leve_at is not null then now() else public.ne_plus_contacter.depuis end,
         maj_at = now();
  perform public.ne_plus_contacter_purger(p_poster);
end;
$$;
revoke execute on function public.ne_plus_contacter_ajouter(uuid, text, uuid) from public, anon, authenticated;

create or replace function public.ne_plus_contacter_arret_tg()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.annule_at is null then
    perform public.ne_plus_contacter_ajouter(new.poster_id, 'arret:' || new.source, new.id);
  elsif tg_op = 'UPDATE' and old.annule_at is null then
    -- Arrêt annulé : le posteur sort de la liste (la ligne reste, datée).
    update public.ne_plus_contacter set leve_at = now(), maj_at = now()
     where poster_id = new.poster_id and arret_id = new.id and leve_at is null;
  end if;
  return null;
end;
$$;
do $$ begin
  if not exists (select 1 from pg_trigger where tgname = 'ne_plus_contacter_arret' and tgrelid = 'public.arrets'::regclass) then
    create trigger ne_plus_contacter_arret after insert or update of annule_at on public.arrets
      for each row execute function public.ne_plus_contacter_arret_tg();
  end if;
end $$;

-- Les arrêts déjà faits (posteur toujours désactivé).
insert into public.ne_plus_contacter (poster_id, depuis, source, arret_id)
select distinct on (a.poster_id) a.poster_id, a.created_at, 'arret:' || a.source, a.id
  from public.arrets a join public.profiles p on p.id = a.poster_id
 where a.annule_at is null and not p.is_active
 order by a.poster_id, a.created_at desc
on conflict (poster_id) do nothing;

-- 2. Les écritures SQL vers un posteur de la liste ne se font plus (la ligne n'est pas créée).
create or replace function public.ne_plus_contacter_insert_tg()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_poster uuid;
begin
  if tg_table_name = 'compte_nudges' then
    select c.poster_id into v_poster from public.comptes c where c.id = new.compte_id;
  elsif tg_table_name = 'posteur_textes' then
    -- La page « collaboration terminée » reste permise (c'est le message de fin).
    if new.cle = 'fin' then return new; end if;
    v_poster := new.poster_id;
  else
    v_poster := new.poster_id;
  end if;
  if v_poster is not null and public.ne_plus_contacter_bloque(v_poster) then return null; end if;
  return new;
end;
$$;
do $$
declare t text;
begin
  foreach t in array array['compte_nudges', 'posteur_messages', 'posteur_annonces', 'questionnaire_popups', 'posteur_textes'] loop
    if not exists (select 1 from pg_trigger where tgname = 'ne_plus_contacter_insert' and tgrelid = format('public.%I', t)::regclass) then
      execute format('create trigger ne_plus_contacter_insert before insert on public.%I for each row execute function public.ne_plus_contacter_insert_tg()', t);
    end if;
  end loop;
end $$;

create or replace function public.ne_plus_contacter_relances_tg()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.statut in ('prevu', 'main') and public.ne_plus_contacter_bloque(new.poster_id) then
    new.statut := 'perime';
    new.maj_at := now();
  end if;
  return new;
end;
$$;
do $$ begin
  if not exists (select 1 from pg_trigger where tgname = 'ne_plus_contacter_relances' and tgrelid = 'public.relances_prevues'::regclass) then
    create trigger ne_plus_contacter_relances before insert or update of statut on public.relances_prevues
      for each row execute function public.ne_plus_contacter_relances_tg();
  end if;
end $$;

-- 3. La détection.
create or replace function public.inactifs_detecter(p_jour date default (now() at time zone 'Europe/Paris')::date)
returns table (poster_id uuid, categorie text, canal_paie text, prenom text, signe_le date, debut date, connecte boolean,
               prevus integer, comptes_sans_posts uuid[], contrat_id text)
language sql stable security definer set search_path = public as $$
  with base as (
    select pr.id, pr.prenom, coalesce(pr.canal_paie, 'upwork') as canal, pr.upwork_contract_id,
           coalesce(pr.offre_acceptee_le, pr.created_at)::date as signe,
           (pr.premiere_connexion_at is not null or u.last_sign_in_at is not null
              or exists (select 1 from auth.sessions s where s.user_id = pr.id)) as co,
           coalesce(pr.cohorte_lundi,
                    (select min(c.premiers_posts_le) from public.comptes c where c.poster_id = pr.id),
                    (select min(pa.date_publication_prevue) from public.passages pa join public.comptes c on c.id = pa.compte_id
                      where c.poster_id = pr.id)) as debut
      from public.profiles pr
      join public.user_roles ur on ur.user_id = pr.id and ur.role = 'poster'
      left join auth.users u on u.id = pr.id
     where pr.is_active
       -- Jamais un compte interne ou de test : un posteur Upwork sans contrat relié, un posteur Ruul sans email Ruul.
       and ((coalesce(pr.canal_paie, 'upwork') = 'upwork' and coalesce(pr.upwork_contract_id, '') <> '')
            or (pr.canal_paie = 'ruul' and (pr.ruul_email is not null or pr.site_application_id is not null)))
       and not public.ne_plus_contacter_bloque(pr.id)
       and not exists (select 1 from public.contrats_test t where t.retire_at is null
                         and (t.poster_id = pr.id or t.contrat_id = pr.upwork_contract_id))
  ),
  x as (
    select b.*,
           (select count(*) from public.passages pa join public.comptes c on c.id = pa.compte_id
             where c.poster_id = b.id and pa.date_publication_prevue <= p_jour)::int as nb_prevus,
           exists (select 1 from public.passages pa join public.comptes c on c.id = pa.compte_id
                    where c.poster_id = b.id
                      and (pa.publie_url is not null or pa.publie_at is not null or pa.lien_confirme_at is not null)) as a_publie,
           exists (select 1 from public.passages pa join public.comptes c on c.id = pa.compte_id
                    where c.poster_id = b.id
                      and coalesce(pa.publie_at, pa.lien_confirme_at, pa.tiktok_publie_at) >= p_jour - 14) as publie_14j,
           exists (select 1 from public.comptes c where c.poster_id = b.id and c.is_active
                    and c.warmup_started_at is not null and coalesce(c.warmup_ends_at, now() + interval '1 day') > now()) as en_warmup,
           array(select c.id from public.comptes c
                  where c.poster_id = b.id and c.is_active and c.warmup_started_at is not null
                    and c.warmup_ends_at is not null and c.warmup_ends_at <= now()
                    and not exists (select 1 from public.passages pa where pa.compte_id = c.id)) as sans_posts
      from base b
  ),
  y as (
    select x.*,
           -- Sa semaine de warm-up (la semaine avant le démarrage) et sa première semaine de posts.
           (x.debut is not null and p_jour between x.debut - 7 and x.debut + 6) as protege
      from x
  )
  select y.id,
         case
           when not y.co and y.signe <= p_jour - 14 then 'A'
           when y.co and y.debut <= p_jour - 14 and not y.a_publie and cardinality(y.sans_posts) > 0 then 'alerte'
           when y.co and y.debut <= p_jour - 14 and not y.a_publie and y.nb_prevus > 0 then 'B'
         end,
         y.canal, y.prenom, y.signe, y.debut, y.co, y.nb_prevus, y.sans_posts, y.upwork_contract_id
    from y
   where not y.publie_14j and not y.en_warmup and not y.protege
     and ((not y.co and y.signe <= p_jour - 14)
          or (y.co and y.debut <= p_jour - 14 and not y.a_publie and (y.nb_prevus > 0 or cardinality(y.sans_posts) > 0)));
$$;
revoke execute on function public.inactifs_detecter(date) from public, anon, authenticated;
grant execute on function public.inactifs_detecter(date) to service_role;

-- 4. Le journal.
create table if not exists public.inactifs_auto (
  id uuid primary key default gen_random_uuid(),
  samedi date not null,
  poster_id uuid not null references public.profiles(id) on delete cascade,
  categorie text not null check (categorie in ('A', 'B', 'alerte')),
  canal_paie text,
  langue text,
  detail jsonb,
  statut text not null default 'a_faire' check (statut in ('a_faire', 'en_cours', 'fait', 'erreur', 'alerte', 'simule')),
  etapes jsonb not null default '[]'::jsonb,
  tentatives integer not null default 0,
  prochain_essai timestamptz,
  erreur text,
  max_prevenu_at timestamptz,
  arret_id uuid,
  cree_at timestamptz not null default now(),
  maj_at timestamptz not null default now(),
  unique (samedi, poster_id)
);
alter table public.inactifs_auto enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'inactifs_auto' and policyname = 'inactifs_auto_admin') then
    create policy inactifs_auto_admin on public.inactifs_auto for select to authenticated using (public.is_admin());
  end if;
end $$;

-- La ligne du rapport du samedi (et la liste dépliable).
create or replace function public.inactifs_rapport(p_samedi date)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'arretes', count(*) filter (where i.categorie in ('A', 'B') and i.statut = 'fait'),
    'jamais_connectes', count(*) filter (where i.categorie = 'A' and i.statut = 'fait'),
    'jamais_postes', count(*) filter (where i.categorie = 'B' and i.statut = 'fait'),
    'en_cours', count(*) filter (where i.categorie in ('A', 'B') and i.statut in ('a_faire', 'en_cours', 'erreur')),
    'alertes', count(*) filter (where i.categorie = 'alerte'),
    'liste', coalesce(jsonb_agg(jsonb_build_object(
       'nom', coalesce(nullif(btrim(concat_ws(' ', p.prenom, p.nom)), ''), p.email), 'categorie', i.categorie,
       'canal', i.canal_paie, 'statut', i.statut, 'erreur', i.erreur,
       'message_fin', (select n.message_fin_at is not null from public.ne_plus_contacter n where n.poster_id = i.poster_id),
       'etapes', i.etapes) order by i.categorie, p.prenom), '[]'::jsonb))
    from public.inactifs_auto i join public.profiles p on p.id = i.poster_id
   where i.samedi = p_samedi and i.statut <> 'simule' and (public.is_admin() or coalesce(auth.role(), '') = 'service_role');
$$;
revoke execute on function public.inactifs_rapport(date) from public, anon;
grant execute on function public.inactifs_rapport(date) to authenticated, service_role;

-- Le message de fin d'un inactif est le sien : la page de fin n'est pas recomposée (ni envoyée) par textes_fin.
do $$
declare
  d text := pg_get_functiondef('public.textes_fin_a_faire(integer)'::regprocedure);
  avant text := '     where not pr.is_active or not exists (select 1 from public.comptes c where c.poster_id = pr.id and c.is_active)';
  apres text := '     where (not pr.is_active or not exists (select 1 from public.comptes c where c.poster_id = pr.id and c.is_active))
       -- 0797 : un inactif arrêté automatiquement a déjà son message de fin (court, sans raison ni paie).
       and not exists (select 1 from public.inactifs_auto ia where ia.poster_id = pr.id and ia.categorie in (''A'', ''B''))';
begin
  if position('0797' in d) > 0 then return; end if;
  if position(avant in d) = 0 then raise exception '0797 : textes_fin_a_faire a changé'; end if;
  execute replace(d, avant, apres);
end $$;

-- Réglage : on (Max, 20/11 : « sans validation de ma part », dès le samedi 21/11).
insert into public.reglages (cle, valeur)
values ('inactifs_auto', jsonb_build_object('mode', 'on', 'canal_alertes', 'ops-alertes'))
on conflict (cle) do nothing;

-- 5. Les crons (UTC ; 19:07 à Paris en hiver).
do $$
begin
  perform cron.unschedule(j.jobid) from cron.job j where j.jobname in ('inactifs-samedi', 'inactifs-reprise');
  perform cron.schedule('inactifs-samedi', '7 18 * * 6',
    $c$select net.http_post(url := 'https://mbikecieskoobeizixig.supabase.co/functions/v1/upwork',
        headers := jsonb_build_object('content-type', 'application/json', 'x-cron-secret', public.cron_secret_lire()),
        body := '{"action":"inactifs"}'::jsonb, timeout_milliseconds := 290000)$c$);
  perform cron.schedule('inactifs-reprise', '7 18 * * 0',
    $c$select net.http_post(url := 'https://mbikecieskoobeizixig.supabase.co/functions/v1/upwork',
        headers := jsonb_build_object('content-type', 'application/json', 'x-cron-secret', public.cron_secret_lire()),
        body := '{"action":"inactifs","reprise":true}'::jsonb, timeout_milliseconds := 290000)$c$);
end $$;
