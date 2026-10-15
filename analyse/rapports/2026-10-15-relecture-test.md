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

## Troisième passe (v2) : justification à part, reviews plus courtes

Retour de l'admin sur la seconde passe : trop centrée sur la taille, trop de
remarques, et des phrases de robot (« the text is about 1.3× bigger »).

Ce qui change :

- **Justification mesurée à part de la taille.** Dans l'éditeur de TikTok, la
  zone de texte a une largeur fixe : le curseur de taille décide où se coupent
  les lignes, le pincement agrandit le bloc sans toucher aux retours à la
  ligne. Mesure : largeur du paragraphe en hauteurs de ligne, publiée ÷
  originale (invariante au pincement), confirmée par les caractères par
  ligne ; paragraphe de 3 lignes et 60 caractères au moins.
- **Moins sévère.** Taille relevée hors de ×0,7 – ×1,4 seulement. Deux points
  au plus par review. Police, graisse et placement : notes pour l'admin,
  jamais envoyées.
- **Rédaction.** Chaque point dit ce qui se voit puis le geste dans TikTok
  (curseur puis pincement, bouton d'alignement, bouton A, rangée de
  couleurs). Gemini reformule ; la reformulation n'est gardée que si elle
  cite les mêmes slides, sans chiffre technique.

| Compte | Review (points envoyés) | Notes admin | Relecture à l'œil |
| --- | --- | --- | --- |
| hanna.rozwoj122 | lignes trop courtes, colonne (slides 5, 6) · accroche centrée au lieu d'à gauche | — | juste |
| emma.inspira316 | lignes trop courtes, colonne (slides 1, 3, 4) | — | juste, net sur les 3 slides |
| sophie.mindset5098 | lignes trop courtes, 7 lignes au lieu de 5 (slides 2, 3) · jaune au lieu de blanc | police | juste |
| christina.nootropia966 | texte nettement plus grand (slides 2, 6) · accroche centrée | — | juste : mêmes lignes, bloc pincé plus grand |
| sofia.cultura4148 | accroche alignée à gauche | texte plus haut | juste ; texte ×1,3 – ×1,4 non relevé (sous le seuil) |
| julia.ksiazki2 | — | — | juste ; accroche courte non jugée |
| louis.ambition622 | — | — | juste |
| margarida.aprende717 | — | police | titre fondu (slide 7) non retenu : écart léger |
| su.efsane263 | — | police | texte ×1,3 non relevé |
| tomas.fokus333 | — | — | police différente visible, non relevée |

Bilan : 5 reviews sur 10, 1 ou 2 points chacune, tous vérifiés sur les
planches. La taille n'est plus le sujet principal : elle sort sur 1 post
(christina) au lieu de 6, et la justification sur 3 (hanna, emma, sophie),
que la seconde passe ne voyait qu'à moitié. Le prix de la sévérité réduite : les textes ×1,3 (sofia, su, tomas)
ne sont plus relevés.

## À suivre

- Le grossissement du texte (×1,3) est fréquent (6 posts sur 10) mais n'est
  relevé qu'au-delà de ×1,4 : à rediscuter si l'admin le veut plus tôt.
- Calibrer sur 100 posts étiquetés avant tout envoi automatique.
- La question « police » rate une police grasse remplacée par la police de
  TikTok : à reformuler ou à mesurer autrement.
