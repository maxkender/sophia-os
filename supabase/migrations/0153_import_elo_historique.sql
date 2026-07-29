-- Persiste le rapport ELO (calcul détaillé) + flag de forçage manuel
-- pour l'historique d'imports et le relancement sous-seuil.
alter table public.contenus
  add column if not exists import_elo_rapport jsonb;

alter table public.contenus
  add column if not exists import_elo_force_seuil boolean not null default false;

comment on column public.contenus.import_elo_rapport is
  'Dernier rapport ELO (vues/pertinence/base/kk/elo par langue) pour logs & historique.';
comment on column public.contenus.import_elo_force_seuil is
  'true = scores plancherés au seuil import (relance manuelle admin).';
