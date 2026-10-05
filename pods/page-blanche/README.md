# Pod 1 — Page blanche (Sophia)

Atelier du premier pod (voir Notion « Pods » → « Pod 1 »). Module **isolé** du
reste de l'OS : ses propres dépendances (`package.json`), aucun import depuis
`src/` ni `supabase/`.

## Étape 1 (ce qui est livré ici) : gabarit + rendu

Reproduire les posts de @amayareading **à l'identique en français** : même mise
en page, mêmes photos, même police, mêmes soulignés. Seule la slide de l'app
change (ReadUp → Sophia, captures en emplacement réservé tant qu'on n'a pas les
vraies). Les JPEG sortent **sans aucune métadonnée** (ni EXIF, ni XMP, ni ICC,
ni C2PA).

```
atelier/
  geometrie.ts      lit les pixels d'une slide : lignes de texte, blocs, images
  rendu.ts          slide traduite → JPEG (Inter, soulignés dessinés, photos recadrées)
  metadonnees.ts    retrait des segments de métadonnées d'un JPEG, sans réencodage
  cli-geometrie.ts  géométrie + image annotée (boîtes numérotées) pour un dossier
  cli-rendu.ts      rend un post à partir de sa transcription
polices/            Inter Regular / Medium (SIL Open Font License)
posts/
  CONSIGNES.md      règles de transcription / traduction
  manifeste.json    les 18 posts scrapés : stats, légende, musique, statut
  <id>.fr.json      transcription anglaise + traduction française, par slide
```

### Lancer

```bash
cd pods/page-blanche && npm install
node atelier/cli-geometrie.ts <slides> <sortie>            # boîtes + annotations
node atelier/cli-rendu.ts <slides> posts/<id>.fr.json <sortie>
```

Node ≥ 22.18 (exécute le TypeScript directement).

### Comment le rendu reste « tout pareil »

- **Positions** : chaque bloc garde sa position d'origine (première ligne de base,
  marge gauche, ou bord droit / centre pour les blocs alignés ainsi).
- **Taille de police** : calibrée pour que la ligne anglaise la plus longue ait
  exactement la largeur mesurée dans l'original.
- **Interligne** : mesuré sur l'original (écart entre lignes de base).
- **Largeur** : celle de la colonne d'origine, élargie seulement si le français
  ne tient pas, et ligne par ligne (une photo peut commencer à côté de la 2e
  ligne d'un bloc). En dernier recours la police descend, jamais sous 84 %.
- **Photos, logos** : recadrées depuis la source, au pixel près.

### Ce qui n'est pas couvert à cette étape

- Posts hors gabarit (photo plein écran avec texte incrusté, tier list) : voir
  `manifeste.json`, statut `exclu`.
- Transcription / traduction automatiques : faites ici à la main (sous-agents).
  À l'étape 2, l'atelier les fera seul (vision + traduction).

## Étape 2 : livraison dans l'OS

```
pod (hors OS)                       OS
cli-livrer.ts ──deposer──▶ fonction `pods` ──▶ pod_livraisons (à valider)
  rend chaque langue          (jeton x-pod-jeton,       │
  JPEG sans métadonnées        images → medias/pods/…)  ▼
                                          Pilotage → Pods : Valider / Rejeter
                                                        │ valider : note d'import
                                                        ▼ classique → rang C/B/A
                                     contenu `livre` dans le label white_bg
                                     → tierlist → assignation → poster
```

- **Dépôt** : `POD_JETON=… node atelier/cli-livrer.ts <slides> <post_id|all> --langues fr`
  (`--essai <dossier>` écrit les requêtes au lieu de les envoyer). Une langue
  n'est livrée que si `posts/<id>.<langue>.json` existe. Un post sans slide de
  l'app n'est pas déposé (rien à promouvoir).
- **Validation** (admin, Pilotage → Pods) : la fonction calcule la note d'import
  comme pour un slideshow importé (30 % pertinence via le prompt `pertinence`,
  70 % vues source) ; sous le seuil la livraison est « écartée », sinon un
  contenu `livre` naît au rang C, B ou A dans le label du pod.
- **Diffusion** : rien de spécial. Pour un contenu `livre`, l'assignation prend
  l'image de la langue du compte (`contenu_langues.slides[].media_id`), ne
  traduit pas, ne place pas l'app, et passe au contenu suivant si la langue n'a
  pas été livrée (`supabase/functions/_shared/pods.ts`).
- **Captures** : `assets/sophia/<langue>/` (repli anglais), fiche App Store
  anglaise partout.
- **Jeton** : seul son SHA-256 est en base (`pods.jeton_hash`) ; le jeton vit
  dans l'environnement de l'agent (`POD_JETON`).
