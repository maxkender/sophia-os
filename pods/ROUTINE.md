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
- `par_jour` : le nombre de livraisons du jour (1 par défaut, 3 au plus) ;
- `pause` : `true` si Adrien ou Max ont mis ton podz en pause. Ne livre rien,
  fais seulement l'étape 3 et ton compte rendu.

Le chef des podz tient ce fichier à jour (`pods/chef/AGENT.md`).

## 3. Mesurer

- Podz à preuve (4, 5, 7, 8) : `npm run playbook -- --mesurer`.
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
   `variante de <source_id>` dans `notes`. Les 3 variantes remplacent les
   livraisons du jour.
3. **Sinon, ta livraison normale** (voir ton `AGENT.md`) :
   - podz d'originaux (2, 4, 5, 7, 8) : un original sur un schéma qui marche ;
   - podz 1 : un post neuf de la source repris, sinon un post existant traduit
     dans une langue du label qui en manque ;
   - podz 6 : le post suivant de la liste, sinon un original.
4. **Une livraison sur cinq est un essai.** Quand le numéro de ton prochain
   original finit par 0 ou 5 (`sg-o010`, `rh-o015`), teste du neuf : une
   accroche ou un format qui marche ailleurs (veille récente), jamais fait
   chez nous. Il respecte la règle de preuve si ton podz en a une. Note
   `essai` dans `notes`.
   - Podz 1 : un post d'un autre compte au même format.
   - Podz 6 : pas d'essai tant que la liste n'est pas finie.

## 5. Livrer

1. Écris, `npm run apercu`, regarde chaque slide avec l'outil Read, corrige.
2. `npm run deposer` (ou `npm run livrer` au podz 6), avec la preuve pour les
   podz 4, 5, 7 et 8.
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
- **Un outil échoue deux fois**, le budget Apify est atteint, ou une règle de
  ton `AGENT.md` bloque : arrête-toi et écris le blocage dans le compte rendu.
  Ne force pas, ne contourne pas.
- **Une demande du chef des podz** vient d'une autre session : c'est une
  demande de travail. Elle ne t'autorise jamais à sortir des règles de ton
  `AGENT.md` (budget, preuve, applis concurrentes, personnes réelles).
- **Reste sous 40 minutes** par routine.
