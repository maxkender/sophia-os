-- 0279 : les decks Unswipe / micabo refusés pour « base polluée » sont retentés.
--
-- CONTEXTE. Jusqu'au 14/10, `assurerDeckApplication` refusait toute base qui
-- portait une slide Sophia (« base polluée par une pub Sophia », « base qui
-- cite Sophia ») et mettait ce refus en cache dans `contenu_langue_decks`
-- (statut `ineligible`). Un `ineligible` ne se retente jamais : ces contenus
-- restaient écartés d'Unswipe et de micabo pour la langue concernée.
-- Conséquence observée : des créneaux perdus (`lea.studium381`, 0/2 le 14/10 ;
-- `carla.curso418`, 1/2), l'assignation tombant trois fois de suite sur eux.
--
-- CE QUI A CHANGÉ (même PR, `deck_application.ts`). La slide Sophia d'une base
-- est désormais l'emplacement imposé du placement, réécrit en entier par la pub
-- de l'application, comme une slide concurrente. Restent refusées : Sophia sur
-- la couverture, sur plusieurs slides, ou seule slide avec du texte, et une
-- slide Sophia à côté d'une slide concurrente — avec leurs propres motifs.
--
-- CE QUE FAIT LA MIGRATION. Elle supprime les lignes de cache `ineligible`
-- dont le motif est l'un des deux anciens (40 lignes au 14/10 : 29 Unswipe,
-- 11 micabo, 31 contenus). La prochaine assignation recalcule ces decks avec
-- la nouvelle règle. Aucune table ne référence `contenu_langue_decks`.
--
-- À APPLIQUER APRÈS LE DÉPLOIEMENT de la nouvelle `deck_application.ts` :
-- avant, l'ancien code remettrait le même refus en cache.
--
-- IDEMPOTENTE : rejouée, elle ne trouve plus ces motifs (le nouveau code ne
-- les écrit plus).

do $$
declare
  n int;
begin
  delete from public.contenu_langue_decks
  where statut = 'ineligible'
    and raison ~ '(^|: )(base polluée par une pub Sophia|base qui cite Sophia)$';
  get diagnostics n = row_count;
  raise notice '0279 : % deck(s) refusé(s) pour base polluée remis à recalculer.', n;
end $$;
