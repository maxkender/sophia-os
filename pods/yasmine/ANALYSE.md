# Pod 10 — @yasminespixels pour micabo : analyse du 23 octobre 2026

Sources des données :
- un relevé TikTok en direct sur Apify (60 derniers posts du compte, 0,14 $) ;
- la base de prod (`mbikecieskoobeizixig`), en lecture seule.

---

## 1. Le compte

| | |
| --- | --- |
| Compte | [@yasminespixels](https://www.tiktok.com/@yasminespixels), 16 k abonnés, « that girl / studytok » en anglais |
| Ses succès | La rentrée de juillet. **1,5 M** vues pour « how I organise my phone », **835 k** pour « the perfect after school routine », 282 k pour « school lunch », **185 k** pour « how I take notes » (8,4 % d'enregistrements) |
| Aujourd'hui | Elle publie peu : 2 posts en 30 jours, 4 k vues médianes. Ses formats restent bons, c'est le compte qui s'est arrêté |
| Concurrents | Aucune appli de révision citée. Deux posts montrent d'autres applis (son Notion, « my favorite productivity apps ») : exclus |

## 2. Son style (relevé sur ses slides)

- **Format** : 1080 × 1920.
- **Couverture** : une photo pleine, le titre en capitales jaunes (Inter Black, `#fef79d`) en escalier, une écriture fine blanche (« how I », « for each subject »).
- **Slides intérieures** : la même photo assombrie d'environ 30 %, et l'un de ces trois éléments :
  - un **iPad** avec des notes (modèles, puis notes remplies façon GoodNotes) ;
  - un **iPhone** avec des captures ;
  - des **cartes « Notes »** blanches sur des photos.
- **Légendes** : en Poppins jaune pâle, au-dessus et au-dessous de l'appareil, en minuscules (« basic », « best for: any subject », « great for revision! »).
- **Ton** : grande sœur, simple, une idée par slide.

## 3. Pourquoi ça marche pour micabo

- Ses formats montrent déjà des **outils d'étude sur un écran**. La slide micabo n'y est pas plaquée : c'est un écran de plus, une vraie capture de l'appli.
- Le public est le nôtre : des élèves et des étudiants qui révisent.
- micabo est une appli de révision : on y dépose ses cours ou ses notes, elle en fait des quiz et des flashcards, 10 minutes par jour jusqu'à l'examen.

## 4. Ce qu'on en a fait

- **Le label `that_girl_study`**, qui sert micabo seul. Aucun compte n'y est rattaché : Adrien et Max choisissent les comptes micabo qui le portent.
- **Des images finies** : le texte est dans l'image, donc un deck par langue. **Français seulement** pour l'instant (décision du 23/10). Plus tard, d'autres langues, avec les captures traduites.
- **Pas ses photos ni ses écrans.** Ses écrans montrent ses données et d'autres applis, et TikTok repère les images reprises. On prend une photo de la banque de l'OS, nos propres notes, et les vraies captures de micabo.
- **Le pilote `yp-001`**, « comment je prends mes notes pour chaque matière », en 10 slides :
  - 4 modèles (la base, Cornell, par blocs, carte mentale) ;
  - 4 pages remplies : photosynthèse, Révolution française, trigonométrie, Première Guerre mondiale ;
  - la slide micabo, avec le parcours « La plante, productrice de matière organique », cohérent avec la page de photosynthèse.
- **L'ordre des suivants** : `sources/manifeste.json`.
