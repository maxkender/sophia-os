# Suivi des pistes et alertes

Une ligne par piste ou alerte. À chaque analyse : relire, remesurer avec la
requête indiquée, mettre à jour le statut (`ouverte`, `en cours`, `corrigée`,
`confirmée`, `infirmée`, `abandonnée`) et la date. Ne jamais effacer une ligne :
une piste infirmée reste, c'est ce qui évite de la reproposer.

| # | Ouverte le | Piste / alerte | Qui | Mesure | Statut | Dernier point |
| --- | --- | --- | --- | --- | --- | --- |
| P1 | 2026-10-13 | Coupe anticipée tierlist : requalifier dès que les 2 premiers passages font r < 0,6 (647 passages gâchés en 60 j) | moteur | `05b` passages_apres_verdict | ouverte | 13/10 : 647 passages, r 0,70 |
| P2 | 2026-10-13 | @supermaxing déclaré `en`, contenu français (197 contenus dont 126 valides) | moteur | `09` + decks « en » de @supermaxing recréés | corrigée | 13/10 09 h 23 : migration 0278 appliquée. 14/10 : premier deck « en » recréé, entièrement en anglais, slide Sophia en 5 |
| P3 | 2026-10-13 | Compte bridé `mia.arbeit842` (de) | ops | `08`, apify | ouverte | 13/10 : 26-118 vues en direct |
| P4 | 2026-10-13 | Compte mort `aleksandar.distsiplina37` (bg), toujours actif | ops | `08`, apify | ouverte | 14/10 : toujours 2 créneaux par jour, 0 post |
| P5 | 2026-10-13 | `ella.mindset714` (hu) : 1 post sur 2 à 1-18 vues | ops | `08b`, apify | ouverte | 13/10 : 7 posts depuis le 07/10 |
| P6 | 2026-10-13 | `martina.gallo30` (it) : −70 % sur la semaine | ops | `08` | ouverte | 14/10 : aucun post le 13/10 |
| P7 | 2026-10-13 | Ouvrir des comptes sv, sk, no (3 à 7 essais pour 10 k vues) ; geler fr, pt | recrutement | `10`, `10b` | ouverte | 13/10 : sv 7,2 · sk 5,3 · no 4,3 · fr 1,6 · pt 1,1 |
| P8 | 2026-10-13 | Slide appli en 2-3 (r 0,78) et decks ≤ 4 slides (r 0,76) | moteur | `06` | ouverte | 13/10 : 247 et 205 passages |
| P9 | 2026-10-13 | alpha_male_film faible ; RH et « vocabulaire » forts ; dating encore servi sur weird_alpha | moteur, pods | `04`, `07` | ouverte | 13/10 : film 946 méd., RH 21,5 % ≥ 10 k |
| P10 | 2026-10-13 | Micabo : 0,5 essai pour 10 k vues, tester des accroches « examen / révision » | contenu Micabo | `rc_micabo.py`, `04` | ouverte | 14/10 : 5 essais le 13/10, 0 en Turquie ; volume de posts en baisse |
| P11 | 2026-10-13 | Vues figées à J+2 : second relevé à J+7 pour les posts ≥ 10 k | moteur | `12` | ouverte | 13/10 : traîne +41 % au total, +12 % en médiane |
| P12 | 2026-10-13 | Originaux weird_alpha prometteurs (r 1,84) | pod originaux | `11` | ouverte | 13/10 : 19 passages |
| P13 | 2026-10-13 | Dilution : 63 k vues par compte et par semaine contre 104 k mi-août | tous | `02` | ouverte | 13/10 : médiane 1 504 |
| P14 | 2026-10-14 | Comptes classés inactif toujours servis (13 le 13/10, 26 créneaux) : suspendre leur assignation | ops / moteur | `01`, liste des comptes à 0 post | ouverte | 14/10 : 30 comptes à 0 post hier, dont 13 inactifs |
| P15 | 2026-10-14 | Unswipe démarre (2ᵉ jour) : premières vues au niveau de Sophia à âge égal, 68 % de publication | ops | requête par jour et par app | ouverte | 14/10 : médiane 966 à 8 h, 4 comptes sur 14 sans post |
| P16 | 2026-10-15 | File de reviews à l'arrêt depuis le 18/09 : 0 relecture sur ~6 200 posts. Agent de relecture (copilote puis autopilote) | moteur, ops | `13`, compte des reviews / passes par jour | ouverte | 15/10 : 227 posts traités du 11 au 18/09, plus rien depuis |
| P17 | 2026-10-15 | « Jutifier » (forme du paragraphe : lignes trop courtes, colonne étroite) coûte des vues : −25 %, −44 % quand seul | ops, moteur | `13` | ouverte | 15/10 : r 0,65 (35 posts), 0,49 seul (10) contre 0,86 passés ; style : aucun écart |
| P18 | 2026-10-15 | Une review fait progresser le créateur : +10 à +28 % de r une fois corrigé du rattrapage | ops | `14` | ouverte | 15/10 : reviewés 0,84 → 1,10, non reviewés 1,00 → 1,06 |
| P19 | 2026-10-15 | Slides livrées déjà écrites (`bruler-texte`) contre texte tapé par le créateur : test 10 contre 10 comptes | moteur, ops | r compte par groupe | ouverte | 15/10 : non lancé ; page blanche (images finies) r 1,00 sur 9 posts |
