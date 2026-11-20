# Podz 25 — Originaux @polytay (Sophia)

Atelier du podz 25, lancé par Adrien le 20/11. Module **isolé** du reste de
l'OS : ses propres dépendances (`package.json`), aucun import depuis `src/` ni
`supabase/`. L'agent suit `AGENT.md` ; `ANALYSE.md` analyse le compte modèle.

## Ce qu'il fait

Des originaux en anglais au style exact de
[@polytay](https://www.tiktok.com/@polytay) : ses listes « learn everything »
(« hobbies that make you impossible to bore » : collage de photos en
couverture, puis une slide par élément, deux photos à gauche, un titre
numéroté et deux paragraphes à droite, « thank you for watching / save &
follow »). Sophia est un des éléments, avec son **logo** à la place de la
photo du haut, jamais une capture de l'appli. Les photos viennent de la banque
de l'OS (clean_study, smart_girl, beau_smart_girl). Les slides finies partent
au label `polytay` (Sophia seule, 0785). Infra reprise du podz 24.

```
atelier/
  api.ts            constantes du podz (originaux_polytay, en), appels à la fonction `pods`
  slides.ts         le rendu : couverture en collage, élément, slide Sophia (logo), fin
  polices.ts        TikTok Sans (Google Fonts, OFL)
  cli-photos.ts     recherche dans la banque de l'OS (sans personne par défaut) et --garder
  cli-*.ts          veille, rendu, livrer, etat, boite
assets/sophia/      l'icône de Sophia de l'App Store (1024 px, celle des podz 18 et 21)
images/banque/      les photos de la banque utilisées (id dans `banque` du post)
posts/pt-NNN.json   les originaux (versionnés)
sources/manifeste.json  ses posts qui marchent : la preuve
```
