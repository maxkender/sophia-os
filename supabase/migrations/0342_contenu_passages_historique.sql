-- 0342 : l'historique de TOUS les passages d'un contenu, par application, pour
-- la règle de fatigue de la tierlist (analyse du 24/10, SUIVI P41).
--
-- POURQUOI. La requalification ne lit que le cycle en cours (`contenu_tier_etat`
-- : moyenne, max, mesures du cycle). Un B à 2 000 vues de moyenne reste B cycle
-- après cycle tant qu'un passage fait 3 000 : rien ne compte jamais le total de
-- passages. Résultat : 87 contenus B ou A avec 8 passages mesurés ou plus sans
-- jamais 10 k vues, 26 posts par jour à 2 800 vues le passage (contre 5 700
-- pour un premier passage).
--
-- CE QUE DONNE LA VUE : une ligne par (contenu, application) avec le nombre de
-- passages publiés mesurés (hors rappels J+7, comme `m`) et le meilleur passage
-- de toute la vie du contenu (rappels compris : un rappel à 10 k prouve autant
-- qu'un passage). Un passage sans application est un passage Sophia.
--
-- Vue à part, et non deux colonnes de plus sur `contenu_tier_etat` : cette
-- dernière est construite par SQL dynamique (0270) et dupliquée pour chaque
-- application ; une vue additive ne touche à rien de ce qui tourne. Lue par
-- `requalifierContenus` (Sophia) et par la requalification par application, sur
-- les seuls contenus dont le cycle est fini, donc quelques dizaines d'id par nuit.
--
-- Sémantique definer, comme `contenu_tier_etat`. Retour arrière :
-- `drop view public.contenu_passages_historique;`

create or replace view public.contenu_passages_historique as
select
  p.contenu_id,
  coalesce(p.application_id, application_id_sophia()) as application_id,
  coalesce(a.slug, 'sophia') as slug,
  count(*) filter (where p.vues is not null and not coalesce(p.est_rappel, false)) as mesures_total,
  max(p.vues) as max_vues_total,
  count(*) as publies_total
from public.passages p
left join public.applications a on a.id = coalesce(p.application_id, application_id_sophia())
where p.statut = 'publie'
group by p.contenu_id, coalesce(p.application_id, application_id_sophia()), coalesce(a.slug, 'sophia');

comment on view public.contenu_passages_historique is
  'Tous les passages publiés d''un contenu, par application : mesurés (hors rappels) et meilleur score de toute sa vie. Règle de fatigue de la tierlist (0342).';

grant select on public.contenu_passages_historique to authenticated, service_role;
