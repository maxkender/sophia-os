# Podz 16 — Originaux @dorian.frog (Sophia)

Atelier du podz 16, lancé par Adrien le 15/11. Module **isolé** du reste de
l'OS : ses propres dépendances (`package.json`), aucun import depuis `src/` ni
`supabase/`. L'agent suit `AGENT.md` ; `ANALYSE.md` analyse le compte.

## Ce qu'il fait

Des originaux en anglais, allemand, italien, portugais du Brésil, turc, suédois, néerlandais et hongrois au style exact de [@dorian.frog](https://www.tiktok.com/@dorian.frog) :
icebergs de hobbies et listes « 5 niche… » sur fond blanc, Sophia en item de la
liste ou en hobby de l'iceberg. Les slides finies partent au label `dorian`
(Sophia seul, 0729). Infra reprise des podz 13 et 15.

```
atelier/
  api.ts            constantes du podz (originaux_dorian, en), appels à la fonction `pods`
  slides.ts         le rendu des deux formats (liste, iceberg)
  polices.ts        Inter Display Light, Inter Light, Inter Regular
  cli-image.ts      images Seedream, objets détourés (BiRefNet) pour l'iceberg
  cli-tableau.ts    tableaux du domaine public de l'Art Institute of Chicago
  cli-*.ts          veille, rendu, livrer, etat, boite
assets/grenouille.png           sa grenouille, détourée de sa couverture
assets/iceberg-couverture.jpg   sa couverture d'iceberg, texte effacé
assets/iceberg.jpg              son iceberg, vidé de ses objets (Seedream)
assets/sophia/                  l'icône de Sophia et ses écrans (captures de l'appli, 15/11) dans leur téléphone
images/                         les images des posts (tableaux, Seedream) et images/objets/ (détourées)
posts/dr-NNN.json               les originaux (versionnés)
sources/manifeste.json          ses posts qui marchent : la preuve
```
