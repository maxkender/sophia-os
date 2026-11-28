# Podz 32 — Remakes @msclzz (Sophia)

Atelier du podz 32, lancé par Adrien le 27/11. Module **isolé** du reste de
l'OS : ses propres dépendances (`package.json`), aucun import depuis `src/` ni
`supabase/`. L'agent suit `AGENT.md` ; `ANALYSE.md` analyse le compte modèle.

## Ce qu'il fait

Des remakes en anglais des guides de psychologie sociale de
[@msclzz](https://www.tiktok.com/@msclzz) qui ont marché (« How To Make People
Remember You ») : fond noir, titres en capitales aux mots en violet,
paragraphes courts, une image noir et blanc détourée par slide. **Sans IA** :
ses propres images (jamais une célébrité), découpées sur son fond noir ;
jamais sa vente. **Sophia** est une étape du milieu, avec son **logo**,
jamais une capture. Les slides finies partent au label `msclzz` (Sophia
seule, 0869). Infra reprise du podz 31.

```
atelier/
  api.ts            constantes du podz (remakes_msclzz, Sophia, en), appels à la fonction `pods`
  slides.ts         le rendu : couverture, avertissement, étape, la slide Sophia (son logo)
  polices.ts        Manrope Bold et Golos Text SemiBold, OFL
  cli-compte.ts     reprend une de ses images, découpée sur son fond noir (sans IA)
  cli-*.ts          veille, photos, rendu, livrer, etat, boite
assets/sophia/      l'icône de Sophia (App Store)
images/compte/      ses images reprises (provenance : index.json)
images/banque/      les photos de la banque de l'OS (dernier recours)
posts/mc-NNN.json   les remakes (versionnés)
sources/manifeste.json  ses 30 posts les plus vus : la preuve
```
