# Podz 28 — Originaux @charl.focus (Sophia)

Atelier du podz 28, lancé par Adrien le 24/11. Module **isolé** du reste de
l'OS : ses propres dépendances (`package.json`), aucun import depuis `src/` ni
`supabase/`. L'agent suit `AGENT.md` ; `ANALYSE.md` analyse le compte modèle.

## Ce qu'il fait

Des originaux en **espagnol** au style exact de
[@charl.focus](https://www.tiktok.com/@charl.focus) : ses guides « cómo
arreglar tu DOPAMINA » (slides noires carrées en Montserrat, couverture en six
images avec le mot clé en capitales, puis « 1 · … » et des paragraphes
justifiés aux mots en gras, des photos à droite ou en bas, la fin sans
numéro). Sophia prend la place de sa slide d'appli (unrespiro, concurrente),
avec son **logo** en haut de la colonne, jamais une capture. Les images
viennent de Seedream (IRM en fausses couleurs, silhouettes, objets) ou de la
banque de l'OS. Les slides finies partent au label `charl` (Sophia seule,
0857). Infra reprise des podz 27 et 26.

```
atelier/
  api.ts            constantes du podz (originaux_charl, es), appels à la fonction `pods`
  slides.ts         le rendu : couverture en six images, point (colonne ou bas), slide Sophia (logo), fin
  polices.ts        Montserrat Light, Regular, SemiBold, Bold (Google Fonts, OFL)
  cli-image.ts      une image Seedream (photo sombre carrée, ou IRM avec --scan)
  cli-photos.ts     recherche dans la banque de l'OS et --garder
  cli-*.ts          veille, rendu, livrer, etat, boite
assets/sophia/      l'icône de Sophia de l'App Store (celle des podz 18, 21, 25 et 27)
images/photos/      les images Seedream du podz
posts/ch-NNN.json   les originaux (versionnés)
sources/manifeste.json  ses 30 posts les plus vus : la preuve
```
