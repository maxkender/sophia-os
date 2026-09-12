# Classement des comptes

Remplace l'**ELO de compte** (`comptes.score`, supprimé par la migration 0238).
Un compte porte une case, requalifiée chaque nuit sur ses 10 derniers posts.

```
INACTIF  <  MAUVAISES VUES  <  PASSABLE  <  BIEN  <  STAR
```

## Ce qu'on mesure

Deux fenêtres différentes, toutes deux sur les `passages` (hors rappels J+7) :

| Grandeur     | Définition                                                          |
| ------------ | ------------------------------------------------------------------- |
| `prevus`     | les 10 derniers créneaux **échus** (hors brouillons, jour en cours exclu) |
| `postes`     | parmi ces prévus, ceux réellement publiés (`publie_at` non null)    |
| `moyenne`    | moyenne des vues des 10 derniers posts **publiés et mesurés**       |
| `mesures`    | combien de ces posts portent une mesure de vues                     |

Le jour en cours ne compte pas : le créateur a encore le temps de poster. Un post
publié mais pas encore relevé (vues nulles) ne pèse pas sur la moyenne.

## Les cases

| Case               | Condition                                                       |
| ------------------ | --------------------------------------------------------------- |
| **INACTIF**        | `postes ≤ 6` sur 10 prévus                                      |
| **MAUVAISES VUES** | moyenne < 600 vues                                              |
| **BIEN**           | moyenne ≥ 1 000 **et** `postes ≥ 8` sur 10                      |
| **STAR**           | moyenne > 10 000 **et** `postes ≥ 9` sur 10                     |
| **PASSABLE**       | tout le reste (dont la zone 600 – 1 000 vues)                   |

Deux règles de résolution :

- **Les flags négatifs priment.** Un compte qui ne poste pas est INACTIF même
  s'il fait des millions de vues — « la catégorie la moins bonne » gagne.
- **Entre BIEN et STAR, la meilleure gagne.** Les deux se recouvrent par
  construction (un STAR remplit aussi BIEN) ; sinon STAR serait inatteignable.

**Moins de 10 prévus** → les seuils suivent le nombre réel de prévus, au prorata :
sur 5 créneaux, INACTIF à ≤ 3 posts (60 %, arrondi au plus bas), BIEN à ≥ 4 (80 %,
arrondi au plus haut), STAR à ≥ 5 (90 %).

**Moins de `min_echantillon` (3) prévus ou mesurés** → PASSABLE, sans flag :
on ne juge pas un compte neuf sur son premier créneau raté.

**Comptes couverts** : ceux qui passent par `passages` (slideshow, UGC AI photo).
Les comptes **CM** (vidéo papier → `papier_posts`) et **UGC AI VIDEO**
(→ `ugc_video_posts`) ont leurs propres tables de posts et restent hors classement.

## Quand ça tourne

À la **fin du drain de relevé des vues** (`rattrapage-elo`, `restants === 0`),
donc sur les vues fraîches de la nuit — pas sur celles de la veille. Le résultat
est écrit dans `reglages.elo_dernier_run.classement` et affiché dans Minuit.

Pour le déclencher à la main : `minuit-vnext` avec `{ etapes: ["classement"] }`.

Un compte sous **verrou manuel** garde sa case ; `classement_calcule` continue
d'être écrit pour montrer ce que l'auto aurait dit.

## Surveillance des comptes (`/admin/surveillance`)

Deux listes.

**File de surveillance** — un compte y entre si :

- sa case est INACTIF ou MAUVAISES VUES ;
- **ou** il est à moins de 30 h de la fin de son essai (voir TRIAL), quelle que
  soit sa case.

Quatre actions par ligne :

| Action                  | Effet                                                                 |
| ----------------------- | --------------------------------------------------------------------- |
| **Skip**                | masque la ligne 7 jours (`surveillance_skip_jusqu`) ; elle revient si le compte est toujours flagué |
| **Changer la case**     | pose la case à la main **et verrouille** : la requalif de la nuit ne l'écrase plus (« Rendre à l'auto » déverrouille) |
| **Nudge**               | dépose un message interne (choisi parmi `reglages.nudges.modeles`) que le créateur voit à sa connexion |
| **Ne pas renouveler**   | ajoute le compte à la seconde liste                                   |

**Ne pas renouveler** — liste de suivi, **sans effet technique** : le compte
continue à recevoir ses posts jusqu'à désactivation manuelle. Chaque ligne porte
la checklist « j'ai demandé au HM de ne pas renouveler ce compte ».

## TRIAL

`comptes.created_at + trial_heures` (80 h). Le compte entre **obligatoirement**
dans la file à `created_at + 50 h` (30 h avant la fin) et porte l'indication
TRIAL avec les heures restantes. Rien n'est coupé automatiquement à l'échéance :
c'est une revue, pas un couperet.

À ne pas confondre avec le **warmup** (`warmup_started_at/ends_at`, 24 h par
défaut, déclenché par le créateur lui-même) : deux compteurs différents, le
warmup n'a pas changé.

## Nudges

Les modèles vivent dans `reglages.nudges.modeles` (`{ id, titre, corps }`),
éditables dans Réglages. L'envoi copie le texte dans `compte_nudges` (snapshot :
modifier le modèle ne réécrit pas l'historique). Le créateur voit le message en
pop-up à sa connexion (`NudgePopup`, même contrat que `ReviewPopup`) et
l'acquitte — ce qui pose `lu_at`.

## Réglages (`reglages.classement_comptes`)

| Clé                   | Défaut | Rôle                                        |
| --------------------- | ------ | ------------------------------------------- |
| `fenetre`             | 10     | nombre de derniers posts pris en compte     |
| `min_echantillon`     | 3      | sous ce seuil, PASSABLE sans flag           |
| `ratio_inactif`       | 6      | INACTIF si postés ≤ ce ratio (sur 10)       |
| `ratio_bien`          | 8      | BIEN si postés ≥ ce ratio (sur 10)          |
| `ratio_star`          | 9      | STAR si postés ≥ ce ratio (sur 10)          |
| `vues_mauvaises`      | 600    | MAUVAISES VUES sous cette moyenne           |
| `vues_bien`           | 1 000  | moyenne minimale pour BIEN                  |
| `vues_star`           | 10 000 | moyenne à dépasser pour STAR                |
| `trial_heures`        | 80     | durée de l'essai depuis `created_at`        |
| `trial_alerte_heures` | 30     | entrée en surveillance avant la fin d'essai |
| `skip_jours`          | 7      | durée d'un skip                             |

## Schéma

`comptes` : `classement`, `classement_calcule`, `classement_verrou`,
`classement_maj_at`, `classement_rapport`, `surveillance_skip_jusqu`,
`non_renouveler`, `non_renouveler_at`, `non_renouveler_par`,
`non_renouveler_hm_demande`, `non_renouveler_hm_demande_at`

`compte_classement_historique` : chaque changement de case (`auto` / `manuel` /
`deverrouillage`), avec la règle et le rapport

`compte_nudges` : messages internes envoyés à un créateur (`lu_at` = acquitté)

`classement_comptes_etat(p_fenetre)` : RPC qui calcule prévus / postés / moyenne
pour tous les comptes suivis en une passe SQL

`stats_comptes` : la colonne `elo` cède la place à `classement` +
`classement_maj_at`

## Ce que la suppression de l'ELO compte a emporté

- `comptes.score` / `score_maj_at` (colonnes supprimées)
- `appliquerEloComptes` et la pénalité de −5 par jour actif sans publication
- l'EWMA de forme dans `majScoresDepuisPassages`
- `performanceNormalisee` : l'ELO langue prend désormais la perf **brute** d'un
  passage, sans normalisation par la forme du compte
- côté UI : le tri « ELO » d'Analytics (→ classement), les tops/flops ELO de
  Pilotage (→ comptes à problème / comptes qui marchent), l'ELO moyen par
  recruteur (→ part de comptes en BIEN+), les badges ELO de Posters, de la fiche
  créateur et du calendrier, et la tuile ELO compte du brief Minuit

## Où c'est dans le code

- `src/features/moteur/classementComptes.ts` — logique pure : seuils, `classer`,
  trial, file de surveillance (testé dans `classementComptes.test.ts`)
- `supabase/functions/_shared/classement_comptes.ts` — copie Deno + run de
  requalification
- `supabase/functions/_shared/rattrapage_elo.ts` — appel en fin de drain
- `supabase/functions/minuit-vnext/index.ts` — étape manuelle `classement`
- `src/pages/admin/AdminSurveillancePage.tsx` — la page
- `src/features/moteur/BadgeClassement.tsx` — le badge, partout dans l'admin
- `src/features/moteur/NudgePopup.tsx` — le message côté créateur
- `supabase/migrations/0238_classement_comptes.sql` — schéma, RPC, réglages
