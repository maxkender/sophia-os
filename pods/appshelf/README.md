# Podz 17 — Originaux @theappshelf (Sophia)

Atelier du podz 17, lancé par Adrien le 15/11. Module **isolé** du reste de
l'OS : ses propres dépendances (`package.json`), aucun import depuis `src/` ni
`supabase/`. L'agent suit `AGENT.md` ; `ANALYSE.md` analyse le compte.

## Ce qu'il fait

Des originaux en anglais au style exact de [@theappshelf](https://www.tiktok.com/@theappshelf) :
cinq vraies applis par post, dont Sophia (jamais la première ni la dernière),
leurs captures de l'App Store et une note façon iOS Notes. Les slides finies
partent au label `appshelf` (Sophia seul, 0730). Infra reprise des podz 13, 15 et 16.

```
atelier/
  api.ts          constantes du podz (originaux_appshelf, en), appels à la fonction `pods`
  slides.ts       le rendu : couverture (`bibliotheque` ou `carte`), slides d'appli, fin
  polices.ts      Inter Display SemiBold et Medium, Inter Regular, Playfair Display Italic
  cli-appli.ts    les vraies applis de l'App Store (recherche, planche, téléchargement)
  cli-image.ts    photos Seedream
  cli-*.ts        veille, rendu, livrer, etat, boite
assets/sophia/     l'icône de Sophia et ses 3 vraies captures (ecran-1 à 3 : accueil, quiz, cours fini)
images/applis/     les applis recommandées : icône, 3 captures, fiche.json
images/            les photos des posts (Seedream)
posts/as-NNN.json  les originaux (versionnés)
sources/manifeste.json  ses posts qui marchent : la preuve
```
