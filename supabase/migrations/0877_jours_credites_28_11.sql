-- 0877 : panne du 28/11, jours comptés comme faits (règle 3 de Max, même forme que 0807 pour le 20/11). Données seulement.
-- Le 27/11 la flotte a passé 1000 comptes actifs : l'assignation de minuit et le rattrapage de 6 h se sont arrêtés sur
-- le garde-fou de lecture (PR #2047). Les posts du 28/11 ont été créés à partir de 09 h 35 (Paris). Les passages de ce
-- jour créés après 06:00 UTC et toujours sans lien de publication sont crédités : payés, comptés dans les posts de la
-- semaine, jamais un jour manqué ni une raison de kill. Un posteur qui publie quand même garde son lien en plus.
-- À appliquer après la fin du 28/11 (Paris) et avant le contrôle du dimanche 29/11 (10:00 UTC). Idempotent.

with cible as (
  select p.id, c.poster_id from public.passages p join public.comptes c on c.id = p.compte_id
   where c.type_compte = 'perso' and not coalesce(p.est_rappel, false) and p.statut <> 'brouillon'
     and p.date_publication_prevue = '2026-11-28' and p.created_at >= '2026-11-28 06:00+00' and p.publie_url is null
     and p.credite_raison is null),
u as (update public.passages p set credite_raison = 'Panne du 28/11 (posts arrivés en retard) : jour compté comme fait'
        from cible where p.id = cible.id returning cible.poster_id)
insert into public.jours_credites (poster_id, jour, raison)
select distinct poster_id, date '2026-11-28', 'Panne du 28/11 (posts arrivés en retard)' from u
on conflict (poster_id, jour) do nothing;
