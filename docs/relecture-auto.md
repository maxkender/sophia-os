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
| `justification` | largeur en hauteurs de ligne, publiée ÷ originale, sous 0,75 (lignes courtes) ou au-dessus de 1,35, confirmé par la ligne la plus longue (en caractères) ; paragraphe de 3 lignes et 60 caractères ou plus. **Jamais de comparaison du nombre de lignes** : le texte est traduit, une version plus longue fait plus de lignes de la même largeur | oui | Jutifier |
| `hierarchie` | l'original distingue un titre, le publié non | oui | Corpus / head |
| `largeur` | largeur du paragraphe sur l'écran (ses marges), publiée ÷ originale, hors de ×0,85 à ×1,15, avec des lettres elles aussi plus grosses (ou plus petites) d'au moins 10 % : le bloc a été pincé trop grand ou trop petit. Plus large à taille égale (traduction plus longue) : rien | oui | Jutifier |
| `taille` | hauteur de ligne (rapportée à la largeur de l'image) hors de ×0,7 à ×1,4 ; pas de second point si `largeur` dit déjà « pincer » | oui | text not the same |
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
qui se voit, en mots (« your lines are shorter than in the original, so the paragraph looks like a thin column » ; jamais « 5 lignes au lieu de 3 », le texte étant traduit),
puis le geste dans l'éditeur de TikTok : pour la justification, des étapes
numérotées (toucher le texte, le petit curseur qui apparaît sur le bord droit
de l'écran, descendre ou monter le point blanc, Done, puis pincer ou écarter
deux doigts), avec renvoi à la vidéo tuto de la remarque « Jutifier » ; pincement pour la taille, bouton d'alignement, zone de texte à
part pour le titre, bouton A et rangée de couleurs pour le style. Jamais de
ratio ni de pourcentage.

**Pas de numéros quand le défaut touche plusieurs slides** : « On some of your
slides, … ». L'agent ne compare que 3 slides (l'accroche et les deux plus
longues) ; un défaut vu sur les slides 5 et 6 est presque toujours sur toutes,
et « On slides 5 and 6 » se lirait comme « les autres sont bonnes ». Une slide
seule est nommée (« On slide 1, the text is centered… ») : c'est précis et
utile. Les numéros restent dans `defauts`, pour l'admin.

**Un post qui marche n'a pas de message** : au-delà de 5 000 vues
(`SEUIL_VUES_SANS_REMARQUE`), l'agent n'envoie rien, on ne corrige pas ce qui
fait des vues. Les défauts restent relevés, montrés à l'admin comme « pas
envoyés ». Les vues gardées (`relectures_auto.vues`, migration 0294) sont les
plus fraîches connues : celles de TikTok au scrape ou le relevé de l'OS
(`passages.vues`). Vues inconnues : les règles s'appliquent.

Après un changement de seuil, `{ "rejuger": { "jour": "AAAA-MM-JJ" } }` (ou
`{ "rejuger": { "post_ids": [...] } }`) réapplique les règles aux mesures déjà
stockées : défauts, brouillon et remarques sont réécrits sans nouveau scrape ni
nouvelle mesure.

Gemini reformule ensuite le brouillon sur un ton de manager. La reformulation
n'est gardée que si elle cite les mêmes numéros de slide que le brouillon (aucun
quand il dit « some of your slides », qu'elle doit garder), sans chiffre
technique ; sinon le brouillon déterministe part tel quel.

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

## Dans l'OS

`/admin/file-reviews` (« Today's queue »), pour le post en cours :

- l'encadré « Relecture de l'agent » montre les points de la review proposée,
  ceux gardés pour une prochaine review et les notes pour l'admin (jamais
  envoyées) ;
- le bouton **Tester** pré-remplit la review avec celle de l'agent, ses
  remarques-types et leurs vidéos tuto. Si le post n'a pas encore été relu,
  l'agent le relit sur-le-champ (scrape puis mesure, 1 à 2 min) ; s'il l'a été
  cette nuit, la review arrive aussitôt ;
- le bouton **Hier** ouvre la file de la veille, relue pendant la nuit.

L'admin relit, corrige au besoin, puis envoie ou passe. Rien ne part sans lui.
Un brouillon de l'agent envoyé **sans retouche** part mot pour mot (il ne
repasse pas par « Améliorer ») : c'est exactement le message relu sur le banc
d'essai. Un texte retouché ou écrit à la main repasse par l'IA comme avant.

### Côté créateur

Un retour envoyé s'ouvre à la prochaine visite du créateur dans son espace,
comme un petit onboarding (`src/features/reviews/RetourParcours.tsx`) :

1. **son post à côté de l'original** (les lecteurs TikTok, comme dans la file ;
   sur téléphone, un sélecteur « Original / Ton post ») ;
2. **le message et les vidéos tuto**, puis « Compris, merci », qui le marque lu.

Il ne se ferme qu'avec « Compris ». La page **Mes retours**
(`/createur/retours`) liste tous ses retours, lus ou non, et rouvre chacun dans
le même parcours. L'admin voit ce parcours sans rien marquer : dans
`/admin/tests` (« Aperçu d'un retour créateur », sur un vrai retour envoyé) et
sur le banc d'essai (« Voir comme le créateur », sur le brouillon de l'agent).

### Banc d'essai

`/admin/banc-relecture` (« Agent test bench », menu Suivi) : les relectures d'un
jour de publication, lot de test et cron confondus, une à la fois :

- l'original et le post du créateur côte à côte (lecteurs TikTok, comme dans la
  file) ;
- chaque point relevé par l'agent avec **✓ juste / ✗ faux** (et, sur un ✗,
  pourquoi) — ceux qui partiraient dans le message et ceux gardés pour plus tard ;
- **Raté** : un défaut que l'agent n'a pas vu, sa règle et ce qui ne va pas ;
- sans point relevé : **« D'accord, rien à signaler »** ;
- le **message exact** que recevrait le créateur, avec ses vidéos tuto.

En tête : posts jugés, messages proposés, points justes (et le taux), défauts
ratés, et le détail par règle. Les jugements vivent dans `relecture_avis`
(migration 0293), un par point (`cle` = `code|slides`, `aucun`, ou `rate:…`) ;
un point qui disparaît après un `rejuger` ne compte plus. Rien n'est envoyé.

Lancer un lot : `{ "enfiler": { "jour": "AAAA-MM-JJ", "limite": 50, "aleatoire": true } }`,
puis des appels `{}` tant que des lignes sont en cours (crons en pause).

Côté fonction, « Tester » appelle `{ "relire": { "post_id": "…" } }` : le post
entre en file s'il n'y est pas (`origine = 'test'`), et chaque appel avance sa
relecture aussi loin que possible ; le navigateur rappelle tant qu'elle n'est
pas finie.

## Lire les résultats en SQL

Justesse par règle sur le banc :

```sql
select a.code, a.verdict, count(*)
from relecture_avis a join relectures_auto r on r.id = a.relecture_id
where r.jour = '2026-10-15'
group by 1, 2 order by 1, 2;
```

```sql
select r.jour, c.handle_tiktok, r.statut, r.defauts, r.brouillon
from relectures_auto r join comptes c on c.id = r.compte_id
where r.jour = current_date - 1
order by jsonb_array_length(r.defauts) desc;
```

## Suite prévue

1. Étiqueter 100 posts à la main et recalibrer les seuils.
2. Envoi automatique des défauts sûrs, une review par créateur et par jour au plus.
