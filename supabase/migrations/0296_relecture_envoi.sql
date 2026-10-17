-- 0296 : l'agent de relecture envoie lui-même ses retours.
--
-- Jusqu'ici (0290) il n'écrivait que des brouillons, relus par l'admin dans la
-- file du jour ou sur le banc d'essai. Désormais, une fois la nuit de relecture
-- finie, la fonction `relecture-auto` envoie (table `reviews`) :
--   - un retour par créateur et par nuit, celui du post au défaut le plus
--     important ; ses autres posts restent en brouillon ;
--   - jamais pour un post déjà reviewé ou passé à la main dans la file ;
--   - seulement les posts de la veille relus par le cron (pas les « Tester »).
-- L'interrupteur `reglages.relecture_envoi_auto` coupe tout, sans déploiement.

-- Qui a écrit le retour : l'admin (file du jour, page Reviews) ou l'agent.
alter table public.reviews add column if not exists origine text not null default 'admin';
alter table public.reviews drop constraint if exists reviews_origine_check;
alter table public.reviews add constraint reviews_origine_check check (origine in ('admin', 'agent'));

-- Garde-fou : deux passages du drain qui se chevauchent n'envoient jamais deux
-- retours de l'agent pour le même post.
create unique index if not exists reviews_agent_un_par_post
  on public.reviews (post_id) where origine = 'agent';

-- Ce que l'envoi a fait de la relecture : null (pas encore traité), « envoye »
-- (review_id renseigné), « envoi en cours » (réservée), ou la raison du non-envoi.
alter table public.relectures_auto add column if not exists envoi text;
alter table public.relectures_auto add column if not exists envoi_at timestamptz;
alter table public.relectures_auto add column if not exists review_id uuid references public.reviews (id) on delete set null;

comment on column public.relectures_auto.envoi is
  'Envoi automatique du brouillon : null = pas traité, « envoye » (review_id), « envoi en cours », sinon la raison du non-envoi.';

insert into public.reglages (cle, valeur)
values ('relecture_envoi_auto', '{"actif": false}'::jsonb)
on conflict (cle) do nothing;
