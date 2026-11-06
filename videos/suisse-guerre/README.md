# « Why is Switzerland never at war? » — vidéo papier 30 s

Vidéo verticale 1080×1920, 30 i/s, 30 s, style papier découpé, **sans texte ni son** (le texte et la musique s'ajoutent sur CapCut). Faite avec Remotion.

## Script et minutage

| Temps | Texte à poser sur CapCut | À l'écran |
|---|---|---|
| 0:00–0:03 | Switzerland hasn't fought a foreign war in over 200 years. Why? | Carte de l'Europe qui explose, la Suisse reste calme, drapeau |
| 0:03–0:07 | One: the Alps. Over half the country is mountains. Invading it is a nightmare. | Les Alpes jaillissent, les chars dégringolent |
| 0:07–0:11 | Two: in 1815, Europe's great powers officially recognized its neutrality. | Parchemin, couronnes qui signent, sceau de cire |
| 0:11–0:16 | But neutral isn't weak: most men serve in the army — and keep their rifle at home. | Chalet, guirlande de soldats, fusil au mur |
| 0:16–0:22 | In WW2, they rigged their Alpine tunnels with explosives. Invade, and you win… nothing. | Train, dynamite, BOUM, char bloqué, chalet-canon |
| 0:22–0:26 | And they're useful to everyone: banks, diplomacy, peace talks in Geneva. | Or, Croix-Rouge, colombes, poignée de main à Genève |
| 0:26–0:30 | Attacking Switzerland costs too much. Leaving it alone pays more. | Balance bombes / pièces, retour à la carte (boucle) |

## Commandes

```bash
npm i
npm run dev                      # Remotion Studio (aperçu)
npx remotion render SuisseGuerre out/suisse-why-never-at-war.mp4 --codec=h264 --crf=17
```

Dans le conteneur cloud, ajouter `--browser-executable=/opt/pw-browsers/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell`.

- `scripts/geo.mjs` régénère `src/geo.json` (carte de l'Europe projetée, depuis `world-atlas`).
- `public/grain.jpg` : texture de papier (bruit ffmpeg).
- Une scène = un fichier dans `src/scenes/`, chacune est aussi une composition à part dans le Studio (dossier « Scenes »).
