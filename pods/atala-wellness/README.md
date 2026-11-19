# Podz 20 — Originaux wellness (Atala)

Atelier du podz 20, lancé par Adrien le 19/11. Module **isolé** du reste de
l'OS : ses propres dépendances (`package.json`), aucun import depuis `src/` ni
`supabase/`. L'agent suit `AGENT.md` ; `ANALYSE.md` analyse le compte modèle.

## Ce qu'il fait

Des originaux en anglais au style exact de
[@healthy_with_emma6](https://www.tiktok.com/@healthy_with_emma6) : des listes
d'habitudes wellness façon notes (une couverture à deux photos, puis une
habitude par slide : titre souligné, intro, colonne de texte, photo, chute),
avec les photos de la banque de l'OS. Sa slide pub (5e) devient la slide
Atala : une fille qui court et la carte d'Atala. Les slides finies partent au
label `wellness_run` (Atala seul, 0778). Infra reprise du podz 19.

```
atelier/
  api.ts          constantes du podz (originaux_atala_wellness, en), appels à la fonction `pods`
  slides.ts       le rendu : couverture, habitude, slide Atala
  polices.ts      Inter fin et SemiBold (instances statiques, OFL)
  cli-photos.ts   recherche dans la banque de l'OS et téléchargement des photos gardées
  cli-*.ts        veille, rendu, livrer, etat, boite
assets/atala/      l'icône d'Atala en 1024 px (celle du podz 19)
images/banque/     les photos gardées (1400 px, sans métadonnées)
posts/aw-NNN.json  les originaux (versionnés)
sources/manifeste.json  ses posts qui marchent : la preuve
```
