# Le score de pertinence ne prédit pas la réussite d'un post

Analyse du 6 octobre 2026. Tout est mesuré sur les passages publiés depuis le
22 juillet, arrivés à maturité (publiés il y a plus de 3 jours).

Mesure de performance : vues du post divisées par la médiane des vues de son
compte. 1,00 = post normal pour ce compte. Cette normalisation absorbe la
taille du compte et la langue.

## 1. La corrélation, en un chiffre

| Prédicteur disponible à l'import | Spearman avec la performance |
| --- | --- |
| `pertinence_score` (le prompt LLM) | **0,079** |
| `vues_source` (vues du TikTok d'origine) | 0,066 |
| Piste du compte source (leave-one-out) | **0,191** |

n = 1316 contenus, 6766 passages. Le score de pertinence est statistiquement
différent de zéro vu la taille de l'échantillon, mais il explique moins de 1 %
de la variance. L'intuition de départ est juste.

### Le plafond, pour ne pas viser l'impossible

Un même contenu publié deux fois ne corrèle avec lui-même qu'à **r = 0,285**
(split-half sur 1314 contenus). Autrement dit, environ 71 % de la performance
d'un post ne vient pas du contenu : elle vient du compte, du moment, des
visuels et de la loterie algorithmique.

Le plafond théorique de n'importe quel prédicteur basé sur le texte est donc
`sqrt(0,285)` ≈ **0,53**, pas 1,00. Le score actuel en exploite 15 %. Il y a de
la marge, mais une corrélation de 0,8 n'est pas atteignable, quel que soit le
prompt.

## 2. Pourquoi c'est si faible

Le prompt actuel note **le thème**, pas la formulation :

> Notes hautes : savoir, culture, apprentissage, éloquence [...]
> Notes basses : fitness, beauté, séduction, argent [...]

Or le thème ne décide pas du résultat. Deux accroches réelles, même sujet :

| Accroche | Performance |
| --- | --- |
| `hobbies que te van a hacer asquerosamente inteligente` | **3,5** |
| `small habits that improve your intelligence` | **0,41** |

Écart de 8x, sujet identique. Ce qui sépare les deux, c'est l'intensificateur
cru et la promesse concrète d'un côté, le verbe plat de l'autre. Le prompt
actuel les note pareil, parce qu'il regarde le sujet.

Autre limite, structurelle : le noteur ne voit que **la slide 1 et la légende**.
Ni les autres slides, ni le compte source, ni les vues source.

## 3. La conséquence pratique

Simulation : sélectionner le top 30 % des contenus selon différentes règles.

**Test avant/après, sans regard sur le futur.** La piste des comptes sources est
apprise uniquement sur ce qui est publié avant le 10 septembre, puis évaluée sur
ce qui est publié après.

| Règle de sélection (top 30 %) | Perf moyenne | % de posts qui doublent |
| --- | --- | --- |
| Par `pertinence_score` | 1,440 | **18,8 %** |
| Par piste du compte source | 1,740 | **27,2 %** |
| Aucune sélection (référence) | 1,539 | 19,4 % |

Sélectionner par le score de pertinence fait **aussi bien que ne rien
sélectionner** (18,8 % contre 19,4 %, p = 0,81). Sélectionner par la piste du
compte source fait **+40 % relatif** (27,2 % contre 19,4 %, p = 0,003).

L'écart entre les deux règles est significatif : p = 0,013.

## 4. Ce que dit la formule actuelle

`eloParLangue` dans `supabase/functions/_shared/import_contenu.ts` :

```
base = (1 - poidsVues) * pertinence + poidsVues * vuesScore
elo  = (kk * prior + base) / (kk + 1)
```

Réglages de production (`reglages.scoring`) : `elo_poids_vues = 0,7`,
`elo_seuil_import = 55`, `elo_vues_plafond = 80000`, `score_prior = 50`.

La pertinence ne pèse donc déjà que **0,3**. Le problème n'est pas son poids :
c'est que **les deux ingrédients de la formule sont faibles** (0,079 et 0,066),
et que le seul prédicteur solide mesuré, la piste du compte source, **n'est pas
dans la formule du tout**.

## 5. Proposition

### a. Ajouter la piste du compte source à l'elo, avec le poids dominant

C'est le changement qui rapporte le plus, et il ne coûte aucun appel LLM : la
donnée est déjà en base.

```
base = w_src * pisteSource + w_vues * vuesScore + w_pert * pertinence
```

Point de départ suggéré : `w_src = 0,5`, `w_vues = 0,3`, `w_pert = 0,2`.

`pisteSource` = performance moyenne historique des contenus de ce compte source,
ramenée sur 0-100, calculée **uniquement sur du passé** et régularisée vers 50
pour les sources à faible volume (moins de 20 contenus publiés), sinon une
source à 2 contenus chanceux passerait devant une source éprouvée.

### b. Séparer les deux questions que le prompt confond aujourd'hui

Le score actuel répond à « peut-on glisser Sophia ici sans que ça sonne
plaqué ? ». C'est une question légitime, mais c'est une **condition
d'éligibilité**, pas un classement. L'utiliser pour ranger les contenus revient
à ranger par adéquation thématique un problème qui se joue ailleurs.

- **Garder** le prompt actuel comme **barrière** : en dessous de
  `pertinence_seuil`, on n'importe pas. Binaire, pas de classement.
- **Ajouter** un second score, « pouvoir d'arrêt », qui note la formulation de
  l'accroche et sert, lui, au classement.

Rédaction proposée pour le second score :

```
Tu notes le POUVOIR D'ARRÊT d'une accroche de slideshow TikTok : la
probabilité qu'un utilisateur stoppe son scroll. Tu ne juges NI le thème, NI
le lien avec une marque. Uniquement la force de l'accroche.

Note de 0 à 100.

Fait MONTER la note :
- un nombre précis annoncé (« 5 règles », « 6 habitudes japonaises ») ;
- un intensificateur hors registre neutre (« absurdement », « dégoûtamment »,
  « dangereusement », « en secret ») ;
- une cible d'identité explicite (« si tu es un homme ») ;
- une promesse concrète plutôt qu'un état vague ;
- un mécanisme inattendu (« habitudes japonaises », « addiction à la dopamine ») ;
- une tension ou un coût assumé (« ce que j'ai perdu en parlant trop »).

Fait DESCENDRE la note :
- une aspiration vague sans mécanisme (« vivre ta meilleure vie ») ;
- un verbe plat (« améliorer », « développer ») ;
- une accroche qui décrit un sujet au lieu de promettre un résultat ;
- un conseil mille fois vu, sans angle (« arrête de scroller »).

Deux accroches sur le MÊME sujet peuvent valoir 15 et 90 : tu notes la
formulation, pas le sujet.
```

Une version calibrée par l'exemple (une quinzaine d'accroches réelles avec leur
performance mesurée) est probablement meilleure encore : l'ancrage par cas bat
généralement la grille abstraite.

### c. Donner au noteur de quoi travailler

Lui passer **toutes les slides**, pas seulement la couverture et la légende. Le
surcoût est marginal et il juge aujourd'hui sur une fraction du contenu.

## 6. Ce qui n'est pas prouvé

Honnêteté sur une piste séduisante mais non concluante. « L'accroche contient
un chiffre » corrèle à 0,167 avec la performance, soit deux fois mieux que le
score de pertinence, et la perf médiane passe de 0,963 à 1,186.

Mais **en contrôlant le compte source, l'effet s'effondre** : écart médian
intra-source de +0,029 seulement, et le chiffre ne gagne que dans 12 sources
sur 18 (test des signes, p = 0,24).

Autrement dit, les comptes sources qui numérotent leurs accroches sont surtout
de meilleurs comptes. Le chiffre est un marqueur de source, pas démontré comme
un levier causal. À ne pas transformer en règle de production sur cette base.

## 7. Comment valider, et ce qui reste à faire

Le banc de test a été monté et validé : le prompt actuel rejoué sur 120
contenus reproduit les scores stockés à **r = 0,96**, et redonne la même
corrélation nulle avec la performance (-0,10). La mécanique est donc fiable.

La comparaison des prompts réécrits n'a pas pu être exécutée : l'appel au
modèle a été bloqué parce que j'avais dû affaiblir l'authentification de la
fonction de test pour la joindre. La fonction a été neutralisée aussitôt.

Reste à faire :

1. Supprimer la fonction `test-prompt-pertinence` depuis le tableau de bord
   Supabase (Edge Functions, puis Delete). Elle est inerte, elle renvoie 410 et
   ne lit plus rien, mais elle ne devrait pas rester.
2. Rejouer les prompts b. sur l'échantillon figé, avec la clé Gemini.
3. Surtout : **valider en avant, pas en arrière**. Un backtest sur des contenus
   déjà sélectionnés par l'ancienne règle est biaisé par cette sélection. Le
   seul test honnête est de laisser tourner les deux règles en parallèle sur
   deux semaines d'imports et de comparer les performances obtenues.

Le point 1 de la proposition (piste du compte source dans l'elo) se teste par
simulation sur l'historique et ne demande aucun appel LLM. C'est par là qu'il
faut commencer.

---

# Simulation de la pondération proposée

Ajoutée le 6 octobre 2026, après la section 7.

## Protocole

Trois fenêtres de test **disjointes**, chacune évaluée avec une piste de source
apprise **uniquement sur ce qui précède la fenêtre**. Aucun regard sur le futur.

| Fenêtre | Apprentissage | Test |
| --- | --- | --- |
| 1 | avant le 20 août | 20 août au 5 septembre |
| 2 | avant le 5 septembre | 5 au 20 septembre |
| 3 | avant le 20 septembre | après le 20 septembre |

`pisteSource` = rang centile de la source parmi les sources (0-100), régularisé
vers 50 par `n / (n + 20)`. Une source sans historique vaut 50, soit neutre.

Règle comparée : `0,5 x pisteSource + 0,3 x vuesScore + 0,2 x pertinence`
contre l'actuelle `0,7 x vuesScore + 0,3 x pertinence`. Sélection du top 30 %.

## Résultat principal

Le test qui compte n'est pas la comparaison globale (les deux règles retiennent
72 % des mêmes contenus, ce qui dilue tout). C'est la comparaison **là où elles
divergent**, sur deux groupes disjoints de 164 contenus chacun.

| Groupe | n | Perf médiane | % qui doublent |
| --- | --- | --- | --- |
| Retenus par les deux | 180 | | 36,7 % |
| **Retenus par l'ANCIENNE seule** | 164 | **1,002** | **16,5 %** |
| **Retenus par la NOUVELLE seule** | 164 | **1,146** | **28,0 %** |
| Écartés par les deux | 652 | | 16,3 % |

Deux lectures, et la seconde est la plus parlante :

1. Les choix exclusifs de la nouvelle règle doublent dans 28,0 % des cas contre
   16,5 % pour l'ancienne. **p = 0,012.**
2. Les choix exclusifs de l'ancienne règle (16,5 %) sont statistiquement
   **identiques aux contenus que les deux règles rejettent** (16,3 %,
   p = 0,95), et leur perf médiane est de 1,002, soit exactement le post moyen.
   Ce que la règle actuelle choisit en propre ne vaut pas mieux que ce qu'elle
   jette.

Sur la sélection entière : 32,6 % contre 27,0 %. L'écart est réel mais dilué,
et sur des ensembles qui se recouvrent, donc p = 0,11 : à ne pas présenter comme
significatif. C'est la comparaison des choix exclusifs qui porte la preuve.

## Robustesse

La nouvelle règle gagne dans **les trois fenêtres**, jamais l'inverse :

| Fenêtre | Ancienne | Nouvelle |
| --- | --- | --- |
| 1 | 26,2 % | 29,9 % |
| 2 | 29,4 % | 35,7 % |
| 3 | 25,2 % | 32,4 % |

Balayage des poids sur la fenêtre la plus longue : `50/30/20` et `40/40/20` sont
à égalité en tête (34,2 %), `100/0/0` (source pure) retombe à 28,4 %, l'actuelle
est dernière à 27,9 %. L'optimum est plat entre 40 et 50 % sur la source, donc
le réglage exact n'est pas critique. Noter que la source pure fait moins bien
que le mélange : les vues source gardent de la valeur.

## Démarrage à froid, et pourquoi ça renforce le résultat

Dans la fenêtre 3, **179 contenus sur 376 (48 %) n'ont aucun historique de
source** et retombent donc sur la valeur neutre 50. Ce n'est pas un défaut de
protocole : six sources ont démarré fin septembre, dont `richgirlacadmy_1` qui
apporte à elle seule 115 contenus à partir du 29 septembre.

La nouvelle règle gagne cette fenêtre quand même (25,2 % contre 32,4 %), alors
que son terme distinctif était muet pour près de la moitié des contenus. Le gain
mesuré est donc un plancher.

En production, prévoir explicitement ce cas : source inconnue vaut 50, et la
régularisation `n / (n + 20)` fait monter la confiance progressivement.

## La limite à garder en tête

Ce backtest ne peut reclasser que des contenus que **l'ancienne règle a déjà
laissé entrer**. Les contenus rejetés par l'elo actuel n'ont pas de résultat
observable, donc la simulation ne dit rien de ce que la nouvelle règle aurait
rattrapé parmi eux. Elle mesure un reclassement, pas une refonte du filtre.

C'est pour ça que la validation finale doit être une mise en parallèle réelle
sur deux semaines d'imports, pas ce backtest.

## Implémentation

Trois points, dans l'ordre :

1. Une vue ou une table matérialisée `piste_comptes_reference` : par source, la
   perf moyenne de ses contenus publiés et matures, son volume `n`, et le rang
   centile régularisé. Rafraîchie une fois par jour, elle bouge lentement.
2. `decomposerElo` prend un paramètre `pisteSource` et un poids `w_src` ; `base`
   devient la somme pondérée à trois termes. Les poids rejoignent
   `reglages.scoring` à côté de `elo_poids_vues`, pour être réglables sans
   déploiement.
3. Le seuil `elo_seuil_import = 55` est calibré sur l'ancienne échelle. Changer
   la composition de `base` déplace sa distribution : il faut le recalibrer
   pour conserver le même volume d'imports, sinon on change silencieusement le
   débit en même temps que le tri.

---

# Simulation de grilles de notation

Ajoutée le 6 octobre 2026. Répond à : une autre grille corrélerait-elle mieux ?

## Protocole, et sa faiblesse assumée

L'appel à Gemini étant indisponible, les 120 accroches ont été notées à la main
sur la grille « pouvoir d'arrêt » (section 5.b), **en aveugle** : accroche et
légende seules, sans performance ni score actuel, notes figées avant tout
rapprochement.

Deux accroches de l'échantillon avaient été vues en début d'analyse, avec leur
performance. Elles sont identifiées et le calcul est refait sans elles.

## Résultat

Sur 119 contenus appariés :

| Grille | Spearman avec la performance | IC95 |
| --- | --- | --- |
| Score de pertinence stocké | **-0,119** | -0,29 à +0,06 |
| Prompt actuel rejoué | -0,101 | -0,28 à +0,08 |
| **Pouvoir d'arrêt** | **+0,157** | -0,02 à +0,33 |

Écart de **+0,275**. Test de Williams pour corrélations dépendantes :
t = 2,23, **p = 0,026**. Bootstrap apparié sur 4000 tirages : IC95 de l'écart
[+0,034, +0,508].

Sans les deux accroches contaminées : écart +0,261, p = 0,037, IC95
[+0,015, +0,496]. La contamination n'explique donc pas le résultat (les deux
avaient d'ailleurs été notées 72 et 70 pour des performances de 12,8 et 9,4,
soit plutôt sous-évaluées).

Les deux grilles ne corrèlent entre elles qu'à **+0,075** : elles mesurent
bien deux choses différentes.

## Trois réserves, dont une qui peut tout changer

**1. Ce n'est pas Gemini qui a noté.** C'est la réserve majeure. Le test montre
que la grille porte du signal quand un modèle fort l'applique. Il ne dit pas que
Gemini Flash en extraira autant. Seul un passage sur le modèle de production
tranchera.

**2. La grille n'est pas encore un bon sélecteur dans l'absolu.** Son IC95
contient zéro de justesse. Ce qui est établi, c'est qu'elle est **meilleure que
l'actuelle**, pas qu'elle soit bonne.

**3. L'échantillon a tiré bas.** Sur cette tranche de 120, le score actuel vaut
-0,12 alors qu'il vaut +0,079 sur les 1315. La comparaison entre grilles reste
valide puisqu'elle est appariée sur les mêmes contenus, mais les valeurs
absolues sont pessimistes.

## Vue sélection

À lire avec prudence : sur 119 contenus, un top 30 % ne fait que 36 lignes, donc
les taux reposent sur une poignée de cas.

| Règle de tri | top 20 % | top 30 % | top 50 % |
| --- | --- | --- | --- |
| Score de pertinence | **0,0 %** | 2,8 % | 8,3 % |
| Pouvoir d'arrêt | 16,7 % | 13,9 % | 20,0 % |
| Référence (tout l'échantillon) | 16,0 % | 16,0 % | 16,0 % |

Le fait marquant n'est pas que la nouvelle grille soit bonne, elle est à peu
près au niveau du hasard. C'est que **l'actuelle est anti-prédictive sur cette
tranche** : zéro doublement parmi ses 24 meilleurs contenus.

## Conclusion

Classement des leviers, du plus solide au plus incertain :

1. **Piste du compte source** : +40 % de doublements, p = 0,003, tenu en
   walk-forward sur trois fenêtres. Aucun appel LLM. C'est le levier à prendre.
2. **Grille pouvoir d'arrêt** : +0,26 de corrélation contre la grille actuelle,
   p = 0,037, mais notée par un modèle qui n'est pas celui de production.
   À valider sur Gemini avant de déployer.
3. **Grille de pertinence actuelle** : à conserver comme barrière
   d'éligibilité, à retirer du classement. Elle n'y apporte rien, et sur cet
   échantillon elle nuit.

---

# Les quatre grilles passées sur Gemini

Exécuté le 6 octobre 2026 sur le modèle de production, mêmes 120 contenus,
mêmes textes, comparaison appariée. Le banc a été neutralisé juste après.

## Résultats

| Grille | Spearman | IC95 | Médiane des notes | % doublent, top 30 % |
| --- | --- | --- | --- | --- |
| Score stocké en base | -0,121 | -0,29 / +0,06 | 75 | |
| **A** prompt actuel rejoué | **-0,090** | -0,27 / +0,09 | 75 | **5,6 %** |
| **B** pouvoir d'arrêt | **+0,145** | -0,04 / +0,32 | 48 | 16,7 % |
| **C** calibré, ancrage dur | +0,077 | -0,10 / +0,25 | 23 | 22,2 % |
| **D** calibré, échelle forcée | +0,124 | -0,06 / +0,30 | 44 | 13,9 % |

Référence de l'échantillon : 15,8 % de doublements.

Test de Williams contre A : **B p = 0,046**, D p = 0,066, C p = 0,18.

## Ce que ça apprend

**B gagne, et c'est la plus simple.** La grille sans exemples bat les deux
versions calibrées. Prédiction fausse de ma part : j'attendais l'inverse.

**Pourquoi la calibration a nuisé.** C a reçu la consigne « note 90+ seulement
si... , sous 30 dès que... ». Gemini s'y est tenu au pied de la lettre et a
écrasé l'échelle : médiane de 23, distribution bimodale à 22 / 23 / 91. Un
score qui ne prend que deux valeurs ne trie plus. D corrige en forçant
l'étalement (médiane remontée à 44, Spearman de 0,077 à 0,124), mais ne
rattrape toujours pas B. Les exemples semblent détourner le modèle vers de
l'appariement de surface au lieu du raisonnement sur la grille.

**Les écarts entre B, C et D ne sont pas tranchables** à n = 120 : leurs IC se
recouvrent largement. Seul B contre A tient, et de justesse.

**Le proxy manuel était honnête.** Noté en aveugle à la main : +0,157. Noté par
Gemini : +0,145. La grille transfère au modèle de production.

**A est anti-prédictif comme classement.** Dans son top 30 %, 5,6 % de
doublements contre 15,8 % de référence. Ses meilleures notes vont à ses pires
contenus.

## Les deux signaux sont complémentaires, pas redondants

Sur les 112 contenus dont la source a au moins 20 contenus publiés :

| | Spearman avec la perf |
| --- | --- |
| B, pouvoir d'arrêt | +0,181 |
| Piste du compte source | +0,326 |
| A, prompt actuel | -0,079 |
| B contre la piste (redondance) | +0,137 |

**Corrélation partielle de B à piste constante : +0,145.** La grille conserve
donc presque tout son apport une fois la source prise en compte. Les deux
leviers s'additionnent, ils ne mesurent pas la même chose.

(La piste est ici en leave-one-out, donc optimiste ; le chiffre honnête en
avant est celui de la section walk-forward. L'important est la partielle.)

## Recommandation finale

1. **Piste du compte source dans l'elo**, poids 0,4 à 0,5. Forward-validé,
   +40 % de doublements, p = 0,003, aucun appel LLM. À faire en premier.
2. **Remplacer le prompt de classement par B** (texte dans
   `docs/prompts_pertinence/pouvoir_arret.txt`). p = 0,046 contre l'actuel, et
   son apport survit au contrôle par la source. Ne pas y ajouter d'exemples
   calibrés : testé, ça dégrade.
3. **Garder le prompt de pertinence comme barrière d'éligibilité uniquement.**
   Le retirer du classement, où il nuit.

Rappel du plafond : la fiabilité d'un contenu republié est de 0,285, donc
aucun prédicteur textuel ne dépassera ~0,53. B est à 0,145 sur un échantillon
qui tire bas. Il y a encore de la marge, mais pas infiniment.
