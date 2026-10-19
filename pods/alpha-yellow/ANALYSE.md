# Pod 4 — label `alpha_male_yellow` : analyse du 15 octobre 2026

Sources des données :
- la base de prod (`mbikecieskoobeizixig`), en lecture seule ;
- un relevé TikTok en direct sur Apify (30 derniers posts des 6 comptes source, 0,36 $).

Les ids de contenu sont abrégés à 8 caractères.

Méthode : celle de l'analyste (`analyse/AGENT.md`).
- **r = vues du passage / vues médianes du compte qui l'a posté.** Au-dessus de 1, le post fait mieux que d'habitude sur ce compte.
- On ne compte que les passages publiés il y a plus de 3 jours, sans les rappels.
- Un contenu est jugé sur la médiane de ses r, à partir de 3 passages.

---

## 1. Le label aujourd'hui

| | |
| --- | --- |
| Contenus | 424, venus de 6 comptes source (343 valides) |
| Comptes à nous | **42** (20 langues). Le 15/10, 10 comptes alpha_male_film sont passés ici (migration 0286) |
| Volume | environ 48 posts par jour avant le 15/10, environ 69 après |
| Réserve servable en priorité (B et plus) | **63 passages, soit moins d'une journée**. Le label vit sur ses 259 contenus C |
| Banque d'images propres | 1 970 images (`npm run images`) |

**Tendance** (posts mûrs, médiane hebdomadaire) :

| Période | Vues médianes | Posts à 10 k ou plus |
| --- | --- | --- |
| Mi-août | 2 100 à 2 400 | 6 à 8 % |
| Depuis la mi-septembre | 1 250 à 1 450 | 2 à 7 % |

Le volume, lui, est passé de 65 à 286 posts par semaine. Semaine du 5 octobre :
1 453 vues médianes contre 1 507 pour les autres labels, et 7,0 % de posts à
10 k contre 8,0 %.

**Comptes source** (passages sur 75 jours) :

| Compte | Passages | Contenus | Vues médianes | r médian | Posts ≥ 10 k | En direct le 15/10 |
| --- | --- | --- | --- | --- | --- | --- |
| **stonemag.co** | 60 | 14 | 4 483 | **2,56** | **28,3 %** | actif : 24 posts en 30 j, 14 650 vues médianes, max 1,3 M |
| supermaxing (FR) | 259 | 44 | 2 968 | 1,36 | 8,5 % | actif, mais 1 237 vues médianes |
| klevr.mind | 45 | 6 | 1 783 | 1,31 | 8,9 % | presque à l'arrêt |
| rockyjune11 | 152 | 23 | 1 835 | 1,15 | 7,2 % | arrêté depuis le 6/09 |
| rileyscsinspo | 33 | 8 | 1 404 | 0,99 | 3,0 % | presque à l'arrêt |
| rockyjune00 | **856** | 112 | 1 246 | **0,83** | 2,8 % | arrêté depuis le 11/08 |

**61 % des passages viennent de la source la plus faible.** Les originaux
doivent remplacer ce stock. L'endormir est une décision du moteur : le pod ne
peut que la proposer.

**Par langue** (3 dernières semaines) :
- fortes : pl (6 060 vues médianes, 19 % de posts à 10 k ou plus), tr (4 154, 16 %), sr (2 231), sv (2 066), es (1 774, 11 %) ;
- faibles : de (1 213, aucun post à 10 k sur 147), pt (730), sk (715), cs (655).

Les originaux vivent surtout traduits : pas de jeu de mots intraduisible.

---

## 2. Ce qui fait des vues aujourd'hui (relevé du 15/10)

Les meilleurs posts de @stonemag.co depuis la mi-septembre :

| Accroche | Date | Vues | Enregistrements | Chez nous |
| --- | --- | --- | --- | --- |
| 7 skills that'll make you dangerously capable in your 20s | 25/09 | **1,3 M** | 120 k (9 %) | 2a9d2d47, S+, r 5,59 |
| Skills that will make you unforgettable | 26/09 | 444 k | 39 k (9 %) | 452e706f, A |
| How to stop feeling awkward around people (and finally relax) | 26/09 | 412 k | 29 k (7 %) | ee79c00a, r 3,09 |
| 7 Social Hacks That Feel Like Cheating | 11/10 | 300 k | 17 k (6 %) | pas importé |
| Things That Make You Quietly Sophisticated | 02/10 | 239 k | 12 k (5 %) | pas importé |
| Things that make you surprisingly good at talking to women | 21/09 | 217 k | 10 k (5 %) | 51759eba, r 6,77 |
| ❌ How to make ordinary days feel special | 19/09 | 2 934 | 75 (2,6 %) | 8d3edcd1 |
| ❌ The art of having a signature | 18/09 | 2 938 | 42 (1,4 %) | 03380b1e, D |

On a le même compte, le même univers photo et en partie les mêmes images,
mais **1,3 M vues contre 2 934**. C'est l'écriture qui fait l'écart.

### Le format qui gagne

- **Visuel** : photos candides des années 2000 (Brad Pitt, Daniel Craig, Christian Bale, Paul Walker, Matthew McConaughey, Al Pacino…), façon paparazzi, avec du grain et des tons chauds. Le texte est **jaune** et centré, sans emoji.
- **9 slides** : l'accroche, 7 items, puis la slide de marque (« STONE MAG. »). Chez nous, ce sera 8 slides, sans marque.
- **Accroche** : 4 à 9 mots, construite en trois éléments.
	- La promesse d'une compétence ou d'un avantage social.
	- Un intensif : *dangerously*, *surprisingly*, *quietly*, *feel like cheating*.
	- Une cible : *in your 20s*, *around people*, *talking to women*.
- **Item** : 25 à 37 mots (170 à 205 caractères).
	- Il commence par un verbe (*Learn to…*, *Stop…*, *Know when…*).
	- Il contient une scène concrète ou une réplique entre guillemets.
	- Il finit sur une chute courte. Le ton est oral, un peu cash (« Nobody really teaches you this shit »).
	- Exemple : *« Instead of asking your friends "Where should we eat?", just give them three options. Because somehow, asking six people to choose a restaurant turns into a forty-minute meeting with absolutely no outcome. »*
- **Enregistrements** : 5 à 9 % des vues sur les gagnants, contre 1,4 à 2,6 % sur les flops. Le gagnant est une liste qu'on garde.
- **Ce qui flop** : le lifestyle contemplatif, un texte d'essai continu, rien à appliquer.
- **Légende** : uniquement des hashtags (#targetaudience #niche #lifemaxxing #confidence #personaldevelopment).
- **Musique** : un son différent à chaque fois (« 0.5 (slowed) », « cutting up », « ENDO SMOKE »…).

---

## 3. Ce que confirment nos comptes (75 jours, au moins 3 passages)

| ✅ Marche | r | ❌ Flop | r |
| --- | --- | --- | --- |
| Things that make you surprisingly good at talking to women (stonemag) | 6,50 | how to cure your phone addiction | 0,26 |
| How to instantly become more noticeable to girls (stonemag) | 6,22 | how you become a truly good man | 0,34 |
| 7 skills that'll make you dangerously capable in your 20s (stonemag, S+) | 5,59 | how you reach your full potential | 0,37 |
| how to be dangerously well educated (rockyjune00) | 5,23 | how you escape the average life | 0,42 |
| How to never run out of things to say with a girl (stonemag, S) | 4,10 | how you become more interesting | 0,44 |
| 7 habits that will make you dangerously attractive in your 20s | 3,87 | how you speak like a highly intellectual person (12 passages) | 0,47 |
| L'effet miroir : 4 détails corporels secrets qui te rendent intimidant(e) (supermaxing) | 3,83 | how you get your focus back | 0,47 |
| 5 comportements psychologiques qui font immédiatement peur aux gens (supermaxing) | 3,58 | | |
| 6 japanese habits I use to destroy laziness (rockyjune00, 13 passages) | 3,37 | | |
| Comment te faire respecter immédiatement sans hausser la voix (supermaxing) | 3,03 | | |

- **Ce qui marche** : une promesse précise, avec un enjeu social. Plaire, se faire respecter, ne plus être gêné, devenir capable.
- **Ce qui flop** : la vague « amélioration de soi » en « how you… », sans promesse. Presque tout vient de @rockyjune00.
- **À accroche identique, l'exécution fait l'écart** : « how to be dangerously well educated » fait r 5,23 sur un contenu et r 0,50 sur un autre (9e63c380).
- **À l'inverse de weird_alpha (pod 2), l'angle « parler aux femmes » marche ici.** Il doit rester respectueux.
- **Repère** : les originaux du pod 2 font déjà r 2,09 et 13 % de posts à 10 k ou plus. C'est une piste, sur 23 passages.

---

## 4. Ce qu'on en tire

1. Écrire seulement sur des schémas prouvés ce mois-ci (`playbook.json`). L'OS refuse un dépôt sans preuve.
2. Reprendre le format @stonemag.co : 7 items concrets, enregistrables, une scène ou une réplique par item.
3. Slide Sophia en 5, sur un item d'apprentissage, et sur une image sans visage de star.
4. Suivre à J+3. Couper tôt ce qui flop, décliner ce qui marche.
5. Élargir la veille. @stonemag.co est la seule source en forme : sans d'autres comptes, le pod s'use avec elle.
