-- 0333 : premier jour de posts de chaque compte, pour les cohortes du lundi
-- de la page Posters (21/10).
--
-- La cohorte d'un posteur est le lundi de la semaine de son premier post prévu,
-- sur le premier de ses comptes. Même jour 0 que Check, Kill or Double (0326,
-- 0327) : le plus ancien passage, rappels et brouillons exclus. Un compte qui
-- n'a encore aucun passage (warm-up en cours) prend, côté page, le lundi de fin
-- de son warm-up.
--
-- security_invoker : la vue lit `passages` avec les droits de l'appelant. Admin
-- et Head of Ops (`is_admin()`) voient tous les comptes ; un poster ne voit que
-- les siens.
--
-- Retour arrière : drop view public.comptes_premier_jour.

create or replace view public.comptes_premier_jour
  with (security_invoker = true)
as
  select p.compte_id, min(p.date_publication_prevue) as premier_jour
    from public.passages p
   where not coalesce(p.est_rappel, false)
     and p.statut <> 'brouillon'
   group by p.compte_id;

grant select on public.comptes_premier_jour to authenticated;

comment on view public.comptes_premier_jour is
  'Premier jour de posts prévu par compte (rappels et brouillons exclus) : jour 0 de Check, Kill or Double, cohorte du lundi de la page Posters. Voir 0333.';

notify pgrst, 'reload schema';
