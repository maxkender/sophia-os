# Relecture automatique des posts

Relire chaque nuit les posts publiés la veille, comme l'admin le faisait à la
main dans `/admin/file-reviews`, et préparer la review. Rien n'est envoyé au
créateur : les résultats attendent dans `relectures_auto`.

## Pourquoi

Le créateur reçoit des images propres et des textes à copier. Il retape chaque
texte dans l'éditeur de TikTok et choisit lui-même taille, couleur, retours à
la ligne : c'est là que naissent les écarts avec l'original. Relus à la main,
227 posts entre le 11 et le 18/09, puis plus rien. Étude complète : Notion,
Analyses → « Agent de relecture des posts ».

## Le circuit

| Quand (UTC) | Quoi |
| --- | --- |
| 01:00 | cron `relecture-enfiler` : les slideshows publiés la veille (heure de Paris) entrent en file. 3 h à Paris l'été, 2 h l'hiver. |
| toutes les 2 min, 01:00 → 05:58 | cron `relecture-drain` → fonction `relecture-auto`, trois étapes reprises d'un passage à l'autre : |
| | 1. un run Apify pour 40 posts (slides publiées, son, légende) ; |
| | 2. relevé des runs terminés ; |
| | 3. pour 3 slides par post (l'accroche et les deux textes les plus longs), Gemini mesure le texte de l'original ET du publié dans le même appel, puis les règles jugent. |

Statuts : `a_scraper` → `scrape` → `a_analyser` → `analyse` → `fait`.
`ignore` : rien de comparable (publié en vidéo, original sans image brute).
`echec` : post introuvable ou trop de tentatives.

## Ce qui est contrôlé

Règles dans `supabase/functions/_shared/relecture.ts`, seuils en tête du fichier.

### Taille et justification : deux réglages différents

Dans l'éditeur de TikTok, la zone de texte a une **largeur fixe**. Deux
gestes changent l'aspect du paragraphe, et pas de la même façon :

- le **curseur de taille** (dans l'éditeur) change la taille des lettres, donc
  combien de mots tiennent sur une ligne et où les lignes se coupent : c'est
  la **justification** (« Jutifier » dans la file) ;
- le **pincement** (après « Done ») agrandit ou réduit le bloc entier sans
  toucher aux retours à la ligne : c'est la **taille** à l'écran.

Un créateur qui tape le texte trop gros puis le pince pour le réduire obtient
une taille correcte mais une colonne étroite de lignes courtes. On mesure donc
la justification par la largeur du paragraphe exprimée en hauteurs de ligne :
le pincement ne la change pas, seul le curseur la change.

### Les règles

| Défaut | Règle | Envoyé ? | Remarque-type |
| --- | --- | --- | --- |
| `texte_absent` | slide publiée sans texte | oui | — |
| `justification` | largeur en hauteurs de ligne, publiée ÷ originale, sous 0,75 (lignes courtes) ou au-dessus de 1,35, confirmé par les caractères par ligne ; paragraphe de 3 lignes et 60 caractères ou plus | oui | Jutifier |
| `hierarchie` | l'original distingue un titre, le publié non | oui | Corpus / head |
| `taille` | hauteur de ligne (rapportée à la largeur de l'image) hors de ×0,7 à ×1,4 | oui | text not the same |
| `alignement` | gauche / centre / droite du paragraphe principal | oui | — |
| `couleur`, `effet` | famille de couleur ; effet du bouton A (aucun, contour, fond) | oui | text not the same |
| `nb_slides`, `musique` | nombre de slides ou son différents de ce qui était fourni | oui | — |
| `police`, `gras`, `placement` | avis de Gemini sur la police ; graisse ; centre du texte décalé de plus de 25 % de la hauteur | **non**, info admin | — |

Un défaut de slide n'est retenu que s'il se répète : vu sur au moins la moitié
des slides où la règle s'applique, et sur 2 slides dès qu'il y en a 2 à juger.
Sauf l'alignement : souvent seule l'accroche a un alignement propre, une slide
suffit.

### La review

Au plus **deux points**, dans l'ordre du tableau ; le reste attend la review
suivante (et reste visible pour l'admin dans `defauts`). Chaque point dit ce
qui se voit, en mots (« your lines are shorter than in the original, so the paragraph looks like a thin column »),
puis le geste dans l'éditeur de TikTok : curseur puis pincement pour la
justification, pincement pour la taille, bouton d'alignement, zone de texte à
part pour le titre, bouton A et rangée de couleurs pour le style. Jamais de
ratio ni de pourcentage.

Gemini reformule ensuite le brouillon sur un ton de manager. La reformulation
n'est gardée que si elle cite les mêmes slides, sans chiffre technique ; sinon
le brouillon déterministe part tel quel.

Seuils calibrés le 15/10 sur 10 posts relus à l'œil (planches original /
publié) : voir `analyse/rapports/2026-10-15-relecture-test.md`.

## Lancer un lot de test

Depuis l'admin (JWT) ou avec le secret de test :

```json
POST /functions/v1/relecture-auto
{ "enfiler": { "jour": "2026-10-15", "limite": 10, "aleatoire": true } }
```

Le lot est marqué `origine = 'test'`. Rappeler la fonction avec `{}` fait
avancer le drain (le run Apify prend une à deux minutes).

## Lire les résultats

```sql
select r.jour, c.handle_tiktok, r.statut, r.defauts, r.brouillon
from relectures_auto r join comptes c on c.id = r.compte_id
where r.jour = current_date - 1
order by jsonb_array_length(r.defauts) desc;
```

## Suite prévue

1. Étiqueter 100 posts à la main et recalibrer les seuils.
2. Copilote : la file de reviews s'ouvre sur la veille, pré-remplie avec le
   brouillon et les remarques-types ; l'admin envoie en un clic.
3. Envoi automatique des défauts sûrs, une review par créateur et par jour au plus.
