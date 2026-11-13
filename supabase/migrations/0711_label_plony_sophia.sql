-- 0711 : le label Plony sert Sophia (podz 14 « Originaux Plony »).
--   Dernière étape de la procédure de 0706, validée par la session de
--   coordination BLEO : l'import de @_plony_ est fini (ses images propres sont
--   dans la banque du label), ses contenus sont passés `rejete` et la source
--   est désactivée. Le label peut donc entrer dans le pool de Sophia sans
--   qu'aucun de ses posts ne soit diffusé : seuls les originaux du podz
--   (pod `originaux_plony`, 0708) le seront, traduits et avec Sophia placée
--   par l'OS (voie 1).
-- Les comptes qui portent le label sont choisis par Adrien et Max (Pilotage).
-- 0709 et 0710 sont prises sur main : ce rattachement prend 0711.
-- À appliquer (MCP) seulement après avoir vérifié qu'aucun contenu de
-- @_plony_ n'était encore valide ni brouillon. Additive, idempotente.

insert into public.label_applications (label_id, application_id)
select l.id, a.id
from public.labels l
join public.applications a on a.slug = 'sophia'
where l.slug = 'plony'
on conflict (label_id, application_id) do nothing;
