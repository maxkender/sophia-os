-- 0865 : le prompt de pertinence d'Artura note haut les posts TDAH, santé mentale
-- et habitudes où l'art tient comme une petite habitude pour décrocher (demande
-- de l'admin du 26/11).
--
-- LE CONSTAT. Le 25/11, l'import de @fraserparkinson0 (label adhd, Artura) a
-- rejeté 65 posts sur 69 : la pertinence Artura les notait 5 à 35 (« TDAH =
-- santé mentale, sans rapport avec l'art »). 34 ont été forcés à la main
-- (pertinence montée à 50, sauvegarde `_force_adhd_20261125`). Résultat dès le
-- 26/11 : sur rebecca.aura99 (it), la slide « pour décrocher et calmer mon
-- esprit, je prends quelques minutes pour découvrir un tableau et son histoire.
-- j'utilise l'appli Artura chaque jour » a fait 1 086 likes, 150 enregistrements
-- et 69 partages en 7 h. Le placement marche sur ces sujets : le prompt doit le
-- savoir.
--
-- CE QUE ÇA CHANGE. Un paragraphe ajouté AVANT « Notes basses » : TDAH, santé
-- mentale, anxiété, stress, listes d'habitudes et d'astuces = 55-80 quand
-- « quelques minutes pour découvrir un tableau et son histoire » peut y être une
-- habitude pour décrocher, calmer son esprit ou remplacer le scroll. Restent
-- bas : médicaments, diagnostic, symptômes cliniques, couple.
-- Les contenus déjà notés ne bougent pas (la note n'est recalculée que pour les
-- lignes sans note) ; le changement vaut pour les imports suivants.
--
-- Ciblé et idempotent : le paragraphe n'est inséré qu'une fois, devant
-- « Notes basses (0-44) », sans toucher au reste du prompt (qui a pu être retouché
-- dans Configuration). Si ce repère manque, rien ne change.
--
-- Retour arrière : retirer le paragraphe qui commence par « Notes moyennes à
-- hautes (55-80) : le TDAH ».

update public.prompts
   set contenu = replace(
         contenu,
         'Notes basses (0-44)',
         $p$Notes moyennes à hautes (55-80) : le TDAH, la santé mentale, l'anxiété, le stress, et les listes d'habitudes ou d'astuces (« adhd hacks », « habits that changed my life », « how to calm your mind », « dopamine reset », « micro-habits », « small resets », « things I do when I feel overwhelmed »), dès qu'une slide peut présenter « quelques minutes par jour pour découvrir un tableau et son histoire » comme une petite habitude pour décrocher, calmer son esprit ou remplacer le scroll. C'est prouvé chez nous : sur ce type de post, la slide « pour décrocher et calmer mon esprit, je prends quelques minutes pour découvrir un tableau et son histoire, j'utilise l'appli Artura chaque jour » a fait plus de 1 000 likes et 150 enregistrements en 7 heures. Ne descends sous 45 que si le post parle de médicaments, de diagnostic, de symptômes cliniques ou de couple, où une habitude culturelle sonnerait faux.

Notes basses (0-44)$p$),
       updated_at = now()
 where cle = 'pertinence_artura'
   and contenu like '%Notes basses (0-44)%'
   and contenu not like '%Notes moyennes à hautes (55-80) : le TDAH%';
