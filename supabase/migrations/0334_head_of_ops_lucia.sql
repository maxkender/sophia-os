-- Lucia D, deuxième Head of Ops (demande d'Aram dans #a-os-tickets, 21/10,
-- validée par Adrien).
--
-- Même forme que 0262 (Aram), pour les mêmes raisons :
--   - ciblée par identifiant (luciad1@sophia.com), un filtre sur le nom
--     promouvrait un homonyme ;
--   - ON INSÈRE AVANT DE SUPPRIMER : dans l'autre sens, un échec entre les deux
--     instructions la laisse sans rôle, donc dehors. Dans cet ordre, le pire cas
--     est qu'elle porte deux rôles, que `chargerRole` tranche en faveur de
--     `head_of_ops`.
--
-- Elle garde son espace recrutement et ses posters : le Head of Ops cumule tout
-- le hiring manager. Ce que le rôle ouvre en plus (droits de données de l'admin
-- via `is_admin()`, limite d'interface seulement) est décrit dans 0260.

insert into public.user_roles (user_id, role)
values ('7036791d-e2dd-4637-913c-247afc65d1b3', 'head_of_ops')
on conflict do nothing;

-- CTE : la passerelle MCP expire sur un DELETE nu (voir 0262).
with supprimees as (
  delete from public.user_roles
   where user_id = '7036791d-e2dd-4637-913c-247afc65d1b3'
     and role <> 'head_of_ops'
  returning 1
)
select count(*) from supprimees;
