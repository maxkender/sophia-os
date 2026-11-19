# Podz 22 — Originaux @built.not.born61 (Atala)

Atelier du podz 22, lancé par Adrien le 19/11. Module **isolé** du reste de
l'OS : ses propres dépendances (`package.json`), aucun import depuis `src/` ni
`supabase/`. L'agent suit `AGENT.md` ; `ANALYSE.md` analyse le compte modèle.

## Ce qu'il fait

Des originaux en anglais au style exact de
[@built.not.born61](https://www.tiktok.com/@built.not.born61) : des listes de
conseils pour hommes (slides blanches, titres League Spartan, images détourées
en noir et blanc, « Follow for more »). Un des conseils est « courir » : un
homme qui court détouré (banque de l'OS, label male_run) et le logo d'Atala à
côté. Les slides finies partent au label `built_run` (Atala seule, 0780).
Infra reprise des podz 19 et 20.

```
atelier/
  api.ts            constantes du podz (originaux_atala_built, en), appels à la fonction `pods`
  slides.ts         le rendu : couverture, conseil (buste ou objet), slide Atala, fin
  polices.ts        League Spartan, IBM Plex Sans, Arimo (Google Fonts, OFL)
  detourage.ts      BiRefNet sur fal, recadrage, noir et blanc
  cli-image.ts      images Seedream détourées
  cli-photos.ts     recherche dans la banque de l'OS (le coureur)
  cli-detourer.ts   détourage d'une photo de la banque
  cli-*.ts          veille, rendu, livrer, etat, boite
assets/atala/       l'icône d'Atala en 1024 px (celle des podz 19 et 20)
images/detoures/    les images détourées des posts
posts/bn-NNN.json   les originaux (versionnés)
sources/manifeste.json  ses posts qui marchent : la preuve
```
