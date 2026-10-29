-- 0430 — Les messages d'étape, du lundi et du jeudi partent sur Slack ET sur
-- Upwork (chacun s'il est relié), une fois sur chaque canal.
--
-- nudges.canaux       : les canaux où le message est vraiment parti ;
-- nudges.erreur_canal : l'échec d'un canal quand l'autre est parti (sinon
--                       slack_erreur, comme avant : rien n'est parti).
-- Additive : 2 colonnes. Aucune donnée existante modifiée.
alter table public.nudges add column if not exists canaux text[];
alter table public.nudges add column if not exists erreur_canal text;

comment on column public.nudges.canaux is
  'Prompt 21 (0430) : les canaux où le message est parti (slack, upwork). Étapes, lundi et jeudi : Slack ET Upwork.';
comment on column public.nudges.erreur_canal is
  'Prompt 21 (0430) : l''échec d''un canal alors qu''un autre est parti (sinon slack_erreur).';
