# Pod 5 — label `RH` : analyse du 15 octobre 2026

Sources des données :
- la base de prod (`mbikecieskoobeizixig`), en lecture seule ;
- un relevé TikTok en direct sur Apify (30 derniers posts de @careerswemma, 0,07 $).

Les ids de contenu sont abrégés à 8 caractères.

Méthode : celle de l'analyste (`analyse/AGENT.md`).
- **r = vues du passage / vues médianes du compte.**
- On ne compte que les passages publiés il y a plus de 3 jours, sans les rappels.
- Un contenu est jugé sur la médiane de ses r, à partir de 3 passages.

---

## 1. Le label aujourd'hui

| | |
| --- | --- |
| Contenus | 228, tous de **@careerswemma** (FR, 6 k abonnés), importés le 28/09. 125 valides : S 2, A 20, B 47, C 57, D 102 |
| Comptes à nous | **9** (fr 2, en, de, ru, bg, sk, el, ro), environ 14 posts par jour |
| Résultats | semaine du 28/09 : 1 925 vues médianes, 16 % de posts à 10 k ou plus ; semaine du 05/10 : **2 318 vues médianes, 21,7 % à 10 k ou plus** (les autres labels : 1 495 et 7,3 %). Max 270 600 vues |
| Réserve en B ou au-dessus | 101 passages, soit environ 7 jours |
| Banque d'images propres | 821 images : bureaux, cafés, bibliothèques, autoportraits au miroir |

**C'est le label le plus fort du moment, mais il est jeune.** La plupart de ses
contenus n'ont qu'un ou deux passages mûrs : le r de l'OS (3 passages au moins)
ne se mesure encore que sur une poignée de contenus.

## 2. ⚠️ La source est une ferme à contenu pour TurboResume

- @careerswemma glisse l'appli **TurboResume** dans ses slides (« adapté à l'offre avec turboresume, le trou devient une compétence »).
- **117 contenus sur 228** la citent.
- Le garde-fou concurrents de l'OS ne la connaissait pas : **57 passages RH publiés sur 139 sont partis avec**, dont 13 étaient encore à venir le 15/10.
- **Corrigé le 15/10** :
	- `turboresume` est ajouté aux concurrents de l'OS (`_shared/concurrents.ts`). Les decks sont nettoyés à l'assignation, et le placement Sophia vise la slide qui le citait ;
	- les 13 passages à venir ont été nettoyés à la main (phrase qui la cite retirée).
- Les slides d'inspiration de la source la montrent parfois, écrite dans l'image : ne pas les choisir.

## 3. Ce qui fait des vues

**En direct (relevé du 15/10)** : @careerswemma a explosé mi-septembre, puis s'est tassée.

| Accroche | Date | Vues | Enregistrements |
| --- | --- | --- | --- |
| les trucs sur lesquels tu DOIS MENTIR en entretien | 17/09 | **479 k** | 19 k (4 %) |
| j'ai copié 4 habitudes de ma manager pendant 3 mois… | 01/09 | 146 k | 4,6 k |
| quand j'étais rh, voilà ce qu'on faisait de vos candidatures | 18/09 | 139 k | 2,6 k |
| (depuis le 01/10, plus rien au-dessus de 5 k vues) | | | |

**Chez nous** (75 jours, souvent 1 ou 2 passages : ce sont des pistes) :

| ✅ Marche | Chez nous | ❌ Flop | r |
| --- | --- | --- | --- |
| les trucs sur lesquels tu DOIS MENTIR en entretien | 270 600 vues (ru) ; r 2,93 sur 3 passages (81f87361) | comment préparer un entretien sans apprendre une seule réponse par cœur | 0,24 |
| les trucs de recruteurs que je devrais pas dire à voix haute | 105 100 vues (de) | tu peux pas dire « va te faire foutre » au boulot, sauf de façon pro | 0,30 |
| 7 questions à poser quand le recruteur dit « vous avez des questions ? » | 75 700 vues | 6 étapes pour répondre à toutes les questions en entretien | 0,33 |
| ta période d'essai sert aussi à vérifier si la boîte te mérite | 46 900 vues | comment j'ai inventé une contre-offre pour négocier mon salaire | 0,47 |
| 6 erreurs débiles qui m'ont gardée au chômage pendant 9 mois (S) | 46 300 vues | 4 trucs à préparer pour un deuxième entretien | 0,47 |
| mes règles non négociables au travail pour garder ma santé mentale | 43 800 vues | | |
| quand j'étais rh, voilà ce qu'on faisait de vos candidatures | 21 900 vues | | |

- **Ce qui marche** : la transgression et le secret d'initiée (mentir, ce que les recruteurs taisent, « j'en suis pas fière »), le rapport de force inversé, et l'échec raconté puis réparé.
- **Ce qui flop** : le tuto de préparation générique, la provocation vulgaire et la fraude assumée.
- **Format gagnant** (post à 479 k) : 8 slides.
	- L'accroche sur un autoportrait au miroir, en tailleur, le visage caché par le téléphone.
	- 6 items numérotés : « question du recruteur », puis « tu réponds », puis « la phrase », puis le pourquoi.
	- Une slide de fin qui fait commenter (« laquelle t'oses pas ? »).

## 4. Ce qu'on en tire

1. Un seul schéma prouvé au 15/10 : « mentir en entretien ». Sa preuve TikTok expire le 17/10, mais le r de 81f87361 la prend ensuite le relais. Les autres s'activeront quand leurs passages mûriront (`playbook --mesurer` chaque jour).
2. Garder la transgression dans l'accroche, mais **recadrer sans jamais inventer** dans les items.
3. Sophia sur l'item « apprendre un truc chaque jour », avec l'angle de conversation en entretien.
4. La source se tasse depuis le 1er octobre : la veille doit trouver d'autres comptes de la niche.
