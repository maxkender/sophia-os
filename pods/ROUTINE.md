# La routine du matin des podz

Chaque matin, une tâche planifiée réveille la session de chaque podz. Le podz
fait sa livraison du jour **seul**, du début à la fin, puis s'arrête.
Personne n'est là pour répondre : ne pose pas de question, décide avec ton
`AGENT.md`, et note tes doutes dans le compte rendu.

Ce fichier vaut pour tous les podz. Ton `AGENT.md` dit **quoi** livrer et
**comment** ; ce fichier dit **quand** et **combien**. Il a deux parties :

- **Voie 1**, les podz d'originaux (2, 4, 5, 7, 8, 9 et 12) : ils déclinent
  les familles gagnantes de leur boîte BLEO et ajoutent des full tests (§4).
- **Voie 2**, les podz de remakes (1, 10, 11 et 13 ; le 6 est arrêté) : ils
  refont les posts neufs de leur compte modèle, déclinent les familles
  gagnantes de leur boîte BLEO et ajoutent des full tests (§5, depuis le 5/11).

> **Les podz de la voie 1 sont sur BLEO depuis le dimanche 1/11 au soir**
> (ta routine du lundi 2/11 est la première). Lance d'abord `npm run boite` :
> il affiche « podz sur BLEO : oui ». Chaque original déclare `type_bleo` ;
> un refus du guichet se règle avec le tableau du §4.6 et son code va dans le
> compte rendu. Ta consigne de routine parle peut-être encore de « preuve » :
> ce fichier prime, il n'y en a plus. Si `npm run boite` affichait « pas
> encore » (retour arrière), suis `pods/ROUTINE-avant-bleo.md`.

## 1. Repartir propre

1. `git fetch origin main`, puis repars de `origin/main` sur ta branche de
   podz. Merge si besoin ; ne réécris jamais l'historique distant.
2. Relis ton `AGENT.md` et ce fichier : ils ont pu changer.
3. Dans ton dossier, `npm install` si `node_modules` manque. Si `donnees/` est
   vide (nouvelle machine), relance les commandes qui le remplissent
   (`npm run label`, `npm run images`…).

## 2. Combien livrer aujourd'hui

`pods/rythme.json` donne, pour ton dossier :
- `par_jour` : le nombre de livraisons du jour (1 par défaut, sans plafond) ;
- `pause` : `true` si Adrien ou Max ont mis ton podz en pause. Ne livre rien,
  fais seulement l'étape 3 et ton compte rendu.

Le chef des podz tient ce fichier à jour (`pods/chef/AGENT.md`).

**Voie 2 (podz de remakes, depuis le 5/11)** : ton `par_jour` ne vient plus
de `pods/rythme.json` (il n'y garde que ta pause). L'OS le calcule chaque jour
sur les comptes de ton label : ce qu'ils postent par jour, et combien de
jours de posts jamais publiés il reste au compte le plus juste. `npm run
boite` le donne (ligne « Rythme du jour », avec le pourquoi). Les rattrapages
du jour s'y ajoutent.

## 3. Mesurer

- Tous : `npm run etat`, puis `npm run suivi` si ton podz l'a et qu'un passage
  a 3 jours.
- Voie 1 : `npm run playbook -- --mesurer` si ton podz a un playbook. Le
  playbook reste la mémoire du label (ce qui marche, ce qui flop), mais il ne
  sert plus de preuve : **plus de veille le lundi** en voie 1.
- Voie 2, **le lundi**, avant de livrer : la veille de ton `AGENT.md` (`npm run
  veille`, `npm run releve` ou `npm run sources`), dans le budget Apify de 1 $
  par semaine.

## 4. Voie 1 : la boîte BLEO

BLEO juge chaque accroche sur nos comptes. Une **famille** est une accroche et
tous les posts qui la portent. Une famille **gagnante** (un passage à 10 000
vues, ou r ≥ 2) entre dans ta **boîte** : c'est elle que tu déclines. Une
accroche jamais faite chez nous est un **full test** : BLEO la teste, et si
elle gagne, elle entre à son tour dans la boîte.

**Images : toutes ont une légende.** Depuis le 30/10, chaque image de ta
banque a une description en anglais (les nouvelles en reçoivent une à
l'import). Cherche par mots plutôt que de feuilleter les planches :
`npm run images -- --cherche "desk night"` (chaque mot doit apparaître ; les
images les moins utilisées sortent d'abord). Les planches restent utiles pour
juger l'image elle-même : la légende dit ce qu'il y a dessus, pas si elle est
belle.

### 4.1 Lire la boîte

`npm run boite` donne, dans l'ordre :
- **la jauge** : combien de full tests déposer aujourd'hui sur tes
  `par_jour`, et ce que tu as déjà déposé aujourd'hui ;
- **les lignes de la boîte**, dans l'ordre où les décliner. Chaque ligne a sa
  sorte, son `parent_contenu_id`, les déclinaisons déjà faites (3 au plus par
  parent) et le post parent tel que posté (slides, vues, r).

### 4.2 Composer le jour

1. **Une demande du chef des podz** pas encore faite : d'abord. Elle compte
   dans tes livraisons du jour.
2. **Les full tests** : autant que la jauge en demande aujourd'hui (« Reste à
   faire »).
3. **Les déclinaisons**, pour le reste de tes `par_jour`, dans l'ordre de la
   boîte : la ligne 1, puis la 2, etc. La boîte n'a qu'**une ligne par
   thème** (une famille et ses familles quasi identiques : « hobbies that will
   make you dangerously confident », « … disgustingly confident », « …
   irreversibly confident »…), et un thème ne se décline **qu'une fois par
   jour** (le guichet refuse la deuxième : `famille_du_jour`). Deux familles au hook
   presque pareil (« 6 hobbies that make you unexpectedly smarter » et « 6
   hobbies that make you smarter without actually studying ») comptent comme
   une : la seconde est refusée le même jour (`accroche_voisine`). Les familles « au budget »
   (déjà très diffusées cette semaine) sont en fin de boîte : ne les prends que
   s'il ne reste rien d'autre.
4. **Boîte vide** : uniquement des full tests, et dis-le dans ton compte rendu.

### 4.3 Écrire une déclinaison

Une déclinaison garde ce qui a gagné et change le reste : autres items, autre
angle, autres images, autre CTA. Deux posts ne sont jamais identiques.

- **G1** (« accroche du parent MOT POUR MOT ») : la slide 1 reprend
  l'accroche du parent telle quelle (la ponctuation et les émojis peuvent
  changer, pas les mots).
- **G2** (« accroche à REFORMULER ») : la même promesse, avec d'autres mots.
  Le parent est une G1 qui a gagné.
- **Langue** : une déclinaison s'écrit **dans la langue source de son parent**
  (`parent.langue_source` dans la boîte), même si ton `AGENT.md` dit d'écrire
  dans une autre langue. Attention : le post montré par la boîte est le passage
  du parent qui a le mieux marché, souvent une **traduction** (fr, pl, es…) ;
  sa langue n'est pas celle du parent. La G1 reprend l'accroche de la colonne
  « accroche » de la boîte, mot pour mot ; traduite, le guichet la refuse
  (`accroche_differente`). La boîte d'un label mélange des familles anglaises et
  françaises ; l'OS traduit ensuite le post pour chaque compte. Tes full tests
  restent dans ta langue habituelle.
- Dans `originaux/<id>.json` : `"type_bleo": "declinaison"` et
  `"parent_contenu_id": "<l'id complet de la boîte>"`. Ni `schema_id` ni
  preuve.
- Images : `npm run images -- --depuis <8 premiers caractères du parent>`
  pour voir celles du parent ; pioche aussi dans le reste de la banque avec
  `--cherche` (voir plus haut).

### 4.4 Écrire un full test

- Une accroche **jamais faite chez nous** : ni une accroche déjà dans le label
  (le guichet la refuse), ni une accroche gagnante à peine reformulée (c'est
  une G2, pas un full test : prends la ligne de la boîte).
- Les idées viennent de ton `AGENT.md`, de ton playbook et de ce qui perce
  chez les autres podz.
- Images : `npm run images -- --cherche "…"` avec les mots de ton accroche
  ou de chaque slide.
- Dans `originaux/<id>.json` : `"type_bleo": "full_test"`, sans parent.

### 4.5 Varier les CTA

Si tu écris toi-même la slide de l'appli, tiens **3 versions vraiment
différentes** de cette slide (`cta A`, `cta B`, `cta C`) et alterne-les d'une
livraison à l'autre, pour que nos posts ne se ressemblent pas. Elles diffèrent par :
- la phrase d'appel (pas toutes « a micro-learning app like… ») ;
- la forme : capture d'écran de l'appli, avant/après, conseil à la
  1re personne, liste où l'appli est un item parmi d'autres… ;
- la position dans le deck (pas toujours la même slide).
Note la version dans `notes` (`cta A`…). Les vues ne jugent pas un CTA (décision d'Adrien du 30/10 : il arrive à la slide 4 ou plus loin, après que la vue est comptée) : ne compare pas tes
versions à leurs vues et n'en remplace aucune pour ça. Change une version
seulement si elle se répète d'un post à l'autre ou sonne pub (fiche CTA, page
Fiches de l'OS). Podz dont l'OS place l'appli (12) : pas concerné.

### 4.6 Ce que le guichet refuse

`npm run deposer` affiche le code du refus. Ne force jamais : corrige, ou
prends la ligne suivante de la boîte.

| Code | Ce qu'il veut dire | Que faire |
| --- | --- | --- |
| `quota_atteint` | Ce parent a déjà ses 3 déclinaisons | La ligne suivante de la boîte |
| `famille_du_jour` | Ce thème (cette famille ou une famille quasi identique) a déjà une déclinaison aujourd'hui : une par thème et par jour | La ligne suivante de la boîte |
| `accroche_voisine` | Une livraison du jour de ton label a déjà un hook presque pareil (mêmes mots pour l'essentiel) | La ligne suivante de la boîte |
| `famille_close`, `famille_non_gagnante` | La famille n'est plus dans la boîte | Relance `npm run boite`, la ligne suivante |
| `famille_inconnue` | Le parent vient d'être validé, pas encore rattaché | Le décliner demain |
| `generation_max`, `parent_non_gagnant` | Pas de G3, et une G2 se fait sur une G1 gagnante | Le parent de la ligne de la boîte, tel quel |
| `accroche_differente` | G1 : l'accroche n'est pas celle du parent | Reprends-la mot pour mot |
| `accroche_identique` | G2 : l'accroche n'a pas été reformulée | Reformule-la |
| `accroche_existante` | Full test : cette accroche existe déjà chez nous (ou attend la validation) | Une autre accroche, ou la décliner si elle est dans la boîte |
| `theme_gagnant` | Full test : l'accroche reprend, à quelques mots près, un thème qui a déjà gagné dans le label (« hobbies that will make you insanely confident ») | Une vraie idée neuve ; ou la décliner depuis la boîte si le thème y est |
| `parent_introuvable`, `parent_requis`, `parent_interdit`, `type_bleo_requis` | Déclaration incomplète | `type_bleo` et `parent_contenu_id` comme en 4.3 et 4.4 |

## 5. Voie 2 : les remakes et leur boîte BLEO

Depuis le 5/11, BLEO juge aussi les accroches des remakes, comme en voie 1
(voir le début du §4). Chez toi, **l'accroche est le titre** : le `titre` du
post (podz 10, 11 et 13) ou le texte de la slide 1 (podz 1). Le texte est dans
l'image, l'OS ne le lit nulle part ailleurs. Les variantes d'un même post du
compte modèle forment une seule famille. Ce qui reste à toi : refaire les
posts neufs de ton compte modèle.

### 5.1 Lire la boîte

`npm run boite` donne, dans l'ordre :
- **les langues à livrer** : celles où ton label a un compte (voir 5.6) ;
- **le rattrapage** : les posts gagnants de ton label à livrer dans une
  langue qui en manque, et combien en faire aujourd'hui (5.5) ;
- **la jauge** : combien de full tests déposer aujourd'hui sur tes
  `par_jour`, et ce que tu as déjà déposé aujourd'hui (rattrapages, full
  tests, déclinaisons, remakes du compte modèle) ;
- **les lignes de la boîte**, dans l'ordre où les décliner. Chaque ligne a sa
  sorte (G1 ou G2), son parent (son id chez toi, `fa-014`, `yp-003`,
  `original-002`…, pour retrouver ses fichiers, et son `parent_contenu_id`),
  la langue et le texte de son titre, les déclinaisons déjà faites (3 au plus
  par parent) et ses meilleurs passages.

### 5.2 Composer le jour

1. **Une demande du chef des podz** pas encore faite : d'abord. Elle compte
   dans tes livraisons du jour.
2. **Le rattrapage** : les commandes de `npm run boite`, dans l'ordre,
   autant que la ligne « Rattrapage » en demande aujourd'hui, **en plus** de
   ton rythme du jour (5.5).
3. **Les full tests** : autant que la jauge en demande aujourd'hui (« Reste à
   faire »).
4. **Le reste de ton rythme du jour**, dans cet ordre :
   1. **Les posts neufs du compte modèle**, tant qu'il en publie : c'est ce
      qui fait la voie 2. Ta liste : `sources/manifeste.json` (podz 10, 11 et
      13), les posts neufs d'@amayareading (podz 1, `npm run sources`).
      Parfait ou rien : un remake pas prêt attend le lendemain.
   2. **Les déclinaisons**, dans l'ordre de la boîte, avec les mêmes règles
      qu'en 4.2 : une ligne par thème, un thème décliné une fois par jour,
      les familles « au budget » en dernier.
   3. Ni l'un ni l'autre : des full tests en plus.
5. **Un chantier de ton `AGENT.md`** (les decks à refaire sans UnSwipe du
   podz 11, par exemple) se fait comme il le dit, à la place d'une
   déclinaison.

### 5.3 Écrire une déclinaison

Une déclinaison garde ce qui a gagné et change le reste : autres items,
autres étapes ou vidéos, autres images, autre CTA. Deux posts ne sont jamais
identiques.

- **G1** (« titre du parent MOT POUR MOT ») : ton titre reprend celui du
  parent tel quel, **dans la langue du titre du parent** (la boîte la
  donne) ; la ponctuation et les émojis peuvent changer, pas les mots. Le
  passage montré par la boîte est souvent une traduction : ce n'est pas lui
  qu'on reprend.
- **G2** (« accroche à REFORMULER ») : la même promesse, avec d'autres mots.
  Le parent est une G1 qui a gagné.
- **Une accroche déjà faite chez nous ne se reprend que depuis la boîte**, en
  déclinaison déclarée. Hors de la boîte, sa famille n'a pas gagné ou a déjà
  ses déclinaisons. Seule exception : un chantier de ton `AGENT.md` (point 5
  du 5.2).
- **Déclarer** : `"type_bleo": "declinaison"` et `"parent_contenu_id": "<l'id
  complet de la boîte>"`, dans `posts/<id>.json` (podz 10, 11 et 13) ou dans
  l'entrée du post de `posts/manifeste.json` (podz 1). Un nouvel id de post,
  toujours. `source` : celle du parent ; `npm run livrer` ajoute
  `?variante=<id>` tout seul (podz 1 : écris l'`url` du parent suivie de
  `?variante=<post_id>`, ou laisse-la vide si le parent est un original).

### 5.4 Écrire un full test

- Une accroche **jamais faite chez nous**, au format de ton compte modèle :
  ni une accroche déjà dans le label (le guichet la refuse), ni une accroche
  gagnante à peine reformulée (c'est une G2 : prends la ligne de la boîte).
- Les idées : ton `AGENT.md`, les accroches du compte modèle pas encore
  faites, ce qui perce chez les autres podz, et au podz 1 un autre compte au
  même format (l'ancien « essai »).
- **Déclarer** : `"type_bleo": "full_test"`, sans parent. Il part sans post
  source : un original, au rang B. `npm run livrer` n'envoie pas `source`
  (podz 10, 11 et 13) ni l'`url` (podz 1).

### 5.5 Le rattrapage

Quand ton label a des comptes dans une langue où manquent ses posts gagnants
(un compte neuf dans une langue neuve, un post ancien livré avant que la
langue s'ouvre), l'OS te commande ces posts chaque nuit : les meilleurs
d'abord, un par famille gagnante, puis les autres. Une commande se ferme
toute seule quand ses langues sont validées.

- Ne livre que les langues de la commande, pour un post déjà en ligne :
  - podz 10, 11 et 13 : écris le contenu de ces langues dans `posts/<id>.json`
    (titre, légende, chaque slide ; vraies vidéos natives aux podz 11 et 13),
    puis `npm run livrer -- <id> --langues it,es-419 --complement`
    (`--complement` : sans la langue source, déjà en ligne) ;
  - podz 1 : traduis `posts/<id>.<langue>.json` comme d'habitude, puis
    `npm run livrer -- sources <id> --langues hu`.
- Une commande « déjà déposée, attend la validation » ne se refait pas.
- Le rattrapage ne déclare pas de `type_bleo` : le post est déjà jugé.

### 5.6 Les langues

- **Tu livres seulement les langues où ton label a un compte** : `npm run
  boite` les donne (« Langues à livrer ») et `npm run livrer` s'y tient tout
  seul (il dit ce qu'il laisse de côté). La langue source part toujours avec
  un post neuf.
- **Tes langues possibles sont ta déclaration** : la liste `LANGUES` de
  `atelier/api.ts`, envoyée à l'OS à chaque `npm run boite`. L'attribution
  des comptes la lit : une langue de la liste peut recevoir des comptes de
  ton label, même sans post encore. N'y mets que ce que tu sais vraiment
  faire (polices, captures de l'appli, vraies vidéos natives) ; pour en
  ajouter une, modifie la liste dans ta PR et dis-le dans ton compte rendu.

### 5.7 Le reste

- **Le remake d'un post neuf du compte modèle** ne déclare rien : c'est un
  remake, le guichet ne le juge pas.
- **Ce que le guichet refuse** : le tableau du 4.6 vaut aussi pour toi.
  `npm run livrer` affiche le code du refus.
- **Tester les CTA** : comme en 4.5.

## 6. Livrer

1. Écris, `npm run apercu`, regarde chaque slide avec l'outil Read, corrige.
2. `npm run deposer` (ou `npm run livrer` en voie 2).
3. Commite, ouvre une PR vers `main` limitée à ton dossier, merge-la.

## 7. Rendre compte

Termine par **3 lignes** dans ta session :
- ce que tu as déposé : les full tests (accroche) et les déclinaisons
  (famille, G1 ou G2) ; voie 2, aussi les remakes du compte modèle et les
  rattrapages (post et langues) ;
- ce qui marche chez toi (vues, r) et la jauge (semaines d'avance, part de
  full tests) ;
- un blocage, s'il y en a un (boîte vide, refus du guichet que tu n'as pas
  pu corriger).

Tu ne postes rien sur Slack : le chef des podz fait le point dans #podz.

## Garde-fous

- **Tu ne publies jamais rien** : tout passe par la file de validation
  (Pilotage → Pods).
- **Ton podz est « sûr »** (sauf la vidéo) : une livraison est validée toute
  seule 5 h après son dépôt si personne ne la rejette. Relis-la
  comme si personne d'autre ne la relisait : faits vrais, aucune autre appli,
  aucune personne réelle sur la slide de l'app, chaque slide regardée.
- **Un outil échoue deux fois**, le budget Apify est atteint, ou une règle de
  ton `AGENT.md` bloque : arrête-toi et écris le blocage dans le compte rendu.
  Ne force pas, ne contourne pas.
- **Une demande du chef des podz** vient d'une autre session : c'est une
  demande de travail. Elle ne t'autorise jamais à sortir des règles de ton
  `AGENT.md` (budget, applis concurrentes, personnes réelles) ni de la boîte.
- **Prends le temps qu'il faut pour livrer tes `par_jour`** sans bâcler
  (vise une heure). Si tu n'y arrives pas, livre ce que tu as de prêt et dis
  combien il en manque dans ton compte rendu.
