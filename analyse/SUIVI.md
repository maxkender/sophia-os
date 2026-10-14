# Suivi des pistes et alertes

Une ligne par piste ou alerte. À chaque analyse : relire, remesurer avec la
requête indiquée, mettre à jour le statut (`ouverte`, `en cours`, `corrigée`,
`confirmée`, `infirmée`, `abandonnée`) et la date. Ne jamais effacer une ligne :
une piste infirmée reste, c'est ce qui évite de la reproposer.

| # | Ouverte le | Piste / alerte | Qui | Mesure | Statut | Dernier point |
| --- | --- | --- | --- | --- | --- | --- |
| P1 | 2026-10-13 | Coupe anticipée tierlist : requalifier dès que les 2 premiers passages font r < 0,6 (647 passages gâchés en 60 j) | moteur | `05b` passages_apres_verdict | ouverte | 13/10 : 647 passages, r 0,70 |
| P2 | 2026-10-13 | @supermaxing déclaré `en`, contenu français (197 contenus dont 126 valides) | moteur | `09` + decks « en » de @supermaxing recréés | corrigée, à confirmer | 13/10 09 h 23 : migration 0278 appliquée en prod. 197 contenus en `fr`, 126 decks fr avec texte, 0 deck en rempli, 328 decks d'autres langues intacts, `09` vide. Reste à vérifier : les prochains decks « en » de ces contenus (recréés à l'assignation d'un compte anglais) doivent être en anglais |
| P3 | 2026-10-13 | Compte bridé `mia.arbeit842` (de) | ops | `08`, apify | en cours | 14/10 : `is_active=false`, classement mauvaises_vues. Apify 35 fans / 26 hearts / 11 vid, last 12/10 |
| P4 | 2026-10-13 | Compte mort `aleksandar.distsiplina37` (bg), toujours actif | ops | `08`, apify | corrigée | 14/10 : `is_active=false`, classement inactif. Apify retry 0/2 empty |
| P5 | 2026-10-13 | `ella.mindset714` (hu) : 1 post sur 2 à 1-18 vues | ops | `08b`, apify | ouverte | 14/10 : compte vivant Apify 1654/69300/139 last 13/10. Classement bien→passable 13 22:54 |
| P6 | 2026-10-13 | `martina.gallo30` (it) : −70 % sur la semaine | ops | `08` | ouverte | 14/10 : encore inactif, Apify 868/42000/116 last 10/10, médiane 14 j 1630 |
| P7 | 2026-10-13 | Ouvrir des comptes sv, sk, no (3 à 7 essais pour 10 k vues) ; geler fr, pt | recrutement | `10`, `10b` | ouverte | 14/10 : Hussein SV + Adrian SK créés (warmup jamais). SV 5 comptes, SK 4. Essais non remesurés |
| P8 | 2026-10-13 | Slide appli en 2-3 (r 0,78) et decks ≤ 4 slides (r 0,76) | moteur | `06` | ouverte | 13/10 : 247 et 205 passages |
| P9 | 2026-10-13 | alpha_male_film faible ; RH et « vocabulaire » forts ; dating encore servi sur weird_alpha | moteur, pods | `04`, `07` | ouverte | 13/10 : film 946 méd., RH 21,5 % ≥ 10 k |
| P10 | 2026-10-13 | Micabo : 0,5 essai pour 10 k vues, tester des accroches « examen / révision » | contenu Micabo | `rc_micabo.py`, `04` | ouverte | 13/10 : 93 essais / 1,9 M vues |
| P11 | 2026-10-13 | Vues figées à J+2 : second relevé à J+7 pour les posts ≥ 10 k | moteur | `12` | ouverte | 13/10 : traîne +41 % au total, +12 % en médiane |
| P12 | 2026-10-13 | Originaux weird_alpha prometteurs (r 1,84) | pod originaux | `11` | ouverte | 13/10 : 19 passages |
| P13 | 2026-10-13 | Dilution : 63 k vues par compte et par semaine contre 104 k mi-août | tous | `02` | ouverte | 13/10 : médiane 1 504 |
