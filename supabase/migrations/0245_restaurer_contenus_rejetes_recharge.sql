-- Restauration des slideshows rejetés à tort par une recharge créateur.
--
-- `revoquer-post` passait `contenus.statut = 'rejete'` dès qu'un créateur
-- rechargeait son post — ce qui retirait le slideshow de TOUTE la flotte,
-- toutes langues, définitivement. 243 slideshows ont été perdus ainsi, dont
-- 162 en rang B ou plus, ce qui a vidé les pools d'assignation (« 0/2 post »).
--
-- Le code ne rejette plus globalement sur recharge créateur (seule la
-- révocation admin le fait). Cette migration récupère les B et plus.
--
-- Les C et D rejetés de la même façon ne sont volontairement PAS restaurés :
-- la consigne était « B ou plus ». Pour les reprendre plus tard :
--   update contenus set statut='valide' where statut='rejete'
--     and pertinence_raison like 'Rechargé par le créateur%' and tier in ('C','D');
--
-- Annulation de cette migration :
--   update contenus set statut='rejete',
--     pertinence_raison = regexp_replace(pertinence_raison,
--       '^Restauré 2026-09-15 [^—]*— ancien : ', '')
--   where pertinence_raison like 'Restauré 2026-09-15 %';

update public.contenus
   set statut = 'valide',
       pertinence_raison =
         'Restauré 2026-09-15 (rejet global sur recharge créateur) — ancien : '
         || coalesce(pertinence_raison, '')
 where statut = 'rejete'
   and pertinence_raison like 'Rechargé par le créateur%'
   and tier in ('B', 'A', 'S', 'S+');
