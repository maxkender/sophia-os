# Podz 30 — Originaux @highlevelgame_ (Artura)

Atelier du podz 30, lancé par Adrien le 25/11. Module **isolé** du reste de
l'OS : ses propres dépendances (`package.json`), aucun import depuis `src/` ni
`supabase/`. L'agent suit `AGENT.md` ; `ANALYSE.md` analyse le compte modèle.

## Ce qu'il fait

Des originaux en anglais au style exact de
[@highlevelgame_](https://www.tiktok.com/@highlevelgame_) : ses conseils de
séduction pour hommes en cartes de texte (papier blanc cassé, serif bordeaux,
« HOW TO … » en capitales, un conseil par carte, « The rule underneath all of
it », « Follow so you don't miss what's next. »). **Artura** est un des
conseils : « Know how to talk about art. », avec un vrai tableau du domaine
public (Met Open Access) et le **logo** d'Artura, jamais une capture. Les
slides finies partent au label `highlevel_art` (Artura seule, 0862). Infra
reprise du podz 29.

```
atelier/
  api.ts            constantes du podz (originaux_highlevel, Artura, en), appels à la fonction `pods`
  slides.ts         le rendu : couverture, conseil, carte Artura (tableau + logo), « Follow »
  polices.ts        Vollkorn Regular, Medium, SemiBold et Noto Emoji (la main), OFL
  cli-oeuvre.ts     cherche et garde une œuvre du domaine public au Met (bords noirs retirés)
  cli-*.ts          veille, photos, rendu, livrer, etat, boite
assets/artura/      l'icône d'Artura (envoyée par Adrien le 24/11)
images/fonds/       le papier (Seedream, teinté)
images/oeuvres/     les tableaux des cartes Artura (fiche de chacun dans `oeuvres` du post)
posts/hl-NNN.json   les originaux (versionnés)
sources/manifeste.json  ses 30 posts les plus vus : la preuve
```
