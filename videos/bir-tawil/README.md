# « What would happen if a supervolcano woke up? » : vidéo papier (EN, puis FR, DE, IT)

Vidéo verticale 1080×1920, 30 i/s, environ 60 s (50 s de récit + 9 s de séquence Sophia), style papier découpé, voix ElevenLabs,
bruitages et sous-titres façon CapCut. Faite avec Remotion, sur le modèle de `videos/suisse-guerre`.

## Scènes (voix anglaise)

| Scène | Texte | À l'écran |
|---|---|---|
| S1 `S1Sleep` | A supervolcano sleeps under Yellowstone… minute by minute. | Coupe de Yellowstone : la chambre magmatique dort (œil fermé), le geyser, puis l'œil s'ouvre ; chronomètre |
| S2 `S2Flow` | In the first minutes, clouds of burning ash… no chance. | Éruption, la nuée ardente rattrape une voiture ; vue du dessus : cercles de distance, tout est recouvert |
| S3 `S3Column` | Within an hour, a column of ash shoots more than 30 kilometers into the sky. | Colonne qui jaillit, avion à 10 km, règle d'altitude, champignon à 30 km, éclairs |
| S4 `S4Ashfall` | In the next days, ash falls over much of North America… ground planes far away. | Calendrier ; carte de l'Amérique du Nord couverte de cendres ; toits qui cèdent ; avions interdits de vol |
| S5 `S5Veil` | Within weeks, sulfur gas veils the Sun across the whole planet. | Globe (d3-geo), anneau de soufre, le Soleil s'éteint, rayons renvoyés |
| S6 `S6Winter` | For years, the world gets a few degrees colder… go hungry. | Thermomètre qui chute, givre, neige, blé fané, assiette qui se vide |
| S7 `S7Tambora` | Sounds crazy? In 1816… a year without a summer. | Spirale, vieille photo sépia du Tambora face à la silhouette de Yellowstone ; plage sous la neige |
| S8 `S8Calm` | The good news?… no sign of the next one. | Yellowstone au calme ; ruban du temps (640 000 ans, mammouth, feu, pyramide) ; scientifique, sismographe plat, coche |

Chaque scène est conçue à la vitesse de la voix anglaise (`BASE` dans `src/timeline.ts`, pas d'étirement global : `STRETCH = 1`).
Les repères de `src/langues/en/script.json` (mot ↔ image de la scène) recalent les moments forts sur la voix des autres langues.

## Fichiers propres à ce sujet

- `src/volcan.tsx` : les formes papier du sujet (pins, bison, geyser, chronomètre, calendrier, voiture, nuée, maison, avion, thermomètre, blé, parasol, scientifique, etc.).
- `src/geo-na.json` (généré par `scripts/geo-na.mjs`) : l'Amérique du Nord projetée, Yellowstone repéré.
- `public/sophia-home.webp` : la capture d'accueil Sophia (anglais) de ce cours.
- `public/sfx` : la banque du modèle + éruption, nuée, voiture, craquement, magma, souffle, geyser, avion, tonnerre, blizzard, givre, tic-tac, calendrier, oiseaux, vagues, spirale, extinction.

## Commandes

```bash
npm i
npm run dev                                   # Remotion Studio
node scripts/planche.mjs /tmp/planche.jpg 5 60 95 175 245   # planche de contrôle (images globales)
NODE_USE_ENV_PROXY=1 node ../moteur/moteur.mjs rendre --projet supervolcan --langue en
```

Composition `Supervolcan`, props `{"langue": "en", "sousTitres": true}`.
