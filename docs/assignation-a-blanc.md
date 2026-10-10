# Assignation test à blanc (1 créateur, zéro incidence)

Admin → Tests → « Assignation test à blanc (1 créateur) ». On choisit un
créateur et un jour (demain par défaut) : le **vrai code de minuit** tourne pour
ce compte, et l'écran montre ce que la nuit ferait — créneau par créneau — sans
**rien** écrire nulle part.

## Différence avec l'assignation test

| | Assignation test (`assignation`, `test: true`) | Test à blanc (`assignation-a-blanc`) |
| --- | --- | --- |
| Passages / posts | créés en base (`est_test`), à annuler | **jamais créés** (simulés en mémoire) |
| Decks traduits / placés | cuits et **enregistrés** (restent après l'annulation) | jamais enregistrés ; IA décochée : aperçu |
| Cache `contenu_langue_decks`, `slides_base`, hashtags | écrits | jamais écrits |
| Face swap UGC (fal) | appelé, médias créés | **bloqué** (compté) |
| Quota baissé, journal de minuit | non (mode test) | simulés, montrés, non écrits |
| Options | mode test (`ignorerTierlist`) | **mode normal**, comme la nuit |

## Ce qui tourne

`supabase/functions/assignation-a-blanc` → `_shared/a_blanc_execution.ts` :
`assignerTousComptes(supabase, jour, compteId, { forcer: false, test: false,
ignorerTierlist: false, ignorerWarmup: true, echeance: maintenant + 60 s })`.

La référence est le drain de la nuit (`assignerDrainLot`) : pour un compte seul,
`assignerTousComptes` fait la même chose (réglages, `select("*")` du compte,
`assignerCompteJour` avec les mêmes options et l'échéance de cuisson du lot,
journal). Ce que le drain ferait de différent est relu à part, en lecture
seule, et affiché dans « la nuit ne servirait pas ce compte » :

- `reglages.assignation_auto` en pause ;
- le pré-filtre du drain (`listerComptesSousQuota`) : il compte les **posts**
  du jour (coquilles legacy comprises), avant la purge ;
- warmup non démarré / en cours (`ignorerWarmup` ne touche QUE ce filtre) ;
- compte CM, UGC vidéo, vidéos uniquement, inactif (inactif : rien n'est lancé).

## Les garanties

Tout tourne dans un isolate dédié où `globalThis.fetch` est remplacé par un
intercepteur **fermé par défaut** (`_shared/a_blanc_intercepteur.ts`), posé par
`assignation-a-blanc/installer.ts`, premier import de l'index. Une fonction Edge
est un bundle et un isolate à elle : la nuit, l'assignation test et Sophia ne
sont pas touchées. Le code partagé de la nuit n'est pas modifié (le mode
« contenus » n'y ajoute qu'un export, `noterContenuBackfill`, et une option
facultative, `ignorerCache`, absente partout ailleurs) ; seul l'objet exporté
`decksAssignation` est enveloppé, à l'exécution, dans cet isolate.

Décision de l'intercepteur, dans l'ordre :

| Requête | Sort ? | Réponse |
| --- | --- | --- |
| illisible, hors contexte de test, contexte fermé | non | bloquée |
| Supabase `/rest/v1/rpc/*`, `/storage/*`, `/functions/*`, `/auth/*`, graphql, realtime… | non | 403 `ABLANC` |
| Supabase avec `x-http-method-override` (ou variantes) | non | 403 |
| Supabase `GET` / `HEAD` `/rest/v1/<table>` | **oui** (lecture) | réelle, à travers le calque |
| Supabase `POST` / `PATCH` / `DELETE` hors run (authentification) | non | 403 |
| Supabase `POST` / `PATCH` / `DELETE` dans le run | **non** | simulée : réponse au format supabase-js |
| toute autre méthode | non | 403 |
| `generativelanguage.googleapis.com/v1beta/models/*:generateContent`, case IA cochée, < 30 appels | **oui** | réelle (rien n'est écrit) |
| Gemini sans IA, ou au-delà du plafond | non | `TypeError` |
| tout autre hôte (fal, TikTok, Apify, Replicate…) | non | `TypeError` (coupure réseau) |
| exception interne de l'intercepteur | non | bloquée (jamais de repli sur le vrai fetch) |

`globalThis.fetch` est en plus verrouillé (non réinscriptible) quand le
runtime le permet : aucun module ne peut remettre le vrai `fetch` pendant un
test.

Seules deux fonctions appellent le vrai `fetch`, et elles revérifient tout
avant : `envoyerLecture` (origine, chemin `/rest/v1/<table>`, GET/HEAD, en-têtes
de lecture seulement, sans corps) et `envoyerIA`.

- **Liste blanche RPC : vide.** Aucune RPC sur le chemin d'assignation d'un
  compte (`.rpc(` n'apparaît dans sa fermeture que dans `media_caption.ts` et
  `slide_media.ts`, hors chemin, et ces RPC écrivent). En ajouter une exigerait
  la preuve qu'elle est STABLE/IMMUTABLE et n'écrit rien.
- Les messages de blocage ne contiennent ni code HTTP ni « timeout » /
  « unavailable » : `callWithFallback` ne réessaie pas, un modèle bloqué coûte
  un seul tour, sans attente. Le 403 n'est pas réessayé par postgrest-js
  (seuls 503/520 en GET le sont).
- Contexte par requête (`AsyncLocalStorage`) : deux tests sur la même instance
  ne se mélangent pas (et un verrou d'instance n'en laisse tourner qu'un). Hors
  contexte, même une lecture est bloquée. Le contexte d'authentification
  (vérification du rôle admin) ne peut que lire, puis il est fermé.
- **Sonde** avant chaque test : l'intercepteur est bien celui que voit le code
  ET une lecture passe par lui ; sinon le test est annulé avant toute étape.
- **Option IA** : refusée pendant la nuit (21:45–00:30 et 03:45–05:30 UTC) et
  moins de 30 min après un run de minuit — les appels partagent la clé du
  modèle avec la nuit, qui pourrait sinon prendre des 429. Plafond de 30 appels
  par test. `ia` n'est activée que par la valeur JSON `true`.
- Les clés passées en paramètre d'URL (`?key=…`) sont masquées dans tout le
  flux NDJSON (les erreurs réseau de Deno citent l'URL complète).

## Le calque « lecture après écriture »

`_shared/a_blanc_calque.ts`. Une écriture simulée est gardée en mémoire et
redevient visible aux lectures suivantes **du même test** : deck relu après
placement, passage relu, contenu repêché (le `eq("passages_prevus", 0)` du
repêchage rend les vraies valeurs, puis 0 ligne au second essai, comme la nuit).

- Table jamais écrite pendant le test : lecture transmise telle quelle.
- Table écrite, requête **simple** (colonnes nues ou `*`, filtres
  eq/neq/gt/gte/lt/lte/in/is/like/ilike avec ou sans `not.`, `order`, `limit`,
  `offset`, Accept JSON ou objet) : lecture réelle élargie, suppressions
  retirées, patchs appliqués et réévalués, lignes patchées hors filtre relues
  par leur clé, lignes insérées ajoutées, puis tri, coupe et projection.
- Table écrite, requête **non simple** (embed `posts!inner(...)`, `or=`, count,
  HEAD, Accept inconnu) : transmise sans superposition — on en retire seulement
  les lignes supprimées et on y reporte les colonnes patchées quand la clé est
  lue. Noté dans les limites du résultat. Sans effet pour un compte : un contenu
  déjà pris est exclu de la suite du tirage (`contenusSession`).
- Insertion : défauts de colonne relevés en prod (`application_id_sophia()` →
  l'id de Sophia, `now()`, `gen_random_uuid()`), clés primaires non-`id`
  (`assignation_journal`, `contenu_pertinences` — mode « contenus » —,
  `contenu_tiers_application`, `reglages`).
- Non simulés : contraintes uniques, clés étrangères, déclencheurs (vérifiés :
  ils n'agissent que sur un statut publié ou pour le rôle authenticated), vues
  recalculées.

## IA cochée / décochée

- **Cochée** : les vrais `assurerDeckPourLangue` / `assurerDeckApplication`
  tournent ; traduction et placement sont faits par le modèle, leurs écritures
  restent dans le calque, le deck montré est celui relu à la fin.
- **Décochée** :
  - Sophia, deck prêt (ou contenu livré par un pod) : vrai code ; s'il manque
    des hashtags, leur génération est bloquée et le jeu statique s'applique
    (signalé) ;
  - Sophia, deck à fabriquer : **aperçu** sans lancer le vrai code (qui ferait
    ~10 s d'essais puis poserait un texte de repli trompeur) ; mêmes refus que
    le vrai code (contenu introuvable, langue hors cibles, « Deck langue source
    vide — impossible de traduire ») ; original de pod → son deck, slide Sophia
    comprise ;
  - autre application : vrai code avec une échéance déjà passée — tous les
    refus sans IA sortent comme la nuit, puis il s'arrête en « budget » avant la
    traduction ou le placement, sans écrire de cache ; ce « budget » devient un
    aperçu « à fabriquer » (base de la langue, sans pub).
  - les écritures que ferait la fabrication sont listées à part, sous la fiche
    du créneau (elles ne sont pas dans « écritures évitées »).

## Mode « contenus » : notation et placement de 1 à 3 slideshows

Admin → Tests → « Tester la notation et le placement (à blanc) ». Avant de
lancer le rattrapage de pertinence d'une application sur TOUT un label, on
choisit l'application (Unswipe par défaut, jamais Sophia), un label (ceux qui
servent l'application en tête), 1 à 3 slideshows valides et importés (recherche
par titre, « 3 au hasard ») et la langue du deck (défaut : langue source). Rien
n'est enregistré.

Même fonction (`assignation-a-blanc`), même isolate, même intercepteur, même
contrôle d'accès :

```
POST { mode: "contenus", applicationId, contenuIds: [1 à 3 uuid], langue? }
→ flux NDJSON, puis { etape: "ready", aBlanc: true, mode: "contenus", resultat }
```

`_shared/a_blanc_contenus.ts`, pour chaque slideshow (en parallèle) :

1. **Pertinence** — le VRAI `noterContenuBackfill` (exporté de
   `pertinence_apps.ts`, inchangé), avec les dépendances du rattrapage réel
   (`import-contenu` : `scoreRelevance`, `lireScoring`, `eloParLangue`,
   `lirePisteSource`) : prompt `pertinence_<slug>`, accroche de la langue
   source, note avec la piste du compte source et son poids, `noteStockee`,
   `eligibiliteDepuisNote` avec le plancher `PERTINENCE_MIN_HORS_SOPHIA` (50).
   L'upsert `contenu_pertinences` est simulé ; la ligne est relue à travers le
   calque. L'écran montre aussi la ligne réellement en base (inchangée).
2. **Tier d'entrée** — celui d'une ligne neuve dans
   `contenu_application_tier_etat` : `tierInitialDepuisNote(note)` si éligible,
   D / 0 sinon, et ses passages.
3. **Placement** — le VRAI `assurerDeckApplication` avec `{ ignorerCache: true }`
   (option ajoutée, absente partout ailleurs : la nuit et l'assignation test
   gardent le cache à l'identique) : le prompt `placement_<slug>` ACTUEL est
   testé. Une base déjà traduite (`slides_base` de la langue) est réutilisée ;
   sinon la traduction est faite par le modèle et reste dans le calque. Lancé
   même pour un contenu non éligible (dit à l'écran). Deck AVANT (base sans
   pub) / APRÈS (slide pub surlignée), slide concurrente imposée, variantes du
   modèle : relus dans le calque et dans l'upsert simulé de
   `contenu_langue_decks`.

Garde-fous propres au mode :

- **IA obligatoire** : mêmes refus la nuit et 30 min après un run de minuit
  (`raisonRefusIA`). Plafond : `PLAFOND_IA_PAR_CONTENU` (15) × nombre de
  slideshows — un slideshow coûte au plus 7 appels (notation, traduction,
  4 essais de placement, hashtags), et un appel en coûte deux quand le premier
  modèle échoue. Le plafond du mode compte reste 30.
- **Jamais Sophia** : refus 400 dans l'index, et à nouveau dans le module.
- **Temps** : au-delà de 110 s, plus de traduction ni d'essai de placement
  (« temps du test épuisé ») : le résultat sort avant le mur Edge de 150 s.
- Le calque connaît la clé primaire composée de `contenu_pertinences`
  (`contenu_id`, `application_id`) : sans elle, le remplacement simulé d'une
  ligne déjà en base aurait été perdu (table écrite seulement par ce mode).

Limites : le modèle n'est pas déterministe (relancer peut donner un autre score
ou une autre slide) ; un contenu déjà passé dans `contenu_tiers_application`
garde son tier réel (le test montre le tier d'entrée) ; une application inactive
est servie quand même par le test (signalé).

## Ce qui n'est pas simulé

Rappels J+7 (ils prennent un créneau du quota la nuit), requalification
tierlist et rattrapage des stats, upscale, concurrence de la flotte (lot de 8,
budget de cuisson et échecs de deck partagés : le test est plus optimiste pour
les autres applications), file du drain, et le tirage aléatoire (relancer peut
montrer un autre contenu).

## Les tests

```
DENO_NO_PACKAGE_JSON=1 deno test --no-lock --allow-all --no-check supabase/functions/_shared/a_blanc_*_test.ts
npx vitest run src/features/moteur/assignationABlanc.test.ts src/features/moteur/AssignationABlancCard.test.tsx \
  src/features/moteur/contenusABlanc.test.ts src/features/moteur/ContenusABlancCard.test.tsx
```

- `a_blanc_contenus_test.ts` : la vraie notation et le vrai placement à
  travers l'intercepteur (faux réseau piégé, base comparée avant / après) ;
  note identique au calcul du rattrapage (piste comprise) ; plancher de 50 ;
  ligne déjà en base remplacée dans le test seulement ; cache ignoré
  SEULEMENT avec `ignorerCache` ; prompts vides ; refus (Sophia, application
  inconnue, nuit) ; déploiement (le module ne touche qu'`assignation-a-blanc`).

- `a_blanc_intercepteur_test.ts` : le vrai supabase-js au-dessus d'un faux
  `fetch` sous-jacent **piégé** (toute requête qui n'est pas une lecture
  `/rest/v1/<table>` ou un Gemini autorisé et qui le traverse fait échouer le
  test) ; matrice méthodes × formes d'entrée × chemins × contextes ; formes de
  réponse supabase-js ; rpc, storage, functions, auth, externes ; hors
  contexte ; concurrence ; IA bloquée sans reprise ; erreur interne.
- `a_blanc_calque_test.ts`, `a_blanc_postgrest_test.ts` : superposition, patch,
  suppression, upsert, clés composées, pagination keyset.
- `a_blanc_decks_test.ts` : vrais decks à travers l'intercepteur.
- `a_blanc_execution_test.ts` : le vrai `assignerTousComptes` de bout en bout
  sur un faux serveur en lecture seule ; la base du faux serveur est comparée
  avant / après (instantané profond).
- `a_blanc_deploiement_test.ts` : `scripts/fonctions-touchees.mjs` rattache
  chaque pièce à `assignation-a-blanc`, et à elle seule.

## Déploiement

- `supabase/config.toml` : `[functions.assignation-a-blanc] verify_jwt = false`
  (contrôle interne `assertAuthorised`, comme `assignation`). L'entrée doit
  arriver dans le même merge que la fonction : le déploiement lit `verify_jwt`
  là.
- Au merge, le workflow `deploy-edge-functions.yml` ne redéploie que
  `assignation-a-blanc` (les fichiers `a_blanc_*` ne sont importés que par
  elle). Il affichera aussi la notice « config.toml a changé — relance ce
  workflow à la main » : **ne pas** le relancer avec l'entrée vide (cela
  redéploierait les 38 fonctions). Si besoin, le relancer avec
  `assignation-a-blanc` seule.
- Si le bundle de la fonction cassait un jour (par exemple `node:async_hooks`),
  seule elle est touchée ; un `workflow_dispatch` peut lister explicitement les
  autres fonctions à déployer pour l'écarter.
- **Vérification après déploiement** (lecture seule) : relever avant / après un
  test à blanc, IA décochée, sur un compte réel — `count(*)` des passages et
  posts du (compte, jour), `max(updated_at)` de `contenu_langue_decks`, la ligne
  `assignation_journal` (compte, jour), `comptes.posts_par_jour`,
  `reglages.minuit_dernier_run` — et constater que tout est identique.

## Règle de maintenance

Toute fonction appelée par l'assignation qui sortirait autrement que par
`fetch` (socket, `Deno.connect`, WebSocket, worker, client HTTP npm qui ne
passe pas par `fetch`) doit être revue ici avant le merge : l'intercepteur ne
voit que `fetch`. Aucun module de `_shared/a_blanc_*` ne doit avoir d'effet de
bord à l'import (seul `installer.ts` pose l'intercepteur, et il est importé par
nom).
