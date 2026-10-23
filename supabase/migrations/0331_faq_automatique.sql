-- 0331 : FAQ automatique — le cerveau de l'assistant répond aussi sur Slack.
--
-- Un seul cerveau, deux entrées : #questions sur Slack (fonction `slack-faq`,
-- appelée par l'appli Slack à chaque message) et la bulle d'aide de l'OS
-- (fonction `chatbot`). Il lit le Poster Guide et le Manager Guide recopiés
-- depuis Notion (fonction `guides-notion`, toutes les heures) et les réponses
-- validées par l'admin (`chatbot_contexte`), puis tranche :
--   repondu    → il répond ;
--   bug        → il se tait, l'IT guy le prend (frontière écrite une seule
--                fois dans supabase/functions/_shared/frontiere_it.ts) ;
--   a_traiter  → il ne sait pas : la question arrive dans l'OS, page Assistant ;
--   hors_sujet → bonjour, merci, discussion : rien.
-- Voir docs/faq-automatique.md.
--
-- Tout démarre en mode TEST : rien ne part sur Slack, la bulle répond comme
-- avant et le cerveau tourne à côté. Les décisions s'affichent dans l'OS.
--
-- Additive : une table, des colonnes nullables, un réglage, un cron.
-- Retour arrière :
--   select cron.unschedule('guides-notion');
--   delete from public.reglages where cle = 'faq_automatique';
--   drop table public.guides_notion;
--   drop index public.chatbot_questions_slack_uniq;
--   drop index public.chatbot_questions_a_traiter_idx;
--   alter table public.chatbot_questions drop column source, drop column etat,
--     drop column test, drop column reponse_faq, drop column section_guide,
--     drop column envoye_at, drop column slack_canal, drop column slack_ts,
--     drop column slack_user_id, drop column slack_nom,
--     drop column slack_reponse_ts, drop column reponse_humaine,
--     drop column reponse_humaine_par, drop column reponse_admin,
--     drop column traite_par, drop column traite_at,
--     drop column ajoute_base_at, drop column erreur;

-- ---------------------------------------------------------------------------
-- 1) Copie du guide Notion : une ligne par page (le guide et ses sous-pages)
-- ---------------------------------------------------------------------------
create table if not exists public.guides_notion (
  page_id text primary key,
  guide text not null check (guide in ('poster', 'manager')),
  titre text not null,
  -- « Poster Guide › Quick answers » : ce que le cerveau cite à la personne.
  chemin text not null,
  url text not null,
  texte text not null default '',
  -- Ordre de lecture dans le guide (racine 0, puis les sous-pages).
  ordre integer not null default 0,
  -- Sous-pages : reprises telles quelles quand la page n'a pas bougé.
  enfants text[] not null default '{}',
  notion_modifie_at timestamptz,
  copie_at timestamptz not null default now()
);

alter table public.guides_notion enable row level security;

-- Écriture par la fonction (service_role) ; lecture admin pour la page Assistant.
drop policy if exists guides_notion_admin on public.guides_notion;
create policy guides_notion_admin on public.guides_notion
  for select using ((select public.is_admin()));

grant select on public.guides_notion to authenticated;

-- ---------------------------------------------------------------------------
-- 2) chatbot_questions devient le journal du cerveau (bulle + Slack)
-- ---------------------------------------------------------------------------
-- `reponse` reste ce que la personne a VRAIMENT reçu (null si rien n'est
-- parti). `reponse_faq` est ce que le cerveau propose, envoyé ou non (mode test).
-- `etat` est null sur les questions d'avant : l'ancien assistant.
alter table public.chatbot_questions
  add column if not exists source text not null default 'os',
  add column if not exists etat text,
  add column if not exists test boolean not null default false,
  add column if not exists reponse_faq text,
  add column if not exists section_guide text,
  add column if not exists envoye_at timestamptz,
  add column if not exists slack_canal text,
  add column if not exists slack_ts text,
  add column if not exists slack_user_id text,
  add column if not exists slack_nom text,
  add column if not exists slack_reponse_ts text,
  add column if not exists reponse_humaine text,
  add column if not exists reponse_humaine_par text,
  add column if not exists reponse_admin text,
  add column if not exists traite_par uuid references public.profiles (id) on delete set null,
  add column if not exists traite_at timestamptz,
  add column if not exists ajoute_base_at timestamptz,
  add column if not exists erreur text;

alter table public.chatbot_questions
  drop constraint if exists chatbot_questions_source_check;
alter table public.chatbot_questions
  add constraint chatbot_questions_source_check check (source in ('os', 'slack'));

alter table public.chatbot_questions
  drop constraint if exists chatbot_questions_etat_check;
alter table public.chatbot_questions
  add constraint chatbot_questions_etat_check check (
    etat is null or etat in (
      'repondu', 'bug', 'hors_sujet', 'a_traiter', 'relance',
      'traite_admin', 'traite_slack', 'ignore'
    )
  );

-- Le Head of Ops pose des questions à l'assistant depuis 0261, mais la
-- contrainte l'ignorait : ses questions n'étaient jamais enregistrées.
alter table public.chatbot_questions
  drop constraint if exists chatbot_questions_role_check;
alter table public.chatbot_questions
  add constraint chatbot_questions_role_check
  check (role in ('admin', 'poster', 'hiring_manager', 'directing_manager', 'head_of_ops'));

-- Slack renvoie un événement s'il n'a pas eu son 200 à temps : un message ne
-- donne qu'une ligne, et donc qu'une réponse.
create unique index if not exists chatbot_questions_slack_uniq
  on public.chatbot_questions (slack_canal, slack_ts)
  where slack_ts is not null;

create index if not exists chatbot_questions_a_traiter_idx
  on public.chatbot_questions (created_at desc)
  where etat in ('a_traiter', 'relance');

-- ---------------------------------------------------------------------------
-- 3) Réglages : tout en test au départ
-- ---------------------------------------------------------------------------
--   mode_slack      eteint | test | actif — test : rien ne part sur Slack
--   mode_os         test | actif — test : la bulle répond comme avant
--   canaux_slack    canaux lus (#questions seulement au départ)
--   message_attente « I've passed your question to the team » quand il ne sait pas
insert into public.reglages (cle, valeur)
values (
  'faq_automatique',
  jsonb_build_object(
    'mode_slack', 'test',
    'mode_os', 'test',
    'canaux_slack', jsonb_build_array('C0BL56RJH7T'),
    'message_attente', true
  )
)
on conflict (cle) do nothing;

-- ---------------------------------------------------------------------------
-- 4) Copie du guide Notion, toutes les heures à :17
-- ---------------------------------------------------------------------------
-- ⚠️ Comme 0304 : <CRON_SECRET> est remplacé par le vrai secret au moment de
-- l'appliquer, jamais écrit dans le dépôt. Une copie complète lit ~150 blocs
-- Notion (3 requêtes/s) : le délai laisse le temps au premier passage.
select cron.schedule('guides-notion', '17 * * * *', $$
  select net.http_post(
    url := 'https://mbikecieskoobeizixig.supabase.co/functions/v1/guides-notion',
    headers := jsonb_build_object('content-type','application/json','x-cron-secret','<CRON_SECRET>'),
    body := '{}'::jsonb,
    timeout_milliseconds := 150000
  );
$$);
