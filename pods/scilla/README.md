# Podz 33 — Originaux @scilla2047 (Artura)

Atelier du podz 33, lancé par Adrien le 27/11. Module **isolé** du reste de
l'OS : ses propres dépendances (`package.json`), aucun import depuis `src/` ni
`supabase/`. L'agent suit `AGENT.md` ; `ANALYSE.md` analyse le compte modèle.

## Ce qu'il fait

Des originaux en anglais au format exact de
[@scilla2047](https://www.tiktok.com/@scilla2047) (carrés blancs, texte natif
TikTok : un titre noir, un paragraphe en couleur, une œuvre dessous), sur
l'angle « réapprendre à regarder, apprécier l'art ». **Sans IA** : chaque
image est un vrai tableau du domaine public (Met Open Access). **Artura** est
un des points, avec son **logo** à côté de l'œuvre, jamais une capture. Les
slides finies partent au label `scilla_art` (Artura seule, 0870). Infra
reprise du podz 30.

```
atelier/
  api.ts            constantes du podz (originaux_scilla, Artura, en), appels à la fonction `pods`
  slides.ts         le rendu : couverture, point, slide Artura (œuvre + logo)
  polices.ts        TikTok Sans Medium et SemiBold, OFL
  cli-oeuvre.ts     cherche et garde une œuvre du domaine public au Met (bords noirs retirés)
  cli-*.ts          veille, photos, rendu, livrer, etat, boite
assets/artura/      l'icône d'Artura
images/oeuvres/     les tableaux (fiche de chacun dans `oeuvres` du post)
posts/sc-NNN.json   les originaux (versionnés)
sources/manifeste.json  ses 30 posts les plus vus : la preuve
```
