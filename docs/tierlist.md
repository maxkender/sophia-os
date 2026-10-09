# Tierlist — placement des posts

Remplace l'ELO par langue. Un post porte **un seul rang**, langue-agnostique.
L'ELO ne sert plus qu'au tout premier placement, à l'import.

## Rangs et passages

| Rang | Passages à effectuer |
| ---- | -------------------- |
| D    | 0                    |
| C    | 1                    |
| B    | 2                    |
| A    | 4                    |
| S    | 8                    |
| S+   | 16                   |

Le rang décide de la **fréquence** d'un post (nombre de passages) et sa **priorité**
au tirage : le bas de tierlist ne passe que quand le haut est épuisé (voir
« Répartition quotidienne »). À l'intérieur d'une bande, le tirage est uniforme.
Il n'y a plus de score, de top-K, de softmax ni de pénalité de saturation.

## Premier placement (import)

Note /100 de la **langue source** : `30 % pertinence + 70 % vues`
(`elo_poids_vues = 0.7`, échelle log^1.3 plafonnée à `elo_vues_plafond`).

| Note      | Résultat        |
| --------- | --------------- |
| < 55      | pas importé     |
| 55 – 60   | C               |
| 60 – 70   | B               |
| ≥ 70      | A               |

S et S+ ne sont **jamais** atteints à l'import — seulement par requalification.

**Contenu partagé (0270).** Pour un contenu noté pour Sophia ET pour une autre
application (`contenu_pertinences`), le rang **Sophia** vient du score
**Sophia**, et plus du max des applications : même formule, mêmes paramètres
(piste du compte source comprise), D / 0 sous le seuil. La porte d'import
(rejet), elle, reste le max. `tier_rapport` porte alors `base:
"pertinence_sophia"`, la note de la porte (`porte`) et son tier (`tier_porte`).
Un contenu dont aucun label ne sert Sophia (« hors Sophia ») ne reçoit pas de
rang Sophia (`contenus` reste D / 0). Un contenu Sophia seul — tout le stock
actuel — garde le placement d'avant, à l'octet près. Même règle pour l'import
forcé (note Sophia planchée au seuil).

Plus de gate par langue : toutes les langues cibles sont postables. Le deck d'une
langue naît à la demande, à la première assignation d'un compte de cette langue
(`assurerDeckPourLangue`). `contenu_langues.score` reste écrit pour l'historique
mais ne pilote plus rien.

## Requalification

Elle tourne à minuit (`minuit-vnext`, étape `tierlist`), **avant** l'assignation,
sur les posts dont le cycle est terminé :

- tous les passages prévus sont **publiés** — un passage assigné jamais publié
  n'est pas consommé, il retourne au pool après 2 jours ;
- le dernier publié a pris `tierlist.recul_jours` jour(s), le temps que les vues
  remontent ;
- au moins une vue a été relevée — sinon le cycle repart **au même rang** (voir
  ci-dessous), jamais de dégradation sur une mesure absente.

`m` = moyenne des vues des passages publiés **du cycle** (les rappels J+7 sont
exclus). Les règles « un passage à plus de 30k / 150k » sont **prioritaires** sur
`m`.

| Rang courant | Condition                      | Nouveau rang |
| ------------ | ------------------------------ | ------------ |
| D            | m < 600                        | D            |
| D            | 600 ≤ m < 1 000                | C            |
| D            | 1 000 ≤ m < 5 000              | B            |
| D            | m ≥ 5 000                      | A            |
| C            | m < 600                        | D            |
| C            | 600 ≤ m < 1 000                | C            |
| C            | 1 000 ≤ m < 5 000              | B            |
| C            | 5 000 ≤ m < 30 000             | A            |
| C            | un passage ≥ 30 000            | S            |
| B            | m < 1 000                      | C            |
| B            | 1 000 ≤ m < 5 000              | B            |
| B            | 5 000 ≤ m < 30 000             | A            |
| B            | un passage ≥ 30 000            | S            |
| B            | un passage ≥ 150 000           | S+           |
| A            | m < 5 000                      | B            |
| A            | 5 000 ≤ m < 30 000             | A            |
| A            | un passage ≥ 30 000            | S            |
| A            | un passage ≥ 150 000           | S+           |
| S            | aucun passage ≥ 30 000         | A            |
| S            | un passage ≥ 30 000            | S            |
| S            | un passage ≥ 150 000           | S+           |
| S+           | deux passages ≥ 150 000        | S+           |
| S+           | sinon                          | S            |

Après requalification, le compteur de passages repart plein au nouveau rang et le
cycle (`contenus.tier_cycle`) est incrémenté — les passages du cycle précédent
sortent de la fenêtre de mesure.

Un post qui tombe en D a 0 passage : il dort jusqu'à un repêchage.

### Un cycle terminé repart toujours

Un post qui a fait tous ses passages sort du pool (`restants = 0`). S'il fallait
une mesure pour le requalifier, un cycle jamais mesuré le condamnait : hors du
pool, jamais relancé, et rien ne le signalait. En prod, 11 % des posts publiés ne
portent aucune mesure (voir `docs/resolution-publication.md`).

La vue distingue donc trois états parmi les passages publiés du cycle :

| Colonne | Ce que ça veut dire |
| --- | --- |
| `mesures` | une mesure de vues est tombée |
| `introuvables` | la résolution a rendu les armes (`resolution_statut = 'introuvable'`) — **aucune mesure ne viendra jamais** |
| `en_attente_mesure` | résolution ou relevé encore en cours |

`deciderRequalif` s'en sert pour garantir qu'un cycle terminé finit toujours par
repartir :

1. au moins un passage mesuré → barème normal, sur `m` ;
2. `en_attente_mesure = 0` et que des introuvables → plus rien à attendre, le
   cycle repart **au même rang**, tout de suite ;
3. `tierlist.requalif_max_jours` (3 par défaut) depuis le dernier passage → filet
   pour une résolution coincée ou un relevé en panne : même relance au même rang ;
4. sinon on patiente encore.

Une relance sans mesure ne débloque pas de remix (rien n'a été prouvé) et écrit
`tier_rapport.sans_mesure` = `introuvable` | `delai`. Un `dernier_publie_at`
absent — créneau coché sans horodatage — tombe en repli sur la date prévue, et à
défaut compte comme échu : rien ne doit geler un cycle.

L'admin voit l'état sur la fiche du slideshow (même fonction, donc même verdict
que minuit) et peut forcer la requalification sans attendre le cron.

## Répartition quotidienne

Chaque compte tire dans les posts qui partagent au moins un de ses labels (et sa
même application / compatibilité UGC), parmi ceux dont il reste des passages à
effectuer.

Le pool du jour est servi **bande par bande**, dans cet ordre :

| Bande | Contenu                                           |
| ----- | ------------------------------------------------- |
| 1     | B et au-dessus, jamais posté par ce compte        |
| 2     | B et au-dessus, posté de longue date              |
| 3     | C (ou D repêché), jamais posté                    |
| 4     | C (ou D repêché), posté de longue date            |
| —     | *(repêchage d'un D dormant : voir plus bas)*      |
| 5     | B et au-dessus, posté **récemment** sur ce compte |
| 6     | C (ou D repêché), posté **récemment**             |

On ne descend d'une bande que quand la précédente est vide. Donc **un C n'est
donné que s'il n'y a plus aucun post en B+ dans le pool du compte** — même un B
déjà vu passe devant un C neuf : le rang prime sur la fraîcheur.

### Écart minimum sur un même compte (0271)

« Récemment » veut dire à moins de `tierlist.ecart_min_meme_contenu` jours
(**14** par défaut, modifiable dans Réglages > Assignation ; `0` désactive la
règle). L'écart est compté en valeur absolue depuis le passage de ce contenu le
**plus proche** du jour visé sur ce compte, donc un passage déjà programmé pour
*demain* compte aussi. Les passages **assignés** comptent, pas seulement les
publiés : c'est ce que le créateur reçoit qui ne doit pas se répéter.

Avant cette règle, un contenu déjà posté était seulement rétrogradé d'une bande,
sans qu'on regarde la date : un créateur pouvait recevoir le même deck — mêmes
images et même texte — deux jours de suite. Le seul garde-fou daté
(`ECART_MIN_JOURS_AUTRE_APPLICATION`, 7 jours) ne valait qu'entre applications
différentes.

C'est une **relégation, pas une exclusion** : les bandes 5 et 6 restent
tirables, donc aucun créneau n'est perdu et aucun quota ne baisse, y compris sur
les langues à petit vivier. À doublon acquis, on ne garde dans ces deux bandes
que les candidats **les plus éloignés** de leur dernier passage : resservir le
deck d'hier quand un autre attend depuis treize jours serait du gâchis. Ailleurs
(bandes 1 à 4), le tirage reste uniforme à l'intérieur d'une bande.

Le plancher de priorité est `TIER_MIN_PRIORITAIRE` (`B`) dans `tierlist.ts`, et
la frontière du dernier recours est `BANDES_AVANT_DERNIER_RECOURS`.

- **Plus de passages à faire que de créneaux** → tirage au hasard dans la
  première bande non vide.
- **Plus de créneaux que de passages à faire** (les quatre premières bandes
  vides) → un post en D est repêché et reçoit `tierlist.repechage_passages`
  passage (1 par défaut). Le repêchage est **par compte** : inutile de réveiller
  un D que ce compte ne peut pas poster.
- Le repêchage passe **avant** les bandes 5 et 6, et c'est voulu : le pool du
  jour ne retient que les contenus à `restants > 0`, alors que les labels du
  compte portent souvent des dizaines de D dormants qu'il n'a jamais postés,
  atteignables par ce seul chemin. Un contenu neuf en D vaut mieux que le deck
  d'hier.

Un D repêché dont le passage est assigné mais pas encore publié peut revenir
dans le pool (fenêtre « en vol » de 2 jours) : il est alors servi dans les
bandes basses, avec les C.

## Rappel J+7 (> 50 000 vues)

Dès qu'un passage publié dépasse `tierlist.rappel_vues` (50k), le **même post**
est reprogrammé sur le **même compte** à J+7. Hors tierlist :

- ne consomme pas de passage du budget tierlist ;
- ne compte pas dans `m` ;
- se réenchaîne si le rappel perce aussi, jusqu'à `tierlist.rappel_max` (3).

Il **prend la place** d'un post classique : un compte à 2 posts/jour qui a deux
rappels ce jour-là ne reçoit aucun contenu neuf, et jamais un troisième post.

**Étalement.** Le scan remonte 30 jours — un post peut franchir les 50k bien
après sa publication, et la première mise en service voit tout l'historique d'un
coup. Les J+7 déjà échus sont donc reportés au premier jour qui a de la place,
les plus anciens d'abord, sans plafond de report : le surplus glisse de jour en
jour jusqu'à écoulement au lieu de s'entasser sur un seul lendemain.

Marqué `passages.est_rappel = true`, avec `rappel_source_id` et `rappel_rang`.

## Remix S+

À chaque requalification qui **arrive ou reste** en S+, une ligne est écrite dans
`remix_debloques` :

```
contenu_id · tier_cycle · nb (3) · tier_cible ('A') · statut ('en_attente')
```

Contrainte unique `(contenu_id, tier_cycle)` : rejouer minuit ne multiplie pas les
déblocages. **Le moteur qui consomme cette file n'est pas branché** — il devra
créer les remix, les rattacher au même label, et passer la ligne à `consomme`.

## Schéma

`contenus` : `tier`, `passages_prevus`, `tier_cycle`, `tier_maj_at`, `tier_rapport`
`passages` : `tier_cycle`, `est_rappel`, `rappel_rang`, `rappel_source_id`
`remix_debloques` : file des remix débloqués par un S+
`contenu_tier_etat` (vue) : publiés / en vol / restants / `m` / max / nb ≥ 150k /
mesurés / introuvables / en attente de mesure — passages **Sophia** seulement
depuis 0270
`contenu_tiers_application` (0270) : tier, passages prévus, cycle, rapport par
contenu × application (hors Sophia ; CHECK `application_id <> Sophia`)
`contenu_application_tier_etat` (vue, 0270) : l'avancement par contenu ×
application, sur les passages de l'application
`contenu_application_a_requalifier` (vue, 0270) : ses cycles terminés
`tier_initial_note(numeric)`, `passages_du_tier(text)` (0270) : miroirs SQL de
`tierInitialDepuisNote` et `PASSAGES_PAR_TIER` (synchro testée)

## Migration des posts existants

Migration `0237_tierlist.sql`, depuis l'ELO de la langue native :

| ELO       | Rang |
| --------- | ---- |
| < 55      | D    |
| 55 – 65   | C    |
| 65 – 75   | B    |
| 75 – 85   | A    |
| 85 – 89   | S    |
| ≥ 89      | S+   |

Les posts repartent au cycle 1 avec le compteur plein : les passages historiques
(cycle 0) ne comptent pas dans la première requalification.

## Réglages (`reglages.tierlist`)

| Clé                  | Défaut | Rôle                                             |
| -------------------- | ------ | ------------------------------------------------ |
| `recul_jours`        | 1      | recul sur le dernier passage avant requalif      |
| `rappel_vues`        | 50 000 | seuil de déclenchement du rappel                 |
| `rappel_jours`       | 7      | décalage du rappel                               |
| `rappel_max`         | 3      | rappels enchaînés maximum                        |
| `remix_par_requalif` | 3      | remix débloqués par une requalification en S+    |
| `repechage_passages` | 1      | passages rendus à un D repêché                   |
| `requalif_max_jours` | 3      | attente max d'une mesure avant relance au même rang |

## Par application (0270)

Décision du propriétaire (2026-10-08) : « plus de tiers mergés, des tiers
différents par application ». Chaque application a **son** rang, **son**
budget de passages, **son** cycle et **sa** mesure `m`, sur ses seuls posts.

- **Sophia** garde `contenus.tier / passages_prevus / tier_cycle / tier_maj_at
  / tier_rapport` et tout le code ci-dessus (requalification, rappels,
  repêchage), inchangé. Seule différence : `contenu_tier_etat` ne compte plus
  que les passages `application_id = Sophia` — un post Unswipe ne consomme
  jamais le budget Sophia et n'entre pas dans son `m`.
- **Autres applications** : table `contenu_tiers_application` (contenu ×
  application) et vue `contenu_application_tier_etat` (mêmes colonnes que
  `contenu_tier_etat`, plus `application_id`, `eligible`, `materialise`,
  `note`), sur les seuls passages de l'application.
- **Tier d'entrée paresseux** : tant qu'aucune ligne n'est écrite, la vue
  déduit le tier de la note d'import de l'application
  (`contenu_pertinences.note`, `tier_initial_note` : ≥ 70 A, ≥ 60 B, sinon C ;
  C aussi pour une ligne forcée pas encore notée), cycle 0. Ligne non
  éligible : D / 0. Import FORCÉ : la note stockée d'une autre application
  est planchée au seuil (`noteStockee`), comme la note Sophia forcée
  (`max(note, seuil)`) — même rang d'entrée des deux côtés, quel que soit le
  seuil ; la ligne Sophia garde sa note brute.
  La ligne naît à la première écriture (requalification, repêchage D,
  changement manuel admin). Un réimport fait suivre la nouvelle note à une
  ligne non écrite ; une ligne écrite garde son rang.
- **Même logique, appliquée séparément** : `deciderRequalif`, barème, S / S+,
  cycle terminé, relance sans mesure, bandes de tirage, repêchage D (seulement
  une ligne écrite à 0 passage), fenêtre « en vol » de 2 jours, réglages
  `reglages.tierlist`.
- **Minuit** : étape `tierlist_applications`, la DERNIÈRE de la nuit, après
  toutes les étapes Sophia (tierlist, rappels, lancement du drain
  d'assignation, upscale, variations) : rien de non-Sophia ne retarde le
  drain. Le drain peut tirer pendant qu'elle tourne — sans conflit : elle ne
  touche que des cycles terminés (restants à 0, hors du pool) et ses
  écritures sont gardées par `tier_cycle` ; un contenu requalifié rejoint le
  pool des lots suivants. Bornée à 20 s, échéance contrôlée avant chaque
  lecture (comptage, chaque page, titres) et chaque écriture ; le reste
  repasse la nuit suivante. Applications inactives comprises (un cycle publié
  doit finir).
  Trace dans `reglages.tierlist_applications_dernier_run` (page Minuit, carte
  Applications) ; `minuit_dernier_run` n'est pas touché. Clic admin
  « Requalifier maintenant » d'une fiche : `{ etapes:
  ["tierlist_applications"], contenuId, applicationId }`.
- **Remix S+ hors Sophia** : rien n'est écrit dans `remix_debloques` (pas
  d'`application_id`, et son UNIQUE `(contenu_id, tier_cycle)` heurterait les
  cycles Sophia) ; le rapport porte `remix_en_attente`.
- **Rappels J+7** : hors budget des deux côtés, inchangés ; ils recopient
  `tier_cycle` et `application_id` de leur source. Une source d'une autre
  application sortie de sa réserve (`eligible = false`, révocation) n'est
  plus rejouée.
- **Concurrence** : écritures gardées par `tier_cycle` (`.select` : 0 ligne =
  requalifié ailleurs), repêchage gardé par `passages_prevus = 0`, écriture de
  l'état paresseux en `ignoreDuplicates`.
- **Tolérance de déploiement** : le code sonde 0270
  (`sonderSchemaTiersApplication`). Absente : aucune autre application n'est
  servie (repli Sophia, motif `reserve_vide` avec la raison), l'étape de
  minuit ne fait rien. Illisible : le compte est rejoué, la nuit saute l'étape
  avec un avertissement.

## Où c'est dans le code

- `src/features/moteur/tierlist.ts` — barèmes, table de requalification,
  `deciderRequalif` et bandes de tirage (testé)
- `supabase/functions/_shared/tierlist.ts` — copie Deno + run de requalification
  et programmation des rappels
- `supabase/functions/_shared/import_contenu.ts` — `assurerTierImport`
- `supabase/functions/_shared/assignation_contenu.ts` — pool, tirage, repêchage,
  `programmerRappelsJ7`
- `supabase/functions/minuit-vnext/index.ts` — étapes `tierlist` et
  `tierlist_applications`
- `supabase/functions/_shared/tiers_application.ts` — tierlist par application
  (sonde 0270, lecture, requalification hors Sophia)
- `src/features/moteur/repartition/ApplicationsContenu.tsx` — bloc « Tier par
  application » de la fiche slideshow
