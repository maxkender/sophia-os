# Podz 19 — Originaux running (Atala)

Atelier du podz 19, lancé par Adrien le 19/11. Module **isolé** du reste de
l'OS : ses propres dépendances (`package.json`), aucun import depuis `src/` ni
`supabase/`. L'agent suit `AGENT.md` ; `ANALYSE.md` analyse les comptes.

## Ce qu'il fait

Des originaux en anglais et en français au style exact de
[@hannah.run5](https://www.tiktok.com/@hannah.run5) et
[@katrina.run](https://www.tiktok.com/@katrina.run) : les « do & don'ts » de la
course à pied, une couverture avec une coureuse détourée puis une slide par
moment (3 « Do », 2 « Don't », vignettes légendées). Le logo d'Atala est une
vignette parmi les « Do », jamais une page d'appli. Les slides finies partent
au label `dos_donts_run` (Atala seul, 0776). Infra reprise des podz 17 et 18.

```
atelier/
  api.ts          constantes du podz (originaux_atala, en et fr), appels à la fonction `pods`
  slides.ts       le rendu : couverture, do & don'ts (`objets` ou `photos`), grille
  polices.ts      Playfair Display, Red Hat Mono SemiBold (Google Fonts, OFL)
  cli-image.ts    objets détourés (BiRefNet) et photos Seedream
  cli-*.ts        veille, rendu, livrer, etat, boite
assets/atala/      l'icône d'Atala en 1024 px (celle de l'OS, agrandie par ESRGAN sur fal puis recomposée)
images/objets/     les vignettes détourées et la coureuse de couverture
images/photos/     les photos du style `photos`
posts/at-NNN.json  les originaux (versionnés)
sources/manifeste.json  leurs posts qui marchent : la preuve
```
