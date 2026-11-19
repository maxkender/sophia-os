# Podz 21 — Originaux @bdnf.milly (Sophia)

Atelier du podz 21, lancé par Adrien le 19/11. Module **isolé** du reste de
l'OS : ses propres dépendances (`package.json`), aucun import depuis `src/` ni
`supabase/`. L'agent suit `AGENT.md` ; `ANALYSE.md` analyse le compte modèle.

## Ce qu'il fait

Des originaux en anglais au style exact de
[@bdnf.milly](https://www.tiktok.com/@bdnf.milly) : intelligence, mémoire,
concentration, en diaporamas de 4 slides sur un fond uni (Cormorant Garamond,
filets, petite image de neurosciences). Sophia n'y est qu'un logo, sur une
slide de conseil : lire une leçon chaque soir, comme un entraînement. Jamais
de nootropique ni de médicament conseillé. Les slides finies partent au label
`milly` (Sophia seule, 0779). Infra reprise des podz 18 et 20.

```
atelier/
  api.ts           constantes du podz (originaux_milly, en), appels à la fonction `pods`
  slides.ts        le rendu : couverture, contenu (paragraphes, image, puces), logo Sophia
  polices.ts       Cormorant Garamond (Google Fonts, OFL)
  cli-image.ts     images de neurosciences (Seedream sur fal)
  cli-molecule.ts  formules 2D de PubChem
  cli-*.ts         veille, rendu, livrer, etat, boite
assets/sophia/     l'icône de Sophia en 1024 px (celle du podz 18)
images/            les images des posts (IRM, neurones…)
posts/mi-NNN.json  les originaux (versionnés)
sources/manifeste.json  ses posts qui marchent : la preuve
```
