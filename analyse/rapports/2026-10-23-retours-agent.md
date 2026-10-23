# Analyse du 2026-10-23 : une semaine de retours de l'agent de relecture

Données : `relectures_auto` (cron) des posts du 16 au 22/10, lues le 23/10 à
8 h 30 UTC ; vues J+2 (`passages.vues`, relevé du 22/10 à 23 h, 54 h d'âge)
mûres jusqu'aux posts du 20/10. r = vues ÷ médiane du compte figée sur le
01/09-15/10 (posts mûrs, ≥ 5). Six nuits d'envoi (posts du 17 au 22/10).

## En bref

1. **Les défauts baissent d'environ 30 %** chez les créateurs déjà là avant les
   retours (~130) : 0,85 défaut par post les 16-17/10, 0,55 à 0,65 depuis ;
   posts à signaler 45-49 % → 30-42 %.
2. **Les vues, elles, ne bougent pas** : r de ces créateurs 1,16 le 18/10,
   puis 1,00 et 1,02, dans la plage d'avant les retours (0,88 à 1,13, ~1,00).
   Le pic du 18/10 s'explique par le choix des contenus (rapport du 21/10).
3. **Pourquoi : les défauts que relève l'agent ne coûtent pas de vues.** Même
   slideshow posté par plusieurs comptes, avec et sans défaut : ratio 1,05
   (196 contenus), le passage avec défaut fait moins bien une fois sur deux.
   Justification 1,00, largeur 1,05, alignement 1,01, couleur 1,10.
4. **Seule exception, la taille du texte : 0,73** (27 contenus, moins bien
   63 % du temps). Piste.
5. **Rythme** : 553 retours en six nuits, 87 % lus ; 181 créateurs sur 202
   servis, 39 en ont reçu un 5 ou 6 nuits sur 6.

## Chiffres clés

Défauts par post (créateurs présents les 16-17/10, `16` + requête du rapport) :

| Posts du | 16 | 17 | 18 | 19 | 20 | 21 | 22 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Défauts par post | 0,85 | 0,84 | 0,68 | 0,55 | 0,61 | 0,55 | 0,65 |
| Posts à signaler | 45 % | 49 % | 37 % | 34 % | 37 % | 30 % | 42 % |
| Retours envoyés | — | 89 | 73 | 74 | 72 | 59 | 75 |

Les ~60 créateurs arrivés le 19/10 suivent la même pente : 0,64 → 0,41-0,56.

Vues J+2 de ces mêmes créateurs (r médian, posts mûrs) :

| Avant les retours (04-17/10) | 18/10 | 19/10 | 20/10 |
| --- | ---: | ---: | ---: |
| 0,88 à 1,13 (médiane ≈ 1,00) | 1,16 | 1,00 | 1,02 |

Coût d'un défaut en vues, à contenu égal (`16` partie C, posts du 16 au 20/10) :

| Défaut | Contenus | r avec défaut ÷ r sans | Avec défaut moins bien |
| --- | ---: | ---: | ---: |
| Tous | 196 | 1,05 | 47 % |
| Largeur | 116 | 1,05 | 47 % |
| Justification | 68 | 1,00 | 50 % |
| Alignement | 60 | 1,01 | 50 % |
| Hiérarchie | 47 | 1,04 | 45 % |
| Couleur | 45 | 1,10 | 47 % |
| Effet | 42 | 0,98 | 52 % |
| **Taille** | 27 | **0,73** | 63 % |

Même constat dans le créateur (89 créateurs, posts avec défaut ÷ sans : 0,97)
et toutes données confondues (avec défaut r 1,03, sans 1,00).

## Ce qui marche

- Les créateurs lisent et corrigent : l'agent fait ce qu'on lui demande,
  rendre les posts conformes à l'original.

## Ce qui ne marche pas

- **Conformité ≠ vues.** Les écarts que l'agent mesure (paragraphe un peu
  plus étroit, alignement, couleur) ne changent pas ce que TikTok montre. Le
  −25 % de « Jutifier » (P27) venait de 35 cas graves vus par un humain ; les
  seuils de l'agent attrapent surtout des écarts légers.
- **Volume** : un créateur sur cinq reçoit un retour presque chaque matin,
  pour des points qui ne lui rapportent rien.

## À améliorer

- **moteur** : délai de 3 jours entre deux retours au même créateur. Gain :
  moitié moins de retours (rejoué sur les six nuits : 293 au lieu de 553),
  sans perte de vues mesurable ; moins de lassitude
  pour le jour où un point compte vraiment. On saura avec le nombre de
  retours par créateur et le taux de lecture.
- **moteur** : faire passer la taille du texte en premier et ne signaler
  les autres points qu'au-delà d'un écart fort, puis remesurer le coût à
  contenu égal par niveau d'écart. Gain attendu : retours qui visent les vues.
  On saura avec `16` partie C, par tranche d'écart.
- **analyste** : remesurer le coût de la taille sur deux semaines (27 contenus
  aujourd'hui) avant d'en faire une règle forte.

## Suivi des pistes précédentes

- P27 (justification coûte des vues) : infirmée pour les écarts que mesure
  l'agent (1,00 à contenu égal, 68 contenus) ; reste vraie pour les cas graves
  vus par un humain le 15/10.
- P28 (une review fait progresser) : oui sur la conformité, non sur les vues.
- P35 (effet des retours) : défauts −30 %, vues inchangées.
- P36 (couleur) : sans objet pour les vues (1,10 à contenu égal).
- Nouvelle piste P37 (taille du texte).
