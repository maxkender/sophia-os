-- 0314 : l'interrupteur du choix automatique d'application.
--
-- CE QUE C'EST. Un booléen, et rien d'autre. À `false`, `manage-users` se
-- comporte exactement comme avant : l'application d'un nouveau compte vient de
-- ce que le recruteur a coché, et sinon c'est Sophia. À `true`, le moteur
-- choisit, à partir de la cible `reglages.repartition_applications`, par la
-- même règle de Sainte-Laguë que la page Répartition projette.
--
-- POURQUOI UN INTERRUPTEUR SÉPARÉ, et pas « une cible est posée = c'est
-- actif ». Parce que la page Répartition fait POSER la cible pour projeter.
-- Confondre les deux ferait qu'essayer un réglage à l'écran changerait la
-- production dans la seconde. Les deux décisions sont distinctes : « voici où
-- je veux aller » et « vas-y maintenant ».
--
-- POURQUOI IL COMPTE PLUS QUE D'HABITUDE. Le code vivant de `manage-users`
-- n'est pas déployé par la CI : c'est un `bundle.gz` épinglé par SHA dans
-- `boot.ts`, republié à la main. Couper par un redéploiement prendrait
-- plusieurs minutes et trois étapes. Cet interrupteur, lui, coupe en une
-- requête, sans redéploiement :
--   update public.reglages
--      set valeur = '{"actif": false}'::jsonb
--    where cle = 'choix_application_auto';
--
-- Même forme que `assignation_auto` et `relecture_envoi_auto`, qui existent
-- déjà : `{"actif": <bool>}`. Une valeur absente ou illisible vaut éteint,
-- côté serveur comme côté page : on ne bascule pas la production sur un doute.
--
-- `on conflict do nothing` : rejouable, et ne réactive jamais ce qu'un
-- administrateur aurait éteint à la main.
--
-- Retour arrière : delete from public.reglages where cle = 'choix_application_auto';

insert into public.reglages (cle, valeur)
values ('choix_application_auto', '{"actif": false}'::jsonb)
on conflict (cle) do nothing;
