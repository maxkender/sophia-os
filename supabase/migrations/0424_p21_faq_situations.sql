-- 0424 — Prompt 21, partie Q : la FAQ par situation (le bot répond selon où en
-- est la personne).
--
-- - `faq_situations` : la liste des situations (modifiable : ajouter, renommer,
--   désactiver). Les 14 du prompt sont « auto » : l'OS les calcule
--   (supabase/functions/_shared/faq_situations.ts). Une situation ajoutée à la
--   main n'est jamais calculée : elle sert dans l'onglet Test, ou forcée pour
--   un posteur (`faq_situation_forcee`).
-- - `faq_entrees` : les questions de la FAQ par situation (« When do I
--   start? »…), avec d'autres formulations.
-- - `faq_reponses` : une réponse par situation, plus la réponse par défaut
--   (situation null). Variables remplies par l'OS : {prenom}, {lundi_debut},
--   {date_debut}, {ce_qui_manque}, {posts_semaine}, {tarif},
--   {derniere_paie_montant}, {derniere_paie_date}, {milestone_suivante},
--   {handle}. Une réponse retirée passe `actif = false` (aucune ligne effacée).
-- - `faq_situation_forcee` : l'admin force la situation d'un posteur (une
--   situation ajoutée à la main, une pause notée ailleurs…).
-- - `chatbot_questions` : la situation de la personne (`situation`,
--   `situations`), l'entrée de FAQ reconnue et la réponse par situation
--   (`reponse_situation` : envoyée en mode on, seulement notée en mode test).
-- - `faq_faits_posteur(poster)` : ce que l'OS sait de la personne pour
--   calculer sa situation et remplir les variables (service_role ou admin).
-- - Les 6 questions du prompt (When do I start?, paie, milestone, warm-up,
--   « Why was my contract ended? », « There's nothing to post today »),
--   insérées avec `on conflict do nothing` : jamais d'écrasement.
--
-- Réglage : aucun nouveau. Le mode est la clé `situations` de
-- `faq_automatique` (off / test / on), absente = « test » : l'OS calcule et
-- note la situation et la réponse qu'il aurait donnée, le bot répond comme
-- avant. Rien n'est écrit dans `faq_automatique` ici.
--
-- Additive : 4 tables, 4 colonnes, 1 fonction, des lignes de départ. Aucune
-- donnée existante modifiée.
-- Retour arrière : retirer la fonction, les 4 tables et les 4 colonnes de
-- chatbot_questions (situation, situations, faq_entree_id, reponse_situation).

-- ---------------------------------------------------------------------------
-- Les situations
-- ---------------------------------------------------------------------------
create table if not exists public.faq_situations (
  cle         text primary key check (cle ~ '^[a-z0-9_]{2,40}$'),
  libelle     text not null,
  description text,
  ordre       integer not null default 100,
  actif       boolean not null default true,
  -- Calculée par l'OS (les 14 du prompt). Une situation ajoutée à la main : false.
  auto        boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.faq_situations is
  'Prompt 21, Q (0424) : les situations de la FAQ (où en est la personne qui écrit). auto = calculée par l''OS.';

insert into public.faq_situations (cle, libelle, description, ordre, auto) values
  ('candidat', 'Candidate', 'Offer sent, not accepted yet (or unknown person).', 10, true),
  ('accepte', 'Accepted, not logged in', 'Offer accepted, never logged in to the dashboard.', 20, true),
  ('connecte', 'Logged in, no TikTok account', 'Logged in, the TikTok account given by the OS doesn''t exist yet.', 30, true),
  ('compte_cree', 'Account created, warm-up not started', 'TikTok account created, "Start warmup" not clicked.', 40, true),
  ('warmup', 'Warm-up in progress, not ready', 'Warm-up started: fewer than 5 follows, or a post on the account.', 50, true),
  ('pret', 'Ready, waiting for Monday', 'All steps done, starts on Monday.', 60, true),
  ('reporte', 'Postponed', 'Wasn''t ready on Sunday midnight: starts the Monday after.', 70, true),
  ('semaine1', 'First week of posts', 'Started posting less than a week ago.', 80, true),
  ('poste', 'Posting for more than a week', 'Started posting more than a week ago.', 90, true),
  ('a_risque', 'Fewer than 6 posts this week', 'From Thursday, fewer than 6 posts with their link this week (at risk).', 100, true),
  ('double', 'Two accounts (Double)', 'Posts on 2 accounts.', 110, true),
  ('pause', 'On pause', 'Sick, away: a pause is running.', 120, true),
  ('kill', 'Kill or stop in progress', 'A Kill or a stop is planned or done, or the contract has ended.', 130, true),
  ('hm', 'Hiring manager', 'A hiring manager (or Head of Ops).', 140, true)
on conflict (cle) do nothing;

alter table public.faq_situations enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'faq_situations'
                  and policyname = 'faq_situations admin') then
    create policy "faq_situations admin" on public.faq_situations for all to authenticated
      using ((select public.is_admin())) with check ((select public.is_admin()));
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Les questions et leurs réponses par situation
-- ---------------------------------------------------------------------------
create table if not exists public.faq_entrees (
  id           uuid primary key default gen_random_uuid(),
  -- Les questions créées par cette migration ; null pour celles de l'admin.
  cle          text unique,
  question     text not null check (length(trim(question)) between 2 and 300),
  formulations text[] not null default '{}',
  actif        boolean not null default true,
  maj_par      uuid references auth.users (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

comment on table public.faq_entrees is
  'Prompt 21, Q (0424) : les questions de la FAQ par situation. Les réponses sont dans faq_reponses.';

create table if not exists public.faq_reponses (
  id         uuid primary key default gen_random_uuid(),
  entree_id  uuid not null references public.faq_entrees (id) on delete cascade,
  -- null = la réponse par défaut (toutes les situations sans réponse à elles).
  situation  text references public.faq_situations (cle) on update cascade,
  texte      text not null check (length(trim(texte)) between 2 and 1500),
  actif      boolean not null default true,
  maj_par    uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Une seule réponse par question et par situation (une seule par défaut).
create unique index if not exists faq_reponses_une on public.faq_reponses (entree_id, coalesce(situation, '*'));

comment on table public.faq_reponses is
  'Prompt 21, Q (0424) : une réponse par situation (situation null = par défaut). Retirée : actif = false.';

create table if not exists public.faq_situation_forcee (
  poster_id  uuid primary key references public.profiles (id) on delete cascade,
  situation  text not null references public.faq_situations (cle) on update cascade,
  -- null : jusqu'à nouvel ordre. Retirer = mettre maintenant (aucune ligne effacée).
  jusqu_au   timestamptz,
  note       text,
  maj_par    uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now()
);

comment on table public.faq_situation_forcee is
  'Prompt 21, Q (0424) : la situation FAQ forcée par l''admin pour un posteur (avant celle que l''OS calcule).';

alter table public.faq_entrees enable row level security;
alter table public.faq_reponses enable row level security;
alter table public.faq_situation_forcee enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'faq_entrees'
                  and policyname = 'faq_entrees admin') then
    create policy "faq_entrees admin" on public.faq_entrees for all to authenticated
      using ((select public.is_admin())) with check ((select public.is_admin()));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'faq_reponses'
                  and policyname = 'faq_reponses admin') then
    create policy "faq_reponses admin" on public.faq_reponses for all to authenticated
      using ((select public.is_admin())) with check ((select public.is_admin()));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'faq_situation_forcee'
                  and policyname = 'faq_situation_forcee admin') then
    create policy "faq_situation_forcee admin" on public.faq_situation_forcee for all to authenticated
      using ((select public.is_admin())) with check ((select public.is_admin()));
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- La situation dans « New questions »
-- ---------------------------------------------------------------------------
alter table public.chatbot_questions
  add column if not exists situation         text,
  add column if not exists situations        text[],
  add column if not exists faq_entree_id     uuid references public.faq_entrees (id) on delete set null,
  add column if not exists reponse_situation text;

comment on column public.chatbot_questions.situation is
  'Prompt 21, Q (0424) : la situation de la personne au moment de la question (faq_situations.cle).';
comment on column public.chatbot_questions.reponse_situation is
  'Prompt 21, Q (0424) : la réponse de la FAQ par situation (envoyée en mode on, seulement notée en mode test).';

-- ---------------------------------------------------------------------------
-- Ce que l'OS sait de la personne (calcul de la situation, variables)
-- ---------------------------------------------------------------------------
create or replace function public.faq_faits_posteur(p_poster uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_auj   date := (now() at time zone 'Europe/Paris')::date;
  v_lundi date := v_auj - (extract(isodow from v_auj)::int - 1);
  pr       record;
  v_compte uuid;
  v_handle text;
  v_pays   text;
  v_warmup timestamptz;
  v_existe boolean;
  v_abos   integer;
  v_videos integer;
  v_role   text;
  v_out    jsonb;
begin
  if coalesce(auth.role(), '') <> 'service_role' and not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  v_out := jsonb_build_object(
    'aujourdhui', v_auj,
    'lundi_semaine', v_lundi,
    -- Un candidat qui accepte aujourd'hui (règle du samedi, 0413) commence ce lundi-là.
    'cohorte_candidat', public.cohorte_lundi_de(v_auj),
    'posts_min', coalesce((select (valeur #>> '{}')::int from public.reglages where cle = 'paie_minimum_posts'), 6),
    'trouve', false);
  if p_poster is null then
    return v_out;
  end if;

  select * into pr from public.profiles where id = p_poster;
  if not found then
    return v_out;
  end if;

  select r.role::text into v_role from public.user_roles r where r.user_id = p_poster
   order by case r.role::text when 'admin' then 1 when 'head_of_ops' then 2 when 'directing_manager' then 3
                              when 'hiring_manager' then 4 else 5 end
   limit 1;

  select co.id, co.handle_tiktok, co.pays, co.warmup_started_at into v_compte, v_handle, v_pays, v_warmup
    from public.comptes co
   where co.poster_id = p_poster and co.type_compte = 'perso' and co.is_active
   order by co.created_at limit 1;

  if v_compte is not null then
    select x.existe, x.abonnements, x.videos into v_existe, v_abos, v_videos from public.ckd_warmup_releves x
     where x.compte_id = v_compte and x.existe is not null order by x.releve_at desc limit 1;
  end if;

  return v_out || jsonb_build_object(
    'trouve', true,
    'poster_id', pr.id,
    'role', v_role,
    'prenom', pr.prenom,
    'actif', pr.is_active,
    'hub', exists (select 1 from public.hub_posteurs h where h.profile_id = pr.id),
    'cohorte_lundi', pr.cohorte_lundi,
    'offre_acceptee_le', pr.offre_acceptee_le,
    'premiere_connexion_at', coalesce(pr.premiere_connexion_at, (select u.last_sign_in_at from auth.users u where u.id = pr.id)),
    'contrat_id', pr.upwork_contract_id,
    'handle', v_handle,
    'pays', v_pays,
    'warmup_started_at', v_warmup,
    'tiktok_existe', v_existe,
    'abonnements', v_abos,
    'videos', v_videos,
    'nb_comptes', (select count(*) from public.comptes co where co.poster_id = pr.id and co.type_compte = 'perso' and co.is_active),
    -- Reportée (dimanche minuit ou Postpone) vers un lundi pas encore venu.
    'reporte', exists (select 1 from public.recrues_rouges rr
                        where rr.poster_id = pr.id and rr.decision = 'reporter'
                          and pr.cohorte_lundi is not null and rr.periode < pr.cohorte_lundi),
    'premier_post', (select min(p.date_publication_prevue) from public.passages p
                       join public.comptes co on co.id = p.compte_id
                      where co.poster_id = pr.id and co.type_compte = 'perso' and p.publie_url is not null),
    'posts_semaine', (select count(*) from public.passages p
                        join public.comptes co on co.id = p.compte_id
                       where co.poster_id = pr.id and co.type_compte = 'perso' and co.is_active
                         and p.publie_url is not null
                         and p.date_publication_prevue between v_lundi and v_auj),
    'prevus_semaine', (select count(*) from public.passages p
                         join public.comptes co on co.id = p.compte_id
                        where co.poster_id = pr.id and co.type_compte = 'perso' and co.is_active
                          and p.statut::text <> 'brouillon' and not coalesce(p.est_rappel, false)
                          and p.date_publication_prevue between v_lundi and v_lundi + 6),
    'pause_jusqu_au', (select max(pp.jusqu_au) from public.posteur_pauses pp
                        where pp.poster_id = pr.id and pp.debut <= now() and pp.jusqu_au > now()),
    -- Kill ou arrêt : un arrêt ouvert ou fait, un Kill 48 h en attente ou parti,
    -- un Kill du samedi sur le 1er compte pas annulé, un contrat terminé.
    'arret', coalesce(
      (select jsonb_build_object('source', a.source, 'at', a.created_at) from public.arrets a
        where a.poster_id = pr.id order by a.created_at desc limit 1),
      (select jsonb_build_object('source', 'kill_auto', 'at', coalesce(k.parti_at, k.prevu_at)) from public.kills_auto k
        where k.poster_id = pr.id and k.statut in ('en_attente', 'parti') order by k.prevu_at desc limit 1),
      (select jsonb_build_object('source', 'kill_samedi', 'at', coalesce(ca.fait_at, ca.prevu_at)) from public.ckd_arrets ca
        where ca.compte_id = v_compte and ca.annule_at is null order by ca.created_at desc limit 1),
      (select jsonb_build_object('source', 'contrat_fini', 'at', cf.termine_at) from public.contrats_fins cf
        where cf.poster_id = pr.id order by cf.semaine desc limit 1)),
    'tarif', coalesce(public.paie_tarif_contrat(pr.id), pr.tarif_hebdo, public.paie_tarif_zone(pr.id)),
    'derniere_paie', (select jsonb_build_object('montant', coalesce(ps.montant_corrige, ps.montant), 'paye_at', ps.paye_at,
                                                'semaine', ps.semaine)
                        from public.paie_semaines ps
                       where ps.poster_id = pr.id and ps.paye_at is not null and not coalesce(ps.exclu, false)
                       order by ps.semaine desc limit 1),
    'milestone', (select jsonb_build_object('nom', j.nom, 'montant', j.montant, 'etat', j.etat)
                    from public.upwork_jalons j where j.contrat_id = pr.upwork_contract_id limit 1),
    'forcee', (select jsonb_build_object('situation', f.situation, 'jusqu_au', f.jusqu_au)
                 from public.faq_situation_forcee f
                 join public.faq_situations s on s.cle = f.situation and s.actif
                where f.poster_id = pr.id and (f.jusqu_au is null or f.jusqu_au > now())));
end;
$$;

revoke execute on function public.faq_faits_posteur(uuid) from public, anon;
grant execute on function public.faq_faits_posteur(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Les questions de départ (anglais, jamais écrasées)
-- ---------------------------------------------------------------------------
insert into public.faq_entrees (cle, question, formulations) values
  ('when_start', 'When do I start?',
   array['When do I start posting?', 'When is my first day?', 'When can I start?', 'When does my first week start?']),
  ('paie', 'When do I get paid?',
   array['When is payday?', 'How much will I be paid?', 'Where is my payment?', 'When will I receive my money?']),
  ('milestone', 'When is my next milestone?',
   array['My milestone isn''t funded', 'Do I need to submit my milestone?', 'Where is my milestone?']),
  ('warmup', 'How does the warm-up work?',
   array['Is my warm-up done?', 'What do I do during the warm-up?', 'How many accounts do I need to follow?']),
  ('contrat_fini', 'Why was my contract ended?',
   array['Why did you end my contract?', 'Why was I removed?', 'Why did you stop working with me?']),
  ('rien_a_poster', 'There''s nothing to post today',
   array['I have no posts on my dashboard', 'My dashboard is empty', 'Why don''t I have posts today?'])
on conflict (cle) do nothing;

insert into public.faq_reponses (entree_id, situation, texte)
select e.id, r.situation, r.texte
  from (values
    -- When do I start?
    ('when_start', 'candidat', 'Accept the offer by Saturday, then create your TikTok account, click Start warmup and follow 5 accounts before Sunday midnight: you start on Monday {lundi_debut}. Accept later and you start the Monday after.'),
    ('when_start', 'accepte', 'You start on Monday {lundi_debut} if by Sunday midnight you have: {ce_qui_manque}. Otherwise you start the Monday after.'),
    ('when_start', 'connecte', 'You start on Monday {lundi_debut} if by Sunday midnight you have: {ce_qui_manque}. Otherwise you start the Monday after.'),
    ('when_start', 'compte_cree', 'You start on Monday {lundi_debut} if by Sunday midnight you have: {ce_qui_manque}. Otherwise you start the Monday after.'),
    ('when_start', 'warmup', 'You start on Monday {lundi_debut} if by Sunday midnight you have: {ce_qui_manque}. Otherwise you start the Monday after.'),
    ('when_start', 'pret', 'You start on Monday {lundi_debut}: your 2 posts a day appear on your dashboard at midnight.'),
    ('when_start', 'reporte', 'You weren''t ready on Sunday, so you start on Monday {lundi_debut}. Still missing: {ce_qui_manque}.'),
    ('when_start', 'semaine1', 'You started on {date_debut}.'),
    ('when_start', 'poste', 'You started on {date_debut}.'),
    -- When do I get paid?
    ('paie', 'candidat', 'Once you''ve accepted the offer, you''re paid every Monday for the week before, through a weekly Upwork milestone. Your rate is the one in the offer.'),
    ('paie', 'accepte', 'You''re paid every Monday for the week before, through your Upwork milestone ({tarif} a week). Your first payment comes the Monday after your first week of posts (you start on Monday {lundi_debut}).'),
    ('paie', 'connecte', 'You''re paid every Monday for the week before, through your Upwork milestone ({tarif} a week). Your first payment comes the Monday after your first week of posts (you start on Monday {lundi_debut}).'),
    ('paie', 'compte_cree', 'You''re paid every Monday for the week before, through your Upwork milestone ({tarif} a week). Your first payment comes the Monday after your first week of posts (you start on Monday {lundi_debut}).'),
    ('paie', 'warmup', 'You''re paid every Monday for the week before, through your Upwork milestone ({tarif} a week). Your first payment comes the Monday after your first week of posts (you start on Monday {lundi_debut}).'),
    ('paie', 'pret', 'You''re paid every Monday for the week before, through your Upwork milestone ({tarif} a week). Your first payment comes the Monday after your first week of posts (you start on Monday {lundi_debut}).'),
    ('paie', 'reporte', 'You''re paid every Monday for the week before, through your Upwork milestone ({tarif} a week). Your first payment comes the Monday after your first week of posts (you start on Monday {lundi_debut}).'),
    ('paie', 'semaine1', 'Your first week is paid on the Monday after it ends, through your Upwork milestone ({tarif} a week). A post only counts when you mark it published with its link on your dashboard, the same day.'),
    ('paie', 'a_risque', 'You''re paid every Monday for the week before ({tarif} a week). This week you have {posts_semaine} posts with their link so far. Below 6 in a week, we end the collaboration: post twice a day and paste each link on your dashboard the same day.'),
    ('paie', 'kill', 'Your last week is paid on Monday, then we close the contract.'),
    ('paie', null, 'You''re paid every Monday for the week before, through your Upwork milestone ({tarif} a week). Your last payment was {derniere_paie_montant} on {derniere_paie_date}.'),
    -- When is my next milestone?
    ('milestone', 'accepte', 'Your first weekly milestone comes when you start posting on Monday {lundi_debut}. We pay it every Monday for the week before.'),
    ('milestone', 'connecte', 'Your first weekly milestone comes when you start posting on Monday {lundi_debut}. We pay it every Monday for the week before.'),
    ('milestone', 'compte_cree', 'Your first weekly milestone comes when you start posting on Monday {lundi_debut}. We pay it every Monday for the week before.'),
    ('milestone', 'warmup', 'Your first weekly milestone comes when you start posting on Monday {lundi_debut}. We pay it every Monday for the week before.'),
    ('milestone', 'pret', 'Your first weekly milestone comes when you start posting on Monday {lundi_debut}. We pay it every Monday for the week before.'),
    ('milestone', 'reporte', 'Your first weekly milestone comes when you start posting on Monday {lundi_debut}. We pay it every Monday for the week before.'),
    ('milestone', 'kill', 'Your last milestone is paid on Monday, then we close the contract.'),
    ('milestone', null, 'Your current milestone is {milestone_suivante}. We pay it every Monday for the week before. If we ask you to, click Submit on it so we can pay you.'),
    -- How does the warm-up work?
    ('warmup', 'candidat', 'After you accept the offer: create your TikTok account, click Start warmup on your dashboard and follow 5 accounts before Sunday midnight. Don''t post anything before your first Monday.'),
    ('warmup', 'accepte', 'To be ready by Sunday midnight you still need: {ce_qui_manque}. Don''t post anything before Monday {lundi_debut}.'),
    ('warmup', 'connecte', 'To be ready by Sunday midnight you still need: {ce_qui_manque}. Don''t post anything before Monday {lundi_debut}.'),
    ('warmup', 'compte_cree', 'To be ready by Sunday midnight you still need: {ce_qui_manque}. Don''t post anything before Monday {lundi_debut}.'),
    ('warmup', 'warmup', 'To be ready by Sunday midnight you still need: {ce_qui_manque}. Don''t post anything before Monday {lundi_debut}.'),
    ('warmup', 'pret', 'Your warm-up is done. Don''t post anything before Monday {lundi_debut}: your 2 posts a day appear on your dashboard at midnight.'),
    ('warmup', 'reporte', 'Your warm-up wasn''t ready on Sunday, so you start on Monday {lundi_debut}. Still missing: {ce_qui_manque}.'),
    ('warmup', 'semaine1', 'Your warm-up is over: you''ve been posting since {date_debut}.'),
    ('warmup', 'poste', 'Your warm-up is over: you''ve been posting since {date_debut}.'),
    -- Why was my contract ended?
    ('contrat_fini', 'kill', 'The Vik Studios team ended the collaboration. Your last week is paid on Monday, then the contract is closed. If you think it''s a mistake, reply here: the team will check.'),
    -- There's nothing to post today
    ('rien_a_poster', 'candidat', 'Posts start on the Monday after you accept the offer and finish the warm-up. Before that, there''s nothing to post.'),
    ('rien_a_poster', 'accepte', 'That''s normal: your posts start on Monday {lundi_debut}. Before that, there''s nothing to post. Still to do by Sunday midnight: {ce_qui_manque}.'),
    ('rien_a_poster', 'connecte', 'That''s normal: your posts start on Monday {lundi_debut}. Before that, there''s nothing to post. Still to do by Sunday midnight: {ce_qui_manque}.'),
    ('rien_a_poster', 'compte_cree', 'That''s normal: your posts start on Monday {lundi_debut}. Before that, there''s nothing to post. Still to do by Sunday midnight: {ce_qui_manque}.'),
    ('rien_a_poster', 'warmup', 'That''s normal: your posts start on Monday {lundi_debut}. Before that, there''s nothing to post. Still to do by Sunday midnight: {ce_qui_manque}.'),
    ('rien_a_poster', 'pret', 'That''s normal: you start on Monday {lundi_debut}. Your 2 posts a day appear on your dashboard at midnight.'),
    ('rien_a_poster', 'reporte', 'That''s normal: you weren''t ready on Sunday, so you start on Monday {lundi_debut}. Still missing: {ce_qui_manque}.'),
    ('rien_a_poster', 'pause', 'You''re on pause, so nothing is planned for you right now. Your posts come back on your dashboard when the pause ends.'),
    ('rien_a_poster', 'kill', 'Your collaboration has ended, so nothing is planned for you anymore.')
  ) as r (cle, situation, texte)
  join public.faq_entrees e on e.cle = r.cle
on conflict do nothing;
