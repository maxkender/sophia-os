-- 0671 : les podz ne reprennent plus les mêmes images ni le même son
-- (plaintes des posteurs et décision d'Adrien du 12/11).
--
-- Constat du 12/11 :
--   * le podz alpha_male_yellow avait utilisé 102 images de sa banque (2 232)
--     pour 1 488 slides en 14 jours, chacune ~15 fois : ses consignes lui
--     faisaient prendre les images de quelques contenus d'inspiration. 40 comptes
--     alpha_male_yellow sur 47 avaient plus de 30 % de slides déjà vues sur
--     leurs propres posts de la semaine (45 % en moyenne) ;
--   * le podz weird_alpha mettait « Ballad to a Mexican Desert » sur 132
--     contenus sur 132, le podz RH « Blue Lamp Window » sur 126 sur 180.
--
-- Le guichet (`pods/index.ts`, `_shared/pods_repetition.ts`) refuse désormais
-- un original qui reprend une image livrée par le podz depuis `images_jours`
-- jours (`images_recentes`), ou dont le son est déjà sur `musique_max` de ses
-- `musique_fenetre` dernières livraisons (`musique_repetee`). `npm run images`
-- n'affiche plus les images récentes du podz. Consignes : `pods/ROUTINE.md` et
-- les AGENT.md des podz de la voie 1.
--
-- Retour arrière : `images_jours` à 0 et `musique_max` à 21 (plus aucun refus).

update public.reglages
   set valeur = jsonb_set(valeur, '{podz,repetition}',
         jsonb_build_object('images_jours', 14, 'musique_fenetre', 20, 'musique_max', 6), true)
 where cle = 'bleo' and not coalesce(valeur->'podz' ? 'repetition', false);
