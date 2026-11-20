# Podz 23 — Remakes @studyingsmiski (Sophia)

Atelier du podz 23, lancé par Adrien le 20/11. Module **isolé** du reste de
l'OS : ses propres dépendances (`package.json`), aucun import depuis `src/` ni
`supabase/`. L'agent suit `AGENT.md` ; `ANALYSE.md` analyse le compte modèle.

## Ce qu'il fait

Des remakes en anglais des posts de
[@studyingsmiski](https://www.tiktok.com/@studyingsmiski) qui ont marché : ses
listes d'applis et ses guides d'étude « cozy » (ciel en papier froissé, cartes
en timbre, stickers détourés, bulles à la main). Partout où elle met Turbo AI,
on met Sophia, avec sa vraie icône. Ses personnages (Smiski, Snoopy…) sont
remplacés par nos stickers Seedream. Les slides finies partent au label
`cozy_girl` (Sophia seule, 0782 puis 0783 : créé pour micabo, passé à Sophia le
20/11). Infra reprise des podz 18 et 22.

```
atelier/
  api.ts            constantes du podz (remakes_studyingsmiski, en), appels à la fonction `pods`
  slides.ts         le rendu : couverture, carte d'appli, slide Sophia, stickers, polaroids, bulles
  polices.ts        Fredoka, Figtree, Gaegu (Google Fonts, OFL)
  detourage.ts      BiRefNet sur fal
  cli-image.ts      stickers détourés, fonds et photos Seedream
  cli-appli.ts      les vraies applis de l'App Store (icône et fiche)
  cli-*.ts          veille, rendu, livrer, etat, boite
assets/sophia/      l'icône de Sophia de l'App Store (1024 px, celle du podz 18)
images/             stickers, fonds, photos, applis (icônes et fiches)
posts/sm-NNN.json   les remakes (versionnés)
sources/manifeste.json  ses posts qui marchent : la preuve
```
