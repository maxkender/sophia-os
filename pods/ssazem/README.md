# Podz 31 — Remakes @ssazem (Sophia)

Atelier du podz 31, lancé par Adrien le 27/11. Module **isolé** du reste de
l'OS : ses propres dépendances (`package.json`), aucun import depuis `src/` ni
`supabase/`. L'agent suit `AGENT.md` ; `ANALYSE.md` analyse le compte modèle.

## Ce qu'il fait

Des remakes en anglais des posts de [@ssazem](https://www.tiktok.com/@ssazem)
qui ont marché : cinq citations de réconfort par post, sa photo en carte
arrondie sur un cadre noir, du grain, la phrase en Times minuscule coupée en
deux blocs (le début à gauche, la suite à droite). **Sans IA** : ses propres
photos (jamais une célébrité ni un personnage), son texte effacé par copie de
texture. **Sophia** est une des cinq phrases, avec son **logo**, jamais une
capture. Les slides finies partent au label `ssazem` (Sophia seule, 0868).
Infra reprise du podz 27.

```
atelier/
  api.ts            constantes du podz (remakes_ssazem, Sophia, en), appels à la fonction `pods`
  slides.ts         le rendu : la carte arrondie, le grain, la phrase en deux blocs, le logo de Sophia
  polices.ts        Tinos (les métriques de Times New Roman), OFL
  cli-compte.ts     reprend une de ses photos, son texte effacé (copie de texture, sans IA)
  cli-*.ts          veille, photos, rendu, livrer, etat, boite
assets/sophia/      l'icône de Sophia (App Store)
images/compte/      ses photos reprises, texte effacé (provenance : index.json)
images/banque/      les photos de la banque de l'OS (dernier recours)
posts/sz-NNN.json   les remakes (versionnés)
sources/manifeste.json  ses 40 posts les plus vus et leurs slides reprenables : la preuve
```
