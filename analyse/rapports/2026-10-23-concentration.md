# Moyenne ou médiane ? Qui porte les vues (20/09 → 19/10)

Données : Sophia, posts publiés du 20/09 au 19/10 (30 jours), vues relevées à
J+2 : 6 899 posts, 34,4 M de vues, 181 comptes, 1 692 slideshows. Micabo et
Unswipe à part ; toutes applis confondues, mêmes chiffres à 2 points près.
Page Notion : Analyses → « Moyenne ou médiane ? Qui porte les vues ».

## En bref

1. **Moyenne 4 978, médiane 1 624 : rapport 3,1.** 78 % des posts sont sous
   la moyenne. La médiane juge le process, la moyenne (la somme) juge le
   business.
2. **8 % des posts (≥ 10 k) font 55 % des vues ; 6 % en font la moitié ;
   29 % en font 80 %.** La moitié « médiane » des posts (p25-p75) fait 21 %
   des vues. Les viraux (≥ 50 k, 1,25 % des posts) font 26 %. Gini 0,68,
   stable semaine après semaine (part des ≥ 10 k entre 44 et 59 %).
3. **Les partages sont encore plus concentrés** : 2 % des posts (≥ 50 k)
   font 45 % des partages, les 10 % meilleurs posts 76 %.
4. **Le total d'un jour bouge avec son top 5** (30 % du total, corrélation
   0,87) et pas avec sa médiane (0,14).
5. **Côté comptes, c'est réparti** : moyenne 238 k, médiane 185 k (rapport
   1,28), Gini 0,44 ; 22 % des comptes font la moitié des vues, 51 % en font
   80 %. Les 86 viraux sont tombés sur 50 comptes différents. Les meilleurs
   comptes sont bons régulièrement (médiane 5 130 contre 1 746 ; leur
   meilleur post ne fait que 24 % de leurs vues ; corrélation de rang des
   médianes entre les deux quinzaines 0,72).
6. **Côté slideshows** : 7,6 % font la moitié des vues ; les 19 % qui ont eu
   au moins un post ≥ 10 k font 69 % des vues.
7. **D'où viennent les viraux** : originaux × 4,5 (9 % des viraux pour 2 %
   des posts), RH × 3, smart_girl × 1,3 ; espagnol × 2,7, turc × 1,4, serbe
   et grec × 2,3 ; allemand × 0,7. Rappels J+7 : 3 % des viraux.

## Chiffres clés

| Tranche | Posts | Vues | Partages |
| --- | --- | --- | --- |
| < 1 k | 25,5 % | 3,1 % | 1,4 % |
| 1-3 k | 39,5 % | 12,7 % | 6,7 % |
| 3-10 k | 27,0 % | 29,5 % | 18,4 % |
| 10-50 k | 6,8 % | 28,7 % | 28,2 % |
| 50-100 k | 0,9 % | 11,9 % | 20,3 % |
| ≥ 100 k | 0,4 % | 14,2 % | 25,0 % |

| Pour 50 % · 80 % · 90 % des vues | Posts | Comptes | Slideshows |
| --- | --- | --- | --- |
| part nécessaire | 6 % · 29 % · 48 % | 22 % · 51 % · 66 % | 7,6 % · 28 % · 43 % |
| Gini | 0,68 | 0,44 | 0,69 |

## Ce que ça change

- Deux tableaux de bord : médiane et r compte pour le process ; nombre de
  posts ≥ 10 k par jour pour la machine à viraux. Le total du jour mélange
  les deux.
- Le levier est la fréquence des percées (2,9 viraux par jour), pas la
  hausse du post médian : originaux, slideshows déjà gagnants, imports frais,
  langues es / tr / sr / el.
- Les comptes ne sont pas le goulot ; le quart sans aucun ≥ 10 k en 30 jours
  mérite un contrôle (bridage, langue, label), pas une purge.
- Les essais suivent probablement les partages plus que les vues : lire
  RevenueCat par pays à la lumière des viraux du pays sur 3 jours.

## Reproduire

`analyse/requetes/17_concentration.sql` (export JSON) puis
`python3 -I analyse/outils/concentration.py rows.json`.
