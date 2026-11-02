-- 0358 : deux infos de plus sur la fiche d'un poster.
--
-- Demande de Lucia du 25/10 (#a-os-tickets) : à côté du lien du profil
-- Upwork (`upwork_url`, 0118), le lien du CONTRAT Upwork et l'email
-- personnel du poster (celui de Slack), saisis à la création ou plus tard
-- dans sa fiche.
--
-- Deux colonnes facultatives, rien d'existant ne change. Mêmes droits que
-- `upwork_url` : les politiques de `profiles` s'appliquent telles quelles
-- (admin et Head of Ops modifient ; le recruteur les remplit à la création,
-- par `manage-users`).
--
-- Retour arrière : alter table public.profiles drop column upwork_contrat_url,
-- drop column email_perso;

alter table public.profiles
  add column if not exists upwork_contrat_url text,
  add column if not exists email_perso text;

alter table public.profiles
  drop constraint if exists profiles_email_perso_format;
alter table public.profiles
  add constraint profiles_email_perso_format
  check (email_perso is null or email_perso ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$');

comment on column public.profiles.upwork_contrat_url is
  'Lien du contrat Upwork du poster (0358).';
comment on column public.profiles.email_perso is
  'Email personnel du poster, celui de Slack (0358).';
