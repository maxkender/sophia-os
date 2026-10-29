# BLEO · journal de chantier

*Tenu par la session de coordination. La spécification reste `docs/bleo.md` (et
le doc Claude « BLEO ») ; ce fichier dit où en est la mise en place, ce que la
lecture du code et de la base a fait apparaître, et ce qui attend une décision.*

## État au 29/10 (avant le premier lot)

Lecture complète de `docs/bleo.md`, contrôle du code sur `origin/main` (7bd27e3)
et de la base de prod, en lecture seule.

### Les chiffres d'aujourd'hui contre ceux de la spec

| Mesure | Spec (28/10) | Base (29/10) | Effet |
| --- | --- | --- | --- |
| Comptes actifs | 358, tous à 2 posts | 368, tous à 2 posts | — |
| Comptes réellement assignés un jour donné | ~358 | 249 (les autres en warm-up ou bloqués) | La file à juger (40 %) tient ~100 tests par jour, pas ~140 |
| Comptes qui ont une médiane | — | 209 | Seuls eux reçoivent des tests (A7.3) |
| Paires du jour (2 posts publiés, hors rappels) | ~99 | 190 à 220 sur les 10 derniers jours | A/B plus puissant : ~1 400 paires mûres à J14, de quoi voir ~+11 % |
| Comptes à deux labels | 28 | 23 | — |
| Comptes `parts_applications` non nul | — | 111 | Ce n'est pas la bonne définition du multi-applis (voir D18) |
| Sources actives qui passent la règle A11 | 23 sur 46 | 24 sur 49 | Le test d'acceptation de L3 « rejoué sur le 28/10 » n'est pas rejouable (vues écrasées) |
| Seuil ELO d'import | 63 | 63 (`reglages.scoring`) | Juste (la migration 0265 du dépôt dit encore 54) |
| Validation automatique des podz | « à activer (phase 3) » | Déjà active partout sauf la vidéo, à 12 h | Il ne reste que 12 → 6 h, par migration (pas de réglage dans l'écran) |
| Âge du dernier relevé des vues | « mûr à 72 h » | 3 330 passages sur 3 766 relevés pour la dernière fois entre 48 et 72 h, ~80 après 72 h | Le r « mûr » est celui du relevé de J+2/J+3 (voir D6) |

### Contraintes du chantier

- **Un merge sur `main` déploie** les fonctions dont la fermeture d'imports a
  bougé (`.github/workflows/deploy-edge-functions.yml`). Toucher `_shared/gemini.ts`
  ou `_shared/assignation_contenu.ts` redéploie `minuit-vnext` et consorts.
- **Les migrations se passent à la main** (MCP ou SQL Editor), une par une,
  **avant** le merge du code qui les lit.
- **Numéros de migration** : le chantier « Prompt 21/22 » en prend en ce moment
  (0415 le 29/10). Prochain libre : 0416. Vérifier `origin/main` juste avant
  chaque merge.
- **Deno n'est pas installé** dans le conteneur de cette session (l'installation
  a été refusée par le mode auto). Sans lui, pas de `deno test`. À ajouter au
  script de démarrage de l'environnement.

## Écarts et pièges relevés

Statut : **à décider** (change la spec, attend Adrien ou Max), **technique**
(corrigé dans le lot sans changer le sens de la spec), **spec** (texte à
corriger dans `docs/bleo.md` et le doc Claude).

### Bloquants pour l'A/B (L5, L6)

| # | Constat | Preuve | Proposition | Statut |
| --- | --- | --- | --- | --- |
| D1 | **Tranché le 29/10 : oui.** À minuit, l'ancien système **supprime tout passage du jour sans `post_id`** puis compte le quota sur les **posts**. Un passage BLEO encore « sans slides » à 00 h est effacé et le témoin remplit les deux créneaux : pas de paire. Même purge à 04 h, au bouton « Assigner » et à la recharge d'un créateur | `purgerAssignationIncomplete` (AC:452), `listerComptesSousQuota` (AC:2836), `revoquer-post` | BLEO crée à 14 h le passage **et son post**, masqué aux posteurs jusqu'à minuit ; le deck prêt remplit les slides du post et de `passages.slides` | à décider |
| D2 | **Tranché le 29/10 : oui.** Les posteurs voient le post J+1 de BLEO dès l'après-midi, ~10 h avant celui du témoin : la mesure « BLEO publié en premier ≈ 50 % » est biaisée d'avance | `PosterCalendrierPage.tsx:66` | Réglé par le masquage de D1 | à décider |
| D3 | **Tranché le 29/10 : oui.** Les passages BLEO **consomment le budget de la tierlist** (`restants`) et leurs vues nourrissent la requalification : le témoin tire dans un stock entamé par BLEO, surtout les contenus neufs (`tier_cycle` 0) que BLEO teste | vue `contenu_tier_etat` (M/0270:444) | Exclure les passages `bras = 'bleo'` de `contenu_tier_etat` et de la requalification pendant l'A/B | à décider |
| D4 | Si le tirage témoin échoue sur « pool », `baisserQuotaSiBesoin` compte le passage BLEO et **baisse le quota 2 → 1 pour de bon** : le compte sort de l'A/B et reste à 1 après | AC:1101, 1188 | Ne jamais baisser le quota d'un compte qui a un passage `bleo` ce jour-là | technique |
| D5 | A8 **exclut** (même contenu 14 j, famille 10 j, couverture 10 j) là où le code actuel **déclasse**, exprès pour ne jamais laisser un créneau vide dans les petites langues | AC:2506, tierlist.ts:140 | Exclure comme la spec, puis relâcher dans l'ordre couverture → famille → contenu avant de laisser un créneau vide ; le rapport compte chaque relâche | à décider |

### Mesures (L0, L2)

| # | Constat | Proposition | Statut |
| --- | --- | --- | --- |
| D6 | Le relevé de nuit couvre ~3 jours réels : un passage est relevé pour la dernière fois entre 48 et 72 h, jamais après. Les passages des comptes désactivés gèlent à leur dernier relevé | Garder (les chiffres de la spec ont été calculés sur ces mêmes relevés) ; écrire « mûr = publié depuis 72 h, r sur son dernier relevé ». Ajouter `enregistrements` au relevé sans élargir la fenêtre | spec |
| D7 | `ecrireStats` ne lit pas l'erreur de l'update : si le code qui écrit `enregistrements` part avant la colonne, **plus aucune vue n'est relevée**, en silence | Migration d'abord, puis contrôle d'erreur dans le même lot | technique (L0) |
| D8 | `collectCount` est au premier niveau de l'item Apify. Mappé avec `?? 0`, le test « 95 % des passages ont `enregistrements` » passe tout seul | `null` quand le champ manque | technique (L0) |
| D9 | Un deck appelle plusieurs modèles (traduction, placement, hashtags) ; un deck Sophia n'a aucun horodatage (`contenu_langues`) : « chaque deck neuf a son `modele` » n'est pas mesurable | `modele` = modèle du placement (celui qui écrit le CTA), `cuit_le` ajouté sur `contenu_langues` ; les decks de podz et les livrés exclus du test | technique (L0) |
| D10 | Les posteurs peuvent modifier toutes les colonnes de leurs passages (RLS `passages_update`), donc `r`, `bras`, `file_bleo`… | Garde sur les colonnes BLEO pour les non-admins, dans la migration de L0 | technique (L0) |

### Remplissage et familles (L1)

| # | Constat | Proposition | Statut |
| --- | --- | --- | --- |
| D11 | Les variantes historiques **n'ont presque jamais l'accroche de leur parent** : sur 59 paires parent-variante validées, 15 seulement partagent `accroche_norm` (toutes weird_alpha). Grouper par accroche les sépare | Les `notes` priment : une variante prend la famille de son parent | spec |
| D12 | Les notes ne vivent que dans le dépôt, avec 10 faux parents (smart-girl : « … variante de sg-o001 » cité à propos d'un autre fichier), des parents implicites (« suite de », « reprend l'accroche de ») et un parent cité par préfixe d'uuid | Script de lecture des notes + table de correspondance relue à la main, versée dans la migration | technique (L1) |
| D13 | 12 contenus sont déjà en génération 2 ; ay-o003 a 5 variantes, sg-o005 en a 4 (quota 3) | Garder l'historique tel quel ; le quota ne vaut que pour les dépôts BLEO | spec |
| D14 | Les originaux de mentalapp (22) et de page blanche (17) sont passés par le circuit des livrés (`livre = true`) : l'étape 3 les classerait `remake` | Les classer `historique`, classe `podz` | spec |
| D15 | `accroche_norm` arrive jusqu'à 10 min après l'import (cron `empreintes`), jamais pour les labels 100 % podz ni les livrés | A2 et le refus `accroche_existante` du guichet appellent `normaliserAccroche` eux-mêmes, sur les contenus **et** les livraisons en attente | technique (L1, L4) |

### Tirage (L5)

| # | Constat | Proposition | Statut |
| --- | --- | --- | --- |
| D16 | `ignorerTierlist` ne donne pas le pool de A6 : les rangs ordonnent encore les bandes, `choisirContenu` ne rend qu'un choix et n'est pas exporté | BLEO compose son pool : `poolContenusPrets` − `contenusLivresHors*` − l'écart multi-applis de 7 jours | technique |
| D17 | Exclusions de comptes oubliées par la spec : recrues en rouge, warm-up jamais commencé, UGC sans persona, compte sans label. Le warm-up est jugé à `now()`, pas au jour visé | Reprendre les filtres de `listerComptesSousQuota`, warm-up jugé à 00 h J+1 | technique |
| D18 | « Multi-applis = `parts_applications` non nul » est faux : c'est quand les parts **effectives** contiennent une autre appli que Sophia (`partsEffectives`, multi_app.ts:191) | Appeler `partsEffectives` | spec |
| D19 | `materialiserPostDepuisPassage` n'est pas exporté et refuse des slides vides ; l'échange de visage UGC, `#Tanıtım` et les hashtags de repli vivent dans `assignerCompteJour` | Extraire ces étapes dans une fonction partagée, appelée par les deux systèmes | technique |
| D20 | Aucune contrainte n'empêche deux passages BLEO pour le même compte et le même jour (un tirage relancé) | Index unique partiel (`compte_id`, `date_publication_prevue`) où `bras = 'bleo'` | technique |
| D21 | Un drain d'assignation s'arrête à 41 lots × 8 ≈ 328 comptes ; le reste attend 04 h | Sans effet à 249 comptes servis ; à surveiller quand la flotte grandit | à surveiller |
| D22 | Marquer `temoin` à 05 h 15 rate les passages créés par la passe de 04 h UTC (05 h Paris en hiver, encore en cours) | Marquer `temoin` au rapport de 22 h, pas la nuit | spec |

### Bascule (L8, W4)

| # | Constat | Proposition | Statut |
| --- | --- | --- | --- |
| D23 | Dans `minuit-vnext`, les rappels J+7 ne tournent que dans l'étape `tierlist` : couper la tierlist coupe les rappels. Le cron `minuit-vnext-rattrapage` (04 h) relance l'assignation **et** les labels. `assignation-contenu`, `revoquer-post` et les boutons admin assignent encore par l'ancien système | Étape `rappels` autonome (ou rappels dans `bleo-assignation`, ce que dit déjà W4.1) ; rattrapage de 04 h, recharge et boutons branchés sur BLEO à la bascule | spec |
| D24 | Lecteurs des rangs oubliés par la spec : vues `label_application_reserve`, `label_application_reserve_livre`, `contenu_a_requalifier`, `contenu_application_a_requalifier`, `contenu_passages_historique` ; `import_contenu.ts` (rang d'import), `nettoyage_stickers*.ts`, `choix_label_equilibre.ts`, `manage-users`, `AdminRepartitionPage`, les `cli-label` des podz, `analyse/` et les skills `sanity-matin` et `chef-podz` | Liste complète dans L8 | spec |

### Podz (L4)

| # | Constat | Proposition | Statut |
| --- | --- | --- | --- |
| D25 | Les règles que P2 retire de `ROUTINE.md` (3 variantes à 30 k, essai 1 sur 5, CTA A/B/C, limite de famille) valent aussi pour la voie 2 (`page-blanche`, `mentalapp`, `fathom`, `yasmine`), que P4 veut garder telle quelle. §4.7 « pas de quota » contredit le quota de 3 | `ROUTINE.md` en deux parties, voie 1 et voie 2 | spec |
| D26 | Supprimer la preuve au guichet ne suffit pas : chaque `cli-deposer` la refuse en local, et sans la veille du lundi les preuves expirent en 30 jours | Retirer la preuve des 7 `atelier/api.ts` dans le même lot | technique |
| D27 | La validation relance `verifierOriginal` : quand `bleo.slide_marquee` passe à vrai, les dépôts en attente avec `texte_sophia` tombent en 409, jamais retentés (`auto_erreur`) | Juger un dépôt sur la règle en vigueur au moment du dépôt | technique (L10) |
| D28 | Changer la forme de `etat` et `label` casse 30 copies d'outils (`cli-etat` ×11, `cli-label` ×7, `cli-suivi` ×6, `cli-playbook` ×6) | Champs ajoutés, rien de retiré | technique |
| D29 | Le passage à 6 h est donné à la fois à L4 (P1) et à L7 | L7 (ligne 635 de la spec) | spec |
| D35 | **Tranché le 29/10 par Adrien.** La spec ne dit pas si une déclinaison change l'accroche, et range les générations 2 après les familles jamais déclinées | Génération 1 : accroche identique mot pour mot. Génération 2 : accroche reformulée (même promesse), ouverte au verdict de la spec (un passage à 10 000 vues ou r ≥ 2 ; le seuil « 10 000 vues de moyenne » de 0605 a été retiré par 0606). Les générations 2 passent en tête de la boîte. Vue `bleo_boite`, colonne `accroche_attendue` ; le guichet (L4) refusera une génération 1 dont l'accroche normalisée diffère du parent et une génération 2 identique | fait (boîte), guichet en L4 |
| D36 | **Tranché le 29/10 par Adrien.** La spec ferme une famille sur le r **médian** de sa dernière génération : un post qui explose ne la sauve pas (168 des 243 familles closes avaient un r moyen d'au moins 1) | Fermeture sur le r **moyen**, chaque r plafonné à 20 comme dans la forme ; la règle est recalculée chaque nuit dans les deux sens (réouverture si la moyenne repasse à 1). Le r du compte reste divisé par la **médiane** du compte, et la forme reste une moyenne plafonnée (1,4 % des r dépassent 20) | fait (0608) |
| D37 | **Demandé le 29/10 par Adrien.** `bleo_boite` ne rend que l'accroche et des identifiants : un podz ne voit ni la tournure du post ni ses images | `bleo_boite_posts(label, limite)` (0610) rend chaque ligne avec le post parent tel que posté : slides dans l'ordre (texte posé, image, slide d'appli, slide d'inspiration), passage de référence (langue source d'abord) et 3 meilleurs passages. Visible dès maintenant sur la page Pods (ligne dépliable). L'action `boite` du guichet (L4) n'aura qu'à l'appeler ; `npm run boite` en fera une planche | fait (données, OS) ; guichet en L4 |
| D38 | Images : la banque de chaque label est grande (de 748 images pour clean_study à 7 707 pour alpha_male, plus de 90 % jamais utilisées), mais les podz choisissent **à l'œil** sur des planches de vignettes (`npm run images`, `--depuis <contenus>`, `--accroches`). Une légende texte (`media_library.caption`) existe pour 45 % des images (3 % pour weird_alpha) mais n'est pas envoyée aux podz | Pour une déclinaison, `npm run boite` ouvre la planche des images du parent et de sa famille (`--depuis`). Ajouter la légende à l'action `images` et un `--cherche <mots>` ; compléter les légendes manquantes (weird_alpha d'abord) | L4. Chiffrage du 29/10 : 13 419 images sans légende dans les labels des podz de la voie 1 ; traitement existant (`caption-media`, fal.ai `florence-2-large`, repli `moondream2`, crons `caption-media-drain-1` à `-6` éteints depuis le 25/10), 24 images par minute, soit environ 9 h ; coût estimé de 0 à 35 $ (fal affiche 0 $ la seconde pour ce modèle ; au tarif H100, 4,50 $/h, avec 1 à 2 s par image : 17 à 34 $). Décision d'Adrien le 29/10 : lancement le **30/10 en journée** (10 h, contrôle de fin à 19 h 30), prêtes pour la recherche des podz (L4). Charge vérifiée : 24 images par minute, une fonction Edge par minute et par tâche, une écriture par image, 3 à 7 Go lus par fal dans le stockage, à lancer en journée (loin de minuit, du relevé de 0 h à 5 h, de la nuit BLEO de 5 h 15 et du tirage de 14 h), tâches éteintes à la fin. Côté podz, la recherche tourne dans l'outil (`donnees/images.json`) : l'agent ne lit que la planche des images trouvées |
| D39 | **Tranché le 29/10 par Adrien.** Le rappel J+7 rejoue le même post sur le même compte : sur 147 rappels mesurés, r médian 1,32 (post normal du compte : 1,00), mais 5,4 % seulement battent le post d'origine (vues médianes 5 300 contre 80 500). Le même contenu sur d'autres comptes (r médian 1,62) et une déclinaison G1 (1,66, 65 posts) font mieux | Pour chaque hit à 50 000 vues, le compte reçoit une **déclinaison G1 du hit** à la place du repost : la famille du hit passe en tête de la boîte du podz (commande urgente, à livrer avant J+7), puis l'assignation donne au compte une G1 qu'il n'a pas encore postée. Repli quand aucune G1 n'est prête, ou quand le label n'a pas de podz de la voie 1 (medical_study, white_bg) : le repost actuel. Volume : environ 27 hits par semaine, environ 20 contenus distincts (smart_girl 9,5 hits par semaine, alpha_yellow 4,8, alpha_male 3,3, weird_alpha 3, RH 3) | L4 (commande dans la boîte) ; **assignation à la bascule** (décision d'Adrien le 29/10 : on attend la bascule) |
| D40 | Le r moyen affiché dans l'OS comptait r = 20 pour chaque passage publié sans r (`least(NULL, 20)` rend 20 en Postgres) : famille « hobbies that will make you disgustingly confident » à 5,3 au lieu de 1,93 | Corrigé (0611) : la moyenne ne lit que les r mesurés. Seul l'affichage était faux : fermeture, forme et tirage filtrent déjà `r is not null`. Les chiffres des reposts (D39) sont refaits sans ce biais : inchangés | fait (0611) |
| D41 | La fatigue ne s'oublie jamais : `n_post` et `n_accroche` comptent tous les passages depuis toujours, et aussi les passages restés `assigne` des semaines après leur date (jamais publiés). Exemple : la meilleure accroche de weird_alpha (433 k vues) vaut 0,005 en allemand (22 passages de la famille, dont 4 jamais publiés) contre 2,69 en français | Ne compter que les passages des 60 derniers jours, et les `assigne` seulement jusqu'à 3 jours après leur date | fait (0612), décision d'Adrien le 29/10 ; dans l'exemple, la famille passe de 22 à 18 passages comptés en allemand |
| D30 | Une déclinaison doit garder l'accroche, mais rien n'empêche un podz de déposer en full test une accroche gagnante à peine reformulée (nouvelle famille, défaut 2,7, 2 tests) | Refus au guichet si l'accroche est trop proche d'une famille gagnante du label (seuil à caler) | à décider |

### Colonne langue : la réécriture native (plan du 29/10, remplace L9 à L11)

Le plan « Réécriture native » du 29/10 (page Notion « Révolution
placement/traduction ») remplace l'agent de langue de la spec. Plus d'agent
Claude par langue, plus de sessions de langue en tâches planifiées : **un seul
appel Gemini par deck** qui voit tout le post et lit des fiches en base. Les
relecteurs natifs recrutés ne sont **pas abandonnés** (Adrien, 29/10) : ils ne
servent pas au démarrage, puis ils réécrivent et corrigent des posts quand on
en trouve. Ce que ça change pour BLEO :

| Spec BLEO | Devient | Où |
| --- | --- | --- |
| L9 · agent de langue à blanc (`bleo_decks_file` comme file de l'agent, guichet `langues`, sessions D0 à D6, relectures `ab_aveugle`, banque, Google Sheet) | Étapes 2 à 4 du plan : fiches, appel unique branché sur le comparateur, fiche CTA et tirage de la voie | Rien dans BLEO avant L7 |
| L10 · test 50/50 de l'agent (3 langues, slide marquée) | Étape 5 : production 50/50 sur l'allemand derrière l'interrupteur de la page Relecture native | Après J14 de l'A/B BLEO (voir plus bas) |
| L11 · étendre langue par langue, fin du CTA A/B/C | Grosses langues d'abord (de, es, it, pt, fr, nl), selon la solidité des fiches ; le CTA A/B/C est remplacé par le tirage de la voie | Après L10 |
| `bleo_banque` (banque remplie par les relecteurs) | **Abandonnée** : la banque est `exemples_natifs` (#810, 0423), remplie depuis des comptes natifs TikTok | — |
| `bleo_fiches` (`sorte` langue, label ou appli ; `version` ; jamais écrasée) | **Reprise** pour les fiches langue et label de l'étape 2 : c'est déjà la « table avec historique ». Les fiches appli restent dans `fiches_appli` (0379) | Étape 2 |
| `bleo_relectures` (micro-tâches payées) | Gardée pour les relecteurs recrutés, **après le démarrage** : réécriture de posts (`tache = 'ecriture'`) et correction de posts publiés (`tache = 'correction'`) ; les 10 dernières de la langue entrent dans l'appel | Étape 6 |
| `bleo_decks_file` (file des decks de l'agent) | File des decks du lendemain cuits l'après-midi (L7) ; `circuit` prendra `natif` à la place de `agent`, `voie_cta` garde `reprise`, `prouvee`, `essai` | L7, puis étape 5 |
| `passages.voie_cta`, `forme_cta`, `circuit`, `deck_version` (0600) | La **fiche CTA** de chaque post publié : voie, forme, circuit, version de la fiche langue (`deck_version`). Il manque la slide du CTA par deck : une colonne à ajouter à l'étape 4 | Étape 4 |
| Règle de la slide marquée (jamais la slide 1) | « Jamais dans les 3 premières slides » (−4,8 points mesurés) | Étape 3 |
| Boucle du lundi | Dans `bleo-lundi` (L3) : comparer formes, slides et voies **à contenu égal**, avec le r (vues ÷ médiane du compte) des posts mûrs (72 h), hors rappels, et le taux d'enregistrements pour 1 000 vues (qui attend la lecture Apify de L0) | L3 |

**Calendrier.** Les étapes 2 à 4 (fiches, appel unique sur le comparateur,
fiche CTA) ne touchent pas la production : elles peuvent avancer tout de suite.
La production 50/50 sur l'allemand change les decks d'une partie des posts :
elle part **après J14** de l'A/B BLEO, comme L3 et L4 (rien ne change pendant
la mesure). Si on veut la lancer avant, elle doit tirer sa moitié au hasard
**indépendamment du bras BLEO**, et le rapport A/B la compte par bras.

**L7 (decks l'après-midi)** reste dans BLEO : c'est là que tournera l'appel
unique pour les decks du lendemain, avec dix heures de marge entre le tirage de
14 h et minuit pour un appel cinq fois plus lourd (environ 10 000 tokens). Le
plafond de dépense par jour va dans `reglages.bleo`.

Ce qui reste de la spec et vaut toujours pour l'appel unique :

| # | Constat | Proposition | Statut |
| --- | --- | --- | --- |
| D31 | `controlerFidelite` est un appel Gemini (contredit « aucun autre modèle ») et rend `[]` quand la réponse est illisible | Exiger chaque position présente et `fidele === true`, pas « aucun `false` » | spec |
| D32 | La règle concurrent dépend de l'appli (`motifConcurrentApplication`) ; `MOTIF_CONCURRENT` est la liste de Sophia | D5.4 avec la liste de l'appli | technique |
| D33 | Un deck en cache n'est réutilisé que s'il a une slide `position_sophia: true` ; sinon Gemini le recuit et l'écrase. Un `echec` d'appli n'est pas retenté avant 24 h, donc le secours de 23 h ne recuirait pas un échec de l'après-midi | L'agent pose le drapeau sur la slide du CTA ; le secours force le recuit | technique |
| D34 | D'autres chemins réimportent une URL connue et effacent ses decks : `enqueueCompte` sans `nouveauxSeulement`, import d'URL à la main, `forcerImportElo` | Un réimport entre 14 h et minuit efface les decks de l'après-midi : le signaler au rapport, et refuser les réimports de contenus qui ont un passage à venir | à décider |

## Ce qu'il faut d'Adrien ou Max

1. Trancher D1 + D2 (post masqué créé à 14 h), D3 (budget de tierlist), D5
   (relâche des garde-fous), D30 et D34. Sans réponse avant le lot concerné,
   la proposition s'applique.
2. Ajouter l'installation de Deno au script de démarrage de l'environnement.
3. Réécriture native (plan du 29/10) : les comptes allemands de la banque
   d'exemples (bloquant pour la fiche allemande). Angles micabo et UnSwipe :
   tranché le 29/10, on part avec la fiche appli seule. Concurrent en essai :
   **non** (29/10), la slide qui cite un concurrent est toujours remplacée par
   notre appli (Sophia, UnSwipe ou micabo, selon le compte) et aucun concurrent n'est publié (règle actuelle, `reprise` +
   `sansConcurrent`). Restent : liberté du CTA, plafond de dépense.
4. Avant L3 : ajouter @sofiya.yussupova comme source de clean_study.

## Bascule du lundi 2/11 (décision d'Adrien le 29/10 au soir)

**Pas d'A/B.** Podz sur BLEO et bascule lundi, l'ancien système gardé en secours.
Ce qui change par rapport au plan de la spec :

- **Pas de L6 (A/B) ni de L7 (decks l'après-midi).** BLEO ne crée pas de passages
  à 14 h : le tirage de 14 h reste le **plan** du lendemain (`bleo_ombre_passages`),
  et c'est l'assignation de minuit actuelle qui le suit. Dans `assignerCompteJour`,
  quand `bleo.mode = 'actif'`, chaque créneau prend le contenu, la langue et
  l'appli du plan à la place de `choisirContenu`. Tout le reste ne bouge pas :
  rappels, quotas, decks, posts, upscale. D1, D2 et D3 ne se posent plus.
- **Secours à deux niveaux.** Par créneau : si le contenu du plan n'est plus
  assignable à minuit (deck en échec, contenu retiré, compte changé), le créneau
  repart sur `choisirContenu` (tierlist). Global : `bleo.mode` repasse à
  `ombre` (interrupteur dans l'OS) et la nuit suivante est l'ancienne. La
  tierlist continue de tourner pendant ce temps, pour un retour immédiat.
- **Ce qui remplace la mesure A/B** : un suivi avant/après dans l'OS (r médian
  par jour, part à 10 000 vues, vues par créneau, part du plan suivie) et une
  alerte si le r médian glissant sur 3 jours baisse de plus de 15 % par rapport
  aux 14 jours d'avant.
- **D39 (G1 à la place du repost)** suit la bascule d'une semaine environ, le
  temps que les podz produisent les G1 commandées.

**Code de bascule (29/10, mergé avant lundi, inerte tant que `bleo.mode` n'est
pas `actif`).** `supabase/functions/_shared/bleo_plan.ts` lit, une fois par lot
de minuit, le mode et le run officiel du jour (dernier tirage fini sans erreur
pour ce `jour_vise`), puis le plan du compte (`bleo_ombre_passages`, rappels
exclus). Dans `assignerCompteJour`, chaque créneau prend d'abord la ligne
suivante du plan dans la langue du compte ; le passage porte `bras = 'bleo'`,
`file_bleo`, `valeur_tirage` et `bleo_run_id`. Un créneau du plan non servable
(application plus servie par le compte, contenu plus `valide`, deck refusé ou
qui lève) repart sur la tierlist avec `bras = 'temoin'`. Hors mode `actif`, une
seule lecture de `reglages` par lot et aucun changement dans les passages. Pas
de plan pour les comptes UGC ni pour l'assignation test.

**Répétitions.** L'assignation à blanc (Moteur → « Assignation test à blanc »)
gagne la case « Suivre le plan BLEO » : le vrai code de la nuit suit le plan du
jour choisi même en mode ombre, sans rien écrire. C'est l'outil des répétitions
de samedi et dimanche.

**Guichet des podz (L4, P1), mergé le 29/10, inerte pour les outils actuels.**
Fonction `pods` : action `boite` (la boîte du label avec le post parent complet,
la jauge, le nombre de full tests du jour et les dépôts du jour) ; `deposer` d'un
original accepte `type_bleo` (`full_test` ou `declinaison`) et
`parent_contenu_id`. Un dépôt déclaré est jugé par `bleo_verifier_depot` (0615)
puis, pour un full test, sur les accroches des livraisons en attente du label ;
la preuve n'est plus demandée. Codes de refus : `type_bleo_invalide`,
`parent_interdit`, `accroche_existante`, `parent_requis`, `parent_introuvable`,
`famille_inconnue`, `famille_non_gagnante`, `famille_close`, `generation_max`,
`parent_non_gagnant`, `quota_atteint`, `accroche_differente` (G1, D35),
`accroche_identique` (G2, D35), plus `type_bleo_requis` quand
`bleo.podz.type_obligatoire` est vrai. Une déclinaison validée rejoint la
famille de son parent tout de suite (même règle que A2 a). Le nombre de full
tests du jour suit la part de la jauge sans hasard (cumul arrondi). Sans
`type_bleo`, le dépôt suit le chemin d'avant (preuve comprise) : les outils des
podz passent à `type_bleo` avec les routines (lundi), puis
`type_obligatoire = true`. D30 (accroche à peine reformulée d'une famille
gagnante) reste à décider : pas encore de refus.

**Routines des podz (L4, P2 et P3), mergées le 29/10.** `pods/ROUTINE.md` en
deux parties : voie 1 sur la boîte (lire la boîte, composer le jour : demandes
du chef, full tests de la jauge, déclinaisons dans l'ordre ; écrire une G1, une
G2, un full test ; que faire de chaque refus du guichet) et voie 2 inchangée
(D25). L'ancienne routine est gardée dans `pods/ROUTINE-avant-bleo.md`. **La
bascule des podz est un réglage** : tant que `reglages.bleo.podz.type_obligatoire`
est faux, `npm run boite` affiche « podz sur BLEO : pas encore » et la voie 1
suit la routine d'avant ; le passer à vrai lundi 2/11 avant 6 h fait passer les
7 podz sur la boîte (et le guichet refuse alors un dépôt sans `type_bleo`).
Retour en arrière : le repasser à faux. Les 7 `AGENT.md` de la voie 1 ont un
encadré qui dit ce qui ne vaut plus (preuve, veille, variantes, essais) ; le
nettoyage de leur texte viendra après la bascule. `pods/chef/AGENT.md` : la
jauge (`bleo_jauge`, `bleo_jauge_jours`), monter `par_jour` au-delà de
6 semaines si la file à juger du label a de la place, le baisser après
14 jours sous 1 semaine, et les lignes BLEO du point du matin.

**Interrupteur.** Vue d'ensemble BLEO (`/admin/bleo`), admin seulement : « Passer
en actif » puis, en secours, « Revenir à l'ancien système ». Confirmation qui
rappelle le plan suivi (jour, créneaux). Le changement vaut pour la prochaine
assignation de minuit. Sans l'interrupteur, le tirage aurait cessé en mode
actif (corrigé par 0614).

| Quand | Quoi |
| --- | --- |
| Ven 30/10 | L4 : guichet (`boite`, dépôt BLEO, refus D30, D35), outils `boite` et `deposer` des 7 podz de la voie 1, routines, chef. Code de bascule (plan suivi à minuit, interrupteur de mode). Légendes d'images (10 h à 19 h 30) |
| Sam 31/10 | Tests : guichet et outils, assignation de quelques comptes en `dryRun` sur le plan du 1/11 |
| Dim 1/11 | Répétition générale en `dryRun` sur tous les comptes ; relecture avec Adrien |
| Lun 2/11 | Merge le matin : les podz passent sur BLEO. 14 h : plan du mardi. 22 h : feu vert ou non (rapport et porte « BLEO tourne »), `bleo.mode = actif` |
| Mar 3/11 | **Premier jour assigné par BLEO** (assignation de minuit du lundi au mardi) |
| ~Lun 9/11 | D39 : déclinaison G1 du hit à la place du repost |
| ~Lun 16/11 | Fin de la tierlist (L8) si 14 jours stables |


| Quand | Lot | Remarque |
| --- | --- | --- |
| Ven 30/10 | L0 · Instrumenter | Migration 0416 appliquée avant le merge (D7) |
| 31/10 – 2/11 | L1 · Remplir l'existant ; L7 · Decks l'après-midi (en parallèle) | L1 dépend du script des notes (D12) |
| 2/11 – 4/11 | L2 · `bleo-nuit`, cron 05 h 15 | Puis 3 nuits sans erreur |
| 4/11 – 8/11 | L5 · Tirage à blanc ; L3 et L4 si prêts | L3/L4 avant J1 ou après J14, jamais pendant |
| **Lun 9/11** | J1 : `bleo.mode = ombre` à 9 h | Repli : lun 16/11 |
| Jeu 12/11 | J4 : porte « BLEO tourne », premier tirage A/B | |
| Dim 22/11 | J14 : décision | |
| Lun 23/11 | J15 : bascule | |
| Mer 25/11 | J17 : confirmation | |
| ~9/12 | L8 : suppression de la tierlist | 14 jours stables après J17 |

La colonne langue suit le plan « Réécriture native » du 29/10 (voir plus haut) :
fiches et comparateur tout de suite, production 50/50 sur l'allemand après J14.

## À blanc du 29/10 au 2/11 (décision d'Adrien le 29/10)

Construit et branché le 29/10, en ajouts seulement (rien de ce qui tourne n'est
modifié, aucune fonction Edge redéployée) :

| Migration | Contenu | État |
| --- | --- | --- |
| `0600_bleo_modele` | Colonnes, tables `bleo_*`, vue `bleo_mediane_compte`, `reglages.bleo` | Appliquée |
| `0601_bleo_remplir` | L1 : 3 458 familles, 65 liens parent → variante des notes (`scripts/bleo-parents-notes.mjs`), types, classes | Appliquée |
| `0602_bleo_nuit` | `bleo_nuit()` : A2, A1, A3, A4, A5 ; cron 05 h 15 | Appliquée, 1re nuit le 29/10 à 12 h (9,5 s) |
| `0603_bleo_tirage` | `bleo_tirage()` en mode ombre (A6 à A8), `bleo_rapport()`, crons 14 h et 22 h | Appliquée (+ correctif « hors_file ») |
| `0604_bleo_boite` | Boîte et jauge des podz (vues `bleo_boite`, `bleo_jauge`), fermeture des familles chaque nuit (A9, A10) | Appliquée ; les podz ne la lisent pas encore (reste de L4) |
| `0605_bleo_boite_g2` | Règle des déclinaisons (D35) : génération 2 ouverte à plus de 10 000 vues en moyenne sur 2 passages mûrs ; `accroche_attendue` identique ou reformulée | Appliquée, puis annulée par 0606 |
| `0606_bleo_boite_g2_spec` | Génération 2 de nouveau ouverte au verdict de la spec ; générations 2 en tête de la boîte (D35) | Appliquée |
| `0607_bleo_vues_os` | Vues de lecture de la section BLEO de l'OS : `bleo_familles_ui`, `bleo_contenus_ui`, `bleo_plan_ui` | Appliquée |
| `0608_bleo_fermeture_moyenne` | Fermeture des familles sur le r moyen plafonné, dans les deux sens (D36) ; `r_moyen` dans les vues de l'OS | Appliquée : 243 → 78 familles closes, boîte 659 → 815 lignes |
| `0610_bleo_boite_posts` | `bleo_boite_posts()` : la boîte avec le post parent complet (D37). D'abord numérotée 0609, en collision avec `0609_relecture_sans_questionnaire_ni_kit` (#827) : renommée le 29/10. BLEO garde la plage 0610 à 0699 | Appliquée |
| `0611_bleo_r_moyen_vues` | Correctif du r moyen affiché (D40) | Appliquée |
| `0612_bleo_fatigue_60j` | La fatigue ne compte que les 60 derniers jours, et un passage non publié 3 jours après sa date (D41). `bleo_nuit` patchée en place (bloc `exp` de A5 seulement) | Appliquée |
| `0613_bleo_contenus_textes` | Texte et image de la slide 1, première ligne de la slide 2, dans `bleo_contenus_ui` (fiche famille) | Appliquée |
| `0614_bleo_mode_actif` | Le tirage de 14 h tourne aussi en mode `actif` (`bleo_tirage` et `bleo_tirage_cron` patchées en place : ils ne tiraient qu'en `ombre`) ; `bleo_changer_mode(p_mode)`, l'interrupteur, admin seulement, avec les 20 derniers changements dans `reglages.bleo.mode_historique` | Appliquée le 29/10 (mode resté `ombre`) |
| `0615_bleo_guichet` | L4 : `bleo_verifier_depot(label, type_bleo, parent, accroche_norm, livraison)` juge un dépôt de podz (13 codes de refus, voir plus bas) ; `reglages.bleo.podz.type_obligatoire` (faux jusqu'à la bascule des podz) | Appliquée le 29/10, testée sur les données réelles (chaque code) |
| `0616_bleo_jauge_jours` | La jauge des podz photographiée chaque jour à 5 h 40 (`bleo_jauge_jours`, cron `bleo-jauge-photo`) : la règle de baisse du chef (14 jours sous 1 semaine) et le suivi avant/après en ont besoin | Appliquée le 29/10, première photo prise |

`reglages.bleo.mode = 'ombre'` depuis le 29/10 à 12 h 20.

Écarts assumés avec la spec, à reporter dans `docs/bleo.md` après l'à blanc :

- Migrations dans une plage réservée (06xx) : le chantier « Prompt 21/22 »
  prend les numéros à la suite plusieurs fois par jour.
- `bleo-nuit` et `bleo-assignation` sont des fonctions SQL appelées par pg_cron
  (`bleo_nuit_cron`, `bleo_tirage_cron`, `bleo_rapport_cron`), pas des
  fonctions Edge : tout est ensembliste, testable directement en base, et rien
  n'est déployé.
- L0 réduit au modèle de données : la lecture des enregistrements Apify, le
  modèle Gemini des decks et la garde des colonnes de `passages` touchent
  l'existant ; après l'à blanc.
- Une variante prend la famille de son parent même si son accroche diffère (D11).
- Tirage : un dernier repli `hors_file` (un contenu à juger au-delà de la
  capacité) plutôt qu'un créneau vide (voie 2 : that_girl_study, mentalmaxxing).
- Un contenu à juger avec un passage à 10 000 vues est jugé (comme la sortie de J+2).
- Le rapport compare plan et réel avec la même formule de valeur, fatigue
  comptée sur les passages d'avant le jour.

Premier plan (30/10, essai de mise au point, 14,5 s) : 249 comptes, 498
créneaux, 0 vide ; file à juger 40 %, récolte 36 %, non-gagnants 17 %,
garde-fous relâchés 10 fois sur 498 ; rejoué deux fois : 492 lignes sur 492
identiques.

Réglés le 29/10 avec Adrien, avant le premier tirage du cron :

- **File à juger étalée** : `file_juger.part_max` passe de 0,40 à 0,30. Le stock
  (1 839 contenus à tester, dont 671 de moins de 30 jours) se résorbe sur environ
  trois semaines au lieu de deux, et la file reste dans la porte (25 à 35 %).
- **Non-gagnants** : le premier comptage (16 %) rangeait parmi eux les contenus
  pas encore mesurés d'une accroche gagnante (reprises, variantes). Ils comptent
  désormais comme gagnants. Le 15 % n'est pas une règle du tirage mais un
  résultat du tirage au cube ; une règle dure reste possible si besoin.

Plan du 30/10 après ces deux réglages (essai, 14,8 s) : file à juger 30 %,
non-gagnants 14,5 %, récolte 48 %, 0 créneau vide.

Reste connu avant les rapports :

- **Tests des contenus de moins de 3 jours** : les petits labels (white_bg,
  clean_study, RH, Fathomly, mentalmaxxing, that_girl_study) reçoivent chaque
  jour plus de livraisons que 30 % de leurs créneaux ne peuvent en tester
  (34 sur 62 complets le 30/10). Le critère ne peut pas tenir sur eux ; à
  trancher (part plus haute pour ces labels, ou critère limité aux labels qui
  ont la place).

Contrôles : `docs/sql/bleo_controles.sql` (copies des règles TypeScript, A5
recalculée à la main, rejouabilité, derniers plans).

## Journal

- **29/10** : lecture de la spec, contrôle du code et de la base ; ce fichier.
- **29/10 après-midi** : 0600 à 0603 appliquées, première nuit, premier plan,
  mode ombre. Prochains rendez-vous : 14 h (plan du 30/10 par le cron), 05 h 15
  (nuit), 22 h le 30/10 (premier rapport : plan du 30/10 contre minuit).
- **29/10, 12 h 40** : file à juger à 30 % (réglage), mélange corrigé (accroches
  gagnantes pas encore mesurées = gagnantes). Les rapports de 22 h sont résumés
  à Adrien dans la session de coordination, pas dans #podz (décision d'Adrien).
- **29/10, 13 h 45** : Adrien tranche D1 + D2 (le passage BLEO et son post sont
  créés à 14 h, le post est masqué aux posteurs jusqu'à minuit) et D3 (les
  passages BLEO sont exclus du budget et des requalifications de la tierlist
  pendant l'A/B). Nuit relancée à la main à 13 h 43 (13,1 s) avant le tirage de 14 h.
- **29/10, 14 h** : premier plan officiel par le cron (plan du 30/10, 17,8 s) :
  249 comptes, 0 créneau vide, file à juger 30 %, non-gagnants 12 %, récolte 49 %.
  Boîte et jauge en place (0604) ; première fermeture : 243 familles gagnantes
  sur 918 closes (dernière génération sous r = 1 sur au moins 4 passages).
  `par_jour` de la jauge mesuré sur les dépôts des 7 derniers jours (plus bas que
  pods/rythme.json : smart_girl 4,3 contre 7, alpha_male 3,1 contre 4).
- **29/10, fin d'après-midi** : règle des déclinaisons tranchée par Adrien (D35),
  0605 appliquée. Boîte : 649 déclinaisons de génération 1 (accroche identique),
  1 de génération 2 (alpha_male_yellow, 13 840 vues de moyenne sur 4 passages).
  Les deux autres générations 1 au-dessus de 10 000 vues ont déjà leurs 3
  déclinaisons. Avec la règle de la spec, 14 générations 2 auraient été ouvertes.
- **29/10, soir** : Adrien revient au verdict de la spec pour ouvrir la génération 2
  et met les générations 2 en tête de la boîte (0606) : 10 générations 2 ouvertes,
  toutes au rang 1 et suivants de leur label. Section BLEO dans l'OS, admin
  seulement et en lecture seule (vues de 0607) : vue d'ensemble (mode, dernière
  nuit, dernier plan, rapport, historique), plan du jour compte par compte contre
  minuit, familles d'accroche et leur fiche (contenus par génération, passages),
  podz (jauge et boîte), réglages. Les podz ne lisent toujours rien (L4).
- **29/10, soir (suite)** : #811 mergée. Dans l'OS : Pods et Répartition (Allocation)
  rangées telles quelles dans la section BLEO ; la boîte et la jauge des podz
  passent en bas de la page Pods (l'ancienne adresse /admin/bleo/podz y renvoie) ;
  icônes sur les titres et les badges ; catégories du plan renommées pour dire
  « langue neuve » ou « langue déjà servie », infobulle sur la valeur attendue.
- **29/10, nuit** : Pods et Allocation dans la section BLEO, boîte des podz sous le
  tableau de bord de Pods, valeur par langue dans la fiche famille (#822, #824,
  #825). Fermeture des familles sur le r moyen plafonné (D36, 0608) : 165
  familles rouvertes ; jauges : weird_alpha 2,4 → 3,6 semaines (full test 30 → 20 %),
  clean_study 2,1 → 3,2 (30 → 20 %), alpha_yellow 5,4 → 7,1 (20 → 10 %), RH reste à
  30 %. D37 (la boîte rend le post parent complet) et D38 (images) pour L4.
- **29/10, nuit (suite)** : D39 attend la bascule (décision d'Adrien). Les légendes
  d'images partiront avec la recherche des podz (L4), pas avant. La colonne langue
  de la spec (L9 à L11) est remplacée par le plan « Réécriture native » du 29/10 :
  `bleo_fiches` reprise pour les fiches, `bleo_banque` abandonnée au profit de
  `exemples_natifs`, production 50/50 sur l'allemand après J14. Migration de la
  boîte renommée 0610 (collision avec la 0609 de la relecture native).
- **29/10, fin de soirée** : relecteurs recrutés gardés pour après le démarrage
  (réécriture et correction de posts) ; angles micabo et UnSwipe : fiche appli
  seule ; légendes des 13 419 images des podz lancées le 30/10 à 10 h.
- **29/10, fin de soirée (suite)** : pas de concurrent en essai (Adrien) : la slide
  concurrente est remplacée par notre appli (Sophia, UnSwipe ou micabo), comme aujourd'hui.
- **29/10, fin de soirée (suite)** : D40 corrigé (r moyen affiché, 0611) grâce à la
  fiche d'une famille relue par Adrien ; D41 ouvert (fatigue sans oubli).
- **29/10, fin de soirée (suite)** : D41 tranché et appliqué (0612, effet à la nuit
  du 30/10) ; la fiche famille montre la slide 1 et la slide 2 de chaque contenu
  (0613) au lieu de la description TikTok.
- **29/10, 19 h** : décision d'Adrien : pas d'A/B, podz sur BLEO et bascule lundi,
  ancien système en secours. Plan ci-dessus (section « Bascule du lundi 2/11 »).
