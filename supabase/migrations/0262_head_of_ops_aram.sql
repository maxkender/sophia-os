-- Aram H, premier et seul Head of Ops.
--
-- SÉPARÉE DE 0261 À CAUSE DU SÉQUENCEMENT, PAS PAR PROPRETÉ.
-- `chargerRole` renvoie null pour un rôle que le front ne connaît pas, et un
-- rôle null, c'est la porte de connexion. Tant que le front déployé ignore
-- `head_of_ops`, cette ligne ne retire pas seulement à Aram son nouvel espace :
-- elle lui retire AUSSI son espace recrutement actuel. 0260 et 0261 sont sans
-- effet tant que personne ne porte le rôle ; celle-ci ne doit partir qu'une
-- fois le front à jour en production.
--
-- Ciblée par identifiant : un filtre sur le nom promouvrait un homonyme.

delete from public.user_roles
 where user_id = 'b2867b5e-c3d7-417c-9087-860d60086e7c';

insert into public.user_roles (user_id, role)
values ('b2867b5e-c3d7-417c-9087-860d60086e7c', 'head_of_ops')
on conflict do nothing;
