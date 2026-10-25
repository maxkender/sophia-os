# Analyse du 2026-10-25 — remplir les tests « 100 % podz » avec des comptes du ventre mou

Données : posts mûrs du 22/09 au 22/10 (J-33 à J-3, hors rappels), vues relevées
à J+2 ; historique complet des candidats ; état des labels (`stats_choix_label`,
fenêtre 15 j) et des réserves au 25/10 ; profil TikTok public de
`nele.mueller7` lu le 25/10. Requête : `requetes/20_ventre_mou_comptes.sql`.

## En bref

- 3 labels 100 % podz attendent des comptes pour leur test (3 comptes, sortie à
  30 posts ≥ ×0,75 de la médiane de la langue) : **Fathomly** (Sophia) 0/3,
  **that_girl_study** (Micabo) 0/3, **mentalmaxxing** (UnSwipe) 1/3.
- Le seul compte de mentalmaxxing, `nele.mueller7`, est **bridé** (9 posts morts
  sur 10, 2 vues au plus) : il fausse le test (perf 0,00 sur 12 posts) et
  prendrait une des 3 places. Kill proposé samedi, pas encore décidé.
- 7 comptes « ventre mou » remplissent les tests sans recruter : réguliers
  (≥ 85 % de posts tenus), au niveau de leur langue (r 0,82 à 1,01), jamais ou
  une seule fois 10 k en 40 à 133 posts.
- Garde-fou : le test juge le label contre la médiane de la langue. Un compte
  faible le ferait échouer ; aucun des comptes proposés n'est sous ×0,8.

## Les labels en test

| Label | Appli | Comptes | Langues livrées par le pod (posts d'avance) | Posts 15 j |
| --- | --- | --- | --- | --- |
| Fathomly (pod 11) | Sophia | 0/3 | de, en, es, es-419, fr, it, pt, pt-br (8 chacune) | 0 |
| that_girl_study (pod 10) | Micabo | 0/3 | de, en, es, es-419, fr, it, pt, pt-br, tr (10 chacune) | 0 |
| mentalmaxxing (pod 6) | UnSwipe | 1/3 | de, en, es, es-419, fr, it, tr (22 chacune) | 12, perf 0,00 |
| white_bg | Sophia, UnSwipe | 10 | — | sorti du test |

## Les comptes proposés

Chaque compte reste dans son application (le label pod lui appartient déjà).

**Fathomly (Sophia)**

| Compte | Langue | Label actuel | Posts (depuis) | Médiane | Max (vie) | ≥ 10 k | r langue 30 j | Tenus 14 j |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| chloe.improve | en | smart_girl | 133 (01/08) | 1 209 | 6 662 | 0 | 0,97 | 28/28 |
| jakob.staerke637 | de | alpha_male_yellow | 75 (14/09) | 1 096 | 9 479 | 0 | 0,82 | 28/28 |
| margarida.aprende717 | pt | smart_girl | 86 (12/09) | 1 105 | 3 281 | 0 | 0,99 | 28/28 |

En réserve : `ines.savoir817` (pt, smart_girl, 70 posts, max 5 711, r 0,85),
`alma.torres1089` (es, alpha_male + weird_alpha, 86 posts, max 6 496, r 0,72 :
un peu bas pour un test).

**mentalmaxxing (UnSwipe)** — après avoir sorti `nele.mueller7`

| Compte | Langue | Label actuel | Posts (depuis) | Médiane | Max (vie) | ≥ 10 k | r langue 30 j | Tenus 14 j |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| lea.arbeit646 | de | classic_study | 39 (24/09) | 1 002 | 4 571 | 0 | 0,90 | 26/26 |
| anna.examen886 | fr | classic_study | 45 (19/09) | 877 | 6 091 | 0 | 0,82 | 26/26 |
| carla.curso418 | es | beau_smart_girl | 60 (13/09) | 964 | 20 300 | 1 | 0,99 | 22/26 |

**that_girl_study (Micabo)**

| Compte | Langue | Label actuel | Posts (depuis) | Médiane | Max (vie) | ≥ 10 k | r langue 30 j | Tenus 14 j |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| julia.trabajo556 | es | classic_study | 56 (13/09) | 1 248 | 10 200 | 1 | 1,01 | 24/26 |

Micabo n'a pas d'autre vrai ventre mou (15 comptes actifs) :
`eylul.calisma136` (tr, r 0,91, 0 ≥ 10 k en 30 j, 22/22) est plate depuis un
mois mais a fait 724 k en septembre — possible, pas un ventre mou ;
`mert.sinav365` (112 k, garçon pour un label « that girl »), `irem.tekrar327`
(238 k, 18/24) et `tim.arbeit325` (14/26, trop irrégulier) écartés. Le 3ᵉ
compte : une recrue Micabo.

## Alertes

- `nele.mueller7` (UnSwipe, de, cohorte S43) : 12 vidéos publiques, 1 abonné,
  7 likes au total ; 9 posts morts sur 10 du 19 au 23/10. Compte bridé. Il est
  l'unique compte de mentalmaxxing : tant qu'il y est, le test compte ~1/3 de
  posts à 0 et il occupe une place.
- Fathomly n'a que 8 posts d'avance par langue : 4 jours pour un compte à 2
  posts par jour. Prévenir le pod 11 de produire en en, de et pt avant de
  basculer, sinon les créneaux tombent à vide.

## À améliorer

1. **Ops** : décider le Kill de `nele.mueller7` (proposé samedi dans Check, Kill
   or Double) ou lui retirer le label mentalmaxxing. Gain : test mentalmaxxing
   libéré et non faussé.
2. **Ops** (page Posters, labels du compte) : basculer les 7 comptes ci-dessus.
   Gain : les 3 tests pleins sans recruter, ~14 posts par jour sur du contenu
   pod, sortie de test possible en 5 jours (30 posts à 6 posts/jour par label).
   En bonus, alpha_male_yellow (4,7 j de réserve) et smart_girl (7,6 j)
   perdent 3 comptes à servir (~6 posts/jour).
3. **Pod 11** : livrer Fathomly en en, de, pt au rythme de 2 par jour et par
   langue au moins.

Comment on saura : chaque compte a sa normale (médiane 30 j ci-dessus). Après
5 à 7 jours, r compte des posts pod = vues / cette médiane : au-dessus de 1, le
contenu pod relève même un compte du ventre mou (preuve plus nette que la perf
du label, qui mélange les comptes). Et la carte « Labels 100 % podz » (page
Allocation) : sortie du test à 30 posts si la perf atteint ×0,75.

Réserve : un test sur des comptes moyens est un test **prudent** — un label qui
le passe passera sur de meilleurs comptes ; un label qui le rate n'est pas
forcément mauvais. Ne pas fermer un label pod sur ce seul test.

## Suivi des pistes précédentes

Analyse ciblée : les pistes ouvertes ne sont pas remesurées ici (dernier point
complet : `2026-10-21.md`, puis les rapports du 23/10). Nouvelle piste P42
ajoutée au suivi.
