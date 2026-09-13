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

Plus de gate par langue : toutes les langues cibles sont postables. Le deck d'une
langue naît à la demande, à la première assignation d'un compte de cette langue
(`assurerDeckPourLangue`). `contenu_langues.score` reste écrit pour l'historique
mais ne pilote plus rien.

## Requalification

Elle tourne à minuit (`minuit-vnext`, étape `tierlist`), **avant** l'assignation,
sur les posts dont le cycle est terminé :

- tous les passages prévus sont **publiés** — un passage assigné jamais publié
  n'est pas consommé, il retourne au pool après 7 jours ;
- le dernier publié a pris `tierlist.recul_jours` jour(s), le temps que les vues
  remontent ;
- au moins une vue a été relevée (sinon on attend — jamais de dégradation sur une
  mesure absente).

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

## Répartition quotidienne

Chaque compte tire dans les posts qui partagent au moins un de ses labels (et sa
même application / compatibilité UGC), parmi ceux dont il reste des passages à
effectuer.

Le pool du jour est servi **bande par bande**, dans cet ordre :

| Bande | Contenu                                    |
| ----- | ------------------------------------------ |
| 1     | B et au-dessus, jamais posté par ce compte |
| 2     | B et au-dessus, déjà posté par ce compte   |
| 3     | C (ou D repêché), jamais posté             |
| 4     | C (ou D repêché), déjà posté               |

On ne descend d'une bande que quand la précédente est vide, et le tirage est
uniforme à l'intérieur d'une bande. Donc **un C n'est donné que s'il n'y a plus
aucun post en B+ dans le pool du compte** — même un B déjà vu par ce compte
passe devant un C neuf : le rang prime sur la fraîcheur.

Un post peut repasser sur un compte qui l'a déjà posté ; à rang équivalent, le
tirage préfère simplement du neuf quand il y en a. Le plancher de priorité est
`TIER_MIN_PRIORITAIRE` (`B`) dans `tierlist.ts`.

- **Plus de passages à faire que de créneaux** → tirage au hasard dans la
  première bande non vide.
- **Plus de créneaux que de passages à faire** (les quatre bandes vides) → un
  post en D est repêché et reçoit `tierlist.repechage_passages` passage
  (1 par défaut). Le repêchage est **par compte** : inutile de réveiller un D
  que ce compte ne peut pas poster.

Un D repêché dont le passage est assigné mais pas encore publié peut revenir
dans le pool (fenêtre « en vol » de 7 jours) : il est alors servi dans les
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
`contenu_tier_etat` (vue) : publiés / en vol / restants / `m` / max / nb ≥ 150k

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

## Où c'est dans le code

- `src/features/moteur/tierlist.ts` — barèmes, table de requalification et
  bandes de tirage (testé)
- `supabase/functions/_shared/tierlist.ts` — copie Deno + run de requalification
  et programmation des rappels
- `supabase/functions/_shared/import_contenu.ts` — `assurerTierImport`
- `supabase/functions/_shared/assignation_contenu.ts` — pool, tirage, repêchage,
  `programmerRappelsJ7`
- `supabase/functions/minuit-vnext/index.ts` — étape `tierlist`
