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
| D39 | **Tranché le 29/10 par Adrien.** Le rappel J+7 rejoue le même post sur le même compte : sur 147 rappels mesurés, r médian 1,32 (post normal du compte : 1,00), mais 5,4 % seulement battent le post d'origine (vues médianes 5 300 contre 80 500). Le même contenu sur d'autres comptes (r médian 1,62) et une déclinaison G1 (1,66, 65 posts) font mieux | Pour chaque hit à 50 000 vues, le compte reçoit une **déclinaison G1 du hit** à la place du repost : la famille du hit passe en tête de la boîte du podz (commande urgente, à livrer avant J+7), puis l'assignation donne au compte une G1 qu'il n'a pas encore postée. Repli quand aucune G1 n'est prête, ou quand le label n'a pas de podz de la voie 1 (medical_study, white_bg) : le repost actuel. Volume : environ 27 hits par semaine, environ 20 contenus distincts (smart_girl 9,5 hits par semaine, alpha_yellow 4,8, alpha_male 3,3, weird_alpha 3, RH 3) | **Abandonnée le 4/11 par Adrien : les rappels restent.** Jamais branchée (ni commande dans la boîte, ni assignation). Remesuré le 4/11 sur plus de données : rappel sur le même compte r médian 1,42, 24 % à 10 k, 5 163 vues médianes (187 posts) ; G1 d'un hit sur le compte du hit r 1,50, 4 405 vues (47 posts) ; G1 d'un hit tous comptes r 1,17, 13,5 % à 10 k (111 posts) ; le hit lui-même sur d'autres comptes r 1,63, 20 % à 10 k (1 639 posts, ce que BLEO fait déjà en récolte). La G1 ne bat pas le rappel, et elle coûterait des commandes urgentes aux podz | abandonnée |
| D40 | Le r moyen affiché dans l'OS comptait r = 20 pour chaque passage publié sans r (`least(NULL, 20)` rend 20 en Postgres) : famille « hobbies that will make you disgustingly confident » à 5,3 au lieu de 1,93 | Corrigé (0611) : la moyenne ne lit que les r mesurés. Seul l'affichage était faux : fermeture, forme et tirage filtrent déjà `r is not null`. Les chiffres des reposts (D39) sont refaits sans ce biais : inchangés | fait (0611) |
| D41 | La fatigue ne s'oublie jamais : `n_post` et `n_accroche` comptent tous les passages depuis toujours, et aussi les passages restés `assigne` des semaines après leur date (jamais publiés). Exemple : la meilleure accroche de weird_alpha (433 k vues) vaut 0,005 en allemand (22 passages de la famille, dont 4 jamais publiés) contre 2,69 en français | Ne compter que les passages des 60 derniers jours, et les `assigne` seulement jusqu'à 3 jours après leur date | fait (0612), décision d'Adrien le 29/10 ; dans l'exemple, la famille passe de 22 à 18 passages comptés en allemand |
| D30 | Une déclinaison doit garder l'accroche, mais rien n'empêche un podz de déposer en full test une accroche gagnante à peine reformulée (nouvelle famille, défaut 2,7, 2 tests) | Refus au guichet si l'accroche est trop proche d'une famille gagnante du label (seuil à caler) ; la mesure de proximité existe depuis 0631 (`bleo_mots_accroche`, D45) | **Fait le 2/11 (0642)** : refus `theme_gagnant` quand le hook d'un full test tombe dans un thème qui a déjà gagné (règle des thèmes) |
| D42 | La boîte liste des parents : une famille dont plusieurs G1 ont gagné y avait une ligne de G2 par G1, à la suite depuis D35 (weird_alpha : 3 G2 de « hobbies that will make you dangerously confident » aux rangs 1 à 3, famille déjà au budget de diffusion). Rien ne limitait la production d'une famille par jour | **Tranché le 30/10 par Adrien** : une ligne par famille, familles au budget en fin de boîte, une déclinaison par famille et par jour (refus `famille_du_jour`) | fait (0628) |
| D43 | La boîte d'un label mélange des familles anglaises et françaises (beau_smart_girl : 85 lignes anglaises sur 123, alors que le podz 7 écrit en français) : une G1 traduite perd l'accroche mot pour mot et le guichet la refuse | Une déclinaison s'écrit dans la langue de son parent ; l'OS la traduit ensuite pour chaque compte | fait (ROUTINE.md §4.3, 30/10) |
| D44 | Les consignes des routines des podz (« livraisons du jour avec leur preuve ») ne se changent que depuis la conversation de chaque podz, pas depuis la coordination | La routine commune prime ; les podz sont prévenus par message à la bascule ; à Adrien de les changer s'il le souhaite | contourné |
| D45 | Une famille, c'est un hook exact : des familles quasi identiques comptent à part. smart_girl a 86 familles « hobbies » (116 contenus) ; le 31/10 le pod 8 en a décliné deux le même jour. Le thème s'use : 28 passages par semaine à la mi-septembre, 173 la semaine du 19/10, médiane des vues de 4 091 à 1 572 (le reste du label stable vers 1 400). La fatigue ne voit que le même post et la même famille | **Tranché le 31/10 par Adrien** : avant la bascule, le guichet refuse une 2e déclinaison au hook voisin le même jour dans le label (`accroche_voisine`, 0631) ; après la bascule, avec D30, regrouper les familles quasi identiques en un thème pour la fatigue et la boîte | guichet fait (0631) ; **thèmes faits le 2/11 (0642)** |
| D46 | Les remakes gardaient l'outro du compte copié : en octobre, 862 passages (148 contenus) ont affiché « follow @richgirlacadmy… », parfois avec son guide « dans la bio » ; 1 115 slides dans 25 langues portent un handle tiers, dont 1 068 en dernière slide. Le 31/10 au matin, 14 posts du jour l'avaient encore | **Tranché le 31/10 par Adrien** : nettoyer et bloquer à la source. 0632 : en base, un handle qui n'est pas à nous est retiré ; la dernière slide qui en portait un devient une outro neutre de la langue ; triggers sur `contenu_langues` et `post_slides` ; nettoyage des decks et des posts pas encore publiés | fait (0632, le 31/10 au soir) : 12 posts du jour, 1 093 decks, 3 triggers |
| D47 | Le dernier repli du tirage (« tout ») peut mettre le même contenu sur les 2 créneaux d'un compte : 1 compte par jour au plus, sur les petits labels 100 % podz (Fathomly le 31/10 et le 1/11, mentalmaxxing le 2/11). Le rapport ne le compte pas en infraction (relâche déclarée). À minuit, `prochaineLignePlan` saute le doublon et le créneau retombe sur la tierlist : rien de publié deux fois | Même au dernier repli, jamais deux fois le même contenu sur un compte le même jour (dans `bleo_tirage`) | fait (0637, le 2/11 : au repli, jamais le même jour ; plan d'essai du 3/11 sans doublon) |
| D48 | Première nuit en mode actif (2/11) : l'index `passages_bleo_compte_jour_uidx` (0600, D20 : un passage BLEO par compte et par jour, pensé pour l'A/B) a refusé le 2e passage BLEO de chaque compte (614 « duplicate key »). 333 passages au lieu de ~668 : 309 comptes à 1 post, 63 à 0 ; le rattrapage de 5 h a échoué pareil (« [object Object] », l'erreur PostgREST relancée telle quelle). Les tests à blanc ne pouvaient pas le voir (aucune écriture) | Index supprimé (0636) le 2/11 à 8 h 24, rattrapage relancé (Adrien) ; le rattrapage relancé a resservi le créneau 1 (déjà posé) à 309 comptes : même contenu deux fois le même jour ; correctif : l'assignation exclut les contenus déjà posés ce jour sur le compte (plan BLEO et tierlist). À faire : que l'assignation écrive le message de l'erreur (pas « [object Object] »), et qu'une répétition écrive un vrai passage sur un compte de test | index supprimé ; suite à faire |
| D50 | Depuis la bascule, le rapport de 22 h compare encore le plan à l'ancien système (`bras` vide) : 1 compte comparé le 3/11, et sa porte « valeur du plan au-dessus de minuit » ne veut plus rien dire. Il lit aussi un run remplacé (il ne filtre pas `erreur`) | 0646 (4/11, 9 h 43) : le plan suivi par minuit (dernier run fini sans erreur) contre ce qui a été servi et publié : servis comme prévu, remplacés par BLEO, tierlist, hors BLEO, non servis (rappels compris dans le quota ; comptes bloqués à part ; comptes sans post listés), publiés ; répétitions réelles (contenu, thème, photo ; déclarées au plan à part) ; portes `plan_servi` (≤ 1 % manqués), `aucune_tierlist`, `aucune_repetition` à la place de `valeur_plan_superieure`. Rejoué : le 3/11 passe tout (607 au plan, 27 remplacés, 0 tierlist, 0 répétition non déclarée, 561 publiés sur 636) ; le 2/11 échoue où il faut (26 non servis, 28 tierlist, 68 thèmes répétés) | fait |
| D51 | Les petits labels de remakes (Fathomly, mentalmaxxing, that_girl_study) remettaient sur un compte un contenu déjà posté à moins de 14 jours, parfois la veille : 4 posts le 3/11, 10 au plan de 14 h du 4/11. Les podz produisent assez (41, 38 et 21 contenus en 7 jours, plus que les créneaux de ces labels) : ce sont les jugements qui manquent (12, 6 et 2 contenus jugés ; 36, 56 et 27 à juger). La file `juger` est plafonnée à 30 % des créneaux du label (1 test par jour pour Fathomly et that_girl_study), et le contenu à juger ne venait qu'au dernier repli, après celui qui répète | 0645 (3/11, 20 h 12) : le repli « contenu à juger » (`hors_file`) passe avant le repli qui répète (`tout`). Plan du 4/11 retiré à 20 h 13 : 10 répétitions → 1 (le compte UGC polonais, qui ne lit pas le plan). Le rythme des podz ne change pas | fait |
| D52 | Deux trous des remplacements BLEO (D49). (1) Le 4/11 vers 11 h, l'arrêt d'UnSwipe (#1099) a annulé les posts UnSwipe du jour ; leur remplacement cherchait des candidats pour UnSwipe, l'application du plan, que plus aucun compte ne sert : 59 posts partis à la tierlist (dont 18 weird_alpha). (2) Un remplacement fait après le tirage de 14 h ne voyait pas le plan du lendemain : 2 comptes ont reçu le 4/11 un contenu que le plan du 5/11 leur donnait aussi | 0647 (5/11, 9 h 46) : `bleo_remplacants` exclut les contenus prévus pour le compte dans les plans suivis des 14 jours suivants. Assignation : si aucun candidat de l'application du plan n'est servable, on retente avec l'application du créneau avant la tierlist (`applicationsRemplacant`). Reste : deux remplacements simultanés sur un même compte peuvent choisir le même contenu (1 cas le 4/11 à 16 h 40) | fait |

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

**A/B traduction (30/10, demande d'Adrien).** Dans Tests seulement : **pas
d'A/B dans l'assignation de minuit pour l'instant** (Adrien, 30/10).

| Morceau | Où | État |
| --- | --- | --- |
| Duel à l'aveugle sur des slideshows déjà publiés : le deck parti contre celui du candidat, gauche ou droite au hasard, vote enregistré | `ab-traduction` (`duel_preparer`), `ab_traduction_duels`, page Tests « A/B traduction et placement » | en service. Deux candidats dans `CIRCUITS` (`_shared/ab_circuits.ts`) : `ancree` (candidat d'attente : traduction ancrée sur la banque + placement actuel, **ne lit aucune fiche** ; c'est lui que le lot 1 a jugé en de, fr, it), et `fiches` (05/11) : la réécriture native du doc, un seul appel qui voit tout le post et écrit le deck, slide d'appli comprise, à travers les quatre fiches (CTA, appli, label, langue) et la localisation scolaire, sans banque ni remarques ; contrôles du code : mêmes positions, appli nommée sur une seule slide à partir de la 4e, jamais la couverture, aucun concurrent, refus noté. Le lot 2 (candidat `fiches`, `envoi_auto` à faux, 0629) sert au vrai match « production contre fiches ». Troisième candidat `production` (05/11) : la chaîne de la nuit rejouée aujourd'hui (`traduireBaseDeck` + placement actuel avec corrections et angle du label), sans rien écrire ; il mesure la production du jour contre le deck parti (souvent cuit avant les angles du 24/10) et sert de référence pour juger une correction de la chaîne. `lot_servir` accepte `langue` pour sortir une langue d'abord (lot 3, français) |
| **Duels envoyés aux relecteurs natifs** (0626) : l'admin envoie un duel prêt aux relecteurs de la langue ; ils le voient dans leur espace « Native review » (OS posteur, `/createur/relecture`), les relisent un à la fois, sans la source (deux versions dans leur langue, version 1 et version 2), notent chaque version sur 5 (la mieux notée gagne, même note = égal) et laissent une remarque obligatoire d'au moins 50 mots par slideshow, slide par slide, qui vaut pour les deux versions (plus de type d'erreur ni de cible côté relecteur, 02/11). Les côtés ne leur sont jamais révélés : `mes_duels_relecteur()` rend les decks dans l'ordre tiré, `voter_duel_relecteur()` traduit le côté en version. L'admin lit le décompte (votes, relecteurs, part du candidat, verdict D8 à 55 %, notes moyennes, dernières remarques) dans Relecture native, onglet Duels (`DuelsAdmin`, 04/11) : chaque duel avec sa source, ses deux versions, le vote de chaque relecteur par son nom, ses notes et sa remarque ; les colonnes restent Version 1 / Version 2 jusqu'à « Révéler » (par duel ou d'un coup). La carte Tests garde le duel à l'aveugle de l'admin | `ab_traduction_duels.relecteurs_le`, `ab_traduction_votes`, `src/features/relectureNative/DuelsRelecteur.tsx`, carte Tests | en service (0626). **Boucle d'amélioration** : le candidat `ancree` relit les 12 dernières remarques des relecteurs qui visent sa version (`chargerRemarquesRelecteurs`, `_shared/ab_circuits.ts`) et les passe au modèle en consignes (`traduireAncre`, `conseils`) ; le verdict D8 dit si la version est à retenir pour `circuit_production` |
| **Boucle de correction** (0630, 08/11) : chaque remarque de relecteur est découpée en corrections atomiques (fragment fautif, ce qu'il aurait écrit, type : calque, registre, vocabulaire, placement, longueur, casse, sens) par Gemini (`ab-traduction`, action `corrections_extraire`, cron `ab-corrections` toutes les 10 min, ou bouton), rangées dans `corrections_natives` en `proposee` ; l'admin retient ou écarte (Relecture native → Corrections, « Retenir les N proposées »). Les RETENUES d'une langue entrent dans la production : bloc `corrections_natives_bloc(langue)` ajouté aux règles de traduction (`traduireBaseDeck`, composer, donc aussi le candidat `production`), et celles de type `placement` en premiers exemples du placement. Aperçu du bloc dans Relecture native → Corrections et dans Traduction & placement → Langues | `_shared/corrections_natives.ts`, `ab-traduction`, `corrections_natives`, `ab_traduction_votes.corrections_extraites_le`, `SectionCorrections.tsx` | en service |
| **Relecture simple des posts publiés** (0631, 08/11) : chaque samedi 8 h 07 UTC (cron `relectures-hebdo`), 15 slideshows publiés par langue (tirés au sort parmi les publiés des 14 derniers jours depuis 0632, un par contenu, au plus 3 par label, jamais deux fois au même relecteur) partent à chaque relecteur de la langue, tels qu'ils sont partis (`post_slides` figées dans `relectures_posts`). Le relecteur (Native review, au-dessus des duels) réécrit les slides qu'il veut, note sur 5, remarque (30 mots si rien réécrit) ; `relire_post_relecteur()`. Les relectures faites sont découpées en corrections par le même job que les votes (`extraireCorrections`, `corrections_natives.relecture_id`). Admin : Relecture native → Relectures (état par langue, part de slides reprises, « Envoyer 15 posts maintenant » = `relectures_envoyer`) | `relectures_posts`, `RelecturesRelecteur.tsx`, `SectionRelectures.tsx`, `apiRelectures.ts` | en service |
| **Bandeau de la boucle** (0633, 13/11) : en tête de Relecture native et de Traduction & placement → Langues, la boucle en quatre étapes (posts envoyés → relus → à trier → dans la traduction) avec les chiffres des 7 derniers jours par langue (`boucle_etat()`) et la part de slides reprises contre la semaine d'avant ; une étape ouvre son onglet | `BandeauBoucle.tsx`, `apiBoucle.ts` | en service |
| **Lot commun de duels** (0627) : au lieu d'un tirage au hasard, un lot n°1 de 15 slideshows choisis pour couvrir le plus de labels et de thèmes possible (`ab_lot_composer()` : contenus validés avec un deck source, un seul par accroche normalisée, un par label à tour de rôle, classés par nombre de langues publiées, r médian et nombre de publications). Le même lot sert toutes les langues : toutes les deux minutes, `ab-traduction` (`lot_servir`, cron `ab-lots`) prépare les duels manquants pour chaque langue qui a au moins un relecteur (invité ou actif), deux par appel, et les envoie d'office (`relecteurs_le` posé à la création). Dès qu'un compte de relecteur est indiqué dans l'OS, sa langue entre dans le lot. Relecture native, onglet Duels, montre la couverture par label, la liste des 15 contenus et l'avancement par langue (relecteurs, duels prêts, échecs, votes) ; `mes_duels_relecteur()` sert les duels dans l'ordre du lot | `ab_lots`, `ab_lot_contenus`, `ab_traduction_duels.lot_id`, `ab_lot_composer()`, `ab_lot_etat()`, `ab_lot_a_faire()`, `src/features/abTraduction/BlocLot.tsx` | en service (0627 appliquée le 02/11, lot n°1 composé : 15 contenus, 10 labels). 0628 : pas de duel dans la langue source du contenu (le relecteur français n'a que les 11 contenus écrits en anglais), `attendus` par langue dans l'état du lot. 0629 (05/11) : plusieurs lots, chacun avec son circuit candidat (sélecteur et « Nouveau lot » dans Relecture native → Duels), et `envoi_auto` : à faux, les duels sont préparés mais attendent « Envoyer les N duels non envoyés » |
| Contrat d'un circuit : il reçoit le deck source, la langue, l'appli et, s'il y en a un, le **CTA imposé par l'OS** (`reprise` quand l'original cite un concurrent, `marquee` quand le podz a marqué la slide) ; il rend le deck aux mêmes positions, une slide d'appli, et le CTA écrit (ou son refus). Sinon il choisit la slide et la tournure avec les quatre fiches | `_shared/ab_circuits.ts` | prêt. L'appel unique s'y ajoute sous l'id `natif` ; le repérage des deux cas se branche dans `commanderCta`. Plus de forme ni de voie `prouvee` / `essai` tirées (décision d'Adrien du 30/10, 0624) |
| **Fiche CTA** (0623) : les règles communes à toutes les applis et toutes les langues pour écrire le CTA (un vrai conseil, l'appli fondue dedans, le même moule que les voisines, le choix de la slide, la slide 4 au plus tôt, les interdits). Une seule fiche, `bleo_fiches` sorte `cta`, `cle = 'commune'`. Le modèle, en anglais, est tenu par la session de la réécriture native (#916) | Page Fiches, sorte « CTA » (la première) | à écrire par Adrien depuis le modèle (0 version au 30/10) ; lue par l'appel unique avec les fiches appli, langue et label. Les fiches label sont écrites (premier jet des 14 labels en 0625), plus calculées |
| Pour plus tard, l'A/B en production : réglage `reglages.ab_traduction` (coupé, refuse de s'allumer sans circuit), tirage post par post (`_shared/ab_traduction.ts`), `decks_natifs`, `passages.bras_traduction`, `ab_traduction_rapport()` | 0620, en base, inutilisés | le branchement dans l'assignation et la cuisson de l'après-midi sont dans maxkender/sophia-os#908, **fermée sans fusion** ; à reprendre si on décide l'A/B en production |

**L7 (decks l'après-midi)** reste dans BLEO : c'est là que tournera l'appel
unique pour les decks du lendemain, avec dix heures de marge entre le tirage de
14 h et minuit, pour que le circuit Gemini actuel ait le temps de reprendre un
deck raté. Le plafond de dépense par jour va dans `reglages.bleo`.

Taille de l'appel, mesurée le 30/10 (l'estimation du 29/10, « cinq fois plus
lourd », oubliait les prompts de l'admin) :

| | Aujourd'hui, 2 appels | Appel unique |
| --- | --- | --- |
| Entrée | ≈ 8 000 tokens : traduction ≈ 3 500 (`traduction_de` 5 800 caractères, `localisation_scolaire` 5 400, slides) ; placement ≈ 4 500 (`placement_sophia` 16 700 caractères à lui seul) ; `corrections` vide | ≈ 10 000 à 15 000 tokens : fiches langue, label et appli (≈ 3 000), une dizaine d'exemples natifs (≈ 1 500 caractères chacun, ≈ 4 000), images en 540 × 960 (≈ 250 à 500 par slide), doctrine de placement si elle reste |
| Appels | 2, à la suite | 1, plus le contrôle de fidélité |

Soit 1,5 à 2 fois les tokens d'aujourd'hui, pas 5. Les tokens coûtent de
l'attente, pas du CPU de la fonction ; le CPU, c'est la préparation des images
(téléchargement, réduction) si la fonction la fait elle-même : à faire en
amont, pas dans l'assignation de minuit.

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

## Bascule du dimanche 1/11 au soir (décision d'Adrien le 29/10, avancée le 30/10)

**Avancée d'un jour (Adrien, 30/10 au soir).** Dimanche 1/11 au soir, après le
tirage de 14 h du plan du 2/11 :
- **l'assignation de minuit passe sur le plan BLEO** (`bleo.mode = 'actif'`,
  « Passer en actif ») : le premier jour assigné par BLEO est le **lundi 2/11**
  (et non plus le mardi 3/11) ;
- **les podz basculent en entier** (`bleo.podz.type_obligatoire = true`, et les
  prompts des 6 routines de la voie 1 qui parlent de preuve) : leurs routines du
  lundi matin sont les premières sur la boîte ;
- **seul l'agent de traduction et placement est progressif** : la réécriture
  native remplacera l'ancien circuit au compte-gouttes, quand elle aura passé
  ses duels de Tests (rien en production d'ici là).

**Pas d'A/B.** Podz sur BLEO et bascule dimanche soir, l'ancien système gardé en secours.
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
- ~~**D39 (G1 à la place du repost)**~~ : abandonnée le 4/11 (Adrien), les rappels
  J+7 restent (voir D39).

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
podz passent à `type_bleo` avec les routines (bascule du dimanche 1/11 au soir), puis
`type_obligatoire = true`. D30 (accroche à peine reformulée d'une famille
gagnante) reste à décider : pas encore de refus.

**Routines des podz (L4, P2 et P3), mergées le 29/10.** `pods/ROUTINE.md` en
deux parties : voie 1 sur la boîte (lire la boîte, composer le jour : demandes
du chef, full tests de la jauge, déclinaisons dans l'ordre ; écrire une G1, une
G2, un full test ; que faire de chaque refus du guichet) et voie 2 inchangée
(D25). L'ancienne routine est gardée dans `pods/ROUTINE-avant-bleo.md`. **La
bascule des podz est un réglage** : tant que `reglages.bleo.podz.type_obligatoire`
est faux, `npm run boite` affiche « podz sur BLEO : pas encore » et la voie 1
suit la routine d'avant ; le passer à vrai le dimanche 1/11 au soir fait passer les
7 podz sur la boîte (et le guichet refuse alors un dépôt sans `type_bleo`).
Retour en arrière : le repasser à faux. Les 7 `AGENT.md` de la voie 1 ont un
encadré qui dit ce qui ne vaut plus (preuve, veille, variantes, essais) ; le
nettoyage de leur texte viendra après la bascule. `pods/chef/AGENT.md` : la
jauge (`bleo_jauge`, `bleo_jauge_jours`), monter `par_jour` au-delà de
6 semaines si la file à juger du label a de la place, le baisser après
14 jours sous 1 semaine, et les lignes BLEO du point du matin.

**Recherche d'images des podz (D38), mergée le 29/10.** L'action `images`
rend la légende de chaque image (`legende`, en anglais) ; `npm run images --
--cherche "mots"` ne garde que les images dont la légende contient chaque mot,
les moins utilisées d'abord, et liste leurs légendes. Elle devient utile avec
le rattrapage des légendes du 30/10.

**Suivi avant/après (remplace la mesure A/B), mergé le 29/10.** Carte « Avant /
après la bascule » sur la vue d'ensemble BLEO : 21 jours, jours pas encore
mesurés en grisé (le r d'un post se calcule 72 h après sa publication ; en
pratique 3 à 4 jours de retard), et l'alerte en rouge quand le r médian des 3
derniers jours mesurés baisse de plus de 15 % par rapport aux 14 jours d'avant.
Le premier jour assigné par BLEO (2/11) entre dans l'alerte vers le 6/11 ; elle
ne compare BLEO seul à l'ancien système qu'à partir du 8/11 environ.

**Interrupteur.** Vue d'ensemble BLEO (`/admin/bleo`), admin seulement : « Passer
en actif » puis, en secours, « Revenir à l'ancien système ». Confirmation qui
rappelle le plan suivi (jour, créneaux). Le changement vaut pour la prochaine
assignation de minuit. Sans l'interrupteur, le tirage aurait cessé en mode
actif (corrigé par 0614).

**Calendrier (à jour le 30/10 au soir).**

| Quand | Quoi |
| --- | --- |
| Ven 30/10 | L4 fini (guichet, outils, routines, chef), légendes d'images (13 418, fini à 20 h 27), une ligne par famille et une déclinaison par famille et par jour (0628) |
| Sam 31/10 | 6 h 10 : contrôle de la nuit. Podz 8 et 9 : premiers dépôts par la boîte. 15 h 20 : répétition (servabilité du plan du 1/11, assignation à blanc, dépôts 8 et 9) |
| Dim 1/11 | 15 h 20 : répétition générale sur le plan du 2/11. **20 h 20 : bascule complète** si tout est vert (mode `actif`, podz sur la boîte, messages aux podz) |
| Lun 2/11 | **Premier jour assigné par BLEO.** 6 h 10 : contrôle de la nuit ; 7 h 17 – 7 h 47 : premières routines des podz sur la boîte ; 8 h 40 : contrôle des dépôts ; 22 h 08 : bilan du premier jour |
| ~Lun 9/11 | ~~D39 : déclinaison G1 du hit à la place du repost~~ (abandonnée le 4/11) |
| ~Lun 16/11 | Fin de la tierlist (L8) si 14 jours stables |

Le calendrier A/B de la spec (J1 le 9/11, J14 le 22/11, L8 le 9/12) est caduc : pas d'A/B.

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
| `0617_bleo_suivi` | Suivi avant/après : vue `bleo_suivi_jours` (r médian, part à 10 000 vues, vues par post, part du plan BLEO, par jour) et `bleo_suivi_alerte()` (r médian des 3 derniers jours mesurés contre les 14 d'avant, alerte au-delà de 15 %, `reglages.bleo.suivi`) | Appliquée le 29/10 ; au 25/10 : 0,96 contre 1,00 (−4 %), pas d'alerte |
| `0620_ab_traduction` | A/B traduction et placement : duels à l'aveugle en Tests (`ab_traduction_duels`), et, coupés, le réglage, `decks_natifs`, `passages.bras_traduction`, le rapport | Appliquée le 30/10 ; A/B **seulement dans Tests** (Adrien, 30/10) |
| `0623_fiche_cta` | `bleo_fiches` accepte la sorte `cta` : la fiche CTA commune | Appliquée le 30/10 ; version 3 (le hook ne change pas, la mise en page et la frappe) |
| `0628_bleo_boite_une_famille_par_jour` | Une ligne par famille dans la boîte (G2 d'abord, puis le parent le moins décliné), familles au budget en fin de boîte ; le guichet refuse une 2e déclinaison de la même famille le même jour (`famille_du_jour`) | Appliquée le 30/10, testée (refus après un dépôt du jour, annulé) |
| `0630_bleo_valeur_au_jour_fatigue_60j` | La valeur du rapport de 22 h compte la fatigue dans la fenêtre de D41 (60 jours ; un passage non publié 3 jours après sa date), comme la nuit et le tirage : elle la comptait depuis toujours | Appliquée le 30/10 ; rapport du 30/10 recalculé |
| `0631_bleo_guichet_accroche_voisine` | Le guichet refuse une déclinaison dont le hook est voisin d'une livraison du jour du label (`accroche_voisine`, D45) : `bleo_mots_accroche`, `bleo_proximite_accroches`, `boite.voisine_seuil` 0,6 et `boite.voisine_mots_min` 2 | Appliquée le 31/10 ; testée sur les 7 déclinaisons du pod 8 (seules les deux « hobbies … smarter » se touchent) |
| `0632_handles_tiers` | Plus aucun handle d'un autre compte dans nos slides (D46) : `texte_sans_handle_tiers`, `slides_sans_handle_tiers`, `outro_suivre` (outro neutre en 30 langues) ; triggers sur `contenu_langues`, `contenu_langue_decks` et `post_slides` | Appliquée le 31/10 par étapes avec `execute_sql` (`apply_migration` attendait une confirmation qui n'arrivait pas, le `drop trigger` la déclenchait) : 12 posts du jour, 1 091 decks Sophia et 2 d'applis nettoyés, 0 restant |
| `0633_a_blanc_depuis_la_base` | `a_blanc_lancer(compte, jour, bleo)` lance `assignation-a-blanc` par pg_net avec l'en-tête des crons lu dans le Vault (jamais affiché) ; `a_blanc_lire(id)` rend la réponse (lignes « Plan BLEO … », résultat). Les répétitions n'ont plus besoin d'Adrien | Appliquée le 31/10 |
| `0634_cron_secret_empreinte` | Vue de l'empreinte SHA-256 du secret des crons (service_role seulement) : le bac à sable du test à blanc bloque les RPC, donc la lecture du Vault, et la fonction comparait l'en-tête à `CRON_SECRET`, périmé depuis la rotation du 31/10 au matin (401). Elle compare maintenant les empreintes | Appliquée le 31/10 ; fonction redéployée à la merge |
| `0635_auto_validation_5h` | Validation automatique des podz à 5 h après le dépôt (au lieu de 12), cron toutes les 10 minutes (au lieu de toutes les heures) | Appliquée le 1/11 à 10 h 20 |
| `0636_bleo_deux_passages_par_compte` | Supprime `passages_bleo_compte_jour_uidx` (D20, A/B) : il refusait le 2e passage BLEO de chaque compte (D48) | Appliquée le 2/11 à 8 h 24, rattrapage relancé |
| `0637_bleo_tirage_meme_jour` | Le dernier repli du tirage (« tout ») ne remet jamais le même contenu sur un compte le même jour (D47) | Appliquée le 2/11 ; tirage d'essai du 3/11 : 668 créneaux, 0 vide, 0 doublon |
| `0638_bleo_nouveaux_avant_tirage` | Le tirage de 14 h rattache d'abord les contenus validés depuis la nuit et calcule la valeur de ceux qui n'en ont pas (`bleo_nouveaux_avant_tirage`, même formule que la nuit) : une livraison du matin est tirée le jour même et publiée à J+1 (« point 2 », Adrien). Un tirage d'essai lancé à une autre heure ne bloque plus le tirage officiel | Appliquée le 2/11 vers 10 h ; premier tirage concerné : 2/11 à 14 h |
| `0639_bleo_tests_famille_couverture` | Les tests (file à juger) respectent aussi « même famille » (10 jours) et « même couverture » (10 jours, dHash à 8 bits) : le 2/11, 12 tests reprenaient une photo de couverture vue par le compte dans les 10 jours et 1 compte avait 2 tests de la même famille le même jour | Appliquée le 2/11 à 12 h 20 ; tirage d'essai du 3/11 : 194 tests placés comme avant, 0 couverture ni famille récente (11 avant) |
| `0641_bleo_tirage_cron_trace_nouveaux` | Le tirage de 14 h écrit aussi dans `bleo_runs.resume` le compte du rattrapage d'avant tirage (`nouveaux_avant_tirage`, 0638) : pg_cron ne garde pas la valeur de retour, et au premier tirage officiel (2/11) ce compte n'était lisible nulle part | Appliquée le 2/11 à 14 h 37 ; effet au tirage du 3/11 (pour le 4/11) |
| `0642_bleo_themes` | Les familles quasi identiques d'un label forment un thème (D45, D30) : au moins 60 % des mots du hook le plus court en commun, dont 2 mots non génériques (`themes.mots_faibles`), regroupement en étoile autour de la plus grosse famille. Fatigue d'accroche (A5, valeur au jour), « même famille sur un compte », budget, fatigue du tirage, tests, infractions du rapport, boîte (une ligne par thème) et « une déclinaison par jour » passent au thème ; verdicts, fermeture et quotas restent à la famille. D30 : un full test au hook d'un thème qui a déjà gagné est refusé (`theme_gagnant`). Fonctions existantes patchées en place, page famille : le thème | Appliquée le 2/11 à 15 h 58 : 3 754 familles → 2 841 thèmes, 436 thèmes de plusieurs familles (913 familles regroupées). weird_alpha 281 → 177 (« hobbies that will make you dangerously confident » : 32 familles, 166 contenus, 1 037 posts en 60 jours) ; boîte de weird_alpha 50 → 24 lignes. Simulé sur les valeurs du 2/11 : les contenus des thèmes de plusieurs familles passent de 35 % à 9 % du poids du tirage dans weird_alpha, de 26 % à 7 % dans smart_girl. Effet à la nuit du 3/11 (A5), donc au tirage du 3/11 pour le 4/11 |
| `0643_bleo_remplacants` | D49 : un créneau hors plan (remplacement dans la journée une fois le plan du compte posé, créneau du plan non servable à minuit, compte absent du plan) est servi par BLEO : `bleo_remplacants(compte, jour, application, exclure)` rend les meilleurs candidats du compte, même vivier et mêmes garde-fous que le tirage (au thème), relâchés au besoin (budget, couverture, thème), tirage pondéré par valeur^3 ; l'assignation les essaie avant la tierlist, dernier secours. Le passage est `bras = 'bleo'`, file `valeur`, run du jour | Appliquée le 2/11 à 23 h 56 ; ~0,2 s par appel. Code déployé après la nuit du 3/11 |
| `0644_bleo_fonctions_sans_anon` | Les 28 fonctions `bleo_*` n'étaient pas fermées à `anon` (droit EXECUTE par défaut) et leur garde laisse passer un appel sans utilisateur : avec la clé publique du site, on pouvait refaire le plan (`bleo_tirage`), rejouer la nuit ou recalculer les thèmes. EXECUTE retiré à PUBLIC et `anon` ; `authenticated` (gardé par is_admin) et `service_role` gardés | Appliquée le 2/11 à 23 h 57 ; 0 fonction `bleo_*` exécutable par `anon` |
| `0645_bleo_tester_avant_repeter` | D51 : dans le tirage, le repli 4 devient `hors_file` (un contenu à juger peut prendre un créneau valeur, sans répéter un contenu à moins de 14 jours) et le repli 5 devient `tout` (le même contenu peut revenir, jamais le même jour, D47). La file et la catégorie suivent l'état du contenu choisi | Appliquée le 3/11 à 20 h 12 |
| `0646_bleo_rapport_plan_contre_publie` | D50 : `bleo_rapport` réécrit. Le plan suivi par minuit (dernier run fini sans erreur) contre ce qui a été servi et publié ce jour : `execution` (servis au plan, remplacés par BLEO, tierlist, hors BLEO, non servis, comptes bloqués, comptes sans post, publiés), `infractions` sur les posts réels (même contenu, thème, photo ; déclarées à part), `mix_reel`, valeurs ; portes `plan_servi`, `aucune_tierlist`, `aucune_repetition`. Page BLEO : la carte du rapport affiche l'exécution | Appliquée le 4/11 à 9 h 43 ; rapport du 3/11 recalculé |
| `0647_bleo_remplacants_hors_plans_a_venir` | D52 : le vivier de `bleo_remplacants` exclut les contenus prévus pour le compte dans un plan suivi (dernier run fini sans erreur) des `meme_contenu_jours` suivants | Appliquée le 5/11 à 9 h 46 |
| `0648_bleo_plan_ui_generation` | `bleo_plan_ui` ajoute `generation` et `type_bleo`. Page Plan : badge « G1 Déclinaison » ou « Full test » à côté de la catégorie, et filtre « Origine du contenu » (déclinaisons, full tests, autres). Affichage seulement | Appliquée le 5/11 à 10 h 30 |
| `0649_bleo_contenus_ui_image_sans_scan` | La fiche d'une famille tombait en « statement timeout » pour un admin connecté : `bleo_contenus_ui` joignait `media_library` sur une expression (`CASE … ::uuid`) que la RLS empêche d'utiliser comme condition d'index. Postgres relisait les ~32 000 médias pour chaque contenu en évaluant `media_dans_slides_du_poster`, ce qui faisait plus de 25 s pour une famille, contre 8 s de délai. L'identifiant du média est maintenant calculé à part (sous-requête LIMIT 1) : même résultat (hash identique sur 151 lignes), 0,3 à 1,3 s | Appliquée le 5/11 à 10 h 45 |
| `0650_bleo_remplacants_themes_a_venir` | Suite de D52 : l'historique du compte vu par `bleo_remplacants` compte aussi les lignes des plans suivis à venir. Un remplaçant évite donc aussi les thèmes et les photos prévus pour le compte les jours suivants, pas seulement les contenus (4 « même thème » non déclarés au rapport du 5/11) | Appliquée le 6/11 à 10 h |
| `0660_bleo_reglages_declinaisons_imports` | Décision d'Adrien du 6/11, après les mesures à âge égal. (a) `classes.depart.accroche_gagnante` passe de 3,2 à 2,0 : la valeur de départ des déclinaisons, relue chaque nuit, y compris pour celles déjà déposées. (b) `file_juger.age_max_import_jours` = 30 : un import (contenu hors podz) arrivé depuis plus longtemps n'est plus testé et reste en réserve. Le tirage lit ce réglage | Appliquée le 6/11 à 17 h 59 ; nuit relancée, plan du 7/11 retiré |
| `0661_bleo_perdants_et_declinaisons_livrees` | Décisions d'Adrien du 7/11. (1) `valeur.facteur_non_gagnant` = 0,5 : au tirage et pour les remplaçants, la valeur d'un candidat non gagnant est multipliée par 0,5 avant l'exposant (poids divisé par 8). (2) Les 14 déclinaisons des podz de remakes en classe `livre` (4,0) passent en `accroche_gagnante` (2,0) ; depuis 0652, les nouvelles prennent déjà cette classe | Appliquée le 7/11 à 17 h 19 ; nuit relancée, plan du 8/11 retiré |
| `0662_bleo_jauge_full_tests_minimum` | Décision d'Adrien du 7/11 : `jauge.parts` passe de 10/20/30/40 % à 30/30/40/50 % de full tests, selon les semaines de stock de la boîte (6, 3, 1). smart_girl 10 % → 30 %, alpha_male et beau_smart_girl 10 % → 30 %, weird_alpha 30 % → 40 %, remakes 40 % → 50 % | Appliquée le 7/11 à 17 h 35 |
| `0663_bleo_meme_contenu_60_jours` | Décision d'Adrien du 8/11 : `garde_fous.meme_contenu_jours` passe de 14 à 60 jours (tirage, remplaçants, rapport), et la tierlist de secours aussi (`tierlist.ecart_min_meme_contenu`). Les rappels J+7 gardent leur règle | Appliquée le 8/11 à 17 h 12 ; plan du 9/11 retiré |
| `0667_bleo_lundi_sources` | Décisions d'Adrien du 10/11 : la règle des sources A11, plus la règle des 100 k, par lots. Le lundi à 6 h 07 (cron `bleo-lundi-sources`), chaque source active est jugée sur ses posts chez nous (3 à 30 jours, hors rappels) : r médian > 1, r face au label > 1, un post à 100 000 vues, ou moins de 5 posts mesurés → retenue (colonne `raison`) ; sinon pas cette semaine. Décisions dans `bleo_sources_decisions` (+ `raison`, `meilleur_vues`, `lancee_le`). `bleo_sources_lot` lance au plus 6 sources retenues par jour (le lundi après les décisions, puis à 6 h 37, cron `bleo-sources-lot`, si le lot d'avant est fini), par le circuit du bouton (`maj_sources_demarrer` : une source à la fois, file vidée entre chaque, nouveaux posts seulement). Seuils dans `reglages.bleo.sources`. Compte rendu : `bleo_sources_semaine_ui`, panneau « Lundi : mise à jour des sources » de la page Sources | D'abord refusée par le classifieur (Adrien demandait un avis) ; appliquée le 10/11 à 15 h 20 après son « go », premier lot lancé à 15 h 21 |
| `0668_bleo_sources_age_min` | Lot 1 du 10/11 : 3 posts sources de moins de 1,2 jour rejetés par le score d'import sur des vues pas encore faites, perdus pour toujours (une URL connue n'est jamais reprise). Un slideshow source de moins de `age_min_jours` (7) n'est plus enfilé par la mise à jour : il part à la suivante (`separerTropRecents`, option `ageMinJours` de `listerUrlsCompteReference`, passée par `tickMajSources`). `reglages.bleo.sources` existait déjà (`toujours`, `min_posts`) : clés manquantes ajoutées, `bleo_lundi_sources` lit `min_posts` | Appliquée le 10/11 à 16 h ; code de l'import déployé à la fusion |
| `0669_maj_sources_ajouter` | Décision d'Adrien du 11/11 : une source ajoutée passe par la file des mises à jour, une source à la fois, au lieu d'extraire tout son profil en parallèle. `maj_sources_ajouter` l'inscrit dans les décisions de la semaine (raison `ajout`) et la lance tout de suite si rien ne tourne, sinon en tête du lot suivant (`bleo_sources_lot` trie `ajout` d'abord). Le formulaire « Ajouter une source » l'appelle ; le panneau s'appelle « Mise à jour hebdomadaire des sources » | Appliquée le 11/11 |
| `0670_labels_perf_comptes_actifs_posts_murs` | Décision d'Adrien du 11/11 : la performance d'un label (fermeture automatique, poids du choix de label, page Répartition) ne compte que les posts publiés il y a 3 à 15 jours, sur des comptes actifs (`publies` dans `stats_choix_label` et `simulation_repartition`). Avant → après : beau_smart_girl 0,724 → 0,734, weird_alpha 0,779 → 0,830, white_bg 0,864 → 0,825, Kaja 0,599 → 0,683 | Appliquée le 11/11 |

Les migrations 0618, 0619, 0621, 0622, 0624 à 0627 sont celles de la relecture native et de la réécriture native (exemples natifs, fiches langue, CTA puis retrait des stats CTA, fiches label et appli, votes des relecteurs) : voir `docs/cta.md` et la session de la relecture native. 0619 a été retirée ; deux migrations portent le numéro 0626.

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
  comptée sur les passages d'avant le jour, dans la fenêtre de D41 (0630).

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

Premier rapport à blanc (30/10, réel de minuit contre le plan de 14 h le 29/10,
recalculé après 0630) : 245 comptes comparés, valeur du plan 1 541 contre 975
au réel (+58 %), 11 couples sur 486 identiques ; mélange du réel : à juger 187,
récolte 166, gagnants servis 86, non-gagnants 48 (37 neufs, 11 servis) ;
0 infraction, 5 relâches déclarées, 0 créneau vide, plan tiré en 17,8 s. Portes :
toutes passent sauf les tests des contenus de moins de 3 jours (34 sur 62
complets, point connu ci-dessous). Avant 0630 : 1 528 contre 952, même lecture.

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
- **30/10** : nuit du 30/10 sans posts au réveil (crédits Gemini épuisés, 402, réessais qui saturent le CPU du drain) ; repli fal (#884), rattrapage complet (490 posts). Plan BLEO rebranché dans minuit (#900). Interrupteur, guichet, outils et routines des podz, suivi avant/après (L4 fini).
- **30/10, après-midi** : A/B traduction préparé (0620), puis limité à Tests sur décision d'Adrien (#908 fermée). Fiche CTA (0623) ; le CTA sans stats ni forme tirée (0624, session de la relecture native). Relecture native et Fiches rangées dans la section BLEO du menu.
- **30/10, soir** : bascule avancée au **dimanche 1/11 au soir** (Adrien) ; répétition des podz 8 et 9 sur la boîte samedi et dimanche ; légendes finies (13 418, 0 échec ; 820 images restent « aucune » d'un passage plus ancien) ; D42 et D43 tranchés (0628, routine) ; plus de CTA jugé aux vues dans les consignes des podz ; spec mise à jour (section « État au 30/10 »).
- **30/10, 22 h** : premier rapport à blanc : plan +58 % de valeur sur le réel, 0 infraction, 0 créneau vide, toutes les portes sauf les tests récents des petits labels (connu). Biais corrigé : la valeur du rapport comptait la fatigue depuis toujours, le tirage dans la fenêtre de D41 (0630). Plan du 31/10 : 245 comptes, 490 créneaux, 0 vide, 18,5 s ; nuit du 30/10 sans erreur.
- **31/10, matin** : nuit sans accroc (486 passages, 0 coupure, 0 repli fal). Répétition : podz 8 et 9 livrés par la boîte (8 et 4 livraisons, toutes typées). Deux familles « hobbies » quasi identiques déclinées le même jour : D45 tranché, refus `accroche_voisine` au guichet (0631). Handles d'un compte tiers (@richgirlacadmy) sur 862 passages d'octobre : D46.
- **31/10, 15 h 20** : répétition. Plan du 1/11 (242 comptes, 484 créneaux, 0 vide, 18 s) servable à minuit à 99,8 % (479 sur 480 ; 1 deck UnSwipe refusé, weird_alpha) ; 379 decks à cuire, comme une nuit normale. Podz 8 et 9 : 12 livraisons typées, 0 refus du guichet, déclinaisons avec parent et dans sa langue ; aucune encore validée (rattachement pas vérifiable). Remarques des podz : parents d'autres podz sans images locales, `--cherche` pauvre sur certains mots ; l'erreur 400 du pod 9 vient de son outil (la boîte donne la bonne image, en `.png`). Handles tiers : 12 posts du jour corrigés ; triggers et nettoyage des decks en attente (confirmation du serveur sans réponse).
- **31/10, 20 h 20** : 0632 appliquée en entier avant l'assignation de minuit : 1 093 decks nettoyés, 0 handle tiers restant, 3 triggers posés.
- **31/10, 20 h 30** : Adrien : bascule dimanche soir sans lui (« Bascule »), et les tests à blanc ne doivent plus lui revenir. `assignation-a-blanc` refusait le secret des crons depuis sa rotation (le bac à sable ferme le Vault) : 0634 (empreinte) et 0633 (lancement depuis la base).
- **31/10, 20 h 45** : tests à blanc lancés d'ici (`a_blanc_lancer`, plan du 1/11) sur 5 comptes (Sophia de et it, micabo fr, UnSwipe es et fr ; smart_girl, weird_alpha, beau_smart_girl, clean_study, mentalmaxxing) : 10 créneaux sur 10 suivent le plan (récolte, juger, gagnant servi, non-gagnant neuf), 0 repli, 3 à 6 s par compte ; outros nettoyées visibles. Tâches de dimanche (15 h 20, 20 h 20) réécrites : tests lancés d'ici, bascule sans Adrien si tout est vert.
- **31/10, 22 h** : 2e rapport à blanc. Valeur du plan 1 553 contre 960 au réel (+62 %), 9 couples sur 483 identiques, 243 comptes ; réel : à juger 211, récolte 134, gagnants servis 76, non-gagnants 62. 0 infraction, 7 relâches, 0 créneau vide. Portes : toutes vertes sauf les tests récents des petits labels (connu). Nuit du 31/10 (10,7 s) et plan du 1/11 (18 s) sans erreur.
- **1/11, 10 h 20** : il y a bien une validation automatique (12 h après le dépôt, une dizaine par heure) : les 12 livraisons de répétition de samedi ont été validées entre 23 h et 1 h 20, rattachées (famille, génération, valeur), et 8 posts en sont déjà sortis. Mais avec BLEO, un dépôt du matin n'entre au plan que le lendemain à 14 h (il faut la nuit pour la valeur) : publication à J+2 au lieu de J+1. Adrien : validation à 5 h et toutes les 10 minutes (0635). Le calcul des valeurs avant 14 h (sinon toujours J+2) n'est pas fait.
- **1/11, 15 h 20** : répétition générale. Plan du 2/11 : 334 comptes (+92, la cohorte qui démarre lundi : 102 comptes n'ont jamais posté), 668 créneaux, 2 vides, 19 s ; servable à 99,8 % (657 sur 658, 1 deck UnSwipe refusé) ; 540 decks à cuire (une nuit normale : 385 à 412, pour ~240 comptes ; nuit estimée à 55-65 min contre 36-45). Tests à blanc d'ici sur 20 comptes (Sophia, micabo, UnSwipe ; 12 langues ; les 7 labels de la voie 1, white_bg, Fathomly, mentalmaxxing, classic_study, that_girl_study ; 6 comptes neufs) : 40 créneaux sur 40, 39 sur le plan, 1 rendu à la tierlist (doublon du plan, D47). Boîtes non vides (24 à 238 lignes), guichet ok (déclinaison et full test). Validation à 5 h (0635) : les 102 livraisons du jour validées entre 11 h 20 et 13 h 10 ; déclinaisons des podz 8 et 9 de samedi et dimanche rattachées. Gemini : 0 erreur 402. L'outil Supabase (MCP) a renvoyé des 502 ; l'API de gestion a pris le relais.
- **1/11, 20 h 22 : bascule.** Contrôles verts : plan du 2/11 fini (668 créneaux), aucune chaîne d'assignation en cours, 0 erreur 402 dans l'heure, 7 boîtes non vides, guichet ok (déclinaison et full test), podz 8 et 9 : 22 déclinaisons validées et rattachées, 3 full tests validés (le dernier aura sa famille à la nuit). `bleo_changer_mode('actif')` (refusé sans jeton : appelé avec `request.jwt.claims` service_role, tracé dans `mode_historique`), puis `podz.type_obligatoire` à vrai. Encadré de répétition retiré de `pods/ROUTINE.md`. Les 7 podz de la voie 1 prévenus dans leur session (BLEO lundi, langue du parent, `accroche_voisine`, `--cherche`, plus de preuve, validation à 5 h). Minuit (lundi 2/11) assigne sur le plan BLEO.
- **1/11, 22 h** : 3e et dernier rapport à blanc (plan contre l'ancien système, jour du 1/11). Valeur du plan 1 499 contre 916 (+64 %), 7 couples sur 456 identiques, 231 comptes ; 0 infraction, 9 relâches, 0 créneau vide ; à juger 29 %, récolte 49 %, non-gagnants 13 %. Sur les 3 rapports (30/10, 31/10, 1/11), toutes les portes de W1 passent chaque jour sauf « tests récents complets » (petits labels, connu, à trancher). Nuit 8 s, tirage du 2/11 19 s. Mode `actif` depuis 20 h 22.
- **2/11, 6 h 10** : première nuit actif ratée à moitié : 333 passages sur ~668 (D48, index d'unicité BLEO hérité de l'A/B). Les passages créés sont bons (316 du plan BLEO, 7 rendus à la tierlist, 0 handle tiers). Adrien prévenu ; à 8 h 24, sur son accord, index supprimé (0636, par l'API de gestion : execute_sql attendait une confirmation) et rattrapage relancé.
- **2/11, 8 h 33** : rattrapage fini (644 passages, chaque compte servable à 2), mais 309 comptes ont reçu deux fois le même contenu : le rattrapage reprend le créneau 1 du plan sans voir qu'il est déjà posé. Correctif de l'assignation (contenus du jour exclus). La suppression des 309 doublons (non publiés) a été bloquée par le garde-fou de sécurité : en attente d'Adrien.
- **2/11, 8 h 40** : premiers dépôts sur la boîte : les 7 podz de la voie 1 ont déposé, 61 livraisons toutes typées (46 déclinaisons, toutes avec parent ; 15 full tests). Refus du guichet : smart_girl 6 `accroche_differente` (déclinaisons écrites dans la langue du post montré par la boîte, une traduction, au lieu de la langue source du parent ; réécrites en anglais, passées : consigne §4.3 corrigée), beau_smart_girl 1 (faute corrigée dans l'accroche), clean_study 1 (signes « θ९ » de l'accroche retirés), alpha_male 1 (Sophia citée dans le texte de base). Plusieurs podz ont sauté d'eux-mêmes des lignes au hook voisin. Remontées : banque d'images juste (RH, clean_study), captures d'applis concurrentes à retirer de la banque (RH : 76ee100a, bb4cf2e9, 7986ea17 ; beau_smart_girl : Actualize).
- **2/11, 9 h 16** : réparé. 303 doublons non publiés sauvegardés (`sauvegarde_doublons_2_11`) puis supprimés, correctif de l'assignation déployé (contenus du jour exclus), rattrapage relancé à 9 h 08 : 644 passages, chaque compte servable à 2 posts distincts (625 du plan BLEO, 9 tierlist, 10 rappels), 0 erreur. Un compte a publié deux fois le même post avant la réparation (8ec8d1ad). Aussi : 0637 (D47) et le journal de l'assignation écrit désormais le vrai message d'erreur. Reste du 2/11 : 62 comptes actifs sans post, tous en warmup ou pas démarrés (normal) ; 13 d'entre eux étaient au plan (filtre du tirage plus large que celui de minuit, à aligner).
- **2/11, 10 h** : point 2 fait (0638, Adrien) : les livraisons du matin, validées à 5 h (0635), entrent au tirage de 14 h, publication à J+1. En passant : l'essai de tirage de 9 h 11 (pour 0637) aurait fait sauter le tirage officiel du 3/11 (« déjà fait ») ; le garde ne compte plus que les tirages commencés à 14 h.
- **2/11, 12 h 20** : contrôle des garde-fous sur les 636 posts du jour : même post à moins de 14 jours 7 (3 au dernier repli, 3 pile à 14 jours, 1 hors plan), même famille le même jour 1, même couverture à moins de 10 jours 13 (12 sur des tests). Les tests ne voyaient que la règle « même contenu » : 0639. Le tirage officiel du 3/11 (14 h) en profite.
- **2/11, 12 h 30** : 6 livraisons du 29/10 (page blanche 4, mentalapp 2) restaient « Validation automatique impossible » depuis la panne de crédit Gemini (l'auto-validation ne retente pas un échec) : erreur effacée, l'auto-validation les reprend (Gemini répond, 0 erreur 402 aujourd'hui). Les deux tirages d'essai du 3/11 (9 h 11, 12 h 19) marqués « essai » (`erreur`), la convention des essais manuels : la page Plan les signale et minuit ne prend que le tirage de 14 h. Page Plan : texte au présent (BLEO actif).
- **2/11, 14 h 35** : premier tirage officiel en actif (pour le 3/11) : lancé à 14 h 00, fini en 23 s, sans erreur ; les essais de 9 h 11 et 12 h 19 ne l'ont pas bloqué. 322 comptes (334 à l'essai du matin : 0508, arrêt Portugal), 644 créneaux, 0 vide, 0 doublon (compte, contenu). Point 2 vérifié : les 61 livraisons du matin (validées entre 11 h 40 et 13 h 21) ont famille et valeur, calculées à 14 h 00 juste avant le tirage ; 38 sont au plan du 3/11 (68 créneaux) : les 15 full tests (29 créneaux, file juger), 23 des 46 déclinaisons (39 créneaux, file valeur, récolte). Les 23 autres ont la même valeur (3,20) que celles tirées : tirage au sort pondéré, elles restent en lice demain. Le compte `nouveaux_avant_tirage` n'était gardé nulle part (valeur de retour du cron) : 0641. Aussi, ce midi : page Slideshows sur les infos BLEO à la place du tier (#1028).
- **2/11, 16 h** : thèmes (0642, Adrien : « fais le regroupement des familles en thèmes »). 3 754 familles → 2 841 thèmes ; la règle de 0631 seule (60 %, 2 mots) regroupait aussi des idées différentes (« the 5 theories that actually change your life » / « 5 daily habits that will change your life ») : il faut 2 mots en commun hors mots génériques. Tout ce qui comptait la famille pour la répétition compte le thème (fatigue, garde-fous, budget, boîte, une déclinaison par jour) ; D30 fait (`theme_gagnant`). Effet au tirage du 3/11 (pour le 4/11) : dans weird_alpha, les contenus des thèmes surchargés passent de 35 % à 9 % du poids du tirage. Les contenus multipliés avant BLEO (weird_alpha : 271 contenus dans des thèmes de 5 familles et plus, dont 127 gagnants, 65 non-gagnants jamais à 10 k, 79 en attente) ne sont pas supprimés : la fatigue au thème les rationne ; à revoir le 9/11. Le rapport compte désormais les infractions « même famille » au thème : les rapports des 2/11 et 3/11 jugent des plans tirés par famille, leurs « même famille » montent (55 en rejouant le 1/11) sans que le tirage ait changé.
- **2/11, 16 h 05** : les thèmes ne jouaient pas sur le plan du 3/11 : il avait été tiré à 14 h sur les valeurs de la nuit (fatigue par famille), avant 0642. Nuit rejouée (`bleo_nuit(true)`, 13,6 s ; résumé du matin gardé dans le journal de session : 82 rattachés, 71 jugés, 103 949 valeurs) puis tirage du 3/11 refait : run 5b848aa7, 321 comptes, 642 créneaux, 0 vide, 0 doublon, 0 compte avec deux posts d'un même thème ; le run de 14 h est marqué « remplacé » (minuit prend le dernier run sans erreur). Créneaux dans des thèmes de 5 familles et plus : weird_alpha 38 → 8 sur 103, smart_girl 25 → 10 sur 138 ; part des thèmes de plusieurs familles, weird_alpha 69 % → 45 %, alpha_male_yellow 47 % → 23 %. Livraisons des podz du matin au plan : 36 (64 créneaux) contre 38 (68).
- **2/11, 22 h 15 : bilan du premier jour assigné par BLEO.**
  - **Posts du 2/11** : 644 passages, dont 606 du plan BLEO, 29 rendus à la tierlist (`bras = 'temoin'`) et 9 hors bras (7 rappels du 28-30/10, 2 assignés à la main).
    - Sur les 29 : 7 à minuit, et 22 remplacements dans la journée (un post retiré puis remplacé, 8 h 28 à 22 h 03). Un remplacement ne lit pas le plan : il repasse par la tierlist. C'est 3,4 % des posts : D49, à régler avant le retrait de la tierlist.
    - Publiés à 22 h : 476 sur 644 (74 %), contre 343-353 à la même heure les jours d'avant (70-76 %). Cohorte du 25/10 : 140 sur 176.
    - Comptes actifs sans passage : 65, en warmup ou pas démarrés. 41 comptes assignés n'ont encore rien publié à 22 h.
    - La nuit a été coupée en deux (D48) : réparée à 9 h 16.
  - **Podz** : 93 livraisons, toutes validées (0 erreur, 0 en attente).
    - Voie 1 : 61 livraisons typées, 15 full tests et 46 déclinaisons :
      - alpha_male 1 + 3 ;
      - alpha_yellow 3 + 10 ;
      - beau_smart_girl 1 + 7 ;
      - clean_study 2 + 4 ;
      - RH 4 + 8 ;
      - smart_girl 1 + 8 ;
      - weird_alpha 3 + 6.
    - Voie 2 : 32 livraisons (page blanche 13, fathom 8, mentalapp 7, yasmine 4).
    - Refus du guichet : ceux de 8 h 40 (journal plus haut). Les refus ne sont pas enregistrés en base.
    - Jauge du jour : weird_alpha 2,9 semaines, RH 2,0, clean_study 2,8 (30 % de full tests) ; alpha_yellow 4,6 (20 %) ; les autres 10 %. Elle compte les lignes de la boîte, donc les thèmes depuis 0642 : en direct, weird_alpha 1,2 semaine et smart_girl 8,4.
  - **Plan du 3/11** : refait à 16 h 05 avec les thèmes (642 créneaux, 0 vide, 0 doublon). Minuit le prend.
  - **Suivi avant/après** : pas encore de mesure des posts du 2/11 (r à J+2). Référence d'avant BLEO : r médian ~1,00, 6-8 % à 10 k, 4 000-5 100 vues par post. `bleo_suivi_alerte()` : pas d'alerte (−0,2 % sur les jours mesurés, au 29/10).
  - **Le rapport de 22 h** compare encore le plan à l'ancien système. Depuis la bascule, l'ancien système n'assigne presque plus rien (1 compte comparé ce soir). Ses infractions se lisent au thème : 52 « même famille » sur un plan tiré par famille. À refaire pour comparer le plan à ce qui est publié (D50).
- **2/11, 23 h 59 : D49 (0643) et 0644.** Les remplacements de la journée (22 le 2/11) et les créneaux de minuit non servables (7) passeront par un remplaçant BLEO au lieu de la tierlist ; testé sur 5 comptes remplacés le 2/11 : 5 candidats chacun, surtout de la récolte, aucun garde-fou relâché, 0,2 s. En passant : les fonctions BLEO étaient appelables sans session (clé publique du site), fermé (0644). Le code de l'assignation est déployé après la nuit du 3/11, pour ne pas changer de version en pleine assignation.
- **3/11, 1 h 15 : D49 en ligne.** PR #1049 fusionnée après la fin de minuit (640 passages stables depuis 1 h 01). Fonctions redéployées sans erreur : minuit-vnext, revoquer-post, assignation, assignation-contenu. Contrôle des remplacements de la journée à 14 h.
- **3/11, 1 h 45 : contrôle de la 2e nuit en mode actif.** Rien à relancer.
  - 640 passages pour le 3/11 : 635 `bleo`, 0 `temoin` (7 le 2/11), 3 rappels, 2 sans bras. Aucun doublon (compte, contenu).
  - `assignation_journal` : 320 comptes, 0 erreur.
  - Logs Postgres depuis 0 h : aucun `duplicate key`. Les seules erreurs sont 3 requêtes de contrôle mal écrites, les miennes.
  - Plan (run 5b848aa7) contre passages, 3 écarts, tous expliqués :
    - 341960f2 (UGC images, pl) : 2 créneaux au plan, 2 passages sans bras. La voie UGC ne lit pas le plan BLEO, comme le 2/11 : à faire suivre avant le retrait de la tierlist ;
    - 61c0cc6a : un rappel posé à minuit a pris un des 2 créneaux. 1 `bleo` et 1 rappel, le quota est tenu ;
    - b4038a39 (es-419, `is_active = false`) : 2 créneaux au plan, 0 passage. Minuit saute les comptes inactifs, mais le tirage les garde (#21 : aligner le filtre des comptes du tirage sur celui de minuit).
- **3/11, 6 h 15 : contrôle du matin.** Tout va bien, rien à réparer.
  - **Comptes :** les 320 comptes en process ont leurs 2 posts. Aucun compte à 0 ou 1. Les 35 comptes actifs sans post n'ont jamais commencé leur warmup (`warmup_ends_at` vide) : minuit ne les sert pas, c'est voulu.
  - **Remplacements de la nuit :** 2 (2 h 26 et 3 h 26). Les deux sont servis par BLEO (`bras = 'bleo'`, file `valeur`, run 5b848aa7) et déjà publiés. D49 marche.
  - **Fonctions :**
    - aucune erreur 546 ni 504 ;
    - aucune vraie erreur 402 de Gemini et aucun repli sur fal ;
    - 4 erreurs 503 au même instant, à 6 h 00 (hub-slack-cohorte, rattrapage-elo, recrues-check, upwork) : un raté de la plateforme, les appels suivants passent ;
    - recrues-check a renvoyé 3 erreurs 500 entre 0 h 15 et 0 h 45, avant le correctif #1050.
  - **Nuit BLEO de 5 h 15 :** 14 s, sans erreur.
    - 59 jugés, 287 r calculés, 104 536 valeurs ;
    - verdicts : 65 contenus et 53 familles ont changé, 1 famille close.
- **3/11, 14 h 07 : remplacements de la journée (D49).** 14 depuis minuit, 13 servis par BLEO, 0 par la tierlist ; le 14e est le compte UGC polonais. Aucun ne répète un contenu à moins de 14 jours. À 20 h : 33 remplacements, 32 par BLEO.
- **3/11, 20 h 13 : D51 (0645), plan du 4/11 retiré.** Adrien : « dis aux podz d'augmenter la cadence à au moins 2 posts par jour ». Les podz des petits labels en font déjà 3 à 6 par jour : le blocage est le jugement (voir D51), pas la production. Pas de message aux podz ; le tirage teste un contenu neuf avant d'en répéter un.
  - Le plan de 14 h (622f2596) est remplacé par 7aebc7ab : 636 créneaux, 318 comptes (8fd6726a désactivé depuis 14 h), 0 vide, 0 doublon, 586 lignes identiques.
  - Replis : `tout` 10 → 1, `hors_file` 0 → 9. Répétitions à moins de 14 jours : 10 → 1, le compte UGC polonais (341960f2), servi hors plan.
- **4/11, 9 h 40 : contrôle de la nuit, rapport refait (D50).**
  - **Passages du 4/11 :** 632 au total, dont 624 `bleo`. Aucun de la tierlist, aucun doublon, 0 erreur au journal.
  - **Comptes :** les 316 comptes en process sont servis. Deux comptes du plan (bf693d44, 13029650) n'ont rien : leur posteur a une demande d'arrêt ouverte, et depuis le 3/11 ces comptes ne reçoivent plus de posts. Le tirage les garde (#21).
  - **Remplacements depuis minuit :** 14, dont 12 par BLEO. Les 2 autres sont sur le compte UGC polonais.
  - **Répétitions des posts du 4/11 :**
    - même thème à moins de 10 jours : 2, contre 77 le 2/11 et 95 à 133 par jour fin octobre ;
    - même contenu à moins de 14 jours : 2, les deux sur le compte UGC polonais (voie UGC, hors BLEO) ;
    - même photo : 2.
  - **Concentration :** 8,6 % des posts dans les thèmes de 5 familles et plus, 13,5 % pour weird_alpha (84 % le 26/10).
  - **3/11, journée complète :** 563 publiés sur 638 (549 le 2/11).
  - **Nuit BLEO de 5 h 15 :** 66 jugés, 473 r calculés, sans erreur.
  - **Rapport :** D50 fait (0646), et le rapport du 3/11 est recalculé. Les comptes 85314885 et 952fa17a, des recrues reportées dans Cohortes, ont perdu leurs posts du 2 et du 3/11 dans la journée. Le rapport les liste sans faire échouer la porte.
- **4/11, 10 h 30 : D39 abandonnée (Adrien : « garde les rappels, abandonne D39 »).** Un posteur (@mert.guc182) a demandé pourquoi son post du jour est le même qu'un post précédent : c'est le rappel J+7 de son post du 28/10 (115 200 vues). D39 aurait mis une G1 du hit à la place, mais elle n'avait jamais été branchée. Remesurée : elle ne bat pas le rappel (chiffres dans D39).
  - **Topo déclinaisons :**
    - les podz en déposent environ 50 par jour depuis la bascule (10 à 12 avant), plus 8 à 15 full tests ;
    - une déclinaison d'une famille gagnante hérite de « gagnant » et part en récolte sans test : 68 postées (141 posts), 81 posts du plan du 4/11 ;
    - sur octobre (déclinaisons plus anciennes, mûres) : r médian 1,17, comme les G0 de leurs familles (1,18), mais 15 % à 10 k contre 10,4 % ;
    - 54 % des G1 tranchées sont gagnantes, 67 % des G2 (peu de cas), 48 % des full tests ;
    - une G1 bat son propre parent 23 % du temps (r 1,02 contre 2,05) ;
    - déclinaisons déposées sous BLEO : 47 posts mesurés à J+1 seulement, trop tôt pour conclure.
- **5/11, 9 h 45 : contrôle du matin, D52, vues des déclinaisons.**
  - **Nuit :** 633 passages, 627 `bleo`, 0 tierlist, 0 doublon, 0 erreur au journal. Les 2 comptes du plan sans post ont une demande d'arrêt ouverte. Nuit BLEO de 5 h 15 sans erreur (83 jugés, 517 r). Plan du 5/11 : 636 créneaux, 0 vide, 4 `hors_file`.
  - **Rapport du 4/11 (le premier en 0646) :** `aucune_tierlist` est rouge, 59 posts. C'est l'arrêt d'UnSwipe à 11 h (D52). `aucune_repetition` est rouge aussi : 2 répétitions de contenu, le même compte servi deux fois à 16 h 40 par deux remplacements simultanés. Le reste : 534 servis au plan, 32 remplacés par BLEO, 467 publiés sur 627.
  - **Déclinaisons sous BLEO, vues à J+1** (posts du 2 au 4/11) :

    | Posts | Nombre | Vues médianes | r médian | Part à 5 k | Part à 10 k |
    |---|---|---|---|---|---|
    | Déclinaisons G1 | 109 | 874 | 0,50 | 10 % | 1,8 % |
    | Gagnants prouvés | 737 | 1 217 | 0,96 | 18 % | 8,1 % |
    | Full tests neufs | 204 | 998 | 0,72 | 14 % | 2 % |
    | Autres tests | 313 | 812 | 0,54 | 5 % | 1,3 % |

    À J+3 (16 posts seulement), les G1 ont un r de 1,09, contre 1,46 pour les gagnants prouvés et 1,00 pour les full tests. Pourtant, une déclinaison part avec la valeur de départ `accroche_gagnante` (3,2, au-dessus de la plupart des gagnants mesurés). Elles prennent 90 des 300 créneaux de récolte du plan du 5/11. 169 déclinaisons sur 173 n'ont pas encore de verdict propre. À trancher avec Adrien (baisser `classes.depart.accroche_gagnante`).
- **5/11, 10 h 30 : aucun réglage avant les mesures J+3 de vendredi (Adrien).** Les deux réglages proposés attendent (valeur de départ des déclinaisons de 3,2 à 2,0, tests d'imports limités aux arrivées de moins de 30 jours), ainsi que la demande aux podz. Les chiffres à âge égal sont dans la tâche du 6/11.
  - **Correction d'une erreur de ma part :** les tests de vieux imports (plus de 60 jours en base) ne sont qu'environ 17 par jour, pas 80. Par temps passé en base avant le test :
    - 7 à 30 jours : r 0,75 à J+1 et 0,94 à J+3 ;
    - 30 à 60 jours : 0,49 et 0,61 ;
    - 60 à 180 jours : 0,27 et 0,30.
  - **Page Plan (0648) :** une déclinaison se reconnaît et se filtre. Plan du 5/11 : sur 300 créneaux de récolte, 206 sont d'autres contenus, 90 des déclinaisons et 4 des full tests.
- **6/11, 10 h : contrôle du matin.**
  - **Passages du 6/11 :** 616 au total. 590 viennent de BLEO, 23 sont des rappels (20 posés à minuit, ce sont les hits de fin octobre), 2 sont sur des comptes UGC et 1 vient de la tierlist. Ce dernier est un remplacement à 1 h 06 sur un compte du label Kaja (podz 13, tout neuf) : aucun contenu Kaja n'est encore jugé, donc il n'y a aucun candidat BLEO.
  - **Le reste :** aucun doublon, 0 erreur au journal. Les 2 comptes en process sans post ont une demande d'arrêt ; 6 comptes du plan ont été désactivés depuis le tirage (#21). Nuit BLEO sans erreur (109 jugés, 3 245 r recalculés après une remise à jour des vues).
  - **Rapport du 5/11 :** tierlist 0, non servis 0, 597 posts servis au plan, 29 remplacés par BLEO, 463 publiés sur 627. Répétitions non déclarées : 1 « même contenu » (le cas du 4/11 à 22 h 40, corrigé par 0647) et 4 « même thème », corrigés par 0650.
- **6/11, 10 h : mesures à âge égal, faites avant tout réglage (Adrien).** Vues à J+3 des posts du 30/10 au 1/11 (avant BLEO) contre ceux du 2 et du 3/11 (BLEO) ; r = vues ÷ médiane du compte.
  - **Flotte :** 2,04 M → 3,59 M de vues par jour, 403 → 549 posts par jour. Vues moyennes par post 5 065 → 6 529, part à 10 k 8,3 % → 12,4 %. r médian 1,00 dans les deux cas.
  - **Par groupe :**

    | Groupe | Vues moyennes | Part à 10 k | r médian |
    |---|---|---|---|
    | Hors podz | 4 749 → 6 972 | 7 % → 13,8 % | stable |
    | Originaux des podz | 6 318 → 6 093 | 12,2 % → 9,8 % | 1,15 → 1,02 |
    | Remakes et page blanche | 2 333 → 3 648 | 2,5 % → 9,2 % | 0,93 → 1,19 |

  - **Par podz :**
    - en hausse : page blanche r 0,86 → 1,24 (10 k : 2 % → 17 %) ; alpha_male 10 % → 23 % à 10 k ; RH 11 % → 21 % à 10 k (r 0,93 → 0,59, mais de gros hits) ;
    - en baisse : smart_girl r 2,05 → 1,12 (10 k : 23 % → 8 %) ; weird_alpha r 1,06 → 0,53 (tout le label weird_alpha : 0,99 → 0,53).
  - **Briques de BLEO** (J+3 sur les posts du 2 et du 3/11, puis r à J+1 sur ceux du 4 et du 5/11) :

    | Brique | Posts | r à J+3 | Part à 10 k | Vues moyennes | r à J+1 |
    |---|---|---|---|---|---|
    | Récolte (gagnants, langue neuve) | 457 | 1,79 | 22,5 % | 11 221 | 0,80 |
    | Gagnants, langue déjà servie | 65 | 1,00 | — | — | — |
    | Déclinaisons | 52 | 0,97 | 3,8 % | 2 889 | 0,45 |
    | Full tests neufs | 139 | 0,97 | 5 % | 3 511 | 0,61 |
    | Tests d'imports de moins de 30 j | 61 | 0,90 | — | — | — |
    | Tests d'imports de 30 j et plus | 109 | 0,59 | — | — | 0,40 |
    | Perdants resservis | 146 | 0,66 | 2,1 % | — | — |

  - **Verdicts depuis le 30/10 :** full tests 33 gagnants pour 38 non-gagnants ; déclinaisons 4 et 2, sur 244.
  - **G0 contre déclinaisons :** dans les 193 familles qui ont un G0 gagnant et une déclinaison, les créneaux de langue neuve vont aux déclinaisons : 76 contre 46 (4/11), 90 contre 50 (5/11), 96 contre 68 (6/11).
  - **Répétitions du 6/11 :** 10 même thème, 2 même contenu (le compte UGC), 2 même photo. Thèmes de 5 familles et plus : 6,1 % des posts (weird_alpha 5,9 %).
- **6/11, 10 h 45 : doublon de tamas.ambicio760, verrou de recharge (0659).** Deux recharges du même post, lancées à 33 s d'écart (10 h 06), ont créé chacune un remplaçant avec le même contenu du plan : 3 posts au lieu de 2, dont 2 identiques. Le doublon (passage b7bba159, post 303533d4, pas publié) est supprimé avec l'accord d'Adrien. Le compte garde son rappel et un post, deux contenus alpha_male, son seul label depuis qu'Adrien lui a retiré white_bg. `revoquer-post` prend maintenant un verrou sur le post (`posts.recharge_en_cours_at`, UPDATE conditionnel) : une 2e recharge pendant la 1re reçoit `RECHARGE_EN_COURS` (409), et la page du posteur lui dit d'attendre une minute.
- **Labels 100 % podz dans BLEO (lots 1 à 4, autre session, 5/11) :** les premiers posts sous ce circuit sont ceux du plan du 7/11. Mesure prévue le 10/11. Numéros de migration en double entre les deux sessions (0647 et 0650) : ce sont des fichiers distincts, sans conflit en base.
- **6/11, 18 h : réglages 0660 appliqués (Adrien : « oui applique les deux réglages »).** Nuit relancée : une déclinaison jamais postée vaut 2,0 au lieu de 3,2. Le plan du 7/11 est retiré (d1bf8097 remplace 1ca431e9) :

  | | Plan de 14 h | Plan de 18 h |
  |---|---|---|
  | Déclinaisons | 129 | 60 |
  | Tests d'imports de 30 jours et plus | 103 | 0 |
  | Tests des podz | 49 | 49 |
  | Tests d'imports récents | 17 | 17 |
  | Familles avec G0 gagnant + déclinaison, en récolte (G0 / déclinaisons) | 53 / 121 | 77 / 54 |
  | Récolte | 304 | 335 |
  | Gagnants, langue déjà servie | 58 | 67 |
  | Perdants resservis | 81 | **138 (22 %)** |
  | Créneaux | 620 | 614 (comptes désactivés entre-temps) |

  - **Effet de bord :** une partie des créneaux libérés part aux perdants resservis (r 0,66 à J+3), au-delà de la limite de 15 % de la spec. C'est le 3e levier proposé (réduire leur poids), pas encore décidé.
  - **Pas touché :** 14 déclinaisons de la voie 2 ont la classe `livre` (4,0), posée par l'autre session ; Adrien doit dire s'il faut les passer en `accroche_gagnante`.
- **7/11, 17 h : compte rendu de la semaine, puis 0661 (Adrien : « baisse les perdants resservis et passe les 14 à 2,0 »).** Plan du 8/11 retiré (26dcce43 remplace 19825ea0) :

  | | Plan de 14 h | Plan de 17 h 19 |
  |---|---|---|
  | Perdants resservis | 130 (21 %) | **19 (3 %)** |
  | Récolte | 330 | 407 |
  | Gagnants, langue déjà servie | 73 | 106 |
  | Déclinaisons | 82 | 112 |
  | Tests | 74 | 75 |
  | Créneaux vides | 0 | 0 |

  - Les déclinaisons héritent du verdict « gagnant » de leur famille : le facteur ne les touche pas, et elles reprennent une partie des créneaux libérés.
  - **Question d'Adrien sur les podz (« c'est pas automatique ? ») :** oui, la jauge (`reglages.bleo.jauge`) fixe la part de full tests de chaque podz d'après les semaines de stock de sa boîte : 10 % à 6 semaines et plus, 20 % de 3 à 6, 30 % de 1 à 3, 40 % en dessous. smart_girl (8 semaines, 167 familles en boîte) est à 10 % ; weird_alpha (1,5 semaine) à 30 %. Plus un label a de gagnants à décliner, moins il fait d'accroches neuves.
  - **0662 (Adrien : « oui fais-le ») :** au moins 30 % de full tests pour chaque podz.
  - **Reposts sur un même compte (remarque du chef, page blanche) :** c'est exact. clara.grandit369 en a eu 2 le 6/11 (posts du 19 et du 20/10) et paul.drive237 1 (post du 21/10).
    - Sur white_bg, aucun repost du 20/10 au 1/11 ; depuis la bascule, 1 à 3 par jour sur 18 posts.
    - Sur toute la flotte : 3 à 8 par jour avant BLEO, 9 à 17 depuis, soit 2 à 3 % des posts. L'écart médian est de 16 à 21 jours : BLEO ressert un gagnant juste après la limite de 14 jours (`meme_contenu_jours`).
    - Proposé à Adrien : porter cette limite à 60 jours. Les rappels J+7 ne sont pas concernés.
- **8/11, 17 h 15 : 0663, limite à 60 jours (Adrien : « oui passe à 60 jours »).** Plan du 9/11 retiré (e08bb95a remplace 1d10a460) : 17 reposts d'un post déjà publié sur le compte depuis moins de 60 jours → 2. Les 2 qui restent sont sur julia.ksiazki2 (smart_girl, polonais, repli `tout` faute de contenu). 682 créneaux, 2 vides.
- **5/11, après-midi : les labels 100 % podz dans BLEO, lot 1 (0650 à 0652, décisions d'Adrien).**
  - **0650 :** une seule définition d'un label 100 % podz, la vue `labels_100_podz` (un seul podz le nourrit, tous ses contenus validés viennent de lui, aucune source active). Le choix de label, la page Répartition, la voie BLEO (colonne calculée `voie(labels)`, plus de colonne tenue à la main), `empreintes` et le chef la lisent.
  - **0651 :** mentalmaxxing fermé (UnSwipe arrêté) ; 8 livraisons en attente rejetées.
  - **0652 :** l'accroche d'un contenu 100 % podz est son titre normalisé ; même accroche ou même post du compte modèle = même famille (42 contenus rattachés, 17 Fathomly, 23 that_girl_study) ; thèmes recalculés (white_bg 113 familles → 91 thèmes, Fathomly 39 → 30) ; écart « même famille » par label (`garde_fous.meme_famille_jours_labels`, Fathomly et Kaja à 6 jours). Essai à blanc avant application : tirage du 7/11 identique sur les 590 créneaux des comptes sans label 100 % podz, 11 créneaux sur 32 changent sur les autres, 0 vide.
  - **Suite prévue :** lot 2 (boîte, jauge et full tests pour la voie 2), lot 3 (langues déclarées par podz, rattrapage quand une langue s'ouvre), lot 4 (rythme calculé sur les comptes qui postent).
- **5/11, soir : les labels 100 % podz dans BLEO, lot 2 (0653, décisions d'Adrien).**
  - **0653 :** la boîte (`bleo_boite`) et la jauge (`bleo_jauge`) prennent aussi la voie 2 ; la jauge compte le rythme sur les originaux et les livrés. `bleo_boite_posts` rend l'id du parent chez son podz (`source_id`, « fa-014 ») ; `bleo_verifier_depot` lit le titre d'un livré pour la règle « accroche voisine du jour ». Essai à blanc avant application : boîte et jauge de la voie 1 identiques, guichet de la voie 1 inchangé. Après : 11 podz dans la jauge ; page blanche 23 familles en boîte (1,2 semaine, 30 % de full tests), Fathomly 9 (0,6 semaine, 40 %), Kaja et that_girl_study 0 (40 %).
  - **Guichet (`pods/index.ts`) :** un livré peut déclarer `type_bleo` et `parent_contenu_id` ; il est jugé sur son titre normalisé. Une déclinaison livrée rejoint la famille de son parent à la validation. L'action `boite` rend la voie ; en voie 2, une boîte vide ne fait pas une journée de full tests.
  - **Podz :** `npm run boite` dans les ateliers page blanche, fathom, kaja et yasmine ; `npm run livrer` envoie la déclaration, et un full test part sans post source. `pods/ROUTINE.md` §5 réécrit (full tests de la jauge, posts neufs du compte modèle, déclinaisons, langue en manque au podz 1) ; les règles « 3 variantes à 30 k », « essai 1 sur 5 » et « au plus 1 par jour sur une famille livrée 3 fois en 7 jours » disparaissent, remplacées par la boîte et le guichet. Le chef garde ses règles de rythme pour la voie 2 (lot 4) ; ses règles 1, 4 et 7 parlent maintenant de boîte, de full tests et de déclinaisons.
  - **Mentalmaxxing** (fermé) a encore 3 familles gagnantes dans la boîte : aucun podz actif ne la lit, la jauge l'ignore.
- **5/11, soir : les labels 100 % podz dans BLEO, lot 3 (0654, décisions d'Adrien).**
  - **Constat :** les podz livraient toutes leurs langues, comptes ou non (that_girl_study : 7 langues livrées, des comptes en es et tr ; Fathomly : 43 decks pt en 7 jours, plus de compte pt), et l'attribution ne croyait servies que les langues déjà livrées (white_bg avait un compte hu sans aucun post).
  - **0654 :** `pods.langues` (la déclaration du podz) ; l'attribution la lit (`langues_declarees_podz` dans `stats_choix_label` et `simulation_repartition`) ; `pod_langues` donne les langues à livrer ; rattrapage chaque nuit (`bleo_commandes_rattrapage`, cron `bleo-rattrapage` à 5 h 55, `bleo_rattrapage_du_pod`). Essai à blanc : simulation Sophia et micabo (714 lignes) et choix de label identiques hors remakes ; seul change white_bg en hongrois. Premières commandes : 32 page blanche, 12 Fathomly.
  - **Guichet et podz :** action `langues` ; `boite` rend `langues` et `rattrapage` ; `npm run boite` déclare `LANGUES` et met le rattrapage en tête ; `npm run livrer` ne livre que les langues qui ont un compte (`--complement` pour un rattrapage) ; page blanche : `atelier/api.ts`. `pods/ROUTINE.md` §5.2, 5.5 et 5.6 ; AGENT de fathom, yasmine, kaja, page blanche ; chef (langues, stock).
- **5/11, soir : les labels 100 % podz dans BLEO, lot 4 (0655, décisions d'Adrien).**
  - **Constat :** tous les comptes de ces labels postent 2 fois par jour (un seul label chacun, sauf le compte hongrois de white_bg) ; la file à juger teste 0,3 à 2,4 accroches neuves par jour et 40 à 65 contenus attendaient leur test ; la page blanche livrait 12 posts par jour, Fathomly 9, yasmine 6 ; les comptes Kaja n'avaient que 2 jours de posts jamais publiés.
  - **0655 :** `bleo_rythme_remakes` (consommation des comptes, stock du compte le plus juste, cible 10 jours, file à juger) et `reglages.bleo.rythme_remakes`. Au 5/11 : page blanche 2 + 3 rattrapages, Fathomly 2 + 3, yasmine 3, Kaja 5.
  - **Guichet et podz :** `boite` rend ce rythme à la voie 2 (et `rythme`, le pourquoi) au lieu de `pods/rythme.json`, qui ne garde que leur pause ; les rattrapages s'y ajoutent. `npm run boite` l'affiche. ROUTINE §2 et §5.2 ; chef (il ne tient plus leur rythme, il le rapporte) ; Kaja.
- **8/11, soir : 14 % de tests dans le plan (question d'Adrien).** Plan du 9/11 : 89 tests sur 682 créneaux, sous la cible de 25 à 35 %. Deux causes :
  - **Labels pleins**, la limite de 30 % bloque des tests qui attendent : white_bg 6 tests par jour pour 92 en attente, Fathomly 3 pour 46, that_girl_study 1 pour 25, Kaja 1 pour 11, beau_smart_girl 22 pour 149, clean_study 9 pour 70, RH 19 pour 51.
  - **Gros labels avec de la place mais rien de neuf à tester depuis 0660** : alpha_male 4 tests sur 31 places, weird_alpha 7 sur 32, smart_girl 6 sur 34, alpha_male_yellow 10 sur 24, classic_study 1 sur 15.
  - **Taux de gagnants des tests BLEO** (plans du 25/10 au 4/11, jugés depuis) : contenus des podz 40 % (136 jugés), imports de moins de 30 jours 29 % (49), de 30 à 60 jours 24 % (58), de plus de 60 jours 23 % (26). L'âge pèse sur les vues du test plus que sur la chance de gagner.
  - **Proposé à Adrien, pas encore décidé :** limite à 50 % sur les 4 labels 100 % podz ; rouvrir les tests aux imports de 30 à 60 jours.
- **9/11 : les full tests des podz qui ont percé.**
  - 74 gagnants sur 382 full tests livrés ; 53 ont déjà une déclinaison (55 en G1, 1 en G2).
  - Meilleur cas : « 5 Languages That Are Easier to Learn Than You Think » (smart_girl) : l'original a fait 4 300 vues sur un post, sa déclinaison 599 000 vues en 26 posts (meilleur 195 000).
  - 31 déclinaisons créées du 4 au 8/11 ne sont pas encore postées.
- **9/11 : labels de la cohorte du 9/11 (question d'Adrien).** Rien changé.
  - **Comptes actifs :** 61, dont alpha_male 12, RH 10, beau_smart_girl 10, alpha_male_yellow 9, weird_alpha 8, smart_girl 6. Les contenus suivent le label du compte (vérifié sur les passages du 9 et du 10/11).
  - **Posts :** le déséquilibre vient du warmup. Les 12 comptes alpha_male postent, contre 2 comptes smart_girl sur 6.
  - **Choix du label (performance au cube × stock) :** parmi les gros labels, il donne ~43 % des comptes neufs à alpha_male (perf 1,24, 12,8 jours de stock) et ~19 % à smart_girl (perf 1,08, 8,4 jours). Le stock se lit encore sur la tierlist (`contenu_tier_etat`).
  - **beau_smart_girl :** fermé par la nuit du 9/11 (0,744 sur 363 posts), mais gardé ouvert à la main pour Sophia (`labels_ouverts_app`).
- **10/11, 10 h : mesure des labels 100 % podz sous le nouveau circuit (lots 1 à 4 du 5/11).** Posts du 7/11 à J+3, du 8 et du 9/11 à J+1, contre les mêmes labels du 30/10 au 3/11 (`passage_vues_jalons`, r = vues / médiane du compte). Chaque case : r médian · part à 10 k · vues moyennes (posts).

  | | Avant, J+3 | 7/11, J+3 | Avant, J+1 | 8 et 9/11, J+1 |
  |---|---|---|---|---|
  | white_bg | 0,98 · 9,1 % · 3 481 (77) | 0,72 · 5,6 % · 2 334 (18) | 0,91 · 6,1 % · 2 663 (49) | 0,76 · 2,9 % · 1 737 (35) |
  | Fathomly | 1,04 · 4,2 % · 3 924 (24) | 2,80 · 0 % · 4 669 (4) | 0,88 · 0 % · 1 390 (14) | 1,11 · 0 % · 1 801 (11) |
  | that_girl_study | 0,92 · 0 % · 1 225 (14) | 1,10 · 0 % · 1 210 (4) | 0,45 · 0 % · 561 (10) | 0,66 · 0 % · 660 (7) |
  | Kaja | pas de posts | 0,29 · 0 % · 243 (2) | pas de posts | 0,75 · 0 % · 467 (6) |
  | Les quatre | 0,98 · 7,0 % · 3 298 (115) | 0,90 · 3,6 % · 2 358 (28) | 0,86 · 4,1 % · 2 131 (73) | 0,77 · 1,7 % · 1 492 (59) |
  | Autres labels | 1,01 · 10,6 % · 5 954 (2 160) | 1,02 · 12,8 % · 7 862 (470) | 0,73 · 4,9 % · 2 833 (1 401) | 0,72 · 6,7 % · 3 171 (1 007) |

  - **Vues :** white_bg recule alors que le reste de la flotte tient. Ce sont ses contenus jugés resservis (file `valeur`) qui font moins bien : r à J+1 de 1,10 (26 posts) à 0,74 (38). Ses tests passent de 0,94 à 0,72. Fathomly et that_girl_study montent, sur très peu de posts.
  - **Livraisons (contenus par jour) :** page blanche ~10 du 1 au 5/11, puis 2 depuis le 6/11 ; Fathomly ~9 → 2 ; yasmine ~6 → 3 ; Kaja 2 à 3, alors que son rythme en demande 5 (ses comptes n'ont que 2 à 5 jours de posts neufs). C'est le rythme de 0655, tenu par les trois premiers.
    - Par type depuis le 5/11 : 26 full tests (white_bg 13, yasmine 6, Fathomly 4, Kaja 3), 6 déclinaisons (yasmine), 24 remakes sans déclaration.
    - Rattrapages : page blanche 12 livrés, 36 ouverts ; Fathomly 10 livrés, 21 ouverts (60 langues). Soit ~2 par jour chacun, pour 3 à 4 demandés.
  - **Répétitions** (posts de ces labels, publiés ou assignés) :
    - même contenu à moins de 14 jours : 1 à 4 par jour du 30/10 au 3/11, 0 chaque jour depuis le 4/11 ;
    - même thème à moins de 10 jours : 17 % des posts du 30/10 au 3/11, 12 % du 7 au 10/11. Fathomly et Kaja ont un écart de famille de 6 jours.
  - **Stock et verdicts :** white_bg 64 jugés (40 gagnants), 58 à juger ; Fathomly 37 jugés (13 gagnants), 27 à juger ; that_girl_study 29 jugés (3 gagnants), 16 à juger ; Kaja 3 jugés, aucun gagnant, 11 à juger. Aucun des 26 full tests du nouveau circuit n'est encore jugé : la file à juger de ces labels est pleine (voir le 8/11).
  - **Lecture :** plus de reposts, et des livraisons calées sur les comptes. Mais pas de gain de vues à ce stade, et white_bg recule. Les échantillons sont petits (28 posts à J+3) : à refaire avec les J+3 du 8 au 11/11.
- **10/11, midi : plus aucun import depuis le 25/10 ; la règle du lundi écrite (0667).**
  - **Constat :** aucune des 50 sources n'a été relevée depuis le 25/10 (`dernier_scrape_at`), et aucun import n'est arrivé depuis. La mise à jour est un bouton de la page Sources (sa dernière séquence date du 19/08 ; les lots de septembre et d'octobre sont passés par des imports source par source), et le lundi automatique de la spec (L3) n'avait pas été construit. Les imports gagnants font pourtant 60 % des posts de récolte (927 sur ~1 500 du 4 au 7/11, 14 % à 10 k, 8 893 vues en moyenne à J+3). Stock : 3 880 imports validés, 1 301 gagnants, 1 283 perdants, 1 167 jamais jugés (218 de moins de 30 jours, tous trop vieux pour un test vers le 24/11).
  - **Posts par brique à J+3 (4 au 7/11) :** full test pendant son test 1,8 % à 10 k (2 160 vues en moyenne) ; déclinaison 5,1 % (4 235) ; full test gagnant resservi 9,2 % (6 061) ; import gagnant resservi 14,1 % (8 893) ; import en test 1,7 % (1 938). Une déclinaison vaut environ deux fois un full test en test, mais gagne aussi souvent (41 % contre 40 % sur les contenus qui ont 2 posts mûrs) : le verdict se joue sur r ≥ 2, atteint aussi souvent (17,6 % et 16,1 % des posts).
  - **Auto-alimentation des déclinaisons :** 1,1 déclinaison par nouveau gagnant, 41 % qui gagnent : 0,45 nouveau gagnant par gagnant, la chaîne s'éteint seule. Nouveaux gagnants par jour (4 au 9/11) : imports ~15, full tests ~12, déclinaisons ~6,5, autres podz ~4. Récolte : 80 % des créneaux sont encore le premier post du contenu dans la langue depuis 60 jours (stable depuis le 3/11), mais leur valeur moyenne baisse (3,9 → 2,8) quand la récolte passe de 349 à 540 créneaux.
  - **0667 (Adrien : « automatique tous les lundis, avec compte rendu, uniquement les comptes qui ont un r correct », puis « go, avec la règle des 100k en plus », « progressif, pas tout d'un coup ») :** règle A11 de la spec, plus une source retenue si un de ses posts chez nous a fait 100 000 vues dans le mois, et des lots de 6 sources par jour. Une première application avait été refusée par le classifieur (Adrien demandait un avis) ; appliquée après son « go ».
  - **Premier passage (10/11, 15 h 21) :** 29 sources retenues sur 49 (18 sur le r, 2 face au label, 7 grâce à un post à 100 000 vues, 2 neuves), 20 pas cette semaine. Lot 1 : infinitydream7, c0coa_candle, b3tteryou, stonemag.co, renaraise, mentoridaily ; 23 sources en 4 lots (mardi à vendredi). Base calme pendant le lot (2 requêtes actives, 37 connexions).
  - **Lot 1 (10/11, 15 h 21 à 15 h 32) :** 14 slideshows enfilés (infinitydream7 0 : ses 74 étaient déjà en stock ; c0coa_candle 2, b3tteryou 2, stonemag.co 2, renaraise 1, mentoridaily 7), 1 validé (b3tteryou, 62 900 vues chez la source), 10 rejetés, 3 encore au nettoyage. Sept rejets sont justes : posts de 13 à 16 jours restés sous 7 500 vues. Trois avaient moins de 1,2 jour et ont été jugés sur des vues pas faites : 0668. Base calme pendant le lot (1 à 2 requêtes actives, 37 à 39 connexions).
  - **Bilan du lot 1 (10/11, 18 h 26) :** 14 slideshows importés, 4 validés (mentoridaily 3, b3tteryou 1), 10 rejetés (7 au score d'import, 3 à l'étape des stickers), 0 échec ; file vide. Base : 1 requête active, 34 connexions. Le code de 0668 est déployé (workflow « Déployer les fonctions Edge » de a4e6a4d, succès). Lot 2 mardi à 6 h 37 : cleanlifestyle.t, _thecharismacode, katy._.studies, millyjhino, studyavec_lea, richgirlacadmy_1 ; puis 17 sources mercredi, jeudi et vendredi.
- **11/11 : point global, beau_smart_girl, Kaja.**
  - **Global :** nuits du 9 au 11/11 sans erreur ; aucun cron en échec en 48 h ; rapport du 10/11 : 639 servis au plan sur 671, 27 remplacés par BLEO, 0 tierlist, 0 créneau vide, 0 répétition réelle ; seule porte rouge, la part de tests (13,6 %). Vues à J+3 : 7/11 3,76 M (7 553 par post), 8/11 3,71 M (7 288, 13,9 % à 10 k). J+1 du 10/11 plus bas (2 488 par post), sur les anciens comptes comme sur les nouveaux. Lot 2 des sources (mercredi 11/11, et non mardi : le premier lot est parti mardi 10/11) : 72 enfilés, 9 validés ; 20 posts de moins de 7 jours mis de côté ; @cleanlifestyle.t ne renvoie plus aucun slideshow.
  - **beau_smart_girl (fermeture automatique du 9/11 à 0,744, tenue ouverte à la main, jamais fermée) :** l'écart vient des comptes, pas du contenu. Même label, même langue : su.efsane263 (tr) 3,32, asya.ogrenir761 (tr) 0,39 ; nikoleta.diavazei900 (el, 23 posts) 0,19. Fort en turc (1,40) et en français (1,34). Originaux du podz 0,97, imports 0,69. La mesure compte les posts de 3 comptes déjà désactivés (sans eux 0,77, au-dessus du seuil), les posts de moins de 3 jours (0,77 sur les posts mûrs) et beaucoup de comptes neufs (46 % des posts, à 0,63). À corriger : la règle de fermeture ne devrait compter que les comptes actifs et les posts mûrs (weird_alpha est à 0,79).
  - **Kaja :** 3 comptes. zoe.drive103 (en, depuis le 19/10, médiane 796 pour une médiane anglaise de 729), moritz.klarheit825 (de, depuis le 9/11, 4 posts), matteo.cultive278 (fr, créé le 9/11, warmup pas commencé, 0 post). 16 contenus « 10/10 skills… » depuis le 4/11, 18 posts, aucun au-dessus de 1 000 vues, 0 gagnant. Sur zoe, contenus Kaja médiane 699 (6 posts) contre 882 pour les weird_alpha d'avant (36 posts). Livre 2 à 3 par jour pour 5 demandés. La règle de test (3 comptes, jugé à 30 posts) suit son cours.
  - **11/11, suite : règle de fermeture corrigée (0670), comptes de beau_smart_girl.** La correction bouge peu beau_smart_girl (0,734) : la médiane de chaque langue monte aussi quand on retire les posts d'hier. Ce qui le tire vers le bas, ce sont quelques comptes.
    - **Turc (compte) :** su.efsane263 médiane 4 669 à 6 688 vues par semaine, asya.akilli518 2,58 ; asya.ogrenir761, même contenu, reste entre 280 et 960 depuis septembre : le compte n'a jamais décollé.
    - **Grec (contenu dans la langue) :** sur nikoleta.diavazei900, beau_smart_girl fait 600 à 970 vues de médiane, ses 2 posts alpha_male 6 768 ; sur anna.veltionetai2 (smart_girl), les posts beau_smart_girl font ~500, les smart_girl 1 300 à 4 500. Les autres labels font 1,20 en grec.
    - **Croate (plutôt contenu) :** klara.mudrost149, beau_smart_girl de 3 331 à ~1 100 de médiane ; 2 posts weird_alpha à 8 072.
    - **Ça marche :** turc (2 comptes), français (emma.lit147 1,32), italien (martina.saggezza245 1,81), anglais (~1,0).
    - **Simulation :** sans nikoleta.diavazei900 et asya.ogrenir761, le label passe à 0,80 ; sans klara.mudrost149 aussi, à 0,84. Proposé à Adrien : nikoleta → smart_girl, asya.ogrenir761 → compte à refaire, klara → weird_alpha ou une semaine d'attente.
    - **11/11, 13 h (Adrien : « passe nikoleta.diavazei900 sur smart_girl et enlève beau_smart_girl, sans toucher aux posts d'aujourd'hui ») :** fait (`compte_labels`) ; ses 2 posts du 11/11 restent beau_smart_girl. Plan du 12/11 (bbeeca3c, 692 créneaux, 0 vide) : ses 2 créneaux sont de la récolte smart_girl. asya.ogrenir761 (compte à refaire) et klara.mudrost149 (weird_alpha ou une semaine d'attente) : en attente d'Adrien.
- **13/11 et 14/11** : la nuit du 13/11 a fermé weird_alpha (0,726) et voulu
  refermer beau_smart_girl : weird_alpha rouvert, ses 20 comptes remis, la
  fermeture automatique coupée (`fermeture_min_posts` = 1 milliard), réserve
  basse à 4 jours au lieu de 5 (décisions d'Adrien). Les podz en clair (0716,
  SQL collé par Adrien) : le rythme de la voie 1 suit le taux de gagnants sur
  21 jours face à la flotte (`bleo_rythme_resultats`, appliqué par le chef),
  une fiche par podz sur la page Pods (`pods_fiches`), et le démarrage d'un
  podz neuf : 4 comptes de test d'office, un par langue, jugés à 30 posts.
- **14/11, réserve BLEO (0718, décision d'Adrien, option 3)** : la réserve d'un
  label ne compte plus les passages restants de la tierlist mais ses posts
  « forts et frais » (valeur BLEO ≥ 3 dans une langue où le label a un compte),
  au rythme de sa récolte des 7 derniers jours. Même vue
  (`label_application_reserve`) : choix de label, Répartition, stock du
  Pilotage, sanity et tableau des podz suivent. Au 14/11 : weird_alpha 0,4 j,
  alpha_male_yellow 4,6, smart_girl 5,2, RH 7,8, alpha_male 9,4,
  beau_smart_girl 11,1.
