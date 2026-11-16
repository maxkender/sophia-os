# Podz 18 — Originaux @iinspogiirly (Sophia)

Atelier du podz 18, lancé par Adrien le 16/11. Module **isolé** du reste de
l'OS : ses propres dépendances (`package.json`), aucun import depuis `src/` ni
`supabase/`. L'agent suit `AGENT.md` ; `ANALYSE.md` analyse le compte.

## Ce qu'il fait

Des originaux en anglais au style exact de [@iinspogiirly](https://www.tiktok.com/@iinspogiirly) :
« 4 apps every girl needs », sa couverture en trois photos l'une sous l'autre,
puis une slide par appli (nom, icône de l'App Store, une phrase). D'autres
applis que les siennes, douces et pour les filles (jamais de cycle), dont
Sophia (jamais la première ni la dernière). Les slides finies partent au label
`inspogirly` (Sophia seul, 0733). Infra reprise du podz 17 (Appshelf).

```
atelier/
  api.ts          constantes du podz (originaux_inspogirly, en), appels à la fonction `pods`
  slides.ts       le rendu : couverture en trois bandes, slides d'appli
  polices.ts      TikTok Sans SemiBold (taille optique 36), le texte natif de TikTok
  cli-appli.ts    les vraies applis de l'App Store (recherche, planche, icône et fiche)
  cli-image.ts    photos Seedream pour la couverture (format `bande`)
  cli-*.ts        veille, rendu, livrer, etat, boite
assets/sophia/     l'icône de Sophia (App Store, 1024 px)
images/applis/     les applis recommandées : icône et fiche.json
images/photos/     les photos des couvertures (Seedream)
posts/ig-NNN.json  les originaux (versionnés)
sources/manifeste.json  ses posts qui marchent : la preuve
```
