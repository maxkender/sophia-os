-- Minuit écrit sa raison, par compte et par jour.
--
-- POURQUOI. Quand un créateur n'a pas son quota, la seule explication
-- disponible était reconstituée APRÈS COUP par `diagnostiquerQuotaCompte`, qui
-- rejoue une logique approchante sur l'état courant. Le 7 octobre, cette
-- reconstitution a désigné un manque de slideshows (« aucun valide ») alors que
-- la vraie raison, rendue par minuit la nuit précédente, était « compte vidéos
-- uniquement (pod 3) ». La raison existait, elle partait dans la réponse HTTP
-- de la fonction, et `pg_net` l'avait purgée avant qu'on la cherche.
--
-- On la garde maintenant. Une ligne par compte et par jour, écrasée si minuit
-- repasse (réassignation manuelle) : c'est le dernier verdict qui compte.
create table public.assignation_journal (
  compte_id  uuid not null references public.comptes(id) on delete cascade,
  jour       date not null,
  quota      integer,
  crees      integer not null default 0,
  raison     text,
  erreur     text,
  maj_at     timestamptz not null default now(),
  primary key (compte_id, jour)
);

comment on table public.assignation_journal is
  'Verdict de minuit par compte et par jour : combien de passages créés et pourquoi pas plus. Écrit par assignerTousComptes, lu par le panneau « qui est incomplet ».';

-- Le panneau l'affiche aux admins ; les fonctions edge écrivent en service_role.
alter table public.assignation_journal enable row level security;

create policy "assignation_journal lecture admin"
  on public.assignation_journal for select
  to authenticated
  using (public.is_admin());

-- Purge : le journal sert à comprendre la veille, pas à faire de l'historique.
-- Sans cette borne il grossit de 150 lignes par jour, indéfiniment.
create index assignation_journal_jour_idx on public.assignation_journal (jour);
