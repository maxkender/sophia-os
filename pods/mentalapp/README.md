# Pod 6 — Remakes @mentalapp (Sophia)

Atelier du pod 6 (voir Notion « Pods » → « Pod 6 »). Module **isolé** du reste
de l'OS : ses propres dépendances (`package.json`), aucun import depuis `src/`
ni `supabase/`. L'agent suit `AGENT.md`.

## Ce qu'il fait

Il refait **à l'identique** les tier lists « mentalmaxxing » de @mentalapp
(depuis le 16/09) pour promouvoir **Sophia** (relance du 15/11 ; UnSwipe du
17/10 au 4/11) : mêmes images au pixel près, textes retapés en Inter Tight,
leur appli (Journey) remplacée par l'élément Sophia (« learn, then scroll
(apps like Sophia) »), livrés en images finies au label `mentalmaxxing`
(Sophia seul), en anglais pour le test.

```
atelier/
  api.ts            constantes du pod, manifeste des posts source, appels à la fonction `pods`
  geometrie.ts      lit les pixels : lignes et blocs de texte (noir, gris, teinté sur case colorée), images
  transcription.ts  le fichier posts/<id>.json que remplit l'agent
  rendu.ts          slide refaite : textes effacés puis réécrits à leur place, élément Sophia
  app.ts            légende Sophia par langue, icône
  metadonnees.ts    retrait des métadonnées d'un JPEG
  cli-releve.ts     relevé Apify de @mentalapp + slides (budget 1 $ / semaine)
  cli-geometrie.ts  images annotées + squelette de transcription
  cli-rendu.ts      rendu de toutes les langues
  cli-apercu.ts     planche de relecture (source + langues)
  cli-livrer.ts     rendu + dépôt dans la file de validation
  cli-etat.ts       file, rangs, vues et r
  original.ts       original à 100 % : couverture + tableau composés avec les images des slides relevées
  carrousel.ts      original au format carrousel : couverture + un item par slide (format @mentalapp du 18/10)
  cli-original.ts   rendu d'un original (tier list ou carrousel), planche, dépôt (sans source : rang original)
assets/sophia_icone.jpg    icône App Store de Sophia (unswipe_icone.jpg : celle d'UnSwipe, plus servie)
polices/                   Inter Tight ExtraLight / Light / Regular / SemiBold (SIL OFL)
posts/<id>.json            transcriptions et traductions (versionnées)
originaux/<id>.json        originaux à 100 % (mm-oNNN, versionnés)
sources/manifeste.json     posts source et leur statut (versionné ; les slides, non)
```

## Comment le rendu reste « tout pareil »

- **Effacer** : chaque ligne de texte est recouverte de la couleur de l'aplat
  autour d'elle (le fond, ou la case colorée d'un rang), puis l'encre isolée
  restée autour (point d'un « ? ») part aussi. Les traits fins du tableau sont
  rétablis s'ils ont été touchés.
- **Taille** : calée pour que chaque ligne anglaise retapée en Inter Tight ait
  la largeur d'encre mesurée dans l'original ; ExtraLight et lettres plus
  serrées pour les grands titres.
- **Place** : même ligne de base, même alignement ; une traduction plus large
  glisse dans l'espace libre puis rapetisse (jamais sous 72 %), et deux
  traductions voisines qui se touchent se partagent la place.
- **Sophia** : l'icône App Store arrondie à la place de la leur, la légende
  de la langue dessous, à la taille de la leur.

## Livraison dans l'OS

Le label sert Sophia seul (0723, 15/11) : la fonction `pods` reçoit un deck
par langue (l'anglais pour le test), la slide de l'élément Sophia marquée
`position_sophia`, sous l'id suffixé `-s` (`idDepot`), et note la pertinence
Sophia et la note d'import avec les vues du post source (70 %). Validé
(Pilotage → Pods, ou automatiquement 5 h après le dépôt), le contenu entre
dans la réserve Sophia du label au rang de sa note.

Jusqu'au 4/11, le label servait UnSwipe seul (variante UnSwipe tirée de la
slide `position_app`) ; ses 62 contenus UnSwipe sont rejetés depuis 0723.
