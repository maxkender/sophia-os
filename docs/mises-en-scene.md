# Captures, intégrateurs et mises en scène

Une banque d'images où nos applis (micabo, Sophia, UnSwipe) sont montrées
en usage réel sur un iPhone, une tablette ou un ordinateur. Elle sert à tous
les podz. Migration 0344, fonction Edge `mises-en-scene`. On la voit dans
Admin → Bibliothèque, onglets **Captures**, **Intégrateurs** et **Mises en scène**.

**Phase test (décision d'Adrien, 23/10)** : en français seulement. On cherche
d'abord ce qui est le plus beau, par support. Les traductions viendront après :
la fonction sait déjà les faire (`traduire_capture`), mais l'interface ne les
propose pas encore.

## Trois étages, rangés par support

Les supports sont `iphone`, `tablette` et `ordinateur`.

1. **Captures** (`captures_app`) : les vrais écrans de nos applis, par application et par support.
	- Une capture a un écran (`parcours`, `notes`, `a-retenir`, `lecons`, `site`…) et une langue.
	- Elle est `originale` (le vrai écran) ou `traduite` (plus tard, liée à son originale).
2. **Intégrateurs** (`integrateurs`) : des photos de la bibliothèque (`media_library`), choisies pour recevoir l'écran d'un support.
	- Exemples : une main qui tient un iPhone, une tablette posée sur un bureau, un ordi ouvert.
	- On n'invente jamais la scène.
	- Un admin qui choisit une photo la valide d'emblée. Une photo proposée par l'agent attend la validation d'un admin.
3. **Mises en scène** (`mises_en_scene`) : le croisement des deux étages, fait par Nano Banana Pro.
	- Chaque capture validée est posée dans chaque intégrateur validé **du même support**, dans chaque appli.
	- Le bouton « Générer » prend les couples qui manquent dans un ordre qui varie : chaque capture passe une fois avant qu'une autre revienne, et deux captures de suite ne tombent pas sur la même photo. Un lot coupé au budget reste donc varié.
	- Une seule mise en scène vivante par couple capture × intégrateur.
	- Chaque mise en scène garde le lien vers sa capture, son intégrateur et sa photo, et compte ses usages.

Les captures et les mises en scène sont **hors de `media_library`**. Une mise en scène porte du texte d'appli : elle ne doit jamais sortir dans les tirages de photos des labels.

## Les règles

- **Seules les images validées par un humain servent aux podz.** Statuts : à valider, validée, rejetée.
- **Parfait ou rien.** Une mise en scène ratée a droit à une seule relance (le bouton « Relancer »). Ensuite, elle est rejetée.
	- Le texte de l'écran est celui de la capture.
	- La main est intacte.
	- Aucun visage, aucun logo ni marque lisible, aucune autre appli visible, même au fond.
- **Une capture remplacée** : on importe la nouvelle avec « Remplace … ».
	- À sa validation, l'ancienne est marquée remplacée.
	- Ses mises en scène passent « à refaire ». Les podz ne les voient plus.
- **Budget Fal par semaine glissante.**
	- Le plafond et le prix d'une image sont dans `reglages.mises_en_scene` (`budget_fal_usd_semaine`, `prix_image_usd`).
	- Chaque appel est noté dans `depenses_fal`.
	- Au-delà du plafond, la fonction refuse et le lot s'arrête. Seul un admin peut passer outre (`hors_budget`).
	- La clé Fal ne sort jamais du serveur.
- **Stockage** : `medias/captures/<app>/<langue>/…` et `medias/mises-en-scene/<app>/<langue>/…`.

## Pour un podz : trouver et utiliser une mise en scène validée

Avec le jeton du podz (en-tête `x-pod-jeton`, comme `photos` de la fonction `pods`) :

```sh
curl -s https://mbikecieskoobeizixig.supabase.co/functions/v1/mises-en-scene \
  -H "content-type: application/json" -H "x-pod-jeton: $POD_JETON" \
  -d '{"action":"mises_en_scene","pod":"remakes_yasmine","application":"micabo","support":"iphone","langue":"fr"}'
```

- La réponse donne les mises en scène **validées et à jour**, les moins utilisées d'abord : `id`, `url`, `largeur`, `hauteur`, `ecran`, `langue`, `support`, `scene_id`, `used_count`.
- Filtres facultatifs : `application`, `support`, `ecran`, `langue`.
- Quand le podz met une mise en scène dans un post livré, il le dit à l'OS : `{"action":"utiliser","pod":"…","id":"<id>"}`. Le compteur d'usage monte d'un cran.
- `{"action":"captures","pod":"…",…}` donne les captures validées et à jour, avec les mêmes filtres.
- Un podz ne fabrique jamais de mise en scène lui-même. S'il lui en manque une, il la demande à l'agent « Mises en scène », par le chef des podz.

## Pour l'agent « Mises en scène »

- Il a son jeton (en-tête `x-agent-jeton`). L'empreinte SHA-256 est dans `reglages.mises_en_scene.jeton_hash`, posée à part, jamais en clair.
- `node scripts/mises-en-scene.mjs` : `importer`, `integrateur`, `manquants`, `mettre`, `captures`, `liste`, `budget`.
- Il importe les originales, propose des intégrateurs et lance les mises en scène. Il regarde chaque image en taille réelle avant de la proposer.
- Il ne valide jamais : c'est un humain, dans la Bibliothèque.

## Les prompts

Ils sont éditables dans la table `prompts`. Sans prompt en base, c'est le défaut du code (`_shared/mises_en_scene.ts`) qui s'applique.

- `mise_en_scene_incrustation` (`{appareil}`) : l'image 1 est la photo de l'intégrateur, l'image 2 la capture.
	- Le contenu de l'écran est remplacé par la capture, en entier, en suivant la perspective.
	- On garde la main devant l'écran, les reflets et la lumière, et on ne change rien d'autre.
	- La sortie est au format de la photo, en 2K.
- `mise_en_scene_traduction` (`{langue}`, `{app}`), pour plus tard : tout le texte de l'interface est traduit comme l'appli le ferait elle-même.
	- La mise en page, les polices, les couleurs, les icônes et la taille restent les mêmes.
	- Rien n'est ajouté.
