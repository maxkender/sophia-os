# Spécification d'implémentation de BLEO

*Copie de l'onglet « Spécification d'implémentation » du doc Claude « BLEO », exportée le 29/10/2026. Le doc et ce fichier sont tenus à jour ensemble. Mise à jour le 30/10 : voir « État au 30/10 » juste dessous ; le journal détaillé est `docs/bleo-chantier.md`.*

## État au 30/10 : ce qui a changé depuis la rédaction

Les décisions d'Adrien des 29 et 30/10 l'emportent sur le reste du document. Les sections concernées sont annotées sur place ; la version d'origine reste lisible pour mémoire.

| Sujet | Avant (rédaction du 28/10) | Maintenant | Section |
| --- | --- | --- | --- |
| Mesure | À blanc puis A/B de 11 jours (W1 à W4) | **Pas d'A/B** (29/10). À blanc du 29/10 au 1/11, puis bascule ; à la place de l'A/B, un suivi avant/après (r médian, part à 10 000 vues) et une alerte si le r médian des 3 derniers jours mesurés baisse de plus de 15 % (0617) | W0 à W4 |
| Bascule | J15, sur décision W3 | **Dimanche 1/11 au soir** (décision du 30/10) : `bleo.mode = actif` et les podz sur la boîte ; premier jour assigné par BLEO : lundi 2/11. Retour : « Revenir à l'ancien système » (mode `ombre`) et `bleo.podz.type_obligatoire` à faux | W4, P1 |
| Tirage | BLEO crée les passages à 14 h, decks l'après-midi | Le tirage de 14 h reste un **plan** (`bleo_ombre_passages`) ; l'assignation de minuit le suit créneau par créneau ; un créneau non servable repart sur la tierlist (`bras = 'temoin'`). La tierlist reste en secours jusqu'à L8 | A7, D1, L6, L7 |
| Fonctions | Fonctions Edge `bleo-nuit`, `bleo-assignation`… | Fonctions SQL appelées par pg_cron (`bleo_nuit`, `bleo_tirage`, `bleo_rapport`, `bleo_jauge_photo`) ; migrations dans la plage 06xx | Planning |
| Réglages | `file_juger.part_max` 0,40 | 0,30 (29/10) | A7, Réglages |
| Déclinaisons | Accroche non précisée ; G2 après les familles jamais déclinées | G1 : accroche du parent **mot pour mot** ; G2 : accroche **reformulée**, ouverte au verdict ; G2 en tête de la boîte (D35, 0606). Une déclinaison s'écrit **dans la langue de son parent**. **Une ligne par famille dans la boîte, une déclinaison par famille et par jour**, familles au budget en fin de boîte (0628) | A2, A9, P2 |
| Fermeture | r médian de la dernière génération | r **moyen** plafonné à 20, recalculé chaque nuit dans les deux sens (D36, 0608) | A9 |
| Fatigue | Tous les passages depuis toujours | Les 60 derniers jours ; un passage non publié ne compte que jusqu'à 3 jours après sa date (D41, 0612) | A5 |
| Colonne langue | Agent de langue Claude par langue, banque des relecteurs, test 50/50 (L9 à L11) | **Réécriture native** : un appel par deck qui voit tout le post et lit **quatre fiches** (appli, langue, label, CTA, dans `bleo_fiches` et `fiches_appli`) ; banque = `exemples_natifs`. A/B **seulement dans Tests** (duels à l'aveugle, votes des relecteurs, 0620 et 0626), rien dans l'assignation de minuit (30/10) ; mise en production au compte-gouttes plus tard | Agent de langue, L9 à L11 |
| CTA | Voie tirée (`prouvee` / `essai` selon les poids de la fiche label), forme notée, stats du lundi | **Plus de stats CTA ni de forme tirée** (0624) : les vues ne jugent pas un CTA. L'OS n'impose que `reprise` (l'original cite un concurrent) et `marquee` (slide marquée par le podz) ; sinon le modèle choisit avec les fiches. CTA **à partir de la slide 4**, jamais le hook (le hook ne change jamais). Fiche label **écrite** (format du deck, où va l'appli, exemples), fiche CTA commune (0623) | D2, D4, D5, D8 |
| Podz | Preuve retirée en phase 3 ; CTA A/B/C jusqu'à la phase 5 | Preuve retirée à la bascule ; images cherchées par leur légende (toutes légendées le 30/10) ; CTA A/B/C gardés pour varier, plus jamais remplacés d'après leurs vues | P1, P2, P3 |
| Garde-fous du tirage | Exclusion stricte | Exclusion, puis relâche plutôt qu'un créneau vide, chaque relâche comptée au rapport (proposition de D5, appliquée par défaut) ; dernier repli `hors_file` (un contenu à juger au-delà de la capacité) | A7, A8 |

**Encore à construire** (voir « Lots de travail ») : L0 (enregistrements, modèle des decks, garde des colonnes), L3 (`bleo-lundi`, règle des sources), L7 (decks l'après-midi, validation automatique à 6 h), D39 (G1 du hit à la place du repost J+7), L8 (fin de la tierlist), et la mise en production de la réécriture native.

## Mode d'emploi

Ce document suffit pour implémenter BLEO avec le dépôt `maxkender/sophia-os` et la base Supabase (projet `mbikecieskoobeizixig`). Le pourquoi, avec les chiffres et les graphiques, est dans le doc Claude « BLEO » (onglet « BLEO en clair ») et sur la page Notion « BLEO · le nouveau système » ; ce document dit quoi et comment.

**Ordre de lecture** : glossaire, existant, modèle de données, algorithmes, agent de langue, podz, planning, à blanc et A/B, lots, réglages, points ouverts.

**Trois statuts** marquent chaque règle :

- **Décidé** : validé par Adrien le 28/10. À implémenter tel quel.
- **Réglage** : une valeur de départ, lue dans la table `reglages` (clé `bleo`), jamais écrite en dur. Elle se cale pendant l'à blanc et l'A/B.
- **Ouvert** : listé dans la dernière section, avec le choix à appliquer si personne ne tranche.

**Règles de chantier** :

1. Rien ne change en production avant la porte « BLEO tourne ». Jusque-là, BLEO n'écrit que dans ses propres tables.
2. Le système actuel (tierlist, assignation de minuit, Gemini) reste en place et appelable jusqu'à la bascule.
3. Chaque comportement neuf passe par un interrupteur : `bleo.mode` = `off`, `ombre` (calcule sans publier), `ab` (un créneau sur deux de chaque compte) ou `actif`.
4. Une fonction neuve a ses tests Deno à côté (`*_test.ts`), comme le reste du dépôt.

**Conventions** : heures en Europe/Paris ; un post est **mûr** 72 h après `passages.publie_at` ; dans toute moyenne, r est plafonné à 20 par post ; les rappels (`est_rappel = true`) ne comptent jamais dans une mesure.

**Hors périmètre** : le podz 3 (réactions UGC en vidéo), les comptes CM et UGC vidéo, et les prompts de l'agent de langue, conçus par un autre agent (page Notion « Révolution placement/traduction »). Cette spécification fixe ses entrées, ses sorties et son circuit.

## Glossaire

Chaque terme a une seule définition, utilisée partout dans le code et les rapports.

| Terme | Définition exacte |
| --- | --- |
| Contenu | Une ligne de `contenus` : un import, un original de podz ou un livré |
| Passage | Une ligne de `passages` : un contenu publié (ou à publier) par un compte, dans une langue, pour une appli |
| Langue servie | Pour un contenu, une langue où il a au moins un passage, quel que soit son statut. Sinon la langue est neuve |
| Mûr | Un passage publié depuis 72 h ou plus |
| Médiane du compte | Médiane des vues de ses passages mûrs publiés dans les 45 derniers jours, hors rappels. Définie seulement avec 5 passages ou plus (même règle que la vue `source_performance`) |
| r | Vues d'un passage mûr ÷ médiane du compte au moment où il mûrit. Nul si le compte n'a pas de médiane. Plafonné à 20 dans les moyennes |
| Percée | Un passage mûr à 10 000 vues ou plus |
| Gagnant | Un contenu dont au moins un passage a fait 10 000 vues ou plus |
| Accroche | Le texte de la slide 1 normalisé : `contenus.accroche_norm`, calculé par `normaliserAccroche` (`_shared/doublons.ts`) |
| Famille d'accroche | La racine (un import ou un full test), ses déclinaisons et les imports qui reprennent son accroche mot pour mot. Colonne `contenus.famille_id` |
| Génération | 0 = la racine, ou une reprise mot pour mot ; 1 = déclinaison de la racine ; 2 = déclinaison d'une génération 1. Jamais 3 |
| Verdict d'accroche | **Gagnante** dès qu'un passage mûr d'un contenu de la famille fait 10 000 vues ou r ≥ 2. **Non gagnante** quand la famille a au moins 2 passages mûrs avec un r, sans atteindre le seuil. **En attente** sinon |
| Déclinaison | Un nouveau contenu de podz sur l'accroche d'une famille gagnante : même accroche, autre angle, autres items, autres images |
| Full test | Une livraison de podz sur une accroche inventée, jamais publiée chez nous : la racine d'une nouvelle famille |
| Boîte du podz | Les familles gagnantes de son label, ni closes ni au bout de leurs déclinaisons |
| Jauge | Semaines de boîte = familles en boîte ÷ (livraisons du podz par semaine ÷ 3) |
| Forme | Moyenne lissée des r d'un contenu, toutes langues confondues : (2 × valeur par défaut + somme des r) ÷ (2 + nombre de r) |
| Valeur par défaut | Le point de départ de la forme, fixé par la classe du contenu (voir Réglages) |
| Valeur attendue | Pour un couple contenu × langue : forme × 0,6^(passages du contenu dans la langue) × 0,75^(passages d'autres contenus de la famille dans la langue) × 0,7 si le contenu a plus de 45 jours |
| File à juger | Les créneaux réservés aux 2 passages de test des nouveaux contenus |
| File valeur | Les autres créneaux, tirés au prorata du cube de la valeur attendue |
| Récolte | Un passage d'un contenu gagnant dans une langue neuve |
| Voie 1 | Labels mixtes : imports et podz d'originaux |
| Voie 2 | Labels 100 % podz (white\_bg, mentalmaxxing, that\_girl\_study, Fathomly) : remakes livrés |
| Livré | Contenu dont les slides finies sont fournies par langue (`contenus.livre = true`) : pas de deck à fabriquer |
| Circuit | Qui a écrit le deck d'un passage : `agent`, `gemini` ou `livre` |
| Voie de CTA | Comment l'appli est placée : `reprise` (CTA de l'original), `prouvee` (forme de la fiche label), `essai`, `marquee` (slide marquée par le podz), `concurrent` (notre appli à la place d'un concurrent) |
| Bras | Pendant l'A/B, `bleo` ou `temoin` pour chaque passage d'un compte de l'A/B (un de chaque par jour) |

## L'existant à connaître

BLEO se branche sur un système qui tourne : voici ce qu'il faut lire avant d'écrire une ligne, avec les pièges repérés. Chemins relatifs au dépôt ; `F/` = `supabase/functions/`, `M/` = `supabase/migrations/`.

### La diffusion aujourd'hui

| Quoi | Où | Ce qu'il faut savoir |
| --- | --- | --- |
| Nuit de l'OS | `F/minuit-vnext/index.ts` | Cron `minuit-vnext` à 00 h Paris (M/0302). Étapes : rattrapage, tierlist (`requalifierContenus`), rappels (`programmerRappelsJ7`), labels (`fermerLabelsEtReaffecter`), assignation, upscale. L'assignation vise **le jour qui commence** (J), pas J+1. Second passage à 04 h UTC : assignation seule |
| Assignation | `F/assignation/index.ts`, `F/_shared/assignation_contenu.ts` | `assignerDrainLot` → `listerComptesSousQuota` → `assignerCompteJour` → `choisirContenu`. Lots de 8 comptes, 6 en parallèle. Journal : table `assignation_journal`, `reglages.minuit_dernier_run` |
| Tierlist | `F/_shared/tierlist.ts`, M/0237, M/0270 | Rangs sur `contenus.tier`, `passages_prevus`, `tier_cycle` (Sophia) et table `contenu_tiers_application` (autres applis). Vues `contenu_tier_etat`, `contenu_application_tier_etat`. Requalification par `deciderRequalif` / `requalifier` |
| Bandes de tirage | `bandesDeTirage` (tierlist.ts) | 6 bandes ; tirage uniforme dans les bandes 1 à 4 (`tirerAuHasard`) ; bandes 5-6 : les plus anciens d'abord. Un rang D (0 passage) n'est atteint que par le repêchage `repecherContenuD` |
| Anti-répétition | `choisirContenu` + `F/_shared/doublons.ts` | Aujourd'hui elle **déclasse** (vers les bandes de dernier recours) sans exclure : même contenu sur le compte à moins de 14 jours, même `accroche_norm` ou couverture à 8 bits près à moins de 10 jours |
| Comptes ignorés | `listerComptesSousQuota` | Inactifs, `type_compte = 'cm'`, `ugc_ai_video`, `videos_uniquement` (podz 3), warm-up pas fini |
| Quota | `assignerCompteJour` | `posts_par_jour` borné 1 à 3 (2 pour les 358 comptes actifs le 28/10). `baisserQuotaSiBesoin` **baisse le quota pour de bon** quand le pool est trop mince |
| Pool | `poolContenusPrets`, règle d'appli (AC:1765), `contenusLivresHorsLangue` (`F/_shared/pods.ts`) | Contenus `valide` + `import_statut = done` des labels du compte ; un livré sans deck dans la langue du compte est exclu ; `contenu_pertinences.eligible` filtre les applis |
| Rappels J+7 | `programmerRappelsJ7` | Passage ≥ 50 k vues, 3 rappels au plus, `est_rappel = true`. Ils prennent un créneau du quota |
| Réglages | `reglages.tierlist` | `recul_jours`, `rappel_*`, `plancher_b`, `fatigue_*`, `ecart_min_meme_contenu` (14), `ecart_min_meme_accroche` (10), etc. Édités dans `AdminReglagesPage.tsx` |

### L'à blanc existant

`F/assignation-a-blanc/` et `F/_shared/a_blanc_*.ts` (doc : `docs/assignation-a-blanc.md`) rejouent l'assignation réelle **d'un seul compte**, en interceptant toutes les écritures dans une couche en mémoire. Rien n'est stocké, rien n'est comparé, et la flotte entière ne peut pas être simulée. L'à blanc de BLEO a donc besoin d'un exécuteur à l'échelle de la flotte, de tables à lui et d'un rapport de comparaison (voir « À blanc et A/B »). L'intercepteur (`creerFetchABlanc`) peut être réutilisé pour les tests.

### Les mesures aujourd'hui

- Les vues arrivent par `F/_shared/rattrapage_elo.ts` (cron `rattrapage-elo-drain`, lancé par minuit) : chaque nuit, les passages des 4 derniers jours Paris sont re-mesurés, et les colonnes `vues`, `likes`, `commentaires`, `partages` sont **écrasées** (pas d'historique). La fonction `metriques` a son cron désactivé (M/0326).
- **Les enregistrements ne sont pas relevés** : `F/_shared/apify.ts` ne lit pas `collectCount`.
- Trois définitions de r coexistent : `source_performance` (médiane du compte sur 45 j, au moins 5 posts), `pods_tableau` (idem) et `statsPassages` dans `F/pods/index.ts` (toutes les publications, sans fenêtre, au moins 3). BLEO impose la première partout.

### L'import aujourd'hui

- **Aucun cron ne met à jour les sources** : c'est un bouton (`MajSourcesPanel.tsx`, RPC `maj_sources_demarrer`, `F/_shared/maj_sources.ts`). Les ticks passent par les drains `import-contenu-drain-N`.
- Piège : sans `nouveauxSeulement`, `listerUrlsCompteReference` renvoie aussi les URL déjà connues, et ré-importer une URL connue **remet le contenu à zéro** (vues, pertinence, statut, decks). La mise à jour du lundi doit toujours passer `nouveauxSeulement: true`.
- Étapes : OCR de l'accroche (règle des stickers), pertinence par appli, OCR du reste, score d'import (ELO, seuil 63, forcé si la source a 40 000 vues ou plus), nettoyage, légende visuelle, validation.
- `accroche_norm` et `couverture_empreinte` sont calculées par la fonction `empreintes` (cron toutes les 10 min), après la validation. Les labels 100 % podz n'en ont pas.

### Les decks aujourd'hui

- Cuits **à l'assignation, à minuit**, à la première demande : `assurerDeckPourLangue` (Sophia, `F/_shared/import_contenu.ts`) et `assurerDeckApplication` (`F/_shared/deck_application.ts`, budget 60 s par lot, repli sur Sophia).
- Cache : `contenu_langues` (unique contenu × langue ; `slides`, `slides_base`, `hashtags`, `angle_placement`) et `contenu_langue_decks` (contenu × langue × variante d'appli ; `statut` pret / echec / ineligible).
- Modèles : `gemini-3.5-flash`, puis `2.0-flash`, puis `3.1-flash-lite` (`F/_shared/gemini.ts`). **Le modèle qui a répondu n'est stocké nulle part.**
- Placement : prompts `placement_sophia` / `placement_<slug>`, angle actif de `angles_placement`, jamais en slide 1, dans les 3 dernières, ± 20 % de longueur ; `sansConcurrent` retire les concurrents ; `#Tanıtım` ajouté en turc (`F/_shared/mention_publicite.ts`).
- `controlerFidelite` existe (`F/_shared/traduction_native.ts`) mais **n'est branché nulle part** en production. La table `corrections` est lue (40 dernières lignes) mais **personne n'y écrit**.

### Les podz aujourd'hui

- Routine commune `pods/ROUTINE.md` ; rythme `pods/rythme.json` (édité par le chef, par PR) ; guichet `F/pods/index.ts` (actions `deposer`, `etat`, `label`, `top_posts`, `valider`, `auto_valider`…).
- Un original validé devient un contenu au rang B (`validerOriginal`). La validation automatique (cron `pods-auto-validation`, M/0323) passe après `auto_validation_heures` (12 par défaut), podz par podz.
- **Aucun lien parent-enfant en base** : « variante de X », « essai » et « cta A/B/C » ne vivent que dans les `notes` des fichiers JSON des podz, jamais envoyés au guichet. `pod_livraisons` n'a ni parent, ni type BLEO.
- `verifierOriginal` (`F/_shared/pods.ts`) exige exactement une slide `texte_sophia` pour un label Sophia : à changer pour la slide marquée.

### Ce qui lit les rangs de la tierlist

À adapter avant de supprimer la tierlist : vues SQL `label_reserve` (M/0354), `stats_choix_label` (choix et fermeture des labels), `simulation_repartition`, `pods_tableau`, le contrôle quotidien (M/0341) ; `F/_shared/tiers_application.ts`, `F/_shared/pertinence_apps.ts`, `F/nettoyer-stickers` (les contenus A et plus y sont protégés), les actions `etat` et `label` des podz ; côté front, `AdminSlideshowsPage`, `AdminPodsPage`, `AdminMinuitPage`, `AdminReglagesPage`, `AdminLabelsPage` et `src/features/moteur/*`.

## Modèle de données

Tout s'ajoute à côté de l'existant, par migrations numérotées à la suite de `supabase/migrations/` : aucune colonne existante n'est supprimée avant la bascule. Les noms ci-dessous sont à garder tels quels (les autres sections les citent). RLS : lecture et écriture réservées aux admins et au service, comme les tables du moteur ; les podz passent par le guichet.

### Colonnes ajoutées

| Table | Colonne | Type | Rôle |
| --- | --- | --- | --- |
| `labels` | `voie` | smallint, défaut 1 | 2 pour white\_bg, mentalmaxxing, that\_girl\_study, Fathomly |
| `contenus` | `famille_id` | uuid → `bleo_familles` | Sa famille d'accroche (A2) |
| `contenus` | `generation` | smallint 0 à 2 | A2 |
| `contenus` | `parent_bleo_id` | uuid → `contenus` | Le contenu décliné. Ne pas réutiliser `parent_id`, pris par les variations |
| `contenus` | `type_bleo` | text | `import`, `reprise`, `full_test`, `declinaison`, `remake`, `historique` |
| `contenus` | `classe_defaut` | text | Classe de valeur par défaut (A5) |
| `contenus` | `etat_bleo` | text | `a_juger`, `en_test`, `juge` (A4) |
| `contenus` | `juge_le` | timestamptz | Passage à `juge` |
| `contenus` | `verdict` | text | `gagnant`, `non_gagnant`, `en_attente` (A3, au niveau du contenu) |
| `contenus` | `slide_appli` | smallint | Position marquée par le podz pour l'appli |
| `passages` | `r` | numeric | A1, non plafonné |
| `passages` | `r_calcule_le` | timestamptz | A1 |
| `passages` | `enregistrements` | integer | Le `collectCount` d'Apify |
| `passages` | `file_bleo` | text | `juger`, `valeur`, `rappel` |
| `passages` | `valeur_tirage` | numeric | Valeur attendue au moment du tirage |
| `passages` | `bleo_run_id` | uuid → `bleo_runs` | Le tirage qui l'a créé |
| `passages` | `bras` | text | `bleo` ou `temoin`, posé pendant l'A/B : bleo par bleo-assignation, temoin par bleo-nuit |
| `passages` | `circuit`, `voie_cta`, `forme_cta`, `deck_version` | text | Copiés du deck servi |
| `contenu_langues`, `contenu_langue_decks` | `circuit`, `modele`, `deck_version`, `voie_cta`, `forme_cta` | text | Qui a écrit le deck, avec quel modèle, quelle version |
| `contenu_langues`, `contenu_langue_decks` | `controles` | jsonb | Résultat des contrôles automatiques |
| `pod_livraisons` | `type_bleo` | text | `full_test` ou `declinaison` (originaux) ; `remake` (livrés) |
| `pod_livraisons` | `parent_contenu_id` | uuid | Le contenu décliné, obligatoire pour une déclinaison |
| `pod_livraisons` | `slide_appli` | smallint | Position marquée |

### Tables neuves

| Table | Clé | Colonnes | Rôle |
| --- | --- | --- | --- |
| `bleo_familles` | `id` | `label_id`, `accroche_norm`, `racine_contenu_id`, `verdict` (défaut `en_attente`), `verdict_le`, `close`, `close_le`, `created_at` ; unique (`label_id`, `accroche_norm`) quand l'accroche existe | Une famille d'accroche |
| `bleo_valeurs` | (`contenu_id`, `langue`) | `forme`, `defaut`, `n_r`, `n_post`, `n_accroche`, `facteur_age`, `valeur`, `calcule_le` | A5, réécrite chaque nuit |
| `bleo_classes` | (`semaine`, `classe`) | `valeur`, `n`, `calcule_le` | Valeurs par défaut de la semaine, avec historique |
| `bleo_runs` | `id` | `jour_vise`, `mode` (`ombre`, `ab`, `actif`), `demarre_le`, `fini_le`, `resume` jsonb, `erreur` | Un tirage de 14 h |
| `bleo_ombre_passages` | `id` | `run_id`, `compte_id`, `contenu_id`, `langue`, `application_id`, `file_bleo`, `valeur_tirage`, `creneau` | Ce que BLEO aurait assigné, pendant l'à blanc |
| `bleo_sources_decisions` | (`semaine`, `compte_reference_id`) | `posts`, `r_mediane`, `r_vs_label`, `decision` (`maj`, `pas_maj`, `peu_de_mesures`), `urls_ajoutees` | A11 |
| `bleo_commandes_langue` | `id` | `contenu_id`, `pod`, `langues` text\[\], `statut` (`a_faire`, `livree`, `annulee`), `cree_le`, `livree_le` | Voie 2 : un remake gagnant à refaire dans d'autres langues |
| `bleo_decks_file` | `id` ; unique (`contenu_id`, `langue`, `application_id`, `jour_vise`) | `voie_cta`, `slide_appli`, `statut` (`a_faire`, `en_cours`, `pret`, `echec`, `secours`), `circuit`, `essais`, `modele`, `controles`, `cree_le`, `fini_le` | Les commandes de decks du lendemain |
| `bleo_relectures` | `id` | `langue`, `label_id`, `application_id`, `contenu_id`, `slide_position`, `tache` (`ab_aveugle`, `correction`, `ecriture`), `version_agent`, `version_gemini`, `version_native`, `choix`, `type_erreur`, `relecteur_id`, `payee_le`, `created_at` | Les micro-tâches des natifs |
| `bleo_banque` | `id` | `langue`, `label_id`, `application_id`, `sorte` (`ecrit`, `corrige`, `valide`), `jeu` (`exemple` ou `test`), `slide_source`, `version_agent`, `version_finale`, `type_erreur`, `contenu_id`, `created_at` | La banque d'exemples de chaque langue |
| `bleo_fiches` | (`sorte`, `cle`, `version`) | `contenu` (markdown), `auteur`, `created_at` | Fiches `langue`, `label` et `appli`, versionnées, jamais écrasées |

`type_erreur` prend une valeur parmi : `tournure_anglaise`, `registre`, `vocabulaire`, `cta_trop_pub`, `cta_mal_place`, `longueur`, `autre`.

### Vues

| Vue | Colonnes | Rôle |
| --- | --- | --- |
| `bleo_mediane_compte` | `compte_id`, `mediane`, `n` | La médiane du glossaire, pour A1 et les rapports |
| `bleo_boite` | `label_id`, `famille_id`, `accroche`, `sorte` (`g1` ou `g2`), `parent_contenu_id`, `faites`, `verdict_le`, `au_budget` | A9, dans l'ordre de la boîte |
| `bleo_jauge` | `label_id`, `pod`, `familles_en_boite`, `par_jour`, `semaines`, `part_full_test` | A10 |
| `bleo_mix` | `jour`, `label_id`, `bras`, `file_bleo`, `categorie` (juger, recolte, gagnant\_servi, non\_gagnant\_neuve, non\_gagnant\_servie), `passages` | Le mélange réel, pour les rapports et l'A/B |

### Remplir l'existant (une fois, à l'installation)

1. `labels.voie = 2` pour les 4 labels 100 % podz.
2. Familles : regrouper les contenus valides par (label, `accroche_norm`), la racine = le plus ancien ; un contenu sans accroche = sa propre famille. Pour les originaux de podz, lire les `notes` des fichiers `pods/*/originaux/*.json` (« variante de X ») pour remplir `parent_bleo_id` et `generation` ; sans note, génération 0.
3. `type_bleo` : `historique` pour tout contenu validé avant BLEO, sauf les livrés (`remake`).
4. `etat_bleo` : `juge` si le contenu a au moins 2 passages mûrs ; sinon `a_juger`.
5. Calculer A1 sur 60 jours de passages, puis A3 et A5.

Classe de valeur par défaut d'un contenu historique : `import` pour un import, `podz` pour un original de podz, `livre` pour un livré. Elle ne pèse vraiment que pour ceux qui ont moins de 2 passages mesurés.

## Algorithmes

Onze calculs, dans l'ordre où ils tournent. Les nombres en gras sont des réglages (`reglages.bleo`), à lire au démarrage de chaque fonction.

### A1 · Mesurer un passage (chaque nuit)

Pour chaque passage `publie`, hors rappel, publié depuis **72 h** ou plus, dont les vues ont changé depuis le dernier calcul (`stats_maj_at > r_calcule_le`, ou `r_calcule_le` nul) :

1. Calculer la médiane du compte à cet instant (glossaire). Moins de **5** passages mûrs sur **45** jours : pas de médiane, `r` reste nul.
2. Écrire `passages.r = vues / médiane` (non plafonné en base) et `passages.r_calcule_le = now()`.

Le r d'un passage suit ses dernières vues connues ; la médiane est celle du jour du calcul.

### A2 · Rattacher un contenu à sa famille (à la validation)

La famille est propre à un label : la même accroche dans deux labels fait deux familles.

| Contenu validé | Famille | Génération | `type_bleo` |
| --- | --- | --- | --- |
| Import dont l'accroche existe déjà dans le label | Celle du contenu existant | 0 | `reprise` |
| Autre import | Nouvelle, dont il est la racine | 0 | `import` |
| Full test déposé par un podz | Nouvelle. Refusé au guichet si l'accroche existe déjà dans le label | 0 | `full_test` |
| Déclinaison déposée par un podz | Celle du parent déclaré au dépôt | parent + 1 | `declinaison` |
| Livré (voie 2) | Comme un import ; sans `accroche_norm`, une famille propre | 0 | `remake` |

Un dépôt de déclinaison est refusé si : la famille n'est pas gagnante, la famille est close, le parent est de génération 2, ou le quota de **3** déclinaisons du parent est atteint (A9).

*30/10 :* refusé aussi si la famille a déjà une déclinaison déposée le même jour (`famille_du_jour`, 0628), si une G1 n'a pas l'accroche du parent mot pour mot (`accroche_differente`) ou si une G2 la garde telle quelle (`accroche_identique`) (D35). Le guichet (`bleo_verifier_depot`, 0615) rend un code par refus.

### A3 · Verdict d'accroche (chaque nuit, après A1)

Pour chaque famille, sur tous les passages mûrs de ses contenus, rappels exclus :

- un passage à **10 000** vues ou plus, ou à r ≥ **2** → `gagnante` (définitif) et `verdict_le = now()` au premier passage à ce statut ;
- sinon, au moins **2** passages mûrs avec un r → `non_gagnante` (peut encore devenir gagnante) ;
- sinon → `en_attente`.

Le même test s'applique à un contenu seul (`contenus.verdict`) : il sert à la génération 2 (A9).

### A4 · États d'un contenu dans la diffusion

| État | Entrée | Sortie |
| --- | --- | --- |
| `a_juger` | Validation d'un contenu dont la famille est en attente | 2 passages de test assignés → `en_test` |
| `en_test` | Ses 2 passages de test sont assignés | Les 2 sont mûrs ; ou un passage fait **10 000** vues au relevé de J+2 ; ou **7** jours après le premier passage s'il n'en a eu qu'un → `juge` |
| `juge` | Voir ci-dessus ; ou directement à la validation si sa famille est déjà jugée (reprise, déclinaison) | Jamais : il reste dans la file valeur |

Un contenu `en_test` n'est tiré nulle part. Si sa famille reçoit un verdict pendant son test (grâce à un autre contenu), il reste en test jusqu'au bout.

Une reprise dont la famille est encore en attente reste `a_juger` sans recevoir de test : on ne teste pas deux fois la même accroche. Elle passe `juge` dès que sa famille reçoit un verdict (A3). Plus généralement, un contenu sort de `a_juger` ou `en_test` dès qu'il a 2 passages mûrs avec un r, quelle que soit leur origine (passages de test, ou passages du système actuel pendant l'à blanc et l'A/B).

### A5 · Forme et valeur attendue (chaque nuit, après A3)

```text
forme(c)  = (k × défaut(c) + somme des min(r, 20)) / (k + n)
            k = 2 ; n = passages mûrs de c avec un r, toutes langues, rappels exclus
valeur(c, L) = forme(c) × 0,6^n_post × 0,75^n_accroche × âge(c)
            n_post     = passages de c dans la langue L (assignés ou publiés)
            n_accroche = passages des autres contenus de sa famille dans L
            (30/10, D41 : sur les 60 derniers jours seulement ; un passage
             resté « assigné » ne compte que jusqu'à 3 jours après sa date)
            âge(c)     = 0,7 si c a plus de 45 jours (contenus.created_at), sinon 1
```

Le calcul couvre chaque couple (contenu valide, langue d'au moins un compte actif de ses labels). Il écrit `bleo_valeurs`. Les contenus `a_juger` et `en_test` y figurent aussi, avec leur valeur par défaut, pour les rapports, mais le tirage les ignore.

**Valeur par défaut** (`défaut(c)`), par classe, recalculée chaque lundi : la moyenne des r plafonnés à 20 du premier passage des contenus de la classe sur 60 jours, bornée entre **0,8** et **4**, gardée telle quelle si la classe a moins de **30** contenus mesurés.

| Classe | Contenus concernés | Valeur de départ (mesurée le 28/10) |
| --- | --- | --- |
| `import` | Import d'une accroche neuve | 2,0 |
| `podz` | Full test, et originaux de podz déposés avant BLEO | 2,7 |
| `accroche_gagnante` | Déclinaison, ou reprise d'une accroche gagnante | 3,2 |
| `accroche_non_gagnante` | Reprise d'une accroche non gagnante | 1,5 |
| `livre` | Remake livré (voie 2) | 4,0 (bornée ; moyenne brute 6,2) |

L'ELO ne sert plus à la valeur : la moyenne de r au premier passage va de 1,4 à 2,2 sans suivre l'ELO (63-67 : 1,71 ; 72-80 : 2,05 ; 80 ou plus : 1,42). L'ELO garde son rôle de porte d'import.

### A6 · Le pool d'un compte

Le pool est celui d'aujourd'hui (mêmes fonctions d'éligibilité, voir l'existant) : contenus valides des labels du compte, servables dans sa langue et pour son appli. BLEO ne change que l'ordre de tirage, pas qui est éligible. Le pool est appelé comme avec ignorerTierlist : les rangs, passages\_prevus et restants ne filtrent plus rien, et le repêchage des contenus D disparaît.

### A7 · L'assignation de 14 h (pour J+1)

Avant de tirer, `bleo-assignation` calcule A2, A4 et A5 pour les contenus validés depuis le dernier passage de `bleo-nuit` : un contenu validé à 13 h peut partir le lendemain.

1. **Créneaux** : pour chaque compte retenu par les exclusions actuelles, `posts_par_jour` créneaux (2 aujourd'hui pour les 358 comptes actifs). Les rappels J+7 prennent leurs créneaux d'abord, comme aujourd'hui.
2. **Taille de la file à juger**, par label : le nombre de passages de test encore à placer (2 par contenu `a_juger`, 1 par contenu `en_test` qui n'en a qu'un), au plus **40 %** des créneaux du label (0,30 depuis le 29/10, `file_juger.part_max`). Le reste va à la file valeur.
3. **Placer les tests** : les contenus `a_juger` du plus récent au plus ancien, ceux de plus de **30** jours en dernier. Pour chacun, 2 comptes du label qui ont une médiane (sinon le r n'existe pas), de langues différentes, avec un créneau libre, en préférant les langues où la famille n'est pas encore passée. Égalité : tirage au sort graineé.
4. **Remplir la file valeur**, compte par compte dans un ordre graineé. Pour chaque créneau :
   1. candidats = couples (contenu `juge`, langue du compte) du pool, après les garde-fous (A8) ;
   2. tirer un candidat avec une probabilité proportionnelle à valeur^**3** ;
   3. mettre à jour en mémoire : la valeur du contenu dans cette langue × 0,6, celle des autres contenus de sa famille × 0,75, le compteur de budget de la famille.
5. **Créneau sans candidat** : on relâche le budget de famille ; toujours rien, le créneau reste vide et le rapport le compte (un label ne devrait jamais en arriver là).
6. **Écrire** les passages, avec `file_bleo` (`juger`, `valeur` ou `rappel`), `valeur_tirage` et `bleo_run_id`.

La graine est dérivée de (date visée, `compte_id`) : rejouer un jour donne le même résultat, ce qui sert à l'à blanc.

Trois cas particuliers :

- **Compte à deux labels** (28 comptes) : il compte pour moitié dans les créneaux de chacun de ses labels pour la taille de la file à juger ; son tirage valeur se fait sur le pool réuni de ses deux labels.
- **Compte multi-applis** (`parts_applications` non nul) : l'appli de chaque créneau est choisie comme aujourd'hui (`choisirApplicationCreneau`), avant le tirage ; le tirage se fait ensuite dans le pool de cette appli. Le repli sur Sophia quand le deck d'une autre appli échoue reste en place.
- **Quota** : BLEO n'appelle jamais `baisserQuotaSiBesoin` ; un créneau vide est signalé, le quota du compte ne bouge pas.

### A8 · Garde-fous

- **Budget de famille** : les passages d'une famille sur les 7 derniers jours (publiés et assignés, plus ceux du tirage en cours) ne dépassent pas **20 %** des passages de son label sur la même période, avec un plancher de **2** passages.
- **Anti-répétition** par compte : le même contenu pas avant **14** jours ; la même famille pas avant **10** jours ; la même image de couverture pas avant **10** jours (règle actuelle de `doublons.ts`, gardée).
- **Rappels J+7** : inchangés.

### A9 · La boîte d'un podz

Une famille du label entre dans la boîte quand elle est `gagnante` et pas close. Elle y propose :

- des **déclinaisons de génération 1** tant que la racine en a moins de **3** (déposées, validées ou en attente) ;
- des **déclinaisons de génération 2** d'un contenu de génération 1 dont le verdict est gagnant (10 000 vues ou r ≥ 2 ; il n'a pas à battre son parent), tant qu'il en a moins de **3**.

Ordre de la boîte : les familles jamais déclinées d'abord, puis par `verdict_le` du plus récent au plus ancien. Les familles au budget (A8) ce jour-là sont signalées mais restent listées.

*Remplacé le 29 et le 30/10 (D35, 0606, 0628) :*
- **une seule ligne par famille** : sa G2 d'abord, sinon le parent qui a le moins de déclinaisons. Une famille dont plusieurs G1 ont gagné avait autant de lignes de G2, à la suite : 3 posts de la même accroche le même jour ;
- **ordre** : les familles qui ne sont pas au budget d'abord ; parmi elles, les G2 en tête, puis les familles jamais déclinées, puis `verdict_le` du plus récent au plus ancien. Les familles au budget passent en fin de boîte : leurs posts ne seraient pas servis avant des jours ;
- **une déclinaison par famille et par jour** (jour de Paris), tous parents confondus : le guichet refuse la deuxième (`famille_du_jour`) ;
- **G1** : l'accroche du parent mot pour mot ; **G2** : la même promesse, reformulée. Une déclinaison s'écrit dans la langue de son parent : la boîte d'un label mélange des familles anglaises et françaises, et l'OS traduit ensuite pour chaque compte.

**Fermeture** : une famille est close quand le r médian des passages mûrs de sa dernière génération passe sous **1**, mesuré sur au moins **4** passages. Ses contenus restent dans le tirage ; elle ne reçoit plus de déclinaison.

*29/10 (D36, 0608) :* la fermeture lit le r **moyen** (chaque r plafonné à 20) et non le r médian : un post qui explose sauve la famille. Elle est recalculée chaque nuit dans les deux sens : une famille rouvre si sa moyenne repasse à 1.

### A10 · La jauge et la part de full test (chaque matin, avant les podz)

```text
semaines = familles dans la boîte / (par_jour × 7 / 3)
part de full test = 10 % si semaines > 6 ; 20 % si 3 à 6 ; 30 % si 1 à 3 ; 40 % sous 1
full tests du jour = arrondi(part × par_jour), au moins 1 par semaine
```

Sous 1 semaine, l'OS envoie une alerte à Adrien et Max (ajouter des sources au label). Entre 1 et 3, le chef des podz le signale dans son point.

### A11 · La règle des sources (chaque lundi)

Pour chaque source active (`comptes_reference.is_active`), lire `source_performance` :

- moins de **5** posts mesurés, ou source listée dans sources.toujours → mise à jour ;
- `r_mediane > 1` ou `r_vs_label > 1` → mise à jour ;
- sinon → pas de mise à jour cette semaine. La source reste active, ses contenus aussi.

Mise à jour = importer ses posts publiés depuis `dernier_scrape_at`, par le circuit d'import actuel. Chaque décision est écrite dans `bleo_sources_decisions`. Au 28/10, 23 sources sur 46 passent.

## L'agent de langue

> **Remplacé le 29/10 par la réécriture native** (page Notion « Révolution placement/traduction », menée par la session de la relecture native). Ce qui vaut aujourd'hui :
> - **Un appel par deck**, qui voit tout le post et fait traduction et placement d'une passe. Il lit quatre fiches : **appli** (quoi dire, `fiches_appli`), **langue** (comment le dire, `bleo_fiches` sorte `langue`), **label** (l'angle de placement de Maximilien, le format du deck, où va l'appli, des exemples, ce que le podz du label en sait ; écrite, plus calculée) et **CTA** (les règles communes : un vrai conseil, l'appli fondue dedans, le même moule que les voisines, le hook jamais modifié, la mise en page et la frappe ; `bleo_fiches` sorte `cta`). Pas de session Claude par langue, pas de banque des relecteurs : les exemples viennent d'`exemples_natifs` et sont résumés dans la fiche langue.
> - **CTA** : l'OS n'impose que `reprise` et `marquee` (D2 ci-dessous, lignes 1 et 2) ; sinon l'appel choisit la slide, à partir de la slide 4, et la tournure. Plus de voie `prouvee` / `essai`, plus de forme tirée, plus de stats CTA (0624).
> - **Mesure** : duels à l'aveugle en Tests, sur des slideshows déjà publiés (deck parti contre deck du nouveau circuit, votes de l'admin et des relecteurs, 0620 et 0626). Rien dans l'assignation de minuit tant qu'Adrien ne le décide pas ; ensuite, une mise en production au compte-gouttes (le branchement de minuit et la cuisson de l'après-midi existent dans maxkender/sophia-os#908, fermée sans fusion).
> - **Gardé de D0 à D8** : les contrôles automatiques (D5, avec un deck recalé sur la source et nettoyé de ses espaces) et le secours par le circuit actuel (D6). Les fiches existent, mais pas comme D8 les décrit (voir l'encadré de D8). Le reste ci-dessous est la conception d'origine, pour mémoire.

L'agent de langue remplace `translateSlideshow` + `integrateSophia` pour la voie 1. Il traite la file `bleo_decks_file` de 14 h à 20 h ; à 23 h, le circuit Gemini actuel prend tout ce qui reste. La publication n'attend jamais l'agent.

### D0 · Où tourne l'agent : des tâches planifiées, comme les podz

L'agent de langue est une session Claude Code persistante, réveillée par une tâche planifiée, exactement comme un podz. Il tourne sur l'abonnement Claude du compte, garde sa mémoire d'un jour à l'autre et peut parler aux podz et au chef.

- **Une session par grande langue, une par famille pour les petites.** de, tr, fr, it, es et pt ont chacune leur session. Les autres sont groupées : nordiques (sv, no, da, fi) ; slaves (cs, sk, pl, sl, hr, sr, bg, ru) ; les autres (en, nl, el, hu, ro, et, lt, lv, ar, he, ja, es-419, pt-BR). En phase 4 : de, pt et tr seulement.
- **Un dossier par session** : `langues/<langue ou famille>/` dans le dépôt, sur le modèle de `pods/` : son `AGENT.md`, un `langues/ROUTINE.md` commun, un `atelier/` avec les outils `commandes`, `controler` et `deposer`, et `langues/README.md` qui liste les sessions (comme le tableau de `pods/chef/AGENT.md`).
- **Deux réveils par jour** : 14 h 15, juste après le tirage de 14 h ; 18 h 15, pour les commandes restantes et les corrections natives arrivées. Un réveil le lundi en plus pour la fiche langue (D8).
- **Un paquet = un sous-agent.** Chaque paquet d'environ 10 commandes est traité par un sous-agent de la session, qui repart d'un contexte propre (fiches, exemples, paquet). La session principale garde la mémoire de sa langue sans gonfler son contexte.
- **Le guichet `langues`** (fonction neuve, sur le modèle de `F/pods/index.ts`, un jeton par session) : `commandes` rend les commandes `a_faire` de ses langues, avec les slides source, les images réduites à 540 × 960, la voie, la slide marquée, le label, l'appli et les derniers CTA des comptes ; `controler` rend les contrôles D5 slide par slide ; `deposer_deck` écrit le deck en cache si les contrôles passent ; `corrections` rend les relectures natives du jour.
- **L'agent fait tout le texte lui-même.** Il traduit et adapte chaque slide (fidélité, naturel, références du pays) et écrit le CTA sur la bonne slide en regardant cette slide et la couverture, réduites. Aucun autre modèle n'intervient, hors secours Gemini de 23 h : `modele` vaut `claude`.
- **Parler aux podz et au chef** : `send_message` à la session d'un podz quand un de ses decks pose problème dans la langue (slide marquée qui tombe mal, jeu de mots intraduisible, référence qui ne passe pas), et un point du soir dans #podz (decks faits, refus, corrections natives). Un podz ou le chef écrit à la session d'une langue de la même façon.
- **Si l'abonnement sature** ou qu'une session prend du retard, rien ne casse : à 23 h, le secours Gemini prend toutes les commandes restantes (D6). La consommation se mesure en phase 4, dans l'usage du compte Claude, avant d'ajouter des langues.

### D1 · La file de commandes (14 h, juste après le tirage)

Pour chaque passage de J+1 qui n'est pas un livré : si aucun deck prêt n'existe pour (contenu, langue, appli), créer une commande `a_faire`. Plusieurs passages qui partagent ce triplet partagent la commande. Les passages sont créés **sans slides** ; le deck prêt les remplit, puis `materialiserPostDepuisPassage` crée le post, comme aujourd'hui.

Une langue absente de `bleo.agent.langues_actives` ne passe pas par l'agent : sa commande part tout de suite au circuit Gemini (`circuit = gemini`), sans attendre 23 h.

### D2 · La voie de CTA (fixée à la commande, pas par l'agent)

| Cas | Voie |
| --- | --- |
| Original de podz avec `slide_appli` | `marquee` : le CTA va sur la slide marquée |
| Import dont l'original nomme une appli (`positionConcurrent` non nul) | `reprise` : notre appli prend sa place, même slide, même forme ; le concurrent n'est jamais publié |
| Autre import | Tirage : `prouvee` (une forme de la fiche label) ou `essai`, selon les poids de la fiche label |
| Original de podz déposé avant la slide marquée | Fonctionnement actuel : sa slide Sophia est traduite (`deckSophiaDuPod`) |

Avant la première fiche label, les poids sont **75 %** `prouvee` (forme : l'angle actif de `angles_placement`) et **25 %** `essai`. L'essai ne descend jamais sous **20 %**. Pour un même contenu le même jour, chaque langue reçoit si possible une voie différente : c'est ce qui permet de comparer à contenu égal.

### D3 · Ce que l'agent reçoit (par paquet d'environ 10 commandes d'une même langue)

- Pour chaque commande : les slides source (`slides_base` de la langue source, texte et URL de l'image), le label, l'appli, la voie et sa forme, la position imposée s'il y en a une (`marquee`, `reprise`), et le pays des comptes qui publieront.
- La dernière version des fiches `appli/<slug>`, `label/<nom>` et `langue/<code>` (`bleo_fiches`).
- Environ 10 exemples de `bleo_banque` (`jeu = exemple`) : même langue ; même label et même appli d'abord, puis les plus récents.
- Les règles déjà codées : `regleLocalisationScolaire` et le profil de voix de la source (`style_profile`).

Chaque paquet est traité par un sous-agent neuf, sans mémoire du précédent (D0). La session tourne sur le modèle par défaut de l'abonnement ; la phase 4 mesure son usage.

### D4 · Ce que l'agent rend (JSON strict, une entrée par commande)

```json
{
  "commande_id": "uuid",
  "slides": [{ "position": 1, "texte": "…" }],
  "slide_cta": 6,
  "forme_cta": "étiquette courte de la forme employée",
  "refus": null
}
```

`refus` = `{ "motif": "…" }` quand la voie ne colle pas au post : la commande repasse en `reprise` si c'est possible, sinon en `prouvee`, et le refus est noté dans `controles`.

### D5 · Les contrôles automatiques (du code, pas l'agent)

Dans cet ordre ; le premier échec arrête la suite :

1. Même nombre de slides, mêmes positions que la source.
2. Chaque slide sauf celle du CTA : `controlerFidelite` (`F/_shared/traduction_native.ts`). Une slide infidèle → l'agent la réécrit une fois ; deuxième échec → secours.
3. Longueur : chaque slide fait au plus **130 %** des caractères de sa source.
4. Appli : la slide du CTA nomme l'appli avec le nom de la fiche appli pour cette langue ; aucune autre slide ne la nomme ; aucun concurrent (`MOTIF_CONCURRENT`, `F/_shared/concurrents.ts`) ; pas « Sophia » si l'appli n'est pas Sophia ; le CTA dans les 3 dernières slides et jamais en slide 1 (règle actuelle), sauf position imposée par la voie marquee ou reprise.
5. Anti-copie : la phrase du CTA n'est pas identique (après `normaliserAccroche`) à celle d'un des 10 derniers posts des comptes qui la publieront ; aucune suite de 8 mots ou plus recopiée d'un exemple ou d'une fiche.
6. La mention publicitaire locale (`#Tanıtım` en turc) est ajoutée par le code (`mention_publicite.ts`), jamais demandée à l'agent.

Tout passe : le deck est écrit dans le cache (`contenu_langues` pour Sophia, `contenu_langue_decks` pour les autres applis) avec `circuit = agent`, `modele`, `deck_version`, `voie_cta`, `forme_cta`, `controles` ; la commande passe `pret` ; les passages de J+1 reçoivent les slides.

### D6 · Le secours (23 h) et la vérification (minuit)

- 23 h : chaque commande `a_faire`, `en_cours` ou `echec` part au circuit actuel (`assurerDeckPourLangue`, `assurerDeckApplication`), avec `circuit = gemini`. Elle passe `secours`.
- 00 h : tout passage du jour sans slides est signalé dans le rapport et dans `#podz` ; le circuit actuel est relancé pour lui.

### D7 · La relecture native, en micro-tâches (15 h – 22 h)

| Tâche | Ce que fait le natif | Ce qui en sort |
| --- | --- | --- |
| `ab_aveugle` | Choisit entre deux versions d'un même deck (agent ou Gemini, ordre tiré au sort), ou « égal » ; note chaque version sur 5 et laisse une remarque typée | Le choix, dans `bleo_relectures` (phases 4 et 5). Dès aujourd'hui, pour les duels de l'A/B traduction (0620) envoyés par l'admin : `ab_traduction_votes` (0626), lus par le circuit candidat et par le rapport D8. Les duels viennent du lot commun (0627) : 15 slideshows choisis pour couvrir les labels, les mêmes pour toutes les langues, préparés et envoyés automatiquement dès qu'un relecteur de la langue est indiqué dans l'OS |
| `correction` | Réécrit une slide comme il la posterait, CTA compris, et choisit un `type_erreur` | Avant 22 h : le deck corrigé remplace celui du cache (`deck_version` + 1) et part le lendemain. Toujours : une ligne `corrige` dans `bleo_banque` |
| `ecriture` | Écrit un deck entier de A à Z (le kit natif, pour démarrer la banque) | Des lignes `ecrit` dans `bleo_banque` |

Un deck validé tel quel donne une ligne `valide`. Jusqu'à 50 decks par langue, 3 sur 5 vont au jeu `exemple` et 2 sur 5 au jeu `test` ; ensuite tout va en `exemple`. Les tâches sont payées à l'unité (montants en réglage), dans la paie du lundi (`paie_generer_lundi`). En attendant la station de relecture dans l'OS, un Google Sheet suffit (une ligne par slide), importé chaque soir.

### D8 · Les fiches

> **État au 30/10** : les fiches s'écrivent et se versionnent dans la page Fiches (Admin → Config → Fiches), rien n'est calculé chaque lundi.
> - **Fiche label** : écrite. Version 1 (0625) : l'angle de placement actif de Maximilien, cité tel quel, et des exemples tirés de nos posts publiés ; version 2 (0626) : ce que le podz du label sait de la slide d'appli. Plus d'agent stats, plus de formes classées ni de poids, plus de seuil de 20 posts par forme : les vues ne jugent pas un CTA (0624, docs/cta.md).
> - **Fiche appli** : celle d'Adrien, plus une rubrique « Ce que les pods en savent » (0627) ; les écarts avec la pratique des podz sont notés dans « À trancher ».
> - **Fiche langue** : en anglais, avec les mots natifs cités tels quels, écrite d'après `docs/fiches-langue-brief.md`. La boucle du lundi (règles tirées des corrections, juge à 55 %) n'existe pas encore.
> - **Fiche CTA** : une seule, commune (0623), version 3.

- **Fiche appli** : écrite par Adrien, une par appli. Ce que fait l'appli, ce qu'on peut affirmer ou non, son nom dans chaque langue, ses concurrents.
- **Fiche langue** : chaque lundi, l'agent de langue propose des règles tirées des erreurs qui reviennent environ 3 fois dans `bleo_banque`. La nouvelle version n'est gardée que si elle bat l'ancienne sur les decks du jeu `test` : un juge (modèle Claude) compare à l'aveugle les deux sorties à la version du natif, et la nouvelle doit gagner au moins **55 %** des duels.
- **Fiche label** : chaque lundi, l'agent stats du label lit les passages mûrs du label sur 45 jours (hors rappels et comptes bridés par le contrôle CKD), compare les voies et les formes de CTA à contenu égal (percée, r, enregistrements pour 1 000 vues), et écrit une nouvelle version : ton, formes classées avec leur nombre de posts et leur confiance, poids des voies (essai ≥ 20 %), formes à éviter, journal. Une conclusion ne change qu'avec au moins **20** posts par forme.

Le détail des prompts et le choix du modèle appartiennent à l'autre agent ; ces entrées, sorties et contrôles sont le contrat entre ses travaux et l'OS.

## Les podz

Les podz changent sur trois points : ils lisent leur boîte au lieu de chercher des preuves, ils déclarent le type et le parent de chaque dépôt, et leur part de full test suit la jauge. La voie 2 garde son fonctionnement et reçoit des commandes de langue.

> **30/10.** La bascule des podz est un réglage : `bleo.podz.type_obligatoire` (faux, puis vrai le dimanche 1/11 au soir). Tant qu'il est faux, `npm run boite` affiche « pas encore » et la voie 1 suit `pods/ROUTINE-avant-bleo.md` (sauf la répétition des podz 8 et 9 les 31/10 et 1/11). Ce qui a été construit (L4) : l'action `boite`, le dépôt déclaré et ses codes de refus, la recherche d'images par légende (`npm run images -- --cherche`), la routine en deux voies, le chef sur la jauge. Pas encore : `etat` et `label` sur r et `bleo_valeurs`, les commandes de langue de la voie 2, `slide_appli`, la validation à 6 h (L7). Les consignes des routines des podz ne se changent que depuis la conversation de chaque podz : la routine commune (`pods/ROUTINE.md`) prime sur elles.

### P1 · Le guichet (`F/pods/index.ts`)

| Action | Changement |
| --- | --- |
| `boite` (neuve, jeton du podz) | Rend `bleo_boite` pour le label du podz, dans l'ordre, avec la jauge (`bleo_jauge`) : semaines, part de full test, nombre de full tests du jour, familles au budget |
| `deposer`, `type: "original"` | Deux champs obligatoires : `type_bleo` (`full_test` ou `declinaison`) et, pour une déclinaison, `parent_contenu_id`. Refus avec un code clair dans les cas de A2 (`famille_non_gagnante`, `famille_close`, `generation_max`, `quota_atteint`, `accroche_existante` pour un full test dont l'accroche existe déjà dans le label) |
| `deposer`, preuve | La preuve (`verifierPreuve`) n'est plus exigée pour les dépôts BLEO : la boîte la remplace |
| `deposer`, slide d'appli | Phase 5 : `slide_appli` (une position, jamais 1) remplace `texte_sophia`. `verifierOriginal` accepte l'un ou l'autre tant que `bleo.slide_marquee` est faux, puis exige `slide_appli` |
| `etat`, `label` | Lisent `passages.r`, `etat_bleo`, `verdict` et la valeur moyenne dans `bleo_valeurs`, au lieu de `tier` et `restants`. Même r que partout (glossaire) : `statsPassages` est à aligner |
| `commandes` (neuve, voie 2) | Rend les `bleo_commandes_langue` à faire du podz |
| `validerOriginal` | Écrit en plus `famille_id`, `generation`, `parent_bleo_id`, `type_bleo`, `classe_defaut`, `etat_bleo`, `slide_appli` (A2, A4). Le rang B reste écrit tant que la tierlist vit |
| Validation automatique | `auto_validation_heures` passe à **6** pour tous les podz, et `auto_validation` est activée pour eux (phase 3) |

### P2 · La nouvelle routine (`pods/ROUTINE.md`)

1. Repartir propre : inchangé.
2. Combien : `par_jour` et `pause` de `pods/rythme.json`, inchangé.
3. Mesurer : `npm run etat` (version BLEO), puis le suivi à 3 jours. `playbook --mesurer` reste : le playbook est la mémoire du label. La veille du lundi (`--decouvrir`) est supprimée.
4. Lire la boîte : `npm run boite` (outil neuf `atelier/cli-boite.ts`, action `boite`).
5. Composer le jour : d'abord les demandes du chef (comptées dans le total), puis le nombre de full tests donné par la jauge, puis des déclinaisons dans l'ordre de la boîte. Boîte vide : uniquement des full tests, et le signaler.
6. Écrire, contrôler, déposer : `cli-deposer.ts` envoie `type_bleo`, `parent_contenu_id` et, en phase 5, `slide_appli`.
7. Rendre compte en 3 lignes, plus : la jauge, les familles déclinées, les full tests.

Règles supprimées : « 3 variantes en plus » après une percée à 30 k, l'essai une livraison sur cinq, la veille, la limite d'une livraison par jour d'une famille utilisée 3 fois en 7 jours (remplacée par le quota de 3 et le budget de famille), et, en phase 5, le test de CTA A/B/C.

*30/10 :* la limite par famille revient sous une autre forme, côté boîte et guichet (une déclinaison par famille et par jour, A9). Les CTA A/B/C restent, pour varier les posts, mais ne sont plus jamais jugés ni remplacés d'après leurs vues (décision du 30/10) ; le point du chef n'a plus de ligne CTA. Les `AGENT.md` qui répètent ces règles (par exemple `alpha-yellow/AGENT.md` : « 2 ou 3 variantes » à r ≥ 2) sont à corriger dans la même PR.

### P3 · Le chef des podz (`pods/chef/AGENT.md`)

- Voie 1 : il lit `bleo_jauge`. Il monte `par_jour` de 1 quand la boîte a plus de 6 semaines et que la file à juger du label a de la place (moins de 90 % de ses créneaux utilisés sur 7 jours). Il le baisse de 1 quand la jauge reste sous 1 semaine pendant 14 jours. « Le rythme ne baisse jamais » disparaît.
- Voie 2 : règle actuelle des jours de stock (moins de 7 jours par compte et par langue : +1 par jour), plus les commandes de langue en attente.
- Son point du matin ajoute : la jauge de chaque podz, la part de full test tenue, les familles closes, les générations 2 ouvertes.

### P4 · La voie 2 (podz 1, 6, 10, 11)

- Les remakes suivent la liste du compte modèle, comme aujourd'hui. Pas de boîte, de jauge ni de full test.
- **Commandes de langue** : chaque nuit, après A3, chaque livré dont le verdict est `gagnant` et qui manque dans une langue des comptes actifs de son label reçoit une ligne `bleo_commandes_langue`. Le podz la lit par l'action `commandes` et livre par le circuit `~langues` existant ; à la validation, la commande passe `livree`.
- Le tirage est celui de la voie 1, dans les pools de leurs labels. Petit label sans compte qui ait une médiane (Fathomly : 3 comptes, that\_girl\_study : 1) : les tests vont à n'importe quel compte du label, et le verdict ne lit que les 10 000 vues.

## Le planning des tâches

> **30/10, ce qui tourne vraiment** (fonctions SQL, pg_cron) : `bleo-nuit` à 5 h 15 (A1 à A5, A9, A10), `bleo-jauge-photo` à 5 h 40, `bleo-tirage` à 14 h (plan du lendemain, en mode `ombre` comme `actif`), `bleo-rapport` à 22 h (plan contre réel, résumé à Adrien dans la session de coordination, pas dans `#podz`). Pas encore : `bleo-lundi` (L3), le secours de 23 h et les sessions de langue (colonne langue remplacée).

Quatre fonctions neuves (`bleo-nuit`, `bleo-lundi`, `bleo-assignation`, `bleo-secours`) s'ajoutent aux crons existants. Chaque cron neuf suit le modèle de M/0302 : deux horaires UTC et une garde sur l'heure de Paris, pour tenir l'heure d'été comme l'heure d'hiver.

| Heure de Paris | Tâche | Fonction | Lit | Écrit |
| --- | --- | --- | --- | --- |
| 00 h 00 | Nuit actuelle | `minuit-vnext` (existante) | — | Avant la bascule : l'assignation du jour. Après : seulement la vérification (D6), l'upscale et la fermeture des labels |
| 00 h – 05 h | Relevé des vues | `rattrapage-elo` (existante) | Apify | `passages.vues`, `likes`, `commentaires`, `partages`, et désormais `enregistrements` |
| 05 h 15 | Calculs de la nuit | `bleo-nuit` (neuve) | `passages`, `contenus`, `bleo_familles` | Dans l'ordre : A1, A3, A4 (sorties de test), commandes de langue (P4), A5, fermetures (A9), jauge (A10), `bleo_mix`. Si le relevé n'est pas fini, elle réessaie toutes les 10 min jusqu'à 05 h 45, puis calcule avec ce qu'elle a et le signale |
| 06 h – 07 h 47 | Routines des podz | Sessions des podz | Action `boite`, `etat` | Dépôts |
| 08 h 13 | Point du chef | Session du chef | `bleo_jauge`, `pods_tableau` | `pods/rythme.json` par PR |
| Toutes les heures, à :20 | Validation automatique | `pods` action `auto_valider` (existante) | `pod_livraisons` | Contenus valides (6 h après le dépôt) |
| Lundi 06 h 00 | Calculs du lundi | `bleo-lundi` (neuve) | `source_performance`, premiers passages | A11 (décisions et mises à jour, toujours `nouveauxSeulement`), `bleo_classes`, alertes de jauge |
| Lundi 07 h – 12 h | Fiches label et fiches langue | Sessions d'agents (D8) | `passages`, `bleo_banque` | `bleo_fiches` |
| 14 h 00 | Tirage de J+1 | `bleo-assignation` (neuve) | `bleo_valeurs`, pools, garde-fous | Selon `bleo.mode` : `bleo_ombre_passages` (ombre) ou `passages` (ab, actif) ; puis la file de decks (D1) |
| 14 h 15, puis 18 h 15 | Decks | Tâches planifiées des sessions de langue (neuves, D0) | `bleo_decks_file` | Decks en cache, slides des passages |
| 15 h – 22 h | Relecture native | Station de relecture (ou Google Sheet) | Decks prêts | `bleo_relectures`, `bleo_banque`, decks corrigés |
| 22 h 00 | Rapport du jour | `bleo-assignation` action `rapport` | `bleo_runs`, `bleo_mix` | Rapport à blanc ou A/B (voir plus bas), posté dans `#podz` |
| 23 h 00 | Secours | `bleo-secours` action `secours` | Commandes non prêtes | Decks Gemini (D6) |

**Pendant l'A/B, les deux systèmes se partagent chaque compte.** À 14 h, `bleo-assignation` remplit un créneau du lendemain ; à minuit, `listerComptesSousQuota` voit le créneau manquant et le système actuel le remplit. `bleo-nuit` pose ensuite `bras = 'temoin'` sur ce passage.

## À blanc et A/B : les 14 jours

> **Remplacé le 29/10 (pas d'A/B) et le 30/10 (bascule avancée).** À blanc du 29/10 au 1/11 : la nuit, le plan de 14 h et le rapport de 22 h (plan contre réel, portes de W1) tournent chaque jour. Répétitions le samedi 31/10 et le dimanche 1/11 (servabilité du plan sur tous les comptes, assignation à blanc qui suit le plan, dépôts des podz 8 et 9 par la boîte). **Dimanche 1/11 à 20 h 20** : si les contrôles sont verts, `bleo.mode = actif` et `bleo.podz.type_obligatoire = true` ; minuit assigne le lundi 2/11 sur le plan. À la place de la mesure A/B : le suivi avant/après (`bleo_suivi_jours`) et son alerte (`bleo_suivi_alerte`). La tierlist reste en secours ; L8 vers le 16/11 après 14 jours stables. La porte de W1 « chaque contenu servable validé depuis 3 jours a ses 2 tests » échoue chaque jour sur les petits labels (white_bg, clean_study, RH, Fathomly, mentalmaxxing, that_girl_study) : à trancher (part plus haute pour eux, ou critère limité aux labels qui ont la place). La suite de cette section est la conception d'origine, pour mémoire.

BLEO est jugé en 14 jours : 3 jours à blanc pour vérifier qu'il fonctionne, puis 11 jours d'A/B où chaque compte publie chaque jour un post choisi par BLEO et un post choisi par le système actuel. La décision tombe le soir du jour 14.

### Le calendrier

| Jour | 14 h | 22 h | Décision |
| --- | --- | --- | --- |
| Avant J1 | — | `bleo-nuit` tourne 3 nuits de suite, sans rien publier | Prérequis (W0) |
| J1 | Plan à blanc pour J2 | Contrôles du plan | — |
| J2 | Plan à blanc pour J3 | Rapport : plan de J2 contre l'assignation réelle de J2 | — |
| J3 | Plan à blanc pour J4 | Rapport de J3 | — |
| J4 | 13 h : porte ; 14 h : premier tirage A/B, pour J5 | Rapport de J4 (à blanc) | Porte « BLEO tourne » |
| J5 à J7 | Tirage A/B du lendemain | Rapport de fonctionnement | Arrêts automatiques |
| J8 à J13 | Tirage A/B du lendemain | Fonctionnement, plus l'A/B cumulé (premières paires mûres à J8) | Arrêts automatiques ; perte nette dès J10 |
| J14 | Tirage A/B pour J15 | Rapport final sur les paires de J5 à J11 | Porte « BLEO rapporte plus » |
| J15 | Si BLEO gagne : premier tirage plein, pour J16 | — | Bascule |
| J17 | — | Rapport de confirmation sur les paires de J12 à J14 | Confirmer ou revenir |

### W0 · Prérequis, avant J1

- Lots fusionnés : L0, L1, L2, L5 et L7. L3 et L4 (sources, podz) sont fusionnés avant J1 ou après J14, jamais pendant : rien d'autre ne doit changer pendant la mesure.
- `bleo-nuit` a tourné 3 nuits de suite sans erreur ; `bleo_valeurs` couvre tous les couples ; aucun contenu valide n'est sans `famille_id`.
- J1 peut tomber n'importe quel jour, dès que les prérequis sont là. Seule précaution : que J4 (la porte et le premier vrai tirage) et J15 (la bascule) tombent en semaine, pour que quelqu'un regarde ; un départ un lundi ou un mardi le garantit. Si L3 est fusionné, lancer `bleo-lundi` une fois à la main la veille de J1. J1 à 9 h : `bleo.mode = ombre`.
- Les decks des deux bras passent par le même circuit (Gemini). L'agent de langue peut tourner à blanc pendant ces 14 jours (L9) : aucun de ses decks n'est publié, et la comparaison ne mesure que le choix des contenus.

### W1 · J1 à J3 : à blanc

- 14 h : `bleo-assignation` écrit le plan du lendemain dans `bleo_ombre_passages`. Rien n'est publié.
- 14 h 30 : contrôles du plan, sans attendre le réel : quota tenu, créneaux vides, garde-fous (requête indépendante du code de tirage), mélange, tests placés, durée.
- 22 h, à J2, J3 et J4 : le plan du jour contre ce que minuit a vraiment assigné. Valeur du plan (somme des `valeur_tirage`) contre la valeur des choix réels (même table `bleo_valeurs`) ; part des couples (compte, contenu) identiques.
- Les états des contenus se calculent sur les vrais passages (règle de sortie générale de A4).

**Porte « BLEO tourne »**, J4 à 13 h, sur les plans de J2, J3 et J4 et les rapports de J2 et J3 :

- quota tenu pour au moins **99,5 %** des comptes, aucun créneau vide dans un label qui a du stock ;
- 0 infraction aux garde-fous ;
- file à juger entre **25** et **35 %** des créneaux, non-gagnants **15 %** au plus, récolte **35 %** au moins ;
- chaque contenu servable validé depuis 3 jours a ses 2 tests dans le plan ;
- tirage fini avant **14 h 30** ;
- valeur du plan BLEO au moins égale à celle des choix réels, les 2 jours comparés.

Un critère manqué : on corrige, et le cycle reprend à J1 dès le correctif fusionné, avec la même précaution sur J4 et J15.

### W2 · J4 à J14 : A/B, un créneau sur deux

- **Le partage** : chaque jour à 14 h, de J4 à J14, `bleo-assignation` (`bleo.mode = ab`) remplit **un** créneau du lendemain pour chaque compte qui a ses 2 créneaux libres (pas de rappel ce jour-là), voie 1 et voie 2. Le passage reçoit `bras = 'bleo'`.
- À minuit, le système actuel remplit l'autre créneau comme d'habitude. `bleo-nuit` pose `bras = 'temoin'` sur tout passage non rappel d'un compte qui a un passage `bleo` le même jour.
- Un compte dont le label est dans `bleo.ab.labels_exclus` n'a pas de créneau BLEO.
- **Decks** : ceux du bras BLEO sont cuits l'après-midi (L7), ceux du témoin à minuit, par le même circuit.
- **Pourquoi ce partage** plutôt que deux groupes de comptes : chaque compte est son propre témoin (même compte, même jour, même posteur). L'écart de niveau entre comptes sort de la mesure, et il faut environ deux fois moins de posts : environ 730 paires pour voir +15 %, contre environ 1 500 posts par groupe avec deux groupes de comptes. Le risque est limité à un créneau sur deux.
- **Le mélange** : BLEO ne remplit qu'un créneau par compte, environ 358 par jour ; la file à juger en prend au plus 40 % (environ 143), de quoi placer les quelque 140 tests du jour.

**La mesure**

- Une paire = un compte, un jour, son post `bleo` et son post `temoin`, publiés tous les deux et mûrs. La décision lit les paires de la voie 1 ; la voie 2 est rapportée à part.
- Mesure principale : la moyenne, sur les paires, de ln(1 + vues du post bleo) − ln(1 + vues du post temoin). Gain = exp(moyenne) − 1. Intervalle à 95 % par bootstrap par compte : on tire 2 000 fois les comptes avec remise, chacun avec toutes ses paires.
- Mesures secondaires : rapport des vues totales des deux bras sur les paires, percée, r médian, enregistrements pour 1 000 vues, taux de publication de chaque bras, part des paires où le post BLEO est publié en premier (attendue près de 50 %), decks manquants.
- Volume : environ **99 paires par jour** (mesuré sur 42 jours : 4 146 paires de comptes qui ont publié leurs 2 posts le même jour). À J14, les paires mûres sont celles de J5 à J11 : environ **700**. Avec l'écart-type mesuré de la différence (1,35), un gain réel de +15 % a environ 4 chances sur 5 d'être vu ; un gain plus petit donnera « non concluant ».

**Les arrêts automatiques**, vérifiés chaque soir :

| Signal | Seuil | Action |
| --- | --- | --- |
| Decks manquants à la publication, bras BLEO | Plus de 1 % deux jours de suite | `bleo.mode = ombre` |
| Créneaux BLEO vides | Plus de 0,5 % un jour | `bleo.mode = ombre` |
| Écart de taux de publication entre les bras | Plus de 3 points sur 3 jours | Enquête ; arrêt si BLEO en est la cause |
| Perte nette, à partir de J10 et de 300 paires | Borne haute de l'intervalle sous −10 % | `bleo.mode = off`, analyse |

### W3 · J14 au soir : la décision

| Résultat, sur les paires de J5 à J11 | Condition | Suite |
| --- | --- | --- |
| BLEO gagne | Borne basse de l'intervalle au-dessus de 0, rapport des vues totales ≥ 0,95, aucun arrêt déclenché | Bascule (W4) |
| Non concluant, tendance positive | L'intervalle contient 0, estimation ≥ 0 | A/B prolongé de 7 jours ; décision à J21 sur environ 1 400 paires, de quoi voir +11 % |
| Non concluant négatif, ou BLEO perd | Estimation sous 0 | Retour en `ombre`, analyse label par label, correction, nouveau cycle de 14 jours |

Label par label : un label dont l'estimation est sous −10 % sur au moins 50 paires reste sur l'ancien système à la bascule (`bleo.ab.labels_exclus`), le temps de comprendre.

### W4 · J15 à J17 : bascule et confirmation

1. J15 à 14 h : `bleo.mode = actif`. BLEO remplit tous les créneaux de J16. `minuit-vnext` ne lance plus les étapes `tierlist` ni `assignation` ; `bleo-assignation` programme aussi les rappels J+7.
2. J17 à 22 h : rapport de confirmation sur les paires de J12 à J14. Si la borne haute passe sous 0 : retour à l'ancien système (`bleo.mode = off`, étapes de minuit rétablies).
3. 14 jours stables après J17 : suppression de la tierlist (L8). Les lettres de rang restent un affichage, calculé depuis la forme (S+ ≥ 8, S ≥ 4, A ≥ 2, B ≥ 1, C ≥ 0,5, D en dessous). Les colonnes de rang restent en lecture 30 jours, puis sont supprimées.

## Lots de travail

Onze lots, chacun livrable seul, par une PR sur `main` avec ses tests. Un lot ne commence que si ceux dont il dépend sont fusés. Les lots L0 à L8 forment la colonne « idées et diffusion » ; L9 à L11, la colonne « agent de langue », menée en parallèle.

| Lot | Contenu | Dépend de | Test d'acceptation |
| --- | --- | --- | --- |
| L0 · Instrumenter | Toutes les migrations du modèle de données ; `collectCount` lu dans `F/_shared/apify.ts` et écrit par `rattrapage_elo` dans `passages.enregistrements` ; `callWithFallback` (`F/_shared/gemini.ts`) rend le modèle qui a répondu, écrit dans les colonnes de deck ; réglages `bleo` insérés, `bleo.mode = off` | — | Après une nuit : au moins 95 % des passages re-mesurés ont `enregistrements` ; chaque deck neuf a son `modele` ; rien d'autre ne change dans l'assignation |
| L1 · Remplir l'existant | Les 5 étapes de « Remplir l'existant » (modèle de données) | L0 | Chaque contenu valide a `famille_id`, `generation`, `type_bleo`, `etat_bleo` ; 10 variantes de podz tirées au hasard ont le bon parent selon leurs `notes` |
| L2 · `bleo-nuit` | A1, A3, A4, A5, fermetures (A9), jauge (A10), commandes de langue (P4), `bleo_mix` ; cron 05 h 15 | L1 | Tests unitaires de chaque formule (lissage, exposants, âge, transitions d'état) ; deux passages de suite donnent le même résultat ; durée sous 10 min |
| L3 · `bleo-lundi` | A11, `bleo_classes`, alertes de jauge ; cron lundi 06 h | L2 | Rejoué sur les données du 28/10 : les mêmes 23 sources sur 46 ; aucune URL déjà connue n'est ré-importée |
| L4 · Podz | Guichet (P1), `ROUTINE.md` et `AGENT.md` (P2), chef (P3), outils `cli-boite` et `cli-deposer` | L2 | Chaque code de refus de A2 a son test ; une déclinaison d'une famille non gagnante est refusée ; l'ordre de la boîte suit A9 |
| L5 · Tirage à blanc | `bleo-assignation` en mode `ombre` (A6 à A8), `bleo_runs`, `bleo_ombre_passages`, rapport de 22 h | L2 | Rejouer un même jour deux fois donne le même plan ; la requête de contrôle des garde-fous rend 0 ligne ; → **porte « BLEO tourne »** (W1) |
| L6 · A/B | Mode `ab` : un créneau sur deux tiré par BLEO (W2), marquage des bras, rapport A/B quotidien, arrêts automatiques | L5, L7 | Les jours sans rappel, chaque compte de l'A/B a exactement 1 passage bleo et 1 passage temoin ; jamais 2 passages BLEO ; → **porte « BLEO rapporte plus »** (W2) |
| L7 · Decks l'après-midi | Après le tirage de 14 h, les decks du circuit actuel sont cuits dans la foulée (drain), pas à minuit ; validation automatique à 6 h pour tous les podz | L0 | Sur 3 jours, tous les passages de J+1 ont leurs slides avant 23 h ; aucune régression du taux de decks en échec |
| L8 · Bascule | W3 ; suppression de la tierlist et adaptation des lecteurs de rang | L6 | 14 jours sans créneau vide ni deck manquant ; plus aucune lecture de `tier` hors de l'affichage |
| L9 · Agent de langue à blanc | `bleo_decks_file`, le guichet `langues` et les sessions de langue en tâches planifiées (D0 à D6) en mode à blanc : l'agent écrit, la version Gemini part ; relectures `ab_aveugle`, banque, fiches, import du Google Sheet ; 3 langues (de, pt, tr) | L7 | Au moins 95 % des commandes donnent un deck qui passe les contrôles avant 23 h ; usage de l'abonnement Claude mesuré par jour ; banque à 20 ou 30 exemples par langue → **porte « banque prête »** |
| L10 · Test 50/50 de l'agent | Par compte, dans les 3 langues : la moitié publie la version de l'agent ; slide d'appli marquée (`bleo.slide_marquee = true`) | L9 | Environ 460 posts par bras ; vues, percée (20 k) et enregistrements comparés à contenu égal → **porte « l'agent gagne »** |
| L11 · Étendre | Langue par langue (`bleo.agent.langues_actives`) ; agents stats de label et fiches label ; fin du test de CTA A/B/C | L10 | Chaque langue ajoutée garde moins de 1 % de decks en secours sur une semaine |

**État des lots au 30/10**

| Lot | État |
| --- | --- |
| L0 | Modèle de données fait (0600). Pas encore : `enregistrements` (0 sur 3 290 posts publiés en 7 jours), `modele` et `cuit_le` des decks, garde des colonnes BLEO de `passages` (D10) |
| L1 | Fait (0601) |
| L2 | Fait (0602, 0604, 0608, 0612, 0616), en fonction SQL |
| L3 | Pas commencé (`bleo-lundi`, A11, `bleo_classes` recalculé, alertes de jauge) |
| L4 | Fait (0615, 0628, guichet, outils des 7 podz, routines, chef, légendes) ; bascule le 1/11 au soir |
| L5 | Fait (0603, 0614), en fonction SQL ; rapports quotidiens |
| L6 | Abandonné (pas d'A/B) ; remplacé par le suivi plan à minuit (bascule) et le suivi avant/après (0617) |
| L7 | Pas commencé ; nécessaire avant la réécriture native en production |
| L8 | Pas commencé ; vers le 16/11 (D23, D24) |
| L9 à L11 | Remplacés par la réécriture native (fiches, duels en Tests ; l'appel unique en cours dans la session de la relecture native) |

## Réglages

Tous les réglages vivent dans une seule ligne, `reglages` où `cle = 'bleo'`, à insérer telle quelle en L0. Le code lit cette ligne au démarrage de chaque fonction et n'a aucune valeur en dur.

```json
{
  "mode": "off",
  "mesure": { "maturite_heures": 72, "mediane_jours": 45, "mediane_min_posts": 5, "r_plafond": 20 },
  "verdict": { "vues": 10000, "r": 2, "passages_min_non_gagnant": 2 },
  "forme": { "k": 2 },
  "valeur": { "fatigue_post": 0.6, "fatigue_accroche": 0.75, "age_jours": 45, "age_facteur": 0.7, "exposant": 3 },
  "classes": {
    "fenetre_jours": 60, "min_contenus": 30, "borne_min": 0.8, "borne_max": 4,
    "depart": { "import": 2.0, "podz": 2.7, "accroche_gagnante": 3.2, "accroche_non_gagnante": 1.5, "livre": 4.0 }
  },
  "file_juger": { "passages_test": 2, "part_max": 0.4, "age_prioritaire_jours": 30, "attente_un_passage_jours": 7, "sortie_j2_vues": 10000 },
  "garde_fous": { "budget_famille": 0.2, "budget_plancher": 2, "budget_jours": 7, "meme_contenu_jours": 14, "meme_famille_jours": 10, "meme_couverture_jours": 10 },
  "boite": { "declinaisons_par_parent": 3, "generation_max": 2, "fermeture_r_median": 1, "fermeture_min_passages": 4 },
  "jauge": { "seuils_semaines": [6, 3, 1], "parts": [0.10, 0.20, 0.30, 0.40] },
  "sources": { "min_posts": 5, "toujours": [] },
  "agent": {
    "langues_actives": [], "reveils": ["14:15", "18:15"], "taille_paquet": 10, "longueur_max": 1.3,
    "voies_depart": { "prouvee": 0.75, "essai": 0.25 }, "essai_min": 0.20,
    "fiche_langue_victoires": 0.55, "fiche_label_min_posts": 20
  },
  "slide_marquee": false,
  "ombre": { "jours": 3, "quota_min": 0.995, "juger_min": 0.25, "juger_max": 0.35, "non_gagnants_max": 0.15, "recolte_min": 0.35, "fin_tirage": "14:30" },
  "ab": {
    "jours": 11, "creneaux_bleo": 1, "jour_decision": 14, "prolongation_jours": 7, "bootstrap": 2000,
    "arret_decks_manquants": 0.01, "arret_creneaux_vides": 0.005, "ecart_publication_max": 0.03,
    "arret_perte": -0.10, "arret_paires_min": 300, "ratio_vues_min": 0.95,
    "label_exclu_perte": -0.10, "label_exclu_paires_min": 50, "labels_exclus": []
  }
}
```

D'où viennent les valeurs qui ne sont pas des choix de conception (base de l'OS, 28/10, passages mûrs hors rappels) :

| Réglage | Valeur | Mesure qui la fonde |
| --- | --- | --- |
| `fatigue_post` | 0,6 | Percée de 8,3 % au 1er passage dans une langue, 5,0 % au 2e, 3,1 % au 3e |
| `fatigue_accroche` | 0,75 | Un autre contenu de la même accroche déjà passé dans la langue : 10,5 % → 8,2 % et 10,3 % → 7,6 % |
| `age_facteur` | 0,7 | Percée d'un gagnant : 33 % la première semaine, 9,7 % après 45 jours |
| `forme.k` | 2 | Après 2 passages, la percée des suivants va de 0,9 % à 17,9 % selon leur r moyen |
| `exposant` | 3 | Simulation sur le stock du 28/10 : non-gagnants à 13 % des passages au cube, 23 % au carré, 58 % de la file au simple prorata |
| `classes.depart` | 2,0 / 2,7 / 3,2 / 1,5 / 4,0 | Moyenne des r au premier passage : imports 1,4 à 2,2 selon l'ELO ; originaux de podz 2,74 ; accroche gagnante reprise 3,1 à 3,3 ; non gagnante 1,4 à 1,6 ; livrés 6,18 (borné) |
| `verdict` | 10 000 vues ou r ≥ 2 | Au-dessus de ce seuil, le niveau ne prédit plus le contenu suivant (corrélation 0,07) |
| `budget_famille` | 20 % | Podz 4 : 5 familles = 73 % de ses passages sur 14 jours |
| `jauge` | 6 / 3 / 1 semaines | Choix de conception, à caler |
| `ombre`, `ab` | Voir W1 et W2 | Paires compte × jour : écart-type de la différence de ln(1 + vues) = 1,35, environ 99 paires par jour (4 146 paires sur 42 jours) ; 700 paires voient un gain de +15 % |

Hors de cette ligne : `pods.auto_validation_heures` passe à 6, et `pods.auto_validation` à vrai pour tous les podz (L7).

## Points ouverts

Tout le reste est décidé. Pour chaque point ouvert, le choix par défaut s'applique si personne ne tranche avant le lot indiqué ; un seul point bloque vraiment (les montants des relecteurs, avant L9).

**Décidé le 28/10** : le nom BLEO ; la tierlist remplacée ; le tirage au cube ; × 0,6 par passage du contenu, × 0,75 par passage de la famille, × 0,7 après 45 jours ; 3 déclinaisons par parent ; la génération 2 au verdict, sans battre le parent ; pas de génération 3 ; les deux voies séparées ; la veille supprimée ; la règle des sources ; la boîte sans niveau ; la file à juger ; les deux colonnes de travail en parallèle ; une semaine à blanc puis l'A/B.

**Tranché depuis le 29/10** : pas d'A/B ; bascule le dimanche 1/11 au soir ; place du CTA à partir de la slide 4, jamais le hook ; pas de concurrent en essai ; plus de stats CTA ni de forme tirée ; une déclinaison dans la langue de son parent, une par famille et par jour ; fermeture sur le r moyen ; fatigue sur 60 jours ; D1 à D4, D20 et D22 sans objet (pas d'A/B). Restent ouverts : D30 (full test trop proche d'une famille gagnante), D34 (réimports qui effacent les decks, pour L7), la porte des tests pour les petits labels, et l'angle de chaque label tenu à la fois dans `angles_placement` et dans la fiche label.

| Point ouvert | Choix par défaut | Avant le lot |
| --- | --- | --- |
| Montant payé par micro-tâche de relecture | **Aucun : à fixer par Adrien** (bloquant) | L9 |
| Relecteurs : posteurs natifs ou recrues | Posteurs natifs d'abord (actifs : tr 27, en 27, de 26, fr 21, es 19, it 18, el 18), missions Upwork pour les langues sans candidat | L9 |
| Langues de départ de l'agent | de, pt, tr | L9 |
| Modèle de l'agent | Celui de l'abonnement Claude, sans autre modèle. En L9, comparaisons à l'aveugle contre la version Gemini | L10 |
| Capacité de l'abonnement | Mesurée en L9 sur 3 langues. Si les limites du compte sont atteintes, le secours Gemini couvre le reste ; avant L10, on choisit : moins de réveils, des paquets plus gros, ou un second compte | L10 |
| Place du CTA | Règle actuelle : 3 dernières slides, jamais la 1re ; une place plus libre se teste comme un essai | L9 |
| Garder un concurrent dans un essai | Non : `sansConcurrent` reste | L9 |
| Budget par famille | 20 % des passages du label sur 7 jours | L5 |
| Seuils de la jauge et part de full test | 6, 3 et 1 semaines ; 10 à 40 % | L4 |
| Validation automatique | 6 h après le dépôt | L7 |
| Heure du tirage | 14 h, pour J+1 | L5 |
| Accroches de plus de 45 jours dans la boîte | Gardées ; test de 2 semaines sur les podz 4 et 8 pendant L4 pour mesurer leur réussite | L4 |
| RH : careerswemma, seule source, r = 1,00 | Mise à jour quand même : liste d'exceptions `sources.toujours` dans les réglages | L3 |
| @sofiya.yussupova pour clean\_study | Ajoutée comme source par Adrien ou Max | L3 |
| Imports rejetés par l'ELO (778 en 45 jours) | Toujours rejetés | — |
| Ouvrir des comptes dans les langues à gros stock de récolte (fi, ru, no, ar, et) ; relancer da, ja, lt, lv | Décision commerciale, hors BLEO | — |
