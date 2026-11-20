# Podz 23 — Remakes @studyingsmiski (micabo)

Atelier du podz 23, lancé par Adrien le 20/11. Module **isolé** du reste de
l'OS : ses propres dépendances (`package.json`), aucun import depuis `src/` ni
`supabase/`. L'agent suit `AGENT.md` ; `ANALYSE.md` analyse le compte modèle.

## Ce qu'il fait

Des remakes en anglais des posts de
[@studyingsmiski](https://www.tiktok.com/@studyingsmiski) qui ont marché : ses
listes d'applis et ses guides d'étude « cozy » (ciel en papier froissé, cartes
en timbre, stickers détourés, bulles à la main). Partout où elle met Turbo AI,
on met micabo, avec son nouveau logo. Ses personnages (Smiski, Snoopy…) sont
remplacés par nos stickers Seedream. Les slides finies partent au label
`cozy_study` (micabo seul, 0782). Infra reprise des podz 18 et 22.

```
atelier/
  api.ts            constantes du podz (remakes_studyingsmiski, en), appels à la fonction `pods`
  slides.ts         le rendu : couverture, carte d'appli, slide micabo, stickers, polaroids, bulles
  polices.ts        Fredoka, Figtree, Gaegu (Google Fonts, OFL)
  detourage.ts      BiRefNet sur fal
  cli-image.ts      stickers détourés, fonds et photos Seedream
  cli-appli.ts      les vraies applis de l'App Store (icône et fiche)
  cli-*.ts          veille, rendu, livrer, etat, boite
assets/micabo/      le nouveau logo de micabo (1024 px, envoyé par Adrien le 20/11)
images/             stickers, fonds, photos, applis (icônes et fiches)
posts/sm-NNN.json   les remakes (versionnés)
sources/manifeste.json  ses posts qui marchent : la preuve
```
