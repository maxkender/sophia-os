---
name: motion
description: Moteur Motion de l'OS (vidéos motion design en papier découpé, en FR/EN/DE/IT, pilotées par la page /admin/motion). À utiliser quand une tâche planifiée réveille le moteur Motion, ou pour toute demande d'écrire le script, produire, traduire ou corriger une vidéo de la page Motion : prendre les tâches en attente, écrire le script, générer les voix ElevenLabs horodatées, rendre avec Remotion (bruitages, sous-titres, fin Sophia traduite) et livrer les vidéos à valider.
---

# Moteur Motion

La page **Motion** de l'OS (`/admin/motion`) pilote tout. Elle écrit des **tâches** dans `motion_taches`.
Toi, le moteur, tu les prends, tu fais le travail ici (Remotion, ElevenLabs, ffmpeg), et tu renvoies le
résultat par la fonction Edge `motion`. Tu ne publies jamais rien et tu ne valides jamais : seul l'admin
valide dans la page, et c'est la validation qui crée le post du compte MOTION de la langue.

Personne n'est là pour te répondre pendant une routine : ne pose pas de question, décide, et écris tes
doutes dans le journal de la vidéo (`journal`).

## 0. Démarrer

1. `git fetch origin main` puis travaille sur la branche `motion-moteur` (crée-la depuis `origin/main`,
   merge `origin/main` si elle existe). Jamais sur `main`.
2. `cd videos/<projet> && npm install` pour chaque projet que tu touches.
3. Vérifie `MOTION_JETON` dans l'environnement (sinon : écris dans ta réponse finale « jeton du moteur
   manquant : le générer dans la page Motion, Réglages, et l'ajouter à l'environnement » et arrête-toi).
4. Toutes les commandes passent par le proxy : `NODE_USE_ENV_PROXY=1` (déjà mis par le CLI pour ce qu'il lance).
   La clé ElevenLabs est injectée par le proxy pour `api.elevenlabs.io` : n'en mets jamais dans un fichier.

Le CLI : `NODE_USE_ENV_PROXY=1 node videos/moteur/moteur.mjs <commande>` (sans argument, il affiche l'aide).

## 1. La boucle

```
prendre  →  tâche « script » | « produire » | « corriger »  →  faire le travail  →  finir (ou echec)
```
Recommence `prendre` jusqu'à `{"tache": null}`, puis fais le compte rendu et arrête-toi.
Une tâche prise est verrouillée 3 h ; en cas d'erreur, `echec --tache T --erreur "…"` (re-tentée 3 fois).

## 2. Tâche `script` : écrire le script anglais

La vidéo a un `sujet`, parfois une `consigne`, et une `capture_url` : la capture de l'accueil Sophia
**en anglais** avec la carte du cours du sujet (fournie par l'admin, une par sujet).

Le script suit `videos/suisse-guerre/src/langues/en/script.json` (types : `src/langues/types.ts`) :
- **7 scènes**, ~85 mots, ~35 s à l'oral. S1 = accroche avec une question (« Why…? »). S7 = la chute.
  Phrases courtes, un fait par phrase, pas de chiffres inutiles.
- **Faits vérifiés**, formulations prudentes quand il le faut (ex. « foreign war » et pas « war »).
- `reperes` : dans chaque scène, 0 à 2 mots sur lesquels doit tomber un moment fort de l'animation
  (`{mot, image, ou?}` ; `mot` = un mot exact du texte, ponctuation comprise ; `image` = l'image de la
  scène où tombe l'événement ; `ou: "fin"` pour caler sur la fin du mot, ex. une explosion après le mot).
- `outro.texte` : « Answer all these questions with the Sophia app. »
- Écris pour l'oral : pas de « : » (pause forcée de la voix), « First, … / Second, … » plutôt que « One: … ».
- `appli` : les textes de l'appli. **Recopie de la capture** la catégorie, le titre, la description,
  « 100 k reads », etc. Écris la leçon (sous-titre + 2 paragraphes, 3 passages surlignés `{m}`) et
  **2 questions de quiz** dont la réponse est dans le script (`bonne` = index de la bonne réponse, B de
  préférence), et `fin` (écran de fin).
- `legende` : une phrase d'accroche + emoji + 5 hashtags dans la langue.
- `projet` : le dossier Remotion. Même sujet qu'un projet existant → réutilise-le. Sinon, nouveau projet
  (§5) : son slug en kebab-case.

Envoie : `moteur.mjs script --tache T --video V --fichier chemin.json --projet slug`. La page le montre à
l'admin, qui le modifie ou le valide (ce qui crée la tâche `produire`).

## 2 bis. Le style de la vidéo : `papier` ou `geographie`

La vidéo a un `style` (dans `video.style`, choisi par l'admin dans la page) :
- **`papier`** (par défaut) : papier découpé, personnages, gags (modèles `videos/moyen-age`, `videos/supervolcan`).
  Tout ce qui suit (§2, §5, §6) vaut pour ce style.
- **`geographie`** : une explication sur une **vraie carte du monde** (frontières Natural Earth, `world-atlas` 1:50 m,
  projection de Mercator). Modèle : `videos/geo-modele` (exemple « Why is Panama so important? »). **Aucune scène à
  dessiner** : une seule carte continue, pilotée par le champ `carte` de chaque scène du script.

### Script `geographie`

Même script que le papier (voix, `outro`, `appli`, `legende`, pas de « : »), 6 à 10 scènes, mais chaque scène a un
`carte` (types : `videos/geo-modele/src/langues/types.ts`, `CarteScene`) :
- `vue` : le cadrage au début de la scène, la caméra y **vole** depuis le cadrage précédent (recul au milieu si on va
  loin). `{"pays": ["France", "Germany"], "marge": 1.4}` (fait tenir ces pays à l'écran) ou
  `{"centre": [lon, lat], "zoom": 3}` (zoom 1 = le monde entier en largeur, 6 = un pays moyen, 15 = une ville).
- `vers` : un second cadrage pendant la scène, sur un mot (`"au": "Panama"`), pour un zoom ou un panoramique.
- `pays` : `[{ "noms": ["Panama"], "couleur": "jaune", "au": "Panama" }]` : les pays s'allument (couleurs : rouge,
  bleu, vert, jaune, orange, violet, gris, noir).
- `points` : `[{ "lieu": [lon, lat], "icone": "ville", "couleur": "bleu", "au": "York" }]` (icônes : ville,
  explosion, bateau, armee, montagne, or, drapeau, personne, usine, petrole, avion, epingle, couronne, blé).
- `fleches` : `[{ "de": [lon, lat], "a": [lon, lat], "par": [[lon, lat], …], "couleur": "rouge", "au": "sail" }]` :
  un trait en pointillés qui se dessine ; `par` = points de passage en mer (sinon la flèche coupe les continents),
  `courbe` = courbure d'un arc simple (0,25 par défaut, négatif = de l'autre côté).
- `zones` : `[{ "centre": [lon, lat], "rayon_km": 350, "couleur": "bleu", "au": "storms" }]` : un cercle qui s'étend.
- `garde: true` : garder les éléments de la scène jusqu'à la fin (sinon ils s'effacent à la scène suivante).
- `au` = un mot **exact** du texte de la scène, ponctuation comprise (comme les repères) ; sans `au`, l'élément arrive
  au début de la scène. Plusieurs éléments par scène, oui, mais un seul « moment » à la fois.
- Noms de pays : les noms anglais Natural Earth (`node scripts/pays.mjs panama` dans `videos/geo-modele`), quelques
  alias (USA, UK, Russie…). Un nom inconnu fait échouer le rendu : vérifie-les.
- Coordonnées vérifiées (longitude d'abord). Le Mercator coupe au 180e méridien : une flèche Asie → Amérique passe
  par l'Europe ; préfère des routes qui ne traversent pas le Pacifique d'un bord à l'autre.

### Rendu `realiste` (style des reels de cartes sur Instagram)

`"rendu": "realiste"` en tête du script (sinon `simple`) : fond en relief aux couleurs naturelles (Natural Earth I,
domaine public, reprojeté en Mercator par `scripts/satellite.py`, tuiles dans `public/sat/`, non commitées : `rendre`
et `lambda` les génèrent seuls la première fois, ~20 s), frontières fines, pays surlignés avec un contour lumineux,
flèches en trait lumineux (couleur `turquoise` conseillée pour les routes), sous-titres **un mot à la fois, blanc dans un
encadré rouge, en haut**, sons discrets de documentaire (souffle, tic, basse, nappe d'ambiance très basse) et
**aucun bruitage cartoon**. La caméra ne recule jamais au-delà du bord de la carte (zoom minimal ~2,3).

Et des **étiquettes** (texte sur la carte, à traduire dans chaque langue avec le script) :
`"etiquettes": [{ "texte": "New York", "lieu": [lon, lat], "style": "pastille", "au": "York", "cote": "bas" }]`
- `titre` : nom de lieu en capitales blanches (« SOUTH AMERICA », « PACIFIC ») ;
- `chiffre` : un nombre qui claque, en couleur (« 20,000+ KM », « SINCE 1999 ») ;
- `pastille` : étiquette orange reliée à un point (villes, escales) ; `cote` : droite (défaut), gauche, haut, bas.
Évite les chevauchements : une étiquette par zone de l'écran, pas de pastille sous l'encadré rouge du haut.

Avec une capture Sophia composée ou d'un autre cours, mets `"recouvrir": true` dans `appli` : la fin réécrit catégorie,
titre et description de l'accueil même en anglais.

### Production `geographie`

Nouveau sujet : copie `videos/geo-modele` dans `videos/<slug>` (sans `node_modules`, `out`, `public/audio`,
`src/langues/*/`), mets à jour `motion.json` (`composition`), `package.json` (`name`) et `src/Root.tsx` (id).
Puis comme §3 : scripts des langues (le `carte` ne se traduit pas, seuls les `au` changent : un mot de la langue),
voix, **planche** (le rendu de la carte est rapide), `rendre`, `livrer`. Si un sujet a besoin d'un nouvel élément de carte
(icône, type de tracé), ajoute-le dans `geo-modele/src/Carte.tsx` puis recopie-le.

## 3. Tâche `produire` : une langue (`langue`)

Le circuit (demande d'Adrien) : script validé → **vidéo anglaise seule** (tâche `produire` avec `langue: "en"`)
→ l'admin la valide → une tâche `produire` par autre langue. Pour un nouveau sujet, c'est donc pendant la
tâche anglaise que tu écris les scènes (§5) ; les autres langues réutilisent les mêmes scènes, il n'y a plus
qu'à traduire, faire la voix, rendre et livrer. Une ancienne tâche sans `langue` = toutes les langues.

Pour chaque langue de la vidéo (`fr, en, de, it` par défaut) :
1. `en-cours --video V --langue L`.
2. **Script de la langue** dans `videos/<projet>/src/langues/<L>/script.json` :
   - `en` : le script validé par l'admin (`video.script`), tel quel.
   - autres : **traduis-le toi-même**, naturel et parlé, pas mot à mot. Garde le même nombre de scènes
     et les mêmes `image` dans `reperes`, avec le `mot` correspondant **dans la langue** (vérifie qu'il
     est bien un mot de la scène). Traduis tout `appli` en reprenant les vrais libellés de l'appli :

| | commencer | jours | lectures | onglets | continuer | quiz |
|---|---|---|---|---|---|---|
| en | Start | DAYS | 100 k reads | Home, Library, Path, Practice, Profile | Continue | QUIZ · {n} OF 2 |
| fr | Commencer | JOURS | 100 k lectures | Accueil, Biblio, Parcours, Entraînement, Profil | Continuer | QUIZ · {n} SUR 2 |
| de | Starten | TAGE | 100 k Aufrufe | Start, Bibliothek, Pfad, Üben, Profil | Weiter | QUIZ · {n} VON 2 |
| it | Inizia | GIORNI | 100 k letture | Home, Biblioteca, Percorso, Ripasso, Profilo | Continua | QUIZ · {n} DI 2 |

   - **Texte dit = texte à l'oral** : jamais de « : » (ElevenLabs en fait une vraie pause), peu de points, une
     virgule seulement où on respire, « … » seulement pour un effet voulu (« you win… nothing »). Les blancs
     trop longs sont resserrés automatiquement par `voix` (`scripts/resserrer.mjs`, horodatages recalés).
     Garde-fou : `voix` remplace de lui-même « : », « ; » et les tirets du texte dit par une virgule (et corrige
     le script) ; relis alors la phrase, et vérifie que tes repères sont toujours des mots du texte.
   - Voix (dans `voix`) : en `nPczCjzI2devNBz1zQrb` (Brian, speed 1.06) ; fr `3HZyQcLKlT0a3RDeXVsP`
     (Guillaume, 1.18) ; de `NlRO8ABjJNJNYaRaLiPJ` (Konrad, 1.2, style 0.45) ; it `32vqZVYOe7sQVGys0soJ`
     (Roberto, 1.2). Modèle `eleven_multilingual_v2`. Pas d'espace avant « ? » / « : » en français dans le
     texte dit (les sous-titres coupent sur les espaces).
3. La capture : télécharge `capture_url` et convertis-la en `public/sophia-home.webp`
   (`ffmpeg -i capture.png public/sophia-home.webp`). Elle doit être une capture d'iPhone portrait de
   l'accueil, carte du cours en haut. Si sa carte n'est pas au même endroit que celle de la Suisse
   (titre sur deux lignes, etc.), ajuste les zones de `AccueilTraduit` et le tap de Start (`TAPS[0]`) dans
   `src/scenes/Outro.tsx`, et note-le dans le journal.
4. `voix --projet P --langue L`, puis contrôle le minutage : les pentes de chaque scène doivent rester
   entre ~0,5 et ~1,5 (sinon déplace ou retire un repère). Une langue trop longue (> 42 s de récit) :
   accélère la voix (speed max 1.2) ou resserre la traduction.
5. **Contrôle visuel avant le rendu complet** (obligatoire) : `node scripts/planche.mjs /tmp/planche.jpg <images…> --langue L`
   (15 à 30 images globales, mosaïque à l'échelle 0,3 ; le script existe dans `videos/supervolcan`, copie-le
   si le projet ne l'a pas), **regarde-la**, corrige.
6. Si la clé AWS est dans l'environnement (`REMOTION_AWS_ACCESS_KEY_ID`), rends sur **Remotion Lambda** :
   `lambda --projet P` (une fois par projet, et après chaque changement de scènes ou de voix), puis
   `rendre … --lambda` (tant que le quota AWS est à 10 : ~28 min pour 3 min 30, rendu en tranches ; après relèvement du quota et `REMOTION_LAMBDA_CONCURRENCE=100`, quelques minutes ; voir `videos/moteur/LAMBDA.md` §8). Après un échec Lambda, attendre ~15 min avant de relancer. Sinon, rendu local.
   `rendre --projet P --langue L` (la version postée, avec sous-titres, son à −14 LUFS ; ajoute `--sans-sous-titres`
   seulement si l'admin demande la version sans), puis `livrer --video V --projet P --langue L`.
7. `journal` à chaque étape importante. À la fin : `finir --tache T`.

## 4. Tâche `corriger`

La `consigne` est le commentaire de rejet de l'admin pour une `langue`. Applique-le au plus juste
(texte, traduction, scène, son, sous-titres…), régénère la voix si le texte a changé, refais le contrôle
visuel, `rendre`, `livrer`, `finir`. Si la consigne vaut pour toutes les langues, refais-les toutes.
Ce que l'admin redemande souvent devient une règle : ajoute-le au §6.

## 5. Nouveau sujet : écrire les scènes

Copie `videos/supervolcan` (le modèle le plus récent) dans `videos/<slug>` (sans `node_modules`, `out`, `public/audio`,
`src/langues/*/voix-*`), mets à jour `motion.json` (`composition`, `scenes`), `package.json` (`name`) et `src/Root.tsx`
(id de composition). Puis écris les scènes du sujet dans `src/scenes/` (autant que le script en a ; une scène = un
fichier, un SVG 1080×1920 via `Stage`). La bonne méthode (supervolcan) :

1. Génère d'abord la voix anglaise, puis calcule pour chaque scène son début, sa durée et l'image locale de chaque mot
   (même calcul que `construireTimeline`) : la scène se conçoit **à la vitesse de la voix anglaise** (`STRETCH = 1`,
   `BASE` = ces durées), chaque action tombe sur l'image de son mot.
2. Mets les repères de `script.json` sur les mots forts avec ces mêmes images (pente 1 en anglais) : les autres langues
   se recalent dessus.
3. Plusieurs plans dans une scène : glissement de page (`translate` sur 10 images) entre deux groupes, comme S2, S4, S7, S8.
4. Planches de contrôle, corrections, puis rendu.

- **Bibliothèque papier** (`src/shapes.tsx`) : `Boom`, `Ring`, `Debris`, `FlagPole`, `SwissFlagRect`,
  `RedCrossRect`, `Tank`, `Chalet`, `DollChain`, `Rifle`, `Train`, `Dynamite`, `Crown`, `Coin`, `GoldBar`,
  `Dove`, `Handshake`, `Bomb`, `Cloud`, `Rays`, `Mountain`, `Sparkle` ; et (`src/volcan.tsx`) `Pine`, `Bison`, `Pool`,
  `Steam`, `Stopwatch`, `Calendar`, `Car`, `Billow` (nuée/fumée), `House` (toit qui cède), `Plane`, `NoSign`,
  `Thermometer`, `Fall` (neige/cendres), `Wheat`, `Parasol`, `Sandcastle`, `Scientist`, `Check`, `Mammoth`, `Pyramid`,
  `Volcano`, `Bolt`, `Embers`, `blob`/`smooth` (formes organiques). Cartes : `scripts/geo.mjs` (Europe),
  `scripts/geo-na.mjs` (Amérique du Nord ; attention aux pays à cheval sur l'antiméridien, comme les États-Unis) ;
  globe : `geoOrthographic` de d3-geo (S5 du supervolcan).
  Ajoute ce qui manque **dans la bibliothèque**, pas dans la scène, pour qu'il serve aux prochains sujets.
- **Outils** (`src/lib.ts`) : `useFrame()` (le temps de la scène, déformé par la voix), `pop`, `lerp`,
  `ease`, `camera`, `shake`, `boil`, filtres `url(#pp)` / `url(#ppl)` (bord déchiré + ombre).
- `src/timeline.ts` : mets dans `BASE` la durée de conception de chaque scène (images).
- `src/Sound.tsx` : `PAR_SCENE`, les bruitages de chaque scène sur ses événements (banque `public/sfx`,
  générée par `scripts/bruitages.mjs` ; un son qui manque s'ajoute à `BRUITAGES` puis se génère une fois).
- La fin Sophia (`src/scenes/Outro.tsx`) et les sous-titres ne changent pas d'un sujet à l'autre, sauf `Decor`
  (les bouts de papier qui flottent derrière le téléphone) : mets-y des formes du sujet, jamais celles d'un autre.
- Mix : les gros impacts (éruption, explosion, craquement) dits pendant la voix restent à 0,5–0,6 ; au-dessus,
  ils couvrent la voix.

## 6. Règles de qualité (retours de l'admin)

- **Chaque nombre dit a son unité** (« treize mille kilomètres », jamais « treize mille » seul), même si elle vient d'être dite.
- **Voix fluide** : pas plus vite que speed 1,1 en français ; on ne coupe pas les blancs entre les mots d'une phrase
  (geo-modele/scripts/resserrer.mjs : fins de phrase et virgules seulement, avec fondu).

- Papier découpé : fond kraft, couleurs franches, ombres, bords qui vibrent légèrement. **Aucun texte dans
  les visuels** (seulement les sous-titres et l'interface de l'appli).
- **Très dynamique** : une action toutes les 1 à 2 s, transitions déchirure / panoramique fouetté entre scènes.
- **Peu de tremblements** : `SHAKE_K = 0.35`, pas de secousse forte hors des gros impacts.
- Rythme : le récit dure ~36 s en anglais (un poil plus que 30 s). Pentes de scène ≥ 0,5.
- Voix fluide : aucun « : » dans le texte dit, blancs resserrés (0,28 s max entre deux phrases).
- La voix passe devant les bruitages (baisse automatique sous la voix) ; son final à −14 LUFS.
- Sous-titres : 1 à 3 mots, majuscules, mot prononcé en jaune ; zone y 1240–1500 (en haut pendant la fin Sophia).
- Fin : la capture Sophia de l'admin, traduite, puis Start → cours → 2 quiz → leçon terminée.

## 7. Compte rendu

À la fin de la routine : ce que tu as pris, ce que tu as livré (langues, durées), ce qui a échoué et
pourquoi, tes doutes. Commit + push de tes changements de code sur `motion-moteur` (les vidéos rendues
ne se commitent pas : `out/` est ignoré).
