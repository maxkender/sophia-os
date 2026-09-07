-- Dernier message Upwork (HM + créateur), rempli plus tard par l'autom.
-- L'admin lit « — » tant que les colonnes sont vides.

alter table public.recrutement_hms
  add column if not exists dernier_message text,
  add column if not exists dernier_message_at timestamptz,
  add column if not exists dernier_message_auteur text
    check (
      dernier_message_auteur is null
      or dernier_message_auteur in ('nous', 'eux')
    );

alter table public.recrutement_createurs
  add column if not exists dernier_message text,
  add column if not exists dernier_message_at timestamptz,
  add column if not exists dernier_message_auteur text
    check (
      dernier_message_auteur is null
      or dernier_message_auteur in ('nous', 'eux')
    );
