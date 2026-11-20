# Le glossaire des podz

Les mots que l'OS, les agents et les pages emploient, avec un seul sens chacun.
Quand un autre fichier dit autre chose, c'est ce fichier qui a raison.

## Les mots

| Mot | Ce que c'est |
| --- | --- |
| **Label** | Une ligne éditoriale (`alpha_male`, `Fathomly`). Les comptes portent un label, et postent ce que ce label contient. Un label est nourri par des sources, par des podz, ou par les deux. |
| **Podz** | Un atelier Claude qui nourrit **un** label : un agent, son dossier `pods/<dossier>/`, sa routine du matin. Un label peut avoir plusieurs podz. |
| **Modèle** | Le compte TikTok dont un podz reprend le style (`@fathom0g` pour Fathomly). Rien n'est importé de ce compte. |
| **Source** | Un compte TikTok dont l'OS **importe** les posts dans un label (page Sources, Bible des comptes). |
| **Format** | Ce que le podz livre. Deux formats pour les slideshows, voir plus bas. |
| **Langue ouverte** | Une langue de la liste d'un podz en images finies (`pods.langues`) : il la livre. |
| **Langue servie** | Une langue ouverte où au moins un compte du label poste. |
| **Livraison** | Un contenu déposé par un podz dans la file de validation de l'OS. |

## Les deux formats

| | Texte + banque | Images finies |
| --- | --- | --- |
| Le podz livre | le texte, et des images choisies dans la banque du label | les slides finies, langue par langue |
| Les langues | l'OS traduit : le post existe dans toutes les langues | seulement celles de sa liste (`pods.langues`) |
| Le rythme | `pods/rythme.json`, tenu par le chef, et la jauge BLEO | calculé par l'OS sur les comptes du label |
| Routine | `pods/ROUTINE.md` §4 (« voie 1 ») | `pods/ROUTINE.md` §5 (« voie 2 ») |

Le format se lit dans la base : un podz qui a une liste `pods.langues` est en
images finies. Le mot « Originaux » ou « Remakes » dans le nom d'un podz ne
dit pas son format : Dorian, Appshelf ou Milly s'appellent « Originaux » et
livrent des images finies.

Le podz vidéo (réactions UGC) est à part : une vidéo par compte, validée une
par une.

## Ce qu'on ne dit plus

- **« Voie 1 », « voie 2 »** : dire le format. Les deux mots restent dans
  `pods/ROUTINE.md` et dans la base (`labels.voie`), où ils nomment la routine
  à suivre.
- **« Label 100 % podz »** comme une sorte de label : c'est un état (aucune
  source active, un seul podz), qui change le jour où l'on ajoute une source ou
  un deuxième podz. Aujourd'hui, les règles de langues et d'allocation en
  dépendent encore (vue `labels_100_podz`).

## Les noms d'un podz

Un podz a plusieurs noms techniques. Celui qu'on lit et qu'on dit est le
**nom de son label**.

| Nom | Exemple | Où |
| --- | --- | --- |
| Label | `Sagace` | partout dans l'OS : c'est le nom à employer |
| Nom du podz | « Remakes @sagace.fr (Sophia) » | `pods.nom` |
| Slug | `remakes_sagace` | `pods.slug`, le jeton, les livraisons |
| Dossier | `pods/sagace/` | le dépôt |
| Skill | `pod-sagace` | `.claude/skills/` |
| Numéro | podz 15 | les commits et le tableau du chef |

## Où le voir

Page **Podz** de l'OS (`/admin/pods`) : la liste des podz par application, la
fiche de chacun (identité, langues, comptes, rythme, livraisons), la file de
validation et les chiffres.
