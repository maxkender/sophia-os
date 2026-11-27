# Lancer un podz : la check-list

Pour Claude (ou qui lance un podz) : ce qui doit être vrai le jour même.
Les étapes détaillées (atelier, pilote, agent) suivent les podz précédents ;
cette page dit ce qui ne se rate pas.

## 1. Le label et le pod (migration)

- **Label 100 % podz** (aucune source) ou label existant (podz d'originaux sur
  un label d'import, comme les podz 35 et 36).
- `pods.langues` = la **langue source** seule (`array['en']`), `langues_pretes`
  pareil. Un podz en **texte + banque** (l'OS traduit) : `langues` nul.
- Le jeton : empreinte seulement (`jeton_hash`), jamais en clair dans un
  fichier, un commit ou un message.

## 2. Les paliers (0874, 0875) : 7 langues ouvertes dès la création

Un **nouveau label 100 % podz avec un podz en images finies** entre au
**palier 1 dans la même transaction que la création du pod** (déclencheur
`pods_palier_entree`) : **7 langues s'ouvrent aussitôt**, la langue source
puis les plus recrutées sur 28 jours (sans ar, he, fa, ur, ja). Ensuite :

| Palier | Langues | Comptes par langue | Monte quand |
| --- | --- | --- | --- |
| 1 | 7 | 1 | une semaine à r > 0,9 (7 jours au palier, 14 posts mûrs) |
| 2 | 14 | 1 | une semaine à r > 0,9 |
| 3 | 14 | 2 | dernier palier automatique |

Les comptes viennent des nouveaux comptes : une langue ouverte où le label a
moins de comptes que son palier n'en donne passe **avant tout** à la création
d'un compte. Un compte qui arrive dans une langue que le podz n'a pas encore
livrée n'a rien à poster : **les 7 langues doivent être livrées**.

Vérifier après la migration : `select * from podz_paliers_etat() where pod = '<slug>';`
(palier 1, 7 langues ouvertes).

Un podz en texte + banque, ou un podz d'originaux sur un label d'import, n'a
pas de palier : l'OS traduit dans toutes les langues des comptes du label.

## 3. Le pilote : livré dans les 7 langues

- Le pilote se rend et se dépose dans **les 7 langues ouvertes** (pas
  seulement la langue source) : `LANGUES` de l'atelier = les 7 langues de
  `pod_langues('<slug>')`, textes traduits et relus, polices qui couvrent
  chaque langue, captures ou cartes de l'appli dans chaque langue.
- Si une langue ne peut vraiment pas se mettre en page, le dire à Adrien
  (il décide de la fermer) : ne pas la laisser ouverte sans la livrer.

## 4. L'agent

- Son `AGENT.md` dit : « palier 1 : 7 langues ouvertes par l'OS, toutes à
  livrer ; une langue qui s'ouvre (palier 2 : 14) se prépare et se livre le
  jour même (`pods/ROUTINE.md` §5.6) ».
- Sa mise en route vérifie `npm run boite` : **aucune langue « à PRÉPARER »**
  ne doit rester le premier jour.
- Puis la routine du matin (tâche planifiée), le contrôle de mise en route,
  sa ligne au tableau du chef, `pods/rythme.json`.
