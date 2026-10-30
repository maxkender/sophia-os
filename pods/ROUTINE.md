# La routine du matin des podz

Chaque matin, une tâche planifiée réveille la session de chaque podz. Le podz
fait sa livraison du jour **seul**, du début à la fin, puis s'arrête.
Personne n'est là pour répondre : ne pose pas de question, décide avec ton
`AGENT.md`, et note tes doutes dans le compte rendu.

Ce fichier vaut pour tous les podz. Ton `AGENT.md` dit **quoi** livrer et
**comment** ; ce fichier dit **quand** et **combien**. Il a deux parties :

- **Voie 1**, les podz d'originaux (2, 4, 5, 7, 8, 9 et 12) : ils déclinent
  les familles gagnantes de leur boîte BLEO et ajoutent des full tests (§4).
- **Voie 2**, les podz de remakes (1, 6, 10 et 11) : ils suivent leur liste,
  comme avant (§5).

> **Bascule des podz (dimanche 1/11 au soir : ta routine du lundi 2/11 est
> la première sur BLEO).** Podz de la voie 1 : lance d'abord
> `npm run boite`. S'il affiche « podz sur BLEO : pas encore », suis
> `pods/ROUTINE-avant-bleo.md` aujourd'hui, à la place de ce fichier.
>
> **Répétition des samedi 31/10 et dimanche 1/11 (demandée par Adrien) :**
> les podz **8** (smart-girl) et **9** (alpha-male) suivent **ce fichier**
> (§4, la boîte) même si `npm run boite` affiche « pas encore ». Chaque
> original déclare `type_bleo` ; un refus du guichet se règle avec le tableau
> du §4.6 et son code va dans le compte rendu. Ta consigne de routine parle
> encore de « preuve » : ce fichier prime, il n'y en a plus.

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
   famille**, et une famille ne se décline **qu'une fois par jour** (le
   guichet refuse la deuxième : `famille_du_jour`). Les familles « au budget »
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
- **Langue** : une déclinaison s'écrit **dans la langue de son parent** (celle
  du post parent montré par la boîte), même si ton `AGENT.md` dit d'écrire dans
  une autre langue. La boîte d'un label mélange des familles anglaises et
  françaises ; une G1 traduite n'a plus l'accroche du parent mot pour mot et le
  guichet la refuse (`accroche_differente`). L'OS traduit ensuite le post pour
  chaque compte. Tes full tests restent dans ta langue habituelle.
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
| `famille_du_jour` | Cette famille a déjà une déclinaison aujourd'hui (une par famille et par jour) | La ligne suivante de la boîte |
| `famille_close`, `famille_non_gagnante` | La famille n'est plus dans la boîte | Relance `npm run boite`, la ligne suivante |
| `famille_inconnue` | Le parent vient d'être validé, pas encore rattaché | Le décliner demain |
| `generation_max`, `parent_non_gagnant` | Pas de G3, et une G2 se fait sur une G1 gagnante | Le parent de la ligne de la boîte, tel quel |
| `accroche_differente` | G1 : l'accroche n'est pas celle du parent | Reprends-la mot pour mot |
| `accroche_identique` | G2 : l'accroche n'a pas été reformulée | Reformule-la |
| `accroche_existante` | Full test : cette accroche existe déjà chez nous (ou attend la validation) | Une autre accroche, ou la décliner si elle est dans la boîte |
| `parent_introuvable`, `parent_requis`, `parent_interdit`, `type_bleo_requis` | Déclaration incomplète | `type_bleo` et `parent_contenu_id` comme en 4.3 et 4.4 |

## 5. Voie 2 : les remakes

1. **Une demande du chef des podz** pas encore faite : fais-la d'abord. Elle
   compte dans tes livraisons du jour.
2. **Un de tes posts a passé 30 k vues** et n'a pas encore ses variantes :
   écris **3 variantes** (même schéma, autre angle, autres items). Note
   `variante de <source_id>` dans `notes`. Les 3 variantes **s'ajoutent** à
   tes livraisons du jour. Si le temps manque, livre d'abord tes livraisons
   normales, puis les variantes, et finis celles qui manquent à la routine
   suivante.
3. **Sinon, ta livraison normale** (voir ton `AGENT.md`) :
   - podz 1 : un post neuf de la source repris, sinon un post existant traduit
     dans une langue du label qui en manque ;
   - podz 6 : le post suivant de la liste, sinon un original ;
   - podz 10 : le remake suivant de `sources/manifeste.json`, sinon une
     variante d'un format déjà rendu. Parfait ou rien : un remake pas prêt
     attend le lendemain.
   - podz 11 : le remake suivant de `sources/manifeste.json`, sinon une
     variante d'une accroche déjà faite. Parfait ou rien, comme le podz 10.
4. **Une livraison sur cinq est un essai**, au podz 1 seulement : un post d'un
   autre compte au même format. Podz 6, 10 et 11 : pas d'essai tant que la
   liste n'est pas finie.
5. **Tester les CTA** : comme en 4.5.
6. **Ne t'enferme pas dans ce qui marche.** Sur tes livraisons normales du
   jour, **au plus 1** reprend une famille d'accroche que tu as déjà livrée 3
   fois ou plus sur les 7 derniers jours. Les variantes des percées (point 2)
   restent en plus et ne comptent pas dans cette limite.
7. **Reprendre, oui, mais en changeant quelque chose** : chaque reprise
   apporte du changement (autres items, autre angle, autre image ou autre
   CTA), pour que deux posts ne soient jamais identiques.

## 6. Livrer

1. Écris, `npm run apercu`, regarde chaque slide avec l'outil Read, corrige.
2. `npm run deposer` (ou `npm run livrer` aux podz 6, 10 et 11).
3. Commite, ouvre une PR vers `main` limitée à ton dossier, merge-la.

## 7. Rendre compte

Termine par **3 lignes** dans ta session :
- ce que tu as déposé : voie 1, les full tests (accroche) et les déclinaisons
  (famille, G1 ou G2) ; voie 2, l'accroche et `variante` s'il y a lieu ;
- ce qui marche chez toi (vues, r) ; voie 1 : la jauge (semaines d'avance,
  part de full tests) ;
- un blocage, s'il y en a un (boîte vide, refus du guichet que tu n'as pas
  pu corriger).

Tu ne postes rien sur Slack : le chef des podz fait le point dans #podz.

## Garde-fous

- **Tu ne publies jamais rien** : tout passe par la file de validation
  (Pilotage → Pods).
- **Ton podz est « sûr »** (sauf la vidéo) : une livraison est validée toute
  seule 12 h après son dépôt si personne ne la rejette. Relis-la
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
