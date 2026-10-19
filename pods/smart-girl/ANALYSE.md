# Pod 8 — label `smart_girl` : analyse du 19 octobre 2026

Sources des données :
- la base de prod (`mbikecieskoobeizixig`), en lecture seule ;
- un relevé TikTok en direct sur Apify (15 derniers posts des 9 comptes de référence du label, 0,31 $).

Les ids de contenu sont abrégés à 8 caractères.

Méthode : celle de l'analyste (`analyse/AGENT.md`).
- **r = vues du passage / vues médianes du compte.**
- On ne compte que les passages publiés il y a plus de 3 jours, sans les rappels.
- Un contenu est jugé sur la médiane de ses r, à partir de 3 passages.

---

## 1. Le label aujourd'hui

| | |
| --- | --- |
| Contenus | 659, dont 379 mesurés et **63 à r ≥ 2**. Toutes les sources sont en anglais : @richgirlacadmy_1, @brookeandbloom, @leah.internet.hoarder, @speakbetter14, @gilmoreobssesed, @better.with.ava, @b3tteryou, @diane.ellsworthh, @c0coa_candle |
| Comptes à nous | **61 actifs dans 24 langues** : pt 7, de 6, fr 5, el 4, en 4, hu 4, tr 4, puis cs, es, it, ro 3, hr, pl, sl 2, et ar, bg, es-419, et, fi, nl, no, sk, sr, sv. Sophia seule |
| Résultats | 3 794 passages publiés depuis juillet : **1 560 vues médianes, 8,9 % à 10 k ou plus**, max 242 400. Stable : 8,8 % en août, 7,9 % en septembre, 10,0 % en octobre |
| Par langue | Très fort en sr (35,6 % à 10 k ou plus), fi, el, hr, pl. Faible en pt (2,2 %) et **nul en en (0 % sur 159 passages)** |
| Réserve | 729 passages, **7,2 jours** au rythme de 101 par jour |
| Banque d'images propres | 6 229 images. Celles de @gilmoreobssesed sont des captures de la série *Gilmore Girls* (une actrice réelle) |

## 2. ⚠️ Trois applis concurrentes dans les sources

- **Elqo** (« elqo.app », appli d'élocution en 5 minutes par jour) : 35 contenus la citent, **87 passages Sophia publiés** sont partis avec depuis le 24/07.
- **Unscroll** (il bloque les applis et propose un article à lire) : 60 contenus, **30 passages publiés** avec. L'OS ne le connaissait que comme concurrent d'UnSwipe.
- **Kodi AI** (appli d'élocution, glissée par @b3tteryou) : 24 contenus, 5 passages publiés avec.
	- « kodi » seul n'est pas visé : « cheat kodi » veut dire « codes » en slovène et en croate.
- **Corrigé le 19/10** :
	- les trois sont ajoutés aux concurrents de Sophia dans l'OS (`_shared/concurrents.ts`). Les decks sont nettoyés à l'assignation, et le placement Sophia vise la slide qui les citait ;
	- les 10 passages à venir qui les citaient ont été nettoyés à la main ;
	- les trois noms sont refusés dans le texte des originaux.
- 188 contenus des sources citent déjà l'appli Sophia. Plusieurs de ces comptes en font la promotion.

## 3. Ce qui fait des vues

**En direct (relevé du 19/10)** :

| Accroche | Compte | Date | Vues | Enregistrements |
| --- | --- | --- | --- | --- |
| behaviours that make you look 10x more attractive | @b3tteryou | 04/10 | **1,0 M** | 30 k (3 %) |
| behaviours that make you look 10x more attractive | @b3tteryou | 22/09 | 407 k | 11 k (2,8 %) |
| (diaporama) | @gilmoreobssesed | 10/10 | 39 k | 2,7 % |
| (diaporama de 12 slides) | @richgirlacadmy_1 | 08/10 | 32 k | **10,8 %** |

- Sur 30 jours, @b3tteryou fait 703 k vues médianes sur 2 posts, et @gilmoreobssesed 16 k sur 15.
- Les autres sont entre 1 k et 3 k. @speakbetter14 ne publie plus depuis le 05/07.

**Chez nous** (r sur 3 passages au moins) :

| ✅ Marche | r | ❌ Flop | r |
| --- | --- | --- | --- |
| Free ways to become disgustingly educated (without a degree) | **16,07** | "Not like other girls" hobbies that make you smarter (une autre version) | 0,28 |
| How I stay neat and intelligent at school all at the same time | **13,29** (10 passages) | how to become unrecognizable and shock everyone | 0,36 |
| 5 words that will expand your vocabulary! | **12,11** (242 k vues) | Books to Read for the Sophisticated Woman | 0,37 |
| 6 hobbies that will make you noticeably smarter | 9,5 | it girl habits (how to level up your life) | 0,38 |
| Timeless elegant accessories every woman should own | 8,87 | 7 LAWS That Secretly Decide Who WINS In Life | 0,39 |
| 12 laws of sovereignty | 6,62 | how to make friends in school when you feel invisible | 0,41 |
| 7 Things a High-Status Woman Never Does | 5,51 | Podcasts That Make You Dangerously Eloquent | 0,44 |
| 6 Languages That Open the Most Doors Internationally | 5,13 (15 passages) | | |

- **Par source**, en r médian :
	- @gilmoreobssesed : 1,23 (24 contenus à r ≥ 2 sur 82). Ses « 5 words to help expand your vocabulary » dépassent presque tous r 2,5 ;
	- @b3tteryou : 1,09 ;
	- @richgirlacadmy_1 : 0,82, avec 15 contenus à r ≥ 2 sur 106 : très inégal ;
	- @speakbetter14 : 0,88.
- **Ce qui marche** :
	- le savoir qu'on emporte : un mot rare par slide, des hobbies qui rendent plus intelligente, des moyens gratuits de se cultiver ;
	- le « je » de l'élève soignée et brillante ;
	- l'élégance et la présence (statut, regard, parole) ;
	- une liste de culture concrète (les langues qui ouvrent des portes).
- **Ce qui flop** :
	- le « level up » générique ;
	- les conseils de vie scolaire ;
	- les listes de livres ou de podcasts à consommer ;
	- les « lois » vagues.
- **Sophia dans les gagnants** :
	- dans un post de vocabulaire, le dernier mot porte l'appli (« érudit : avec une appli de micro-apprentissage comme l'appli Sophia ») ;
	- dans une liste, c'est un item « apprendre un truc chaque jour en 5 minutes ».

## 4. Ce qu'on en tire

1. **9 schémas actifs au 19/10**, prouvés par des contenus du label à r ≥ 2. Les deux posts de @b3tteryou, à 1,0 M et 407 k vues, prouvent aussi « attractive behaviours ».
2. **Écrire en anglais**, comme toutes les sources. L'OS traduit pour les 24 langues ; nos comptes anglais, eux, ne font pas de vues.
3. **Sophia** prend le dernier mot ou l'item « 5 minutes par jour pour apprendre », avec la formule « a micro-learning app like the Sophia app ».
4. **Les captures d'actrice** (Gilmore Girls) font partie du style gagnant, mais jamais sur la slide Sophia : pas de recommandation prêtée à une personne réelle.
