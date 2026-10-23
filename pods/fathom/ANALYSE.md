# Pod 11 — @fathom0g pour Sophia : analyse du 23 octobre 2026

Sources des données :
- un relevé TikTok en direct sur Apify (60 derniers posts du compte, 0,14 $) ;
- l'App Store (fiches de Sophia et d'UnSwipe) ;
- la base de prod (`mbikecieskoobeizixig`), en lecture seule.

---

## 1. Le compte

| | |
| --- | --- |
| Compte | [@fathom0g](https://www.tiktok.com/@fathom0g), « Fathomly », 91 k abonnés, en anglais (Royaume-Uni) |
| Ce que c'est | Le compte de **Fathomly**, une appli concurrente de Sophia : « Like Duolingo, but for everything you learn » |
| Rythme | 60 diaporamas du 31/07 au 20/10, souvent un par jour ; aucune vidéo |
| Vues | Médiane **32 k** ; tubes à **3,6 M** (« 10/10 Skills You Can Learn In A Day! »), **2,9 M** et 2,5 M (« 5 Pointless Skills That Make You Instantly Cooler »), **818 k** et 626 k (« 5 Ways To Be Unrecognisable In 6 Months ») |
| Enregistrements | **5 à 9 %** des vues : des listes qu'on garde |
| Accroches | Recyclées : « 5 Ways To Be Unrecognisable » en 5 variantes, « 10/10 Skills To Learn Before You Are 25 » 4 fois |

## 2. Son format (relevé sur ses slides)

- **Format** : 1080 × 1920 (1124 × 2000 chez lui), fond blanc `#fdfdfd`.
- **Couverture** : le titre en capitales condensées (Anton), le chiffre et les mots forts en bronze (`#c4823c` → `#ad6a2b`), et sa mascotte (une figurine en pâte à modeler, un philosophe qui tire ou pousse).
- **Étapes** : un titre géant (Anton, la ligne la plus longue bord à bord), puis la **carte d'une vraie vidéo YouTube** telle que l'appli iOS l'affiche (miniature, durée, avatar, titre, « chaîne · vues · date »), parfois une ligne dessous (« 2–3 hours to learn. »).
- **Fin** : sa slide Fathomly (« FATHOMLY / LIVE ON APPSTORE », l'icône, « Like Duolingo, but for everything you learn. », « DOWNLOAD FROM LINK IN BIO »). Ses deux plus gros tubes (3,6 M et 2,9 M) n'en avaient pas.
- **Autres formats** : des listes d'applis (icône, nom en couleur, une phrase), des listes de vidéos YouTube sans titre.

## 3. Pourquoi ça marche pour Sophia

- **Sophia** est une appli de culture générale : « apprends un truc nouveau chaque jour en 5 minutes » (App Store : « Sophia : Culture Générale », 4,6 ★, 26 langues).
- Fathomly lui fait concurrence de front : sa slide de fin devient la slide Sophia, dans son propre format. Ce n'est pas plaqué, c'est sa place.
- **UnSwipe** (« tes réseaux, sans les Reels ») a aussi sa place naturelle dans plusieurs de ses accroches : « DELETE SOCIAL MEDIA », « Instead Of Scrolling », « Based On Your ScreenTime », « Build Peak Intelligence ». C'est la **double intégration** : UnSwipe sur l'étape qui s'y prête, Sophia à la fin, dans le même deck.

## 4. Ce qu'on en a fait

- **Le label `Fathomly`**, qui sert Sophia seul (migration 0343). Aucun compte n'y est rattaché : Adrien et Max choisissent les comptes Sophia anglais (21 comptes) qui le portent.
- **Des images finies** : le texte est dans l'image, donc un deck par langue. **Anglais d'abord** (décision du 23/10) ; une autre langue demande des vidéos YouTube dans cette langue.
- **Jamais ses images** : ni sa mascotte (sa marque), ni ses captures. Notre couverture porte une statue du domaine public (Met Museum, CC0), détourée : Hercule et le lion de Némée, dont le bronze répond au titre.
- **De vraies vidéos** : `npm run youtube` relève les résultats de YouTube et les chiffres exacts ; aucune carte n'est inventée.
- **Le pilote `fa-001`**, « 5 Ways To Be Unrecognisable In 6 Months » (son post à 818 k), en 7 slides :
	- leur « DELETE SOCIAL MEDIA » devient « QUIT SHORT VIDEOS », avec la carte UnSwipe (« keep Instagram, lose the Reels. no need to delete anything. ») ;
	- quatre vraies vidéos : TEDx (lecture, 3,4 M), Dr Thomas Smithyman (contact visuel, 374 k), GTN (course, 2 M), TED-Ed (sommeil, 2,6 M) ;
	- Sophia à la fin, sur le modèle de sa slide Fathomly, sans « link in bio ».
- **L'ordre des suivants** : `sources/manifeste.json`.
