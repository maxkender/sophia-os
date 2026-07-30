-- Idempotence du rattrapage ELO : un passage ne doit pas appliquer
-- deux fois son delta langue (↑/↓) si on relance le rattrapage.
alter table public.passages
  add column if not exists elo_maj_at timestamptz;

comment on column public.passages.elo_maj_at is
  'Horodatage de la dernière application ELO langue (delta) pour ce passage. NULL = pas encore compté.';

create index if not exists passages_elo_pending_idx
  on public.passages (statut, date_publication_prevue)
  where statut = 'publie' and elo_maj_at is null and vues is not null;
