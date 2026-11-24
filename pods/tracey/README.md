# Podz 26 — Originaux @traceygreen589 (Atala + Artura)

Atelier du podz 26, lancé par Adrien le 24/11 : le **premier podz qui sert
deux applis**. Module **isolé** du reste de l'OS : ses propres dépendances
(`package.json`), aucun import depuis `src/` ni `supabase/`. L'agent suit
`AGENT.md` ; `ANALYSE.md` analyse le compte modèle.

## Ce qu'il fait

Des originaux en anglais au style exact de
[@traceygreen589](https://www.tiktok.com/@traceygreen589) : ses listes
« 10/10 hobbies that actually work if you have adhd » (fond blanc, Arial, une
IRM en couverture, un loisir par slide avec une photo et une colonne de
texte). Chaque post porte **deux slides d'appli** : « running » avec le logo
d'Atala sur une photo de course de la banque, et « learning to look at art »
avec le logo d'Artura sur un tableau de la banque. Au dépôt, chacune est
marquée `position_app: "atala"` / `"artura"` ; l'OS en tire une variante par
appli. Les slides finies partent au label `tracey` (Atala et Artura, 0854).

```
atelier/
  api.ts            constantes du podz (originaux_tracey, en, ses deux applis), appels à la fonction `pods`
  slides.ts         le rendu : couverture, loisir (mots soulignés), slides d'appli (logo sur la photo)
  polices.ts        Arimo (Google Fonts, OFL)
  cli-photos.ts     recherche dans la banque de l'OS (course, tableaux) et --garder
  cli-image.ts      photos de loisirs et IRM de couverture (Seedream)
  cli-*.ts          veille, rendu, livrer, etat, boite
assets/atala/       l'icône d'Atala (1024 px, celle des podz 19 à 24)
assets/artura/      l'icône d'Artura (1024 px, envoyée par Adrien le 24/11)
images/banque/      les photos de la banque utilisées (id dans `banque` du post)
images/photos/      les photos Seedream (loisirs, IRM)
posts/tg-NNN.json   les originaux (versionnés)
sources/manifeste.json  ses posts qui marchent : la preuve
```
