-- 0662 : au moins 30 % d'accroches neuves (full tests) pour chaque podz (Adrien, 7/11).
--
-- La jauge fixe la part de full tests d'un podz d'après les semaines de stock de sa
-- boîte (`jauge.seuils_semaines` 6, 3, 1) : 10 % à 6 semaines et plus, 20 % de 3 à 6,
-- 30 % de 1 à 3, 40 % en dessous. Plus un label avait de gagnants à décliner, moins il
-- faisait d'accroches neuves : smart_girl (8 semaines, 167 familles en boîte) était à
-- 10 %. Or à âge égal une déclinaison fait comme une accroche neuve (r 0,97 contre 0,97
-- à J+3), et seules les accroches neuves ouvrent de nouveaux thèmes (46 % des full tests
-- jugés depuis le 30/10 sont gagnants).
-- Parts : 30 %, 30 %, 40 %, 50 % (au lieu de 10, 20, 30, 40).
--
-- Retour arrière : remettre [0.1, 0.2, 0.3, 0.4] dans `jauge.parts`.

update public.reglages
   set valeur = jsonb_set(valeur, '{jauge,parts}', '[0.3, 0.3, 0.4, 0.5]'::jsonb)
 where cle = 'bleo';
