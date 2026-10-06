-- Aram H, premier et seul Head of Ops.
--
-- SÉPARÉE DE 0261 À CAUSE DU SÉQUENCEMENT, PAS PAR PROPRETÉ.
-- `chargerRole` renvoie null pour un rôle que le front ne connaît pas, et un
-- rôle null, c'est la porte de connexion. Tant que le front déployé ignorait
-- `head_of_ops`, cette migration ne lui aurait pas seulement retiré son
-- nouvel espace : elle lui aurait AUSSI retiré son espace recrutement.
-- Appliquée une fois le bundle de production vérifié.
--
-- ON INSÈRE AVANT DE SUPPRIMER, et ce n'est pas un détail de style : dans
-- l'autre sens, le moindre échec entre les deux instructions laisse Aram sans
-- aucun rôle, donc dehors. Dans cet ordre, le pire cas est qu'il porte deux
-- rôles, ce que `chargerRole` tranche déjà en faveur de `head_of_ops`.
--
-- Ciblée par identifiant : un filtre sur le nom promouvrait un homonyme.

insert into public.user_roles (user_id, role)
values ('b2867b5e-c3d7-417c-9087-860d60086e7c', 'head_of_ops')
on conflict do nothing;

-- La CTE n'est pas décorative. La passerelle MCP de ce projet expire sur un
-- DELETE nu (trois tentatives, aucun verrou, aucun trigger : vérifié) et passe
-- dès que l'instruction rend un jeu de résultats. Forme conservée ici parce
-- que c'est exactement celle qui a été exécutée en production.
with supprimees as (
  delete from public.user_roles
   where user_id = 'b2867b5e-c3d7-417c-9087-860d60086e7c'
     and role <> 'head_of_ops'
  returning 1
)
select count(*) from supprimees;
