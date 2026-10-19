# Pod 7 — label `beau_smart_girl` : analyse du 19 octobre 2026

Sources des données :
- la base de prod (`mbikecieskoobeizixig`), en lecture seule ;
- un relevé TikTok en direct sur Apify (20 derniers posts des 6 comptes de référence du label, 0,23 $).

Les ids de contenu sont abrégés à 8 caractères.

Méthode : celle de l'analyste (`analyse/AGENT.md`).
- **r = vues du passage / vues médianes du compte.**
- On ne compte que les passages publiés il y a plus de 3 jours, sans les rappels.
- Un contenu est jugé sur la médiane de ses r, à partir de 3 passages.

---

## 1. Le label aujourd'hui

| | |
| --- | --- |
| Contenus | 173, dont 127 mesurés et **22 à r ≥ 2**. Sources : @wagamamalover (EN), @studyavec_lea (FR), @mia.study5 (EN), @smarter_with_sara (EN), @cleanlifestyle.t, @lifewithclara10 (IT), @iheartliver, @leadher.global |
| Comptes à nous | **28 actifs dans 17 langues** : de 5, tr 4, it 3, el 2, es 2, puis bg, cs, en, es-419, fr, hr, hu, nl, pt, ro, sl, sv. 19 servent Sophia, 8 servent UnSwipe à 100 %, aucun micabo |
| Résultats | 956 passages publiés depuis le 26/07 : **1 378 vues médianes, 5,6 % à 10 k ou plus**, max 179 400. En baisse : 9,0 % à 10 k ou plus en août, 5,6 % en septembre, 4,8 % en octobre |
| Réserve | Sophia : 176 passages, **5,7 jours** au rythme de 31 par jour. UnSwipe : 12,3 jours |
| Banque d'images propres | 1 621 images : bibliothèques, musées, photos argentiques chaudes, filles qui lisent, cafés |

À comparer avec les originaux des autres pods :
- pod 2 (weird_alpha) : 4 956 vues médianes et 15,3 % à 10 k ou plus, sur 72 passages ;
- pod 4 (alpha_male_yellow) : 8 250 vues médianes sur 12 passages (trop tôt pour conclure).

## 2. ⚠️ Deux applis concurrentes dans les sources

- @mia.study5 glisse l'appli d'étude **Bycat** dans ses slides (« i upload all my material to Bycat (with free trial) »).
	- 10 contenus la citent. **45 passages publiés depuis le 30/09 sont partis avec**, et 9 étaient encore à venir.
- @smarter_with_sara montre **Actualize: Daily Microlearning**, un concurrent direct de Sophia, dans 33 contenus.
	- Le placement Sophia remplaçait presque toujours cette slide : 1 seul passage publié avec.
- **Corrigé le 19/10** :
	- « bycat » et l'appli « actualize » sont ajoutés aux concurrents de l'OS (`_shared/concurrents.ts`). Le verbe « actualize your potential » n'est pas visé. Les decks sont nettoyés à l'assignation, et le placement Sophia vise la slide qui les citait ;
	- les 9 passages à venir ont été nettoyés à la main : la phrase qui cite Bycat est réécrite sans l'appli ;
	- les deux noms sont refusés dans le texte des originaux.
- @studyavec_lea cite déjà Sophia et UnSwipe dans ses propres posts. Ne prends jamais une slide d'inspiration qui montre une appli.

## 3. Ce qui fait des vues

**En direct (relevé du 19/10)** :

| Accroche | Compte | Date | Vues | Enregistrements |
| --- | --- | --- | --- | --- |
| how to be pretty af and insanely interesting at the same time | @mia.study5 | 23/09 | **571 k** | 56 k (9,8 %) |
| how to strengthen your immune system, backed by science (with sources) | @wagamamalover | 25/09 | 307 k | 6,1 k (2 %) |
| je NOTE TOUTES les choses que j'ai essayé pour arrêter de scroller | @studyavec_lea | 15/10 | 115 k | 0,9 % |
| les habitudes inconnues que j'ai volées aux filles toujours parfaites | @studyavec_lea | 12/10 | 70 k | 1,6 % |

- Sur 30 jours, @mia.study5 fait 12 k vues médianes sur 19 posts, @studyavec_lea 8 k sur 17, et @wagamamalover 45 k sur 3.
- @smarter_with_sara est tombée à 1 k. @lifewithclara10 ne publie plus depuis le 16/09.

**Chez nous** (r sur 3 passages au moins) :

| ✅ Marche | r | ❌ Flop | r |
| --- | --- | --- | --- |
| les habitudes insolites que j'ai volé à ma prof de fac pour se cultiver sans s'en rendre compte | **7,58** (11 passages, 179 k vues en italien) | things to do instead of doomscrolling | 0,27 |
| je note TOUS les trucs bizarres que j'ai fait pour me cultiver | **7,45** | simple ways to make life good again, backed by science | 0,29 |
| how i made school actually INTERESTING again | 5,04 | how to actually increase your attention span | 0,38 |
| new words to add to your vocabulary, backed by science | 3,99 | how to become the person you promised yourself you'd be | 0,45 |
| les règles que j'ai volé à ma mère pour devenir ridiculement cultivée | 3,87 | ways you can actually lower your cortisol levels | 0,46 |
| 5 conseils pour avoir tellement confiance en toi que personne ne peut te briser | 3,06 | how to stop being so lazy | 0,51 |
| les habitudes chelous que j'ai adoptées et qui ont tout changé | 3,01 | | |

- **Par source**, en r médian :
	- @studyavec_lea : 1,44 (8 contenus à r ≥ 2 sur 25 mesurés) ;
	- @mia.study5 : 1,00 (2 sur 18) ;
	- @wagamamalover : 0,90 (7 sur 70).
- **Ce qui marche** :
	- se cultiver, raconté : les habitudes volées à quelqu'un d'admiré, les trucs notés sur 10, les habitudes chelous ;
	- la promesse « jolie ET intéressante » ;
	- le sujet précis (vocabulaire, cerveau, mémoire).
- **Ce qui flop** :
	- la liste « prouvée par la science » sur un sujet vague (améliorer sa vie, son énergie, son cortisol) ;
	- l'anti-scroll en liste générique, sans récit ;
	- la promesse vague à soi-même.
- **Format gagnant** (83ef5e79, r 7,58) :
	- 5 à 6 slides, dans une ambiance bibliothèque ou musée sombre, avec un petit texte blanc centré ;
	- l'accroche tient en 4 lignes ;
	- les items sont numérotés et racontés à la troisième personne : « 1. Elle allait au musée pour voir trois œuvres. », puis 3 ou 4 lignes ;
	- Sophia vient en dernier item : « elle remplaçait les réseaux par le micro-apprentissage, 5 minutes par jour d'histoire, de sciences ou d'art ».

## 4. Ce qu'on en tire

1. **8 schémas actifs au 19/10** :
	- tous ont des preuves « os », des contenus du label à r ≥ 2 ;
	- deux preuves TikTok s'y ajoutent, à 571 k et 307 k vues, qui expirent les 23 et 25/10.
2. **Écrire en français, sur le modèle de @studyavec_lea** : c'est la meilleure source, et ses posts traduits par l'OS ont fait 179 k vues en italien et 93 k en allemand.
3. **Sophia** prend l'item « apprendre un truc sur le monde chaque jour » (5 minutes d'histoire, d'art ou de sciences), avec l'angle « avoir toujours une histoire à raconter ».
4. **La réserve Sophia du label ne tient que 5,7 jours** : il lui faut du stock.
5. **Les originaux ne servent que les 19 comptes Sophia**, comme ceux des pods 2, 4 et 5 : l'OS ne leur donne pas de rang UnSwipe. Les 8 comptes UnSwipe du label continuent avec les imports.
