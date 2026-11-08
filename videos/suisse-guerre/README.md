# « Why is Switzerland never at war? » — vidéo papier (FR, EN, DE, IT)

Vidéo verticale 1080×1920, 30 i/s, 45 s (36 s de récit + 9 s de séquence Sophia), style papier découpé, **sans texte ni son** (le texte et la musique s'ajoutent sur CapCut). Faite avec Remotion.

## Script et minutage

| Temps | Texte à poser sur CapCut | À l'écran |
|---|---|---|
| 0:00–0:03,6 | Switzerland hasn't fought a foreign war in over 200 years. Why? | Carte de l'Europe qui explose, la Suisse reste calme, drapeau |
| 0:03,6–0:08,4 | One: the Alps. Over half the country is mountains. Invading it is a nightmare. | Les Alpes jaillissent, les chars dégringolent |
| 0:08,4–0:13,2 | Two: in 1815, Europe's great powers officially recognized its neutrality. | Parchemin, couronnes qui signent, sceau de cire |
| 0:13,2–0:19,2 | But neutral isn't weak: most men serve in the army — and keep their rifle at home. | Chalet, guirlande de soldats, fusil au mur |
| 0:19,2–0:26,4 | In WW2, they rigged their Alpine tunnels with explosives. Invade, and you win… nothing. | Train, dynamite, BOUM, char bloqué, chalet-canon |
| 0:26,4–0:31,2 | And they're useful to everyone: banks, diplomacy, peace talks in Geneva. | Or, Croix-Rouge, colombes, poignée de main à Genève |
| 0:31,2–0:36 | Attacking Switzerland costs too much. Leaving it alone pays more. | Balance bombes / pièces |
| 0:36–0:45 | Answer all these questions with the Sophia app. | Téléphone : accueil Sophia → clic sur Start → cours → 2 quiz → « Lesson complete » |

Le récit est ralenti par `STRETCH` (×1,2) et les tremblements de caméra par `SHAKE_K` (0,35), dans `src/lib.ts`.
La séquence Sophia (`src/scenes/Outro.tsx`) utilise la capture d'accueil `public/sophia-home.webp` et la police Plus Jakarta Sans (`public/fonts`).

## Langues, voix, bruitages et sous-titres

- `src/langues/<langue>/script.json` : le texte de chaque scène, ses repères (mot ↔ image de la scène), la voix ElevenLabs,
  les textes de l'appli Sophia (accueil, cours, quiz, fin) et la légende. Une langue = un dossier (en, fr, de, it).
- `node scripts/voix.mjs --langue fr` : voix horodatée de la langue (`public/audio/<langue>/`, `src/langues/<langue>/voix-*.json`).
- `node scripts/langues.mjs` : régénère `src/langues/index.ts` (les langues complètes).
- `node scripts/bruitages.mjs` : la banque de bruitages `public/sfx/*.mp3` (ElevenLabs Sound Effects), une seule fois par son.
- `src/timeline.ts` : la durée de chaque scène vient de la voix de la langue, les repères calent les moments forts sur les mots.
- `src/Sound.tsx` : voix + bruitages, baissés quand la voix parle. `src/Captions.tsx` : sous-titres façon CapCut.
- `src/scenes/Outro.tsx` : la fin Sophia ; l'accueil part de la capture anglaise (`public/sophia-home.webp`) dont les textes
  sont recouverts par leur traduction.
- Composition `SuisseGuerre`, props `{"langue": "fr", "sousTitres": true}`.

Le moteur Motion (`videos/moteur/moteur.mjs`, skill `motion`) fait tout ça depuis la page Motion de l'OS :
`NODE_USE_ENV_PROXY=1 node videos/moteur/moteur.mjs rendre --projet suisse-guerre --langue fr`.

## Commandes

```bash
npm i
npm run dev                      # Remotion Studio (aperçu)
npx remotion render SuisseGuerre out/suisse-why-never-at-war-45s.mp4 --codec=h264 --crf=18
```

Dans le conteneur cloud, ajouter `--browser-executable=/opt/pw-browsers/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell`.

- `scripts/geo.mjs` régénère `src/geo.json` (carte de l'Europe projetée, depuis `world-atlas`).
- `public/grain.jpg` : texture de papier (bruit ffmpeg).
- Une scène = un fichier dans `src/scenes/`, chacune est aussi une composition à part dans le Studio (dossier « Scenes »).
