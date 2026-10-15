# Relecture automatique : test du 2026-10-15 sur 10 posts du jour

Lot tiré au hasard parmi les slideshows publiés le 15/10 (`origine = 'test'`),
passé dans la fonction `relecture-auto` déployée, déclenchée comme le fera le
cron de 3 h. Verdicts comparés à une relecture à l'œil (planches original /
publié sur les 3 slides comparées).

## Fonctionnement

- File → run Apify (10 posts, slides téléchargées) → analyse : aucun post
  introuvable, aucun échec, 10 relus en 82 s (première passe) puis 98 s
  (seconde passe, avec la question « police »).
- 3 appels Gemini par post (original et publié dans le même appel).

## Première passe : trop tolérante

3 posts signalés sur 10, verdicts justes, mais des défauts visibles ratés :
colonne étroite non vue (hanna.rozwoj122, la largeur du bloc n'était pas
mesurée), textes grossis à ×1,3 jamais relevés (seuil à ×1,45), police perdue
non vue (tomas.fokus333), alignement de l'accroche écarté faute d'une seconde
slide. Les coordonnées de Gemini, recoupées à l'œil, sont fiables.

## Seconde passe : seuils recalibrés

| Compte | Langue | Défauts retenus | Relecture à l'œil |
| --- | --- | --- | --- |
| sophie.mindset5098 | en | taille ×1,3 · police · couleur jaune au lieu de blanc | taille et couleur justes ; police plausible |
| sofia.cultura4148 | it | taille ×1,4 · accroche alignée à gauche · texte plus haut | juste |
| margarida.aprende717 | pt | taille ×1,4 · titre fondu dans le corps (slide 7) · police | juste |
| hanna.rozwoj122 | pl | colonne étroite (5 lignes au lieu de 3) · accroche centrée au lieu d'à gauche | juste : c'est le cas « Jutifier » type |
| christina.nootropia966 | el | taille ×1,3 · accroche centrée au lieu d'à gauche | juste |
| su.efsane263 | tr | taille ×1,3 · sous-titre aligné à gauche | juste, défaut mineur |
| tomas.fokus333 | hr | taille ×1,3 | juste, mais la police grasse de l'original perdue n'est pas vue |
| emma.inspira316 | ro | paragraphe plus étroit (slides 1 et 4) | juste, écart léger |
| julia.ksiazki2 | pl | aucun | colonne étroite sur une seule slide, non retenue |
| louis.ambition622 | fr | aucun | texte un peu plus petit (×0,8), acceptable |

Bilan : environ 15 défauts relevés, tous visibles sur les planches (la police
de sophie reste à confirmer) ; 2 ratés (police de tomas, colonne étroite de
julia sur une seule slide).

## À suivre

- Le grossissement du texte (×1,3) est le défaut le plus courant : 6 posts sur 10.
- Calibrer sur 100 posts étiquetés avant tout envoi automatique.
- La question « police » rate une police grasse remplacée par la police de
  TikTok : à reformuler ou à mesurer autrement.
