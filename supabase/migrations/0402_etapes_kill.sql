-- 0402 — Système du 2 nov., partie B : les 4 étapes de l'accueil et le Kill
-- automatique à 48 h (remplace les étapes 1 à 3 du prompt 17 A).
--
-- Toutes les heures, `recrues-check` regarde chaque recrue :
--   1. connexion        faite : 1re connexion à l'OS ; message bienvenue + 24 h
--   2. tiktok           faite : le @ existe ; message connexion + 48 h
--   3. warmup_lance     faite : « Start warmup » cliqué ; message création + 24 h
--   4. warmup_bien_fait faite : 5 follows et aucun post ; message samedi 12 h
-- Un seul message par étape (nudges, index unique), Slack si relié sinon
-- Upwork, entre 10 h et 20 h heure du pays. 48 h après ce message, ni étape
-- faite ni réponse : Kill automatique, annulable pendant 12 h (page Cohorts),
-- puis l'arrêt complet (file `arrets`, partie C).
--
-- Interrupteurs : `relances_auto` (les messages ; « test » = rien ne part) et
-- `kill_auto` (off | test | on, défaut test : le Kill est noté « simulé »).
-- Un vrai Kill exige `kill_auto` = on ET un message vraiment parti.
--
-- Additive : réglages, 3 tables, une colonne, des fonctions. Aucune donnée
-- existante modifiée.
-- Retour arrière : drop des fonctions etapes_recrues, kill_noter,
-- kill_annuler, kills_auto_liste, arret_demander ; drop des tables
-- kills_auto, arrets, posteur_reponses ; alter table relances_prevues drop
-- column premier_at ; delete des réglages kill_auto, etapes_delais,
-- etape_texte_*, lien_etapes_tiktok.

insert into public.reglages (cle, valeur) values
  ('kill_auto', to_jsonb('test'::text)),
  ('etapes_delais', jsonb_build_object(
     'connexion_message_h', 24,
     'tiktok_message_h', 48,
     'warmup_lance_message_h', 24,
     'warmup_bien_fait_heure', 12,
     'kill_h', 48,
     'kill_annulation_h', 12,
     'fenetre_debut', 10,
     'fenetre_fin', 20)),
  ('etape_texte_connexion', to_jsonb(
    'Hi {prenom}, you haven''t logged in yet. Your login is in our first message above. Dashboard: {url}. Please log in today. If we don''t hear from you within 48 hours, we''ll close the contract.'::text)),
  ('etape_texte_tiktok', to_jsonb(
    'Hi {prenom}, your TikTok account @{handle} isn''t created yet. Here is how: {lien_etapes}. Then click Start warmup and follow 5 accounts. If nothing happens within 48 hours, we''ll close the contract.'::text)),
  ('etape_texte_warmup_lance', to_jsonb(
    'Hi {prenom}, please click Start warmup on your dashboard today, then follow 5 accounts. If nothing happens within 48 hours, we''ll close the contract.'::text)),
  ('etape_texte_warmup_bien_fait', to_jsonb(
    'Hi {prenom}, your warm-up isn''t right yet: {ce_qui_manque}. Please fix it before Sunday midnight, or you won''t start on Monday {date}.'::text)),
  ('lien_etapes_tiktok', to_jsonb('https://app.notion.com/p/Vik-Studios-TikTok-Poster-Guide-3f4241308d6681f8ad41dc507f2c8505'::text))
on conflict (cle) do nothing;

-- En test, le Kill se compte depuis le 1er passage où le message était prévu.
alter table public.relances_prevues add column if not exists premier_at timestamptz not null default now();

-- ---------------------------------------------------------------------------
-- Les réponses des posteurs (Slack, boutons, Upwork) : remplie par la partie E,
-- lue ici (une réponse après le message évite le Kill).
-- ---------------------------------------------------------------------------
create table if not exists public.posteur_reponses (
  id         uuid primary key default gen_random_uuid(),
  poster_id  uuid not null references public.profiles (id) on delete cascade,
  canal      text not null check (canal in ('slack', 'bouton', 'upwork')),
  -- L'id du message chez Slack ou Upwork (ts, story id) : jamais lu deux fois.
  source_id  text,
  texte      text,
  recu_at    timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create unique index if not exists posteur_reponses_source on public.posteur_reponses (canal, source_id)
  where source_id is not null;
create index if not exists posteur_reponses_poster on public.posteur_reponses (poster_id, recu_at desc);

comment on table public.posteur_reponses is
  'Système du 2 nov. (0402) : les messages reçus des posteurs (DM Slack, boutons, Upwork). Une réponse évite le Kill à 48 h.';

alter table public.posteur_reponses enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'posteur_reponses'
                  and policyname = 'posteur_reponses lecture') then
    create policy "posteur_reponses lecture" on public.posteur_reponses
      for select to authenticated using ((select public.is_admin()));
  end if;
end $$;
revoke all on public.posteur_reponses from public, anon, authenticated;
grant select on public.posteur_reponses to authenticated;
grant all on public.posteur_reponses to service_role;

-- ---------------------------------------------------------------------------
-- Les Kills automatiques
-- ---------------------------------------------------------------------------
create table if not exists public.kills_auto (
  id          uuid primary key default gen_random_uuid(),
  poster_id   uuid not null references public.profiles (id) on delete cascade,
  etape       text not null check (etape in ('connexion', 'tiktok', 'warmup_lance', 'warmup_bien_fait')),
  periode     date not null,
  nudge_id    uuid references public.nudges (id) on delete set null,
  message_at  timestamptz,
  detecte_at  timestamptz not null default now(),
  -- Fin du délai d'annulation : l'arrêt part à ce moment.
  prevu_at    timestamptz not null,
  -- simule (test) | en_attente (annulable) | annule | parti | erreur
  statut      text not null check (statut in ('simule', 'en_attente', 'annule', 'parti', 'erreur')),
  raison      text,
  annule_par  uuid references auth.users (id) on delete set null,
  annule_at   timestamptz,
  parti_at    timestamptz,
  unique (poster_id, etape, periode)
);

create index if not exists kills_auto_statut on public.kills_auto (statut, prevu_at);

comment on table public.kills_auto is
  'Système du 2 nov., partie B (0402) : 48 h après le message d''une étape, ni étape faite ni réponse. Annulable pendant kill_annulation_h, puis arrêt complet (arrets).';

alter table public.kills_auto enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'kills_auto'
                  and policyname = 'kills_auto lecture') then
    create policy "kills_auto lecture" on public.kills_auto
      for select to authenticated using ((select public.is_admin()));
  end if;
end $$;
revoke all on public.kills_auto from public, anon, authenticated;
grant select on public.kills_auto to authenticated;
grant all on public.kills_auto to service_role;

-- ---------------------------------------------------------------------------
-- Les arrêts complets (partie C) : une ligne par posteur à arrêter.
-- ---------------------------------------------------------------------------
create table if not exists public.arrets (
  id          uuid primary key default gen_random_uuid(),
  poster_id   uuid not null references public.profiles (id) on delete cascade,
  -- kill_48h (Kill automatique) | je_ne_veux_plus (partie E) | kill_samedi
  -- (Kill du samedi, partie D) | manuel (« Arrêter » sur Cohorts)
  source      text not null check (source in ('kill_48h', 'je_ne_veux_plus', 'kill_samedi', 'manuel')),
  kill_id     uuid references public.kills_auto (id) on delete set null,
  -- A déjà publié un post : payé pour la semaine en cours, contrat fermé après
  -- le paiement. Sinon : remboursement et contrat fermé tout de suite.
  a_poste     boolean,
  -- a_faire | en_cours | fait | erreur (une action en échec, les autres faites)
  statut      text not null default 'a_faire' check (statut in ('a_faire', 'en_cours', 'fait', 'erreur')),
  -- Le journal : une entrée par action ({action, statut, detail, at}).
  etapes      jsonb not null default '[]'::jsonb,
  erreur      text,
  demande_par uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now(),
  maj_at      timestamptz not null default now()
);

-- Un seul arrêt ouvert par posteur.
create unique index if not exists arrets_ouvert on public.arrets (poster_id) where statut in ('a_faire', 'en_cours');

comment on table public.arrets is
  'Système du 2 nov., partie C (0402) : l''arrêt complet d''un posteur (OS, Upwork, Slack), chaque action journalisée.';

alter table public.arrets enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'arrets'
                  and policyname = 'arrets lecture') then
    create policy "arrets lecture" on public.arrets
      for select to authenticated using ((select public.is_admin()));
  end if;
end $$;
revoke all on public.arrets from public, anon, authenticated;
grant select on public.arrets to authenticated;
grant all on public.arrets to service_role;

-- ---------------------------------------------------------------------------
-- Ce que recrues-check lit : les recrues avant (et juste après) leur cohorte.
-- ---------------------------------------------------------------------------
create or replace function public.etapes_recrues()
returns table (
  poster_id             uuid,
  prenom                text,
  pays                  text,
  fuseau                text,
  bienvenue_at          timestamptz,
  cohorte_lundi         date,
  premiere_connexion_at timestamptz,
  slack_user_id         text,
  contrat_id            text,
  compte_id             uuid,
  handle                text,
  warmup_started_at     timestamptz,
  tiktok_existe         boolean,
  tiktok_vu_at          timestamptz,
  abonnements           integer,
  videos                integer,
  messages              jsonb,
  prevues               jsonb,
  repondu_at            timestamptz,
  kill                  jsonb
)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_auj date := (now() at time zone 'Europe/Paris')::date;
begin
  if coalesce(auth.role(), '') <> 'service_role' and not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return query
  with po as (
    select pr.* from public.profiles pr
     where pr.is_active and pr.cohorte_lundi >= v_auj - 2
       and exists (select 1 from public.user_roles r where r.user_id = pr.id and r.role = 'poster')
       and not exists (select 1 from public.hub_posteurs h where h.profile_id = pr.id)
  ),
  cpt as (
    select distinct on (c.poster_id) c.poster_id, c.id, c.handle_tiktok, c.pays, c.warmup_started_at
      from public.comptes c
     where c.poster_id in (select id from po) and c.type_compte = 'perso' and c.is_active
     order by c.poster_id, c.created_at
  )
  select po.id, po.prenom, cpt.pays,
         case when cpt.pays is null then 'Europe/Paris' else public.fuseau_pays(cpt.pays) end,
         coalesce((select a.message_at from public.accueils a where a.poster_id = po.id and a.message_at is not null
                    order by a.message_at limit 1),
                  po.offre_acceptee_le, po.created_at),
         po.cohorte_lundi,
         coalesce(po.premiere_connexion_at, u.last_sign_in_at),
         po.slack_user_id, po.upwork_contract_id,
         cpt.id, cpt.handle_tiktok, cpt.warmup_started_at,
         r.existe,
         (select min(w.releve_at) from public.ckd_warmup_releves w where w.compte_id = cpt.id and w.existe),
         r.abonnements, r.videos,
         coalesce((select jsonb_agg(jsonb_build_object('id', n.id, 'type', n.type, 'envoye_at', n.envoye_at,
                                                       'reponse_at', n.reponse_at, 'erreur', n.slack_erreur))
                     from public.nudges n
                    where n.poster_id = po.id and n.periode = po.cohorte_lundi
                      and n.type in ('connexion', 'tiktok', 'warmup_lance', 'warmup_bien_fait')), '[]'::jsonb),
         coalesce((select jsonb_agg(jsonb_build_object('type', v.type, 'premier_at', v.premier_at, 'statut', v.statut,
                                                       'raison', v.raison))
                     from public.relances_prevues v
                    where v.poster_id = po.id and v.periode = po.cohorte_lundi
                      and v.type in ('connexion', 'tiktok', 'warmup_lance', 'warmup_bien_fait')), '[]'::jsonb),
         greatest(
           (select max(n.reponse_at) from public.nudges n where n.poster_id = po.id),
           (select max(x.recu_at) from public.posteur_reponses x where x.poster_id = po.id)),
         (select jsonb_agg(jsonb_build_object('id', k.id, 'etape', k.etape, 'statut', k.statut, 'prevu_at', k.prevu_at))
            from public.kills_auto k where k.poster_id = po.id and k.periode = po.cohorte_lundi)
    from po
    left join auth.users u on u.id = po.id
    left join cpt on cpt.poster_id = po.id
    left join lateral (
      select w.existe, w.abonnements, w.videos from public.ckd_warmup_releves w
       where w.compte_id = cpt.id and w.existe is not null
       order by w.releve_at desc limit 1
    ) r on true;
end;
$$;

revoke execute on function public.etapes_recrues() from public, anon;
grant execute on function public.etapes_recrues() to authenticated, service_role;

-- Noter un Kill (recrues-check). Un Kill « simulé » devient réel si le mode
-- passe à « on » et qu'un vrai message est parti ; un Kill annulé ou parti ne
-- change plus.
create or replace function public.kill_noter(
  p_poster uuid,
  p_etape text,
  p_periode date,
  p_nudge uuid,
  p_message_at timestamptz,
  p_statut text,
  p_annulation_h numeric
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'kill_noter : réservé à recrues-check';
  end if;
  if p_statut not in ('simule', 'en_attente') then
    raise exception 'kill_noter : statut %', p_statut;
  end if;
  insert into public.kills_auto (poster_id, etape, periode, nudge_id, message_at, prevu_at, statut)
  values (p_poster, p_etape, p_periode, p_nudge, p_message_at,
          now() + make_interval(secs => greatest(coalesce(p_annulation_h, 12), 0) * 3600), p_statut)
  on conflict (poster_id, etape, periode) do update
     set statut = excluded.statut, nudge_id = excluded.nudge_id, message_at = excluded.message_at,
         detecte_at = now(), prevu_at = excluded.prevu_at
   where kills_auto.statut = 'simule' and excluded.statut = 'en_attente'
  returning id into v_id;
  return v_id;
end;
$$;

revoke execute on function public.kill_noter(uuid, text, date, uuid, timestamptz, text, numeric) from public, anon, authenticated;
grant execute on function public.kill_noter(uuid, text, date, uuid, timestamptz, text, numeric) to service_role;

-- « Annuler » (Cohorts, admin et Head of Ops) : tant que le délai court.
create or replace function public.kill_annuler(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'kill_annuler : réservé à l''admin et au Head of Ops';
  end if;
  update public.kills_auto
     set statut = 'annule', annule_par = auth.uid(), annule_at = now(), raison = 'annulé à la main'
   where id = p_id and statut in ('en_attente', 'simule');
  if not found then
    raise exception 'kill_annuler : ce Kill est déjà parti ou annulé';
  end if;
end;
$$;

revoke execute on function public.kill_annuler(uuid) from public, anon;
grant execute on function public.kill_annuler(uuid) to authenticated;

-- La section « Kills automatiques » (Cohorts) : les 14 derniers jours.
create or replace function public.kills_auto_liste()
returns table (
  id           uuid,
  poster_id    uuid,
  poster_nom   text,
  hm_prenom    text,
  etape        text,
  periode      date,
  message_at   timestamptz,
  detecte_at   timestamptz,
  prevu_at     timestamptz,
  statut       text,
  raison       text,
  annule_at    timestamptz,
  parti_at     timestamptz,
  arret_statut text,
  arret_erreur text
)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return query
  select k.id, k.poster_id, nullif(btrim(concat_ws(' ', pr.prenom, pr.nom)), ''), hm.prenom,
         k.etape, k.periode, k.message_at, k.detecte_at, k.prevu_at, k.statut, k.raison, k.annule_at, k.parti_at,
         a.statut, a.erreur
    from public.kills_auto k
    join public.profiles pr on pr.id = k.poster_id
    left join public.profiles hm on hm.id = pr.manager_id
    left join lateral (select x.statut, x.erreur from public.arrets x where x.kill_id = k.id
                        order by x.created_at desc limit 1) a on true
   where k.detecte_at >= now() - interval '14 days'
   order by (k.statut = 'en_attente') desc, k.detecte_at desc;
end;
$$;

revoke execute on function public.kills_auto_liste() from public, anon;
grant execute on function public.kills_auto_liste() to authenticated;

notify pgrst, 'reload schema';
