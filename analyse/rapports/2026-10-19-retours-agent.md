# Analyse du 2026-10-19 : premier effet des retours de l'agent de relecture

Données : `relectures_auto` (cron) des posts du 16, 17 et 18/10, lues le 19/10
à 19 h UTC. Premiers retours réels envoyés le 18/10 à 4 h 41 (posts du 17/10),
seconds le 19/10 (posts du 18/10). Vues à âge égal : celles relevées par la
nuit de relecture (environ 10 h après publication). Les vues J+2 du 18/10 ne
sont pas encore là. **Un seul jour de recul : piste, pas preuve.**

## En bref

1. **Les retours sont lus** : 89 sur 89, en 8 h en médiane ; 87 de ces
   créateurs ont reposté le 18/10. Nuit suivante : 78 envoyés, déjà 67 lus.
2. **Le défaut signalé revient beaucoup moins** : il reste sur 19 % des posts
   suivants quand le retour a été lu avant de poster, contre 28 % sans retour
   (16 → 17/10) et 34 % quand le retour n'était pas encore lu. Créateurs qui
   le refont au moins une fois : 34 % contre 53 %.
3. **C'est bien le message qui agit** : les défauts du même créateur *absents*
   du message baissent à peine (25 % → 21 %).
4. **Vues : tendance positive mais pas encore mesurable.** À 10 h, r passe de
   0,74 à 0,94 chez les créateurs servis (+27 %) contre 0,75 → 0,76 chez les
   autres. Mais l'écart entre ces deux groupes varie de ±15 % d'un jour à
   l'autre sans aucun retour. À relire le 22/10 sur les vues J+2, et sur une
   semaine d'envois.

## Chiffres clés

Le défaut du message revient-il le lendemain ? (`16`, partie A)

| Groupe | Créateurs | Posts suivants avec le défaut (moy. par créateur) | Créateurs qui le refont |
| --- | ---: | ---: | ---: |
| Sans retour (16 → 17/10) | 79 | 28 % | 53 % |
| Retour pas encore lu au moment de poster | 16 | 34 % | 44 % |
| **Retour lu avant de poster** | **83** | **19 %** | **34 %** |
| Témoin : défauts hors message, sans retour | 24 | 26 % | 50 % |
| Témoin : défauts hors message, retour lu | 30 | 21 % | 40 % |

Par point du message (part des posts suivants où il revient, sans retour → retour lu) :
alignement 36 % → 12 % (42 paires), justification 34 % → 21 % (53),
largeur 37 % → 25 % (72), hiérarchie 16 % → 11 % (37), effet 29 % → 21 % (14),
taille 13 % → 13 % (16), **couleur 29 % → 38 %** (13).

Tous défauts confondus, sur tous les posts (créateurs servis le 18/10 au matin / les autres) :

| Posts du | Servis : posts avec ≥ 1 défaut | défauts par post | Autres : posts avec ≥ 1 défaut | défauts par post |
| --- | ---: | ---: | ---: | ---: |
| 16/10 | 58 % | 1,01 | 40 % | 0,55 |
| 17/10 (jour du retour) | 75 % | 1,12 | 11 % | 0,17 |
| 18/10 | **47 %** | **0,75** | 45 % | 0,61 |

Le 17/10 est le jour de sélection (on sert ceux qui ont un défaut), d'où les
extrêmes. Par rapport au 16/10, les servis baissent (−11 points) quand les
autres montent (+5 points).

Vues à âge égal (r = vues à ~10 h ÷ médiane du compte, `16` partie B) :

| Posts du | Servis | Autres |
| --- | ---: | ---: |
| 16/10 | 0,77 | 0,68 |
| 17/10 | 0,74 | 0,75 |
| 18/10 | **0,94** | 0,76 |

Le 18/10, chez les servis : posts sans défaut r 1,06, posts avec défaut 0,87.

## Ce qui marche

- Les points de **forme** (alignement, justification, largeur) sont ceux qui
  se corrigent le mieux : les tutos vidéo font leur travail.
- La lecture est quasi totale, parce que le retour bloque l'appli jusqu'à
  « Compris ».

## Ce qui ne marche pas

- **Couleur** : aucun progrès (13 paires, piste). Soit le message est moins
  clair (choisir la couleur dans la palette TikTok), soit la mesure reste
  fragile (jaune pâle / crème, corrigé le 17/10).
- Taille : pas de progrès, mais elle revenait déjà peu (13 %).

## Alertes

Aucune. Deux nuits d'envoi sans doublon ni erreur (voir le bilan du 18/10).

## À améliorer

- **ops** : relire au banc les 13 cas « couleur » du 18/10 où le défaut est
  revenu : mesure fausse ou message pas compris ? Gain : 8 % des points envoyés
  (11 sur 138 le 18/10), sans effet aujourd'hui. On saura avec `16` A bis.
- **analyste** : relancer `16` le 22/10 (vues J+2 du 18/10, défauts du 19 et
  du 20/10) puis le 26/10 (une semaine). Conclure sur les vues seulement si
  l'écart tient sur plusieurs jours et sur les vues mûres.
- **moteur (plus tard)** : à partir du 19/10, presque tous les créateurs
  reçoivent des retours, la cohorte témoin disparaît. Pour mesurer les vues
  proprement, comparer chaque créateur avant / après son premier retour
  (r J+2), ou garder 10 % de créateurs sans retour pendant deux semaines.

## Suivi des pistes précédentes

- P26 (file de reviews à l'arrêt) : corrigée, l'agent envoie depuis le 18/10.
- P27 (justification coûte des vues) : toujours ouverte ; la justification se
  corrige après retour (34 % → 21 %).
- P28 (une review fait progresser) : renforcée sur les défauts, à confirmer sur les vues.
- Nouvelles pistes : P35 (effet des retours de l'agent), P36 (couleur).
