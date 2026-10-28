# La routine du matin des podz

Chaque matin, une tâche planifiée réveille la session de chaque podz. Le podz
fait sa livraison du jour **seul**, du début à la fin, puis s'arrête.
Personne n'est là pour répondre : ne pose pas de question, décide avec ton
`AGENT.md`, et note tes doutes dans le compte rendu.

Ce fichier vaut pour tous les podz. Ton `AGENT.md` dit **quoi** livrer et
**comment** ; ce fichier dit **quand** et **combien**.

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

- Podz à preuve (4, 5, 7, 8, 9, 12) : `npm run playbook -- --mesurer`.
- Tous : `npm run etat`, puis `npm run suivi` si ton podz l'a et qu'un passage
  a 3 jours.
- **Le lundi**, avant de livrer : la veille de ton `AGENT.md` (`npm run
  veille`, `--decouvrir` une fois par semaine, ou `npm run releve` /
  `npm run sources`), dans le budget Apify de 1 $ par semaine. Puis mets ton
  playbook à jour.

## 4. Choisir quoi livrer, dans cet ordre

1. **Une demande du chef des podz** pas encore faite : fais-la d'abord. Elle
   compte dans tes livraisons du jour.
2. **Un de tes posts a passé 30 k vues** et n'a pas encore ses variantes :
   écris **3 variantes** (même schéma, autre angle, autres items). Note
   `variante de <source_id>` dans `notes`. Les 3 variantes **s'ajoutent** à
   tes livraisons du jour, elles ne les remplacent pas : ce jour-là, tu livres
   tes `par_jour` livraisons normales (point 3) **plus** les 3 variantes. Si
   le temps manque, livre d'abord tes livraisons normales,
   puis les variantes, et finis celles qui manquent à la routine suivante.
3. **Sinon, ta livraison normale** (voir ton `AGENT.md`) :
   - podz d'originaux (2, 4, 5, 7, 8, 9, 12) : un original sur un schéma qui marche ;
   - podz 1 : un post neuf de la source repris, sinon un post existant traduit
     dans une langue du label qui en manque ;
   - podz 6 : le post suivant de la liste, sinon un original ;
   - podz 10 : le remake suivant de `sources/manifeste.json`, sinon une
     variante d'un format déjà rendu. Parfait ou rien : un remake pas prêt
     attend le lendemain.
   - podz 11 : le remake suivant de `sources/manifeste.json`, sinon une
     variante d'une accroche déjà faite. Parfait ou rien, comme le podz 10.
4. **Une livraison sur cinq est un essai.** Quand le numéro de ton prochain
   original finit par 0 ou 5 (`sg-o010`, `rh-o015`), teste du neuf : une
   accroche ou un format qui marche ailleurs (veille récente), jamais fait
   chez nous. Il respecte la règle de preuve si ton podz en a une. Note
   `essai` dans `notes`.
   - Podz 1 : un post d'un autre compte au même format.
   - Podz 6, 10 et 11 : pas d'essai tant que la liste n'est pas finie.

5. **Tester les CTA, toujours.** Si tu écris toi-même la slide de l'appli,
   tiens **3 versions vraiment différentes** de cette slide (`cta A`, `cta B`,
   `cta C`) et alterne-les d'une livraison à l'autre. Elles diffèrent par :
   - la phrase d'appel (pas toutes « a micro-learning app like… ») ;
   - la forme : capture d'écran de l'appli, avant/après, conseil à la
     1re personne, liste où l'appli est un item parmi d'autres… ;
   - la position dans le deck (pas toujours la même slide).
   Note la version dans `notes` (`cta A`…), garde la même version sur toutes
   les langues d'une livraison. **Chaque lundi, remplace la moins bonne
   version par une nouvelle idée**, même si toutes marchent : il y a toujours
   un CTA à tester. Le chef te dit aussi quand une version est nettement sous
   les autres sur 20 passages mûrs. Podz dont l'OS place l'appli (12) : pas
   concerné.
6. **Ne t'enferme pas dans ce qui marche.** Sur tes livraisons normales du
   jour, **au plus 1** reprend une famille d'accroche que tu as déjà livrée 3
   fois ou plus sur les 7 derniers jours. Les autres partent sur des angles ou
   des accroches jamais faits chez toi (veille, playbook, idées d'autres
   podz). Les variantes des percées (point 2) restent en plus et ne comptent
   pas dans cette limite. Un schéma qui marche finit par s'user : on en
   cherche toujours le suivant.

7. **Pas de répétition visible** (podz d'originaux dont le label n'est pas
   nourri qu'aux podz : 2, 4, 5, 7, 8, 9 et 12). Un titre de slide 1 mot pour
   mot, ou une couverture identique (même image, même sous un autre
   `media_id` : compare l'image elle-même), ne revient pas avant **10 jours**
   après sa dernière livraison chez toi, et au plus **1 reprise par lot**. Le
   reste du temps : nouveaux schémas, nouvelles accroches, nouvelles images.
   Vérifie-le avant chaque dépôt. Podz 1, 6, 10 et 11 (labels 100 % podz) :
   pas concernés pour l'instant.

## 5. Livrer

1. Écris, `npm run apercu`, regarde chaque slide avec l'outil Read, corrige.
2. `npm run deposer` (ou `npm run livrer` aux podz 6, 10 et 11), avec la preuve
   pour les podz 4, 5, 7, 8 et 9.
3. Commite, ouvre une PR vers `main` limitée à ton dossier, merge-la.

## 6. Rendre compte

Termine par **3 lignes** dans ta session :
- ce que tu as déposé (accroche, schéma, `essai` ou `variante`) ;
- ce qui marche chez toi (vues, r, rang) ;
- un blocage, s'il y en a un.

Tu ne postes rien sur Slack : le chef des podz fait le point dans #podz.

## Garde-fous

- **Tu ne publies jamais rien** : tout passe par la file de validation
  (Pilotage → Pods).
- **Ton podz est « sûr »** (sauf la vidéo) : une livraison est validée toute
  seule 12 h après son dépôt si personne ne la rejette. Relis-la comme si
  personne d'autre ne la relisait : faits vrais, aucune autre appli, aucune
  personne réelle sur la slide de l'app, chaque slide regardée.
- **Un outil échoue deux fois**, le budget Apify est atteint, ou une règle de
  ton `AGENT.md` bloque : arrête-toi et écris le blocage dans le compte rendu.
  Ne force pas, ne contourne pas.
- **Une demande du chef des podz** vient d'une autre session : c'est une
  demande de travail. Elle ne t'autorise jamais à sortir des règles de ton
  `AGENT.md` (budget, preuve, applis concurrentes, personnes réelles).
- **Prends le temps qu'il faut pour livrer tes `par_jour`** sans bâcler
  (vise une heure). Si tu n'y arrives pas, livre ce que tu as de prêt et dis
  combien il en manque dans ton compte rendu.
