# Podz 27 — Originaux @raretheory_ (Sophia)

Atelier du podz 27, lancé par Adrien le 24/11. Module **isolé** du reste de
l'OS : ses propres dépendances (`package.json`), aucun import depuis `src/` ni
`supabase/`. L'agent suit `AGENT.md` ; `ANALYSE.md` analyse le compte modèle.

## Ce qu'il fait

Des originaux en anglais au style exact de
[@raretheory_](https://www.tiktok.com/@raretheory_) : ses listes « topic to
research when u're bored » (fond bordeaux, Arial Narrow crème, une couverture
au titre justifié avec deux petites photos, puis une catégorie et ses sujets
par slide, la fin en paragraphe justifié avec sa dernière phrase en gras).
Sophia est un point du milieu de la liste (« 05 — one lesson a day »), avec
son **logo** à la place de la petite photo, jamais une capture de l'appli.
Les photos de couverture viennent de la banque de l'OS (clean_study,
smart_girl, beau_smart_girl). Les slides finies partent au label
`raretheory` (Sophia seule, 0856). Infra reprise du podz 25.

```
atelier/
  api.ts            constantes du podz (originaux_raretheory, en), appels à la fonction `pods`
  slides.ts         le rendu : couverture, catégorie, point, slide Sophia (logo), fin
  polices.ts        Arimo Regular et Bold (Google Fonts, OFL), resserrées au rendu
  cli-photos.ts     recherche dans la banque de l'OS (sans personne par défaut) et --garder
  cli-*.ts          veille, rendu, livrer, etat, boite
assets/sophia/      l'icône de Sophia de l'App Store (celle des podz 18, 21 et 25)
images/banque/      les photos de la banque utilisées (id dans `banque` du post)
posts/rt-NNN.json   les originaux (versionnés)
sources/manifeste.json  ses 30 posts les plus vus : la preuve
```
