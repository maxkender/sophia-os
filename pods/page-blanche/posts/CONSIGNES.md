# Consignes de transcription / traduction — pod Page blanche (étape 1)

Objectif : reproduire un post @amayareading À L'IDENTIQUE en français. Seule la
slide de l'app change (ReadUp → Sophia). Mise en page, photos, ordre : tout pareil.

## Fichier à produire : `posts/<post_id>.fr.json`
```json
{ "post_id": "…", "slides": { "1": { "textes": { "T1": { "en": ["ligne 1", "ligne 2"], "fr": "texte [[souligné]]" } },
                                      "images": { "I1": "garder" } } } }
```
- Une entrée par bloc `T…` et par image `I…` de la géométrie (`<id>_<n>.geo.json`, image annotée `<id>_<n>.annote.png` : vert = texte, rouge = image).
- `en` : le texte anglais de CHAQUE ligne détectée du bloc, dans l'ordre, exactement comme écrit (sert à calibrer la taille de police). Autant d'entrées que de `lignes` dans la géométrie.
- `fr` : la traduction du bloc entier, sans retour à la ligne (le moteur coupe lui-même).
- `alignement` (facultatif) : `"droite"` ou `"centre"` si le bloc l'est dans l'original et qu'il ne fait qu'une ligne.

## Règles de traduction
- Français naturel, oral, tutoiement, minuscules en début de phrase comme l'original. Pas de traduction mot à mot.
- **Longueur ≈ celle de l'anglais (au plus +10 % de caractères)** : la place est fixe. Raccourcis si besoin.
- Soulignés : entoure de `[[ ]]` l'équivalent français de chaque passage souligné dans l'original.
- Garde chiffres, « 10/10 », ponctuation expressive (« !! »), mentions entre parenthèses.
- Slide « sources » : titre traduit, références laissées telles quelles (copie l'anglais dans `fr`).

## La slide de l'app (la SEULE qui change)
- Toute mention de ReadUp (ou d'une appli qui bloque TikTok) devient **l'appli Sophia** : appli de culture générale, « un truc nouveau chaque jour en 5 minutes » (histoire, art, sciences, philo…).
- **Sophia ne bloque aucune appli** : ne jamais l'écrire. Réécris la phrase pour qu'elle soit vraie et naturelle dans le contexte (ex. « je remplace mon scroll par 5 minutes sur l'appli Sophia »), même longueur, même ton, même soulignés.
- Images : capture d'écran de ReadUp (téléphone vert, livre ReadUp) → `"sophia_capture"` ; petit bandeau App Store de ReadUp → `"sophia_appstore"` ; photos, logos (OpenAI, Claude, Google…), emojis → `"garder"`.

## Vérification (obligatoire)
```
cd /home/user/sophia-os/pods/page-blanche
node atelier/cli-rendu.ts $S/src_ok posts/<id>.fr.json $S/rendu/<id>
python3 $S/planche.py "$S/rendu/<id>/*.jpg" $S/rendu/<id>.planche.jpg
```
Regarde la planche (Read) et le rapport (avertissements « déborde »). Raccourcis le français et recommence tant qu'il y a un débordement ou un rendu visiblement faux (3 tours max).

## Problèmes de détection
Si une boîte rouge contient du texte anglais, si deux textes distincts sont fusionnés, ou si du texte n'est pas encadré : NE BRICOLE PAS, décris-le dans `posts/<id>.notes.md` (slide, élément, problème).
