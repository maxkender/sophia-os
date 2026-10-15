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

| Défaut | Règle | Remarque-type de la file |
| --- | --- | --- |
| `forme_paragraphe` | caractères par ligne publiés ÷ originaux < 0,7 (colonne étroite) ou > 1,5 | Jutifier |
| `taille` | hauteur de ligne (rapportée à la largeur de l'image) hors de ×0,7 à ×1,45 | text not the same |
| `hierarchie` | l'original distingue un titre, le publié non | Corpus / head |
| `couleur`, `contour`, `gras` | famille de couleur, contour, graisse différents | text not the same |
| `alignement` | gauche / centre / droite différent | — |
| `placement` | centre du texte décalé de plus de 20 % de la hauteur | — |
| `texte_absent` | slide publiée sans texte | — |
| `nb_slides`, `musique` | nombre de slides ou son différents de ce qui était fourni | — |

Un défaut de slide n'est retenu que s'il se répète : vu sur au moins la moitié
des slides où la règle s'applique, et sur 2 slides dès qu'il y en a 2 à juger.

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
