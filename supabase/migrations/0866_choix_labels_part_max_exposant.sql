-- 0866 : le choix du label d'une recrue ne s'emballe plus sur un label qui marche
-- (décision de Max du 27/11).
--
-- LE CONSTAT. Semaine du 23/11 : 427 recrues Sophia, dont psychologiefaits 191
-- (45 %) et History 168 (39 %), soit 84 % sur deux labels. Même scénario que
-- weird_alpha, rempli jusqu'à saturation (0,5 jour de réserve aujourd'hui).
-- La mécanique (`choix_label_equilibre.ts`) :
--   * poids = facteur de performance ^ perf_exposant (3), facteur borné à ×4 :
--     psychologiefaits (×14,75) et History (×4,75) pèsent 4³ = 64, alpha_male,
--     le suivant, ≈ 1,86³ ≈ 6 : dix fois moins ;
--   * part_max = 1/2 : deux labels au plafond peuvent prendre 100 % des recrues ;
--   * la règle « rafale » (2 des 3 derniers comptes de la langue) ne voit rien
--     quand deux labels alternent, et « pays saturé » (> 1/2 du pays) arrive
--     trop tard sur une grande flotte.
--
-- CE QUE ÇA CHANGE, dans le réglage `choix_labels` (le même que la page
-- Répartition édite ; une valeur en base passe devant le défaut du code) :
--   * part_max : 0,5 → 0,2 : aucun label au-dessus de 20 % des recrues
--     (le plafond reste au moins 1/n quand peu de labels sont candidats) ;
--   * perf_exposant : 3 → 2 : l'écart de poids entre un label au plafond et
--     alpha_male passe d'environ ×10 à environ ×4.
-- Les défauts du code (0,5 et 3) ne bougent pas : le réglage les remplace, et
-- les deux copies (front et Deno) restent identiques.
--
-- ✅ Appliquée le 2026-11-27 (MCP). Ne touche à aucune autre clé du réglage.
-- Retour arrière : `update public.reglages set valeur = valeur - 'part_max' - 'perf_exposant' where cle = 'choix_labels';`
-- (retour aux défauts 0,5 et 3).

update public.reglages
   set valeur = valeur || jsonb_build_object('part_max', 0.2, 'perf_exposant', 2),
       updated_at = now()
 where cle = 'choix_labels';
