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
| D1 | À minuit, l'ancien système **supprime tout passage du jour sans `post_id`** puis compte le quota sur les **posts**. Un passage BLEO encore « sans slides » à 00 h est effacé et le témoin remplit les deux créneaux : pas de paire. Même purge à 04 h, au bouton « Assigner » et à la recharge d'un créateur | `purgerAssignationIncomplete` (AC:452), `listerComptesSousQuota` (AC:2836), `revoquer-post` | BLEO crée à 14 h le passage **et son post**, masqué aux posteurs jusqu'à minuit ; le deck prêt remplit les slides du post et de `passages.slides` | à décider |
| D2 | Les posteurs voient le post J+1 de BLEO dès l'après-midi, ~10 h avant celui du témoin : la mesure « BLEO publié en premier ≈ 50 % » est biaisée d'avance | `PosterCalendrierPage.tsx:66` | Réglé par le masquage de D1 | à décider |
| D3 | Les passages BLEO **consomment le budget de la tierlist** (`restants`) et leurs vues nourrissent la requalification : le témoin tire dans un stock entamé par BLEO, surtout les contenus neufs (`tier_cycle` 0) que BLEO teste | vue `contenu_tier_etat` (M/0270:444) | Exclure les passages `bras = 'bleo'` de `contenu_tier_etat` et de la requalification pendant l'A/B | à décider |
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
| D30 | Une déclinaison doit garder l'accroche, mais rien n'empêche un podz de déposer en full test une accroche gagnante à peine reformulée (nouvelle famille, défaut 2,7, 2 tests) | Refus au guichet si l'accroche est trop proche d'une famille gagnante du label (seuil à caler) | à décider |

### Agent de langue (L9)

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
3. Avant L9 : le montant des micro-tâches de relecture (bloquant), les fiches
   appli (D8 de la spec, nécessaires au contrôle D5.4), le Google Sheet de
   relecture.
4. Avant L3 : ajouter @sofiya.yussupova comme source de clean_study.

## Calendrier visé

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

La colonne « agent de langue » (L9 → L11) part après L7, dès que les points
bloquants de L9 sont levés.

## À blanc du 29/10 au 2/11 (décision d'Adrien le 29/10)

Construit et branché le 29/10, en ajouts seulement (rien de ce qui tourne n'est
modifié, aucune fonction Edge redéployée) :

| Migration | Contenu | État |
| --- | --- | --- |
| `0600_bleo_modele` | Colonnes, tables `bleo_*`, vue `bleo_mediane_compte`, `reglages.bleo` | Appliquée |
| `0601_bleo_remplir` | L1 : 3 458 familles, 65 liens parent → variante des notes (`scripts/bleo-parents-notes.mjs`), types, classes | Appliquée |
| `0602_bleo_nuit` | `bleo_nuit()` : A2, A1, A3, A4, A5 ; cron 05 h 15 | Appliquée, 1re nuit le 29/10 à 12 h (9,5 s) |
| `0603_bleo_tirage` | `bleo_tirage()` en mode ombre (A6 à A8), `bleo_rapport()`, crons 14 h et 22 h | Appliquée (+ correctif « hors_file ») |

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
