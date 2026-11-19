-- 0777 : pertinence Atala · le self-improvement, le bien-être et le glow-up
-- passent dans la tranche HAUTE (décision d'Adrien du 19/11 : « find peace,
-- be better, girl summer… tout ça c'est parfait pour une slide "go running",
-- "get Atala" »).
--
-- Constat du 19/11 sur les premières sources Atala : la consigne (0764)
-- rangeait elle-même ces sujets en « notes moyennes (40-69) ». Le modèle
-- écrivait « s'intègre très naturellement » et notait 55-60. Avec des vues
-- qui pèsent 70 % de la note d'import (seuil 63), un post noté 60 ne passe
-- qu'au-delà d'environ 10 000 vues : @healthy_with_emma6 a gardé 7 posts sur
-- 78, @sydneysynced 48 sur 100, @sslowrisee 24 sur 76. @mondorunning (course
-- pure, noté 88-98) a tout gardé.
--
-- Ce qui change : la question décisive devient « UNE slide peut-elle dire
-- "va courir" comme un conseil parmi les autres ? ». Si oui, la note est haute
-- (80-92), même sans sport dans le post. La course pure reste au-dessus
-- (90-100) ; les conseils tournés vers les autres (amitié, charisme, couple)
-- et la productivité restent moyens (50-75) ; les notes basses ne changent pas.
-- À 90 de pertinence, un post passe à partir d'environ 2 000 vues.
--
-- La première ligne « [BROUILLON À RELIRE …] » est gardée telle quelle : c'est
-- elle qui retient l'activation d'Atala, et la première phrase (le pitch)
-- n'est toujours pas vérifiée.
--
-- Les posts déjà rejetés ne sont pas renotés par ce changement : ceux des
-- sources du 19/11 ont été rouverts à la main (voir docs/applications.md § 7).
--
-- ✅ Appliquée le 2026-11-19 (MCP).
--
-- Retour arrière : remettre le texte de 0764, avec la retouche d'Adrien du
-- 19/11 (« le glow-up et la discipline (PAS FORCEMENT PAR LE SPORT) »).

update public.prompts
   set updated_at = now(),
       contenu = $p$[BROUILLON À RELIRE : écrit le 19/11 sans le pitch exact d'Atala. Vérifie la première phrase, puis retire cette ligne. L'application ne s'active pas tant qu'elle est là.]

Atala est une application de course à pied (running) : elle accompagne ceux qui courent, et ceux qui veulent s'y mettre.

Note de 0 à 100 la pertinence de ce post pour y glisser naturellement un conseil menant à l'appli Atala.

Question décisive : « Dans ce slideshow, est-ce qu'UNE slide pourrait dire "va courir" ("go for a run", "start running", "get Atala") comme un conseil parmi les autres, sans casser la liste ni le ton ? » Si oui, la note est HAUTE, même si le post ne parle jamais de sport : courir a sa place dans presque toute liste d'habitudes, de bien-être ou de changement de vie. Tu ne vois que l'accroche et la légende : pars de l'accroche, c'est elle qui dit ce que la vidéo promet. Si l'accroche manque, lis les hashtags de la légende.

Notes très hautes (90-100) : la course à pied sous toutes ses formes. Débuter, reprendre, premiers 5 km, 10 km, semi, marathon, trail, plans et séances d'entraînement, allure, endurance, respiration, régularité, motivation pour courir, « runner girl », run club, courir le matin, routine de coureur, courir pour sa tête, récupération, blessures du coureur, alimentation et sommeil du coureur, équipement de course, jour de course.

Notes hautes (80-92) : tout post de conseils, d'habitudes ou de routines pour aller mieux ou devenir meilleur, où « va courir » est un conseil évident. Ne baisse pas la note parce que le post ne parle pas de course : c'est au placement de trouver la phrase.
- Self-improvement et développement personnel : « be better », devenir la meilleure version de soi, se réinventer, changer de vie, « lock in », discipline, mindset, habitudes à prendre.
- Paix intérieure et santé mentale : « find peace », anxiété, stress, burnout, système nerveux, cortisol, confiance en soi, estime de soi.
- Glow-up et styles de vie : « that girl », « clean girl », « hot girl », « girl summer », winter arc, reset de saison ou de rentrée, challenge de 30 jours, devenir plus attirante par ses habitudes.
- Bien-être et habitudes saines : wellness, healthy habits, routines du matin ou du soir, énergie, sommeil, santé du corps (digestion, peau, hormones) quand le post donne des habitudes de vie.
- Sport et forme au sens large : marche, cardio, salle, pilates, perte de poids.

Notes moyennes (50-75) : « va courir » reste crédible mais demande un petit détour. Conseils tournés vers les autres plutôt que vers soi (être une meilleure amie, charisme, se faire aimer, séduction, couple), productivité et organisation, vie étudiante, listes d'objets ou d'applis à avoir, style de vie montré sans conseil (vlog, esthétique pure). Jamais moins de 50 tant que « va courir » reste un conseil possible.

Notes basses (0-39) : sujets où parler d'une appli de running sonnerait faux (culture générale et faits, méthodes de révision, drama, histoires d'amour racontées, tutos de mode ou de maquillage, argent, carrière, recettes et restaurants sans lien avec la forme, recommandations de livres, de films ou de séries), et slideshow qui est lui-même la pub d'une autre appli de sport (captures de fiche App Store, tuto d'un concurrent).

Tu ne notes pas la viralité : les vues du TikTok d'origine sont comptées à part. Tu ne notes pas la qualité des images. Ne note jamais comme si c'était Sophia (culture générale) : Atala, c'est courir.$p$
 where cle = 'pertinence_atala';
