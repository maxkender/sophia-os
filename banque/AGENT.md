# Banque d'images (Pinterest)

Tu remplis la banque d'images de l'OS avec des images cherchées sur Pinterest
(demande d'Adrien du 19/11). La banque passe avant les podz : un label sans
image ne peut rien livrer. Atala (running) est partie de zéro, 0 image sous ses
labels et 140 photos de course dans toute la banque de l'OS.

## Ce que tu produis

Des images **propres**, rangées sous un ou plusieurs labels. Tout podz d'un de
ces labels les retrouve avec sa commande `images` et les dépose comme une image
d'import nettoyée. Une image :

- verticale **9:16**, 720 px de large au moins (l'outil recadre et refuse le reste) ;
- **sans texte, ni logo en sujet, ni filigrane** ;
- avec une **légende en anglais** qui dit qui, quoi, où et la lumière : c'est
  elle que les podz lisent pour chercher (`images --cherche "track night"`).

## Le tour, en quatre commandes

Dans `banque/`, une fois par session : `npm install`.

| Commande | Ce qu'elle fait |
|---|---|
| `npm run chercher -- --max 60 "men running aesthetic" "trail running man aesthetic"` | Lance le scraper Pinterest (Apify) : chaque argument est une recherche par mots-clés, ou l'adresse d'un tableau, d'un compte ou d'une recherche Pinterest. Les candidates s'ajoutent à `donnees/candidats.json`. Écartées d'office : vidéos, GIF, images pas verticales ou trop petites. |
| `npm run planche -- --requete "men\|man\|male" --n 3` | Sort les planches à trier, `sortie/planches/<numéro>.jpg`, 40 images chacune, montrées comme elles seront versées. Sous chaque image : les 6 caractères de son empreinte et sa taille ; une étiquette rouge si la description sent la pub ou la marque. |
| `npm run verser -- --labels male_run --planche 1 donnees/tri-1.json` | Verse les images gardées et écarte le reste de la planche. `--essai` ne verse rien et écrit les images recadrées dans `sortie/verser/` : regarde-les avant de verser. |
| `npm run etat` | Par label d'Atala : images propres, dont celles de Pinterest ; versées depuis 24 h ; candidates qui restent à trier. |

`npm test` vérifie la lecture des épingles, les filtres et le recadrage.

Un **tableau Pinterest rempli à la main** (par Max ou Adrien, pour fixer une
direction artistique) se lit comme une recherche : donne son adresse à
`chercher`.

## Le tri (c'est toi qui regardes)

Lis chaque planche avec l'outil de lecture d'image, puis écris le fichier de
décisions, une ligne par image **gardée** :

```json
[
  { "ref": "c4dfbf", "legende": "shirtless man crouching on a red running track at night under a floodlight, seen from behind" },
  { "ref": "f3ff1e", "legende": "man in black running on a track at night under a stadium floodlight", "visage": true, "cadrage": "haut" }
]
```

- `cadrage` : `centre` (défaut), `haut`, `bas`, `gauche`, `droite`, quand le
  sujet n'est pas au milieu.
- `labels` : seulement si l'image va ailleurs que `--labels`. Une image neutre
  (piste vide, chaussures, route au lever du jour) va à tous les labels de
  course : `--labels male_run,clean_girl_run,classic_girl_run`.
- `visage: true` dès qu'un visage est reconnaissable : l'OS ne la proposera ni
  en photo de profil ni aux autres labels.

**On écarte** :

- tout texte posé sur l'image : citation, titre, statistiques d'une appli
  (distance, allure), capture d'écran ;
- un dossard lisible, un nom, une plaque ;
- une pub ou une photo de marque (étiquette rouge, logo en gros plan, produit
  mis en scène), et toute appli concurrente d'Atala à l'écran. Un logo petit
  sur une chaussure ou une chaussette ne compte pas ;
- un visage reconnaissable **en gros plan et de face**, un enfant, un athlète
  connu. On préfère le dos, la silhouette, le flou, le cadrage qui coupe ;
- un collage de plusieurs photos, un filigrane, une image floue ou sale ;
- un doublon : la même photo revient sous deux empreintes quand elle a été
  remise en ligne. Garde la plus grande.

**On garde** ce qui tient la direction artistique du label (`labels_proposes`,
section `atala` de la Bible) : `male_run`, running homme ; `classic_girl_run`,
coureuse en photo d'iPhone ; `clean_girl_run`, clean girl, calme. `manga_tok`
n'est pas de la photo de course : ne le remplis pas avec cet outil.

## Règles

- **Regarde avant de verser.** `--essai`, puis une planche des images
  recadrées : un texte ou un collage se voit mal en vignette.
- **Rien d'inventé.** Une légende décrit ce qu'on voit, pas ce qu'on suppose.
- Le plafond est de 400 images versées sur 24 h (`banque_jetons.par_jour`).
  `quota_images` : arrête-toi, reprends demain.
- Une image versée par erreur : donne son id à l'humain, ne la supprime pas
  toi-même. `media_origines` garde l'adresse de l'épingle de chaque image.
- `donnees/` et `sortie/` restent hors de git.

## Accès

- **Pinterest** : par Apify, acteur `epctex/pinterest-scraper`. Le jeton Apify
  est injecté par le proxy de la session (hôte `api.apify.com`) ; hors session,
  `APIFY_TOKEN`. Les images se téléchargent sur `i.pinimg.com`, qui doit être
  dans les hôtes autorisés de l'environnement.
- **OS** : fonction Edge `banque`, en-tête `x-banque-jeton`. Le jeton vient de
  `BANQUE_JETON` (environnement de la session) : ne l'affiche jamais, ne l'écris
  dans aucun fichier.

Coût mesuré le 19/11 : 0,0015 $ la recherche (15 épingles), puis 0,0001 $
l'épingle. Douze recherches de 60 épingles ont rendu 359 candidates pour
0,05 $. Environ une épingle sur trois est trop petite (736 px de large en 4:5).
