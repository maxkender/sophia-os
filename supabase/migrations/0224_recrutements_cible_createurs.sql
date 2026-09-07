-- Cible créateurs par HM (dans chaque pays), réglable 0–30. Défaut 10.

alter table public.recrutement_hms
  add column if not exists cible_createurs smallint not null default 10;

alter table public.recrutement_hms
  drop constraint if exists recrutement_hms_cible_createurs_chk;

alter table public.recrutement_hms
  add constraint recrutement_hms_cible_createurs_chk
  check (cible_createurs between 0 and 30);
