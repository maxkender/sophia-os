-- 0284 : comment masters (TICKET 002 de Max, test de 2 semaines).
--
-- Un « comment master » par région reçoit sur Slack chaque post de sa région
-- qui dépasse 8 000 vues dans ses 12 premières heures, avec un commentaire
-- prêt à écrire dans la langue du post. Il le poste sur TikTok puis clique
-- « Done » ; 48 h plus tard on relève les likes de son commentaire (le seul
-- indicateur du test, demandé par Max).
--
-- La région, c'est la langue du compte (`comptes.langue`) : « de » couvre
-- l'Allemagne, l'Autriche et la Suisse, « it » l'Italie. Cloisonné : chaque
-- région a son propre canal Slack privé.
--
-- Écrit par les fonctions edge `comment-masters` (cron horaire) et
-- `slack-interactions` (bouton Done), toutes deux en service_role.

create table public.comment_master_regions (
  langue           text primary key,
  region           text not null,
  comment_master   text not null,
  slack_channel_id text,
  seuil_vues       integer not null default 8000,
  fenetre_heures   integer not null default 12,
  actif            boolean not null default true,
  created_at       timestamptz not null default now()
);

comment on table public.comment_master_regions is
  'Une ligne par région de comment master : langue des comptes couverts, canal Slack privé, seuil de vues et fenêtre depuis la publication.';

insert into public.comment_master_regions (langue, region, comment_master)
values
  ('de', 'German-speaking countries', 'Martin Befeld'),
  ('it', 'Italy', 'Annapaola Illiano');

create table public.comment_master_demandes (
  id                  uuid primary key default gen_random_uuid(),
  -- Unique : un post ne part qu'une fois, même si deux relevés se chevauchent.
  passage_id          uuid not null unique references public.passages (id) on delete cascade,
  compte_id           uuid references public.comptes (id) on delete set null,
  langue              text not null,
  application         text,
  publie_url          text not null,
  vues_declenchement  integer not null,
  age_minutes         integer,
  commentaire         text not null,
  traduction_en       text,
  statut              text not null default 'a_envoyer'
                        check (statut in ('a_envoyer', 'envoye')),
  erreur              text,
  slack_channel_id    text,
  slack_ts            text,
  envoye_at           timestamptz,
  fait_at             timestamptz,
  fait_par            text,
  -- Relevé à 48 h du « Done » : le commentaire retrouvé sous le post.
  mesure_statut       text check (mesure_statut in ('trouve', 'introuvable')),
  mesure_at           timestamptz,
  likes_commentaire   integer,
  commentaire_cid     text,
  commentaire_auteur  text,
  commentaire_poste   text,
  created_at          timestamptz not null default now()
);

comment on table public.comment_master_demandes is
  'Un post envoyé à un comment master : commentaire généré, message Slack, clic Done, puis likes du commentaire relevés 48 h après.';

create index comment_master_demandes_a_mesurer_idx
  on public.comment_master_demandes (fait_at)
  where fait_at is not null and mesure_at is null;

-- Lecture admin pour le bilan du test ; les fonctions edge écrivent en service_role.
alter table public.comment_master_regions enable row level security;
alter table public.comment_master_demandes enable row level security;

create policy "comment_master_regions lecture admin"
  on public.comment_master_regions for select
  to authenticated
  using (public.is_admin());

create policy "comment_master_demandes lecture admin"
  on public.comment_master_demandes for select
  to authenticated
  using (public.is_admin());

-- Cron horaire. ⚠️ Comme 0103 : <CRON_SECRET> est remplacé par le vrai secret
-- au moment de l'appliquer, jamais écrit dans le dépôt.
--
-- Une fois par heure, et pas plus : chaque relevé coûte ~0,0023 $ par post
-- encore dans sa fenêtre de 12 h (une trentaine en moyenne pour DE + IT), soit
-- ~1,7 $ par jour. Un commentaire arrive donc au plus tard 1 h après le
-- passage des 8 000 vues.
select cron.schedule('comment-masters', '7 * * * *', $$
  select net.http_post(
    url := 'https://mbikecieskoobeizixig.supabase.co/functions/v1/comment-masters',
    headers := jsonb_build_object('content-type','application/json','x-cron-secret','<CRON_SECRET>'),
    body := '{}'::jsonb,
    timeout_milliseconds := 280000
  );
$$);
