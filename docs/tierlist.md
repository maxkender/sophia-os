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

Le rang décide de la **fréquence** d'un post : à l'intérieur du pool du jour, le
tirage est uniforme. Il n'y a plus de score, de top-K, de softmax ni de pénalité
de saturation.

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

- **Plus de passages à faire que de créneaux** → tirage au hasard.
- **Plus de créneaux que de passages à faire** → un post en D est repêché et
  reçoit `tierlist.repechage_passages` passage (1 par défaut). Le repêchage est
  **par compte** : inutile de réveiller un D que ce compte ne peut pas poster.

Un post peut repasser sur un compte qui l'a déjà posté ; le tirage préfère
simplement du neuf quand il y en a.

## Rappel J+7 (> 50 000 vues)

Dès qu'un passage publié dépasse `tierlist.rappel_vues` (50k), le **même post**
est reprogrammé sur le **même compte** à J+7. Hors système :

- ne consomme pas de passage du budget tierlist ;
- ne compte pas dans `m` ;
- s'ajoute au quota du compte ce jour-là ;
- se réenchaîne si le rappel perce aussi, jusqu'à `tierlist.rappel_max` (3).

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

- `src/features/moteur/tierlist.ts` — barèmes + table de requalification (testé)
- `supabase/functions/_shared/tierlist.ts` — copie Deno + run de requalification
  et programmation des rappels
- `supabase/functions/_shared/import_contenu.ts` — `assurerTierImport`
- `supabase/functions/_shared/assignation_contenu.ts` — pool, tirage, repêchage,
  `programmerRappelsJ7`
- `supabase/functions/minuit-vnext/index.ts` — étape `tierlist`
