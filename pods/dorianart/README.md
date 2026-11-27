# Podz 34 — Icebergs @dorian.frog (Artura)

Atelier du podz 34, lancé par Adrien le 27/11. Module **isolé** du reste de
l'OS : ses propres dépendances (`package.json`), aucun import depuis `src/` ni
`supabase/`. L'agent suit `AGENT.md` ; `ANALYSE.md` analyse ses icebergs.

## Ce qu'il fait

Des originaux en anglais au format des **icebergs de loisirs** de
[@dorian.frog](https://www.tiktok.com/@dorian.frog) (« Iceberg of ADHD
hobbies », « Iceberg of Autistic hobbies » : sa couverture à l'ovale, puis
l'iceberg par étages, chaque loisir en objet détouré). **Sans IA** : sa
couverture (texte effacé sur l'aplat), un iceberg dessiné par code, de vrais
objets du Met (domaine public) détourés sur leur fond. **Artura** est un des
loisirs, avec son **logo**, jamais une capture. Les slides finies partent au
label `dorian_art` (Artura seule, 0871). Infra reprise du podz 33 ; ses
autres formats restent au podz 16 (Sophia).

```
atelier/
  api.ts            constantes du podz (originaux_dorian_art, Artura, en), appels à la fonction `pods`
  slides.ts         le rendu : sa couverture, l'iceberg en facettes (dessiné), étages, objets, logo d'Artura
  polices.ts        Inter Regular, OFL
  cli-objet.ts      cherche un objet du Met et le détoure sur son fond uni (sans IA)
  cli-oeuvre.ts     une peinture du domaine public au Met
  cli-*.ts          veille, photos, rendu, livrer, etat, boite
assets/             sa couverture (texte effacé), l'icône d'Artura
images/objets/      les objets détourés (fiche de chacun dans `oeuvres` du post)
posts/da-NNN.json   les icebergs (versionnés)
sources/manifeste.json  ses icebergs : la preuve
```
