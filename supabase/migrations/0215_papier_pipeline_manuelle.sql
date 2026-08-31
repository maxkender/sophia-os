-- Pipeline papier : mode auto/manuel, hold, durée par master, catégorie, arrêt.

alter table public.papier_masters
  add column if not exists topic_categorie text not null default 'aleatoire';

alter table public.papier_masters
  add column if not exists pipeline_mode text not null default 'auto';

alter table public.papier_masters
  add column if not exists pipeline_hold text;

alter table public.papier_masters
  add column if not exists duree_cible_sec int;

alter table public.papier_masters
  add column if not exists annule boolean not null default false;

alter table public.papier_masters
  drop constraint if exists papier_masters_statut_check;

alter table public.papier_masters
  add constraint papier_masters_statut_check
    check (statut in ('queued', 'scripting', 'images', 'clips', 'ready', 'failed', 'stopped'));

alter table public.papier_masters
  drop constraint if exists papier_masters_categorie_check;

alter table public.papier_masters
  add constraint papier_masters_categorie_check
    check (topic_categorie in (
      'aleatoire',
      'histoire',
      'faits_divers',
      'mythes',
      'science',
      'espace',
      'animaux',
      'geographie',
      'pop_culture',
      'origines',
      'personnages',
      'mysteres'
    ));

alter table public.papier_masters
  drop constraint if exists papier_masters_mode_check;

alter table public.papier_masters
  add constraint papier_masters_mode_check
    check (pipeline_mode in ('auto', 'manuel'));

alter table public.papier_masters
  drop constraint if exists papier_masters_hold_check;

alter table public.papier_masters
  add constraint papier_masters_hold_check
    check (pipeline_hold is null or pipeline_hold in ('topic', 'script'));

comment on column public.papier_masters.topic_categorie is
  'Domaine du sujet IA (aléatoire ou catégorie choisie).';

comment on column public.papier_masters.pipeline_mode is
  'auto = enchaîne tout ; manuel = validation sujet puis script.';

comment on column public.papier_masters.pipeline_hold is
  'Étape en attente de validation admin (topic | script).';

comment on column public.papier_masters.duree_cible_sec is
  'Durée cible de cette vidéo ; le nombre de plans en dépend.';

comment on column public.papier_masters.annule is
  'true si l''admin a arrêté la pipeline.';
