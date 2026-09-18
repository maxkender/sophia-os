# Contacts enseignants-chercheurs — 6 matières

Fichier Excel : **`contacts_profs_universite.xlsx`**

Annuaire constitué à partir des pages officielles listées (Sorbonne Université, Paris 1 Panthéon-Sorbonne, Université Paris Cité, Dauphine-PSL, EPHE-PSL, Université de Montréal, APHEC). Tous les enseignants trouvés sur ces pages sont inclus, pas seulement 100.

## Feuilles

| Feuille | Contenu |
|---|---|
| SYNTHESE | Effectifs par matière + sources |
| TOUS LES CONTACTS | Liste complète |
| MONDE ACTUEL | Science politique, sociologie, économie, géographie, management, APHEC |
| HISTOIRE | UFR Histoire Sorbonne, EPHE section 27, Paris Cité Histoire |
| ART | UFR Histoire de l'art Sorbonne + historiens de l'art EPHE |
| MYTHOLOGIE | Experts mythologie / religions (UdeM + spécialités publiées) |
| SCIENCES | EPHE section 25 (Sciences de la Vie et de la Terre) + info / maths Sorbonne |
| LITTERATURE | UFR Littérature française et comparée + philologues EPHE |
| AVEC EMAIL | Uniquement les fiches avec un courriel publié |

## Colonnes

Matière · Nom · Prénom · Titre / fonction · Spécialité · Email · Institution · Statut · Pays · Source

Les emails sont ceux publiés sur les annuaires (liens `mailto:`). Pour l'EPHE, le format institutionnel `prenom.nom@ephe.psl.eu` est celui affiché sur les fiches individuelles.

## Régénérer

```bash
python3 contacts-profs/build_contacts.py
```
