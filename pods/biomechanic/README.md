# Podz 24 — Originaux @thebiomechanic (Atala)

Atelier du podz 24, lancé par Adrien le 20/11. Module **isolé** du reste de
l'OS : ses propres dépendances (`package.json`), aucun import depuis `src/` ni
`supabase/`. L'agent suit `AGENT.md` ; `ANALYSE.md` analyse le compte modèle.

## Ce qu'il fait

Des originaux en anglais au style exact de
[@thebiomechanic](https://www.tiktok.com/@thebiomechanic) : ses tier lists
« … Tierlist For Optimal Health (Science based) » (fond blanc, Playfair
Display, jauge « CORTISOL », un élément par slide du F au S tier, une photo).
Un des tiers est « courir » : une photo de course de la banque de l'OS (labels
male_run, clean_girl_run, classic_girl_run) avec le logo d'Atala à côté.
Toutes les photos viennent de la banque. Les slides finies partent au label
`biomechanic_run` (Atala seule, 0784). Infra reprise des podz 20 et 22.

```
atelier/
  api.ts            constantes du podz (originaux_atala_biomechanic, en), appels à la fonction `pods`
  slides.ts         le rendu : couverture (et sa jauge), tier, slide Atala
  polices.ts        Playfair Display, Arimo (Google Fonts, OFL)
  cli-photos.ts     recherche dans la banque de l'OS (banques de course par défaut) et --garder
  cli-image.ts      croquis et tête de couverture (Seedream)
  detourage.ts      BiRefNet sur fal (la tête de couverture)
  cli-*.ts          veille, rendu, livrer, etat, boite
assets/atala/       l'icône d'Atala en 1024 px (celle des podz 19 à 22)
images/banque/      les photos de la banque utilisées (id dans `banque` du post)
images/dessins/     tête au cerveau et croquis de couverture
posts/bm-NNN.json   les originaux (versionnés)
sources/manifeste.json  ses posts qui marchent : la preuve
```
