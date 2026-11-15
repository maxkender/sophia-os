# Podz 15 — Remakes @sagace.fr (Sophia)

Atelier du podz 15, lancé par Adrien le 15/11. Module **isolé** du reste de
l'OS : ses propres dépendances (`package.json`), aucun import depuis `src/` ni
`supabase/`. L'agent suit `AGENT.md` ; `ANALYSE.md` analyse le compte.

## Ce qu'il fait

Il refait les listes « 10/10 » de [@sagace.fr](https://www.tiktok.com/@sagace.fr)
(« Compétence 10/10 à apprendre avant 20 ans ») pour **Sophia**, en français :
sa couverture à l'identique, ses compétences avec de vraies vidéos YouTube en
carte sombre, le temps qu'il faut, et Sophia en étape au milieu de la liste à
la place de sa slide « ABONNE-TOI ». Les slides finies partent au label
`sagace` (Sophia seul, 0724). Fork de l'atelier du podz 13 (Kaja).

```
atelier/
  api.ts          constantes du podz (remakes_sagace, fr), appels à la fonction `pods`
  slides.ts       le rendu : sa couverture (décor + lignes brun/noir à leur taille), les étapes, la carte Sophia
  dessin.ts       format, couleurs relevées chez lui, titres en Anton
  youtube.ts      la carte YouTube sombre et la recherche des vraies vidéos
  polices.ts      Anton, Inter Medium / Regular, Roboto Medium
  cli-*.ts        veille, youtube, rendu, livrer, etat, boite
assets/couverture.jpg      son décor, refait le 15/11 sans son texte ni son @ (huit couvertures fusionnées)
assets/applis/sophia.jpg   l'icône App Store de Sophia
posts/sg-NNN.json          les remakes (versionnés)
sources/manifeste.json     ses 17 posts, leurs compétences et l'ordre de travail
veille/comptes.json        le compte relevé par la veille
```

## Le décor de couverture

Toutes ses couvertures récentes portent la même illustration au même endroit.
`assets/couverture.jpg` garde, pixel par pixel, ce que huit d'entre elles ont
en commun (la médiane là où elles s'accordent, le plus clair ailleurs), puis
blanchit (`#fdfdfd`) la zone sous le « 10/10 » à gauche de la falaise : il ne
reste ni son texte ni « @sagace ».

## Livraison dans l'OS

La fonction `pods` reçoit un deck `fr`, la slide Sophia marquée
`position_sophia`. Validé (Pilotage → Pods, ou tout seul 5 h après le dépôt),
le contenu entre dans la réserve Sophia du label.
