# Résolution des publications

Retrouver le post TikTok derrière un créneau que le créateur a déclaré publié.

## Le problème

Tout le relevé de vues tient sur `passages.publie_url`, le lien que le créateur
colle à la main après avoir posté. L'UI exige un lien non vide — rien de plus.
Résultat en prod, avant ce mécanisme :

- trois comptes ont publié **158 fois** en collant l'URL de leur **profil**
  (`https://www.tiktok.com/@pseudo?_r=1&_t=…`), sans jamais un seul ID de post ;
- `ava.mindset178` : 10 créneaux sur 10 publiés, **0 vue relevée**, classé
  PASSABLE faute de données ;
- 325 posts publiés sur 30 jours (11 %) sans la moindre mesure.

Le filet de sécurité existant — retrouver le post par similarité de texte —
n'attrapait rien : **0 match** sur 24 h de logs. Normal, il compare le texte des
slides (`texte_overlay`) à la légende du TikTok. Deux textes sans rapport.

## Le mécanisme

Le créateur coche « publié » → le trigger `passages_file_resolution` met le
créneau en file. Un drain (`resolution-publication`, cron à la minute) le reprend
et cherche le post, en deux étages du moins cher au plus cher.

**1. Le lien du créateur**, quand il est exploitable — gratuit :

- il porte déjà `/photo/<id>` ou `/video/<id>` → on le canonise et c'est fini ;
- c'est un lien court du bouton « Partager » (`vm.` / `vt.` / `tiktok.com/t/`)
  → une redirection suivie donne l'ID.

Le lien est refusé s'il pointe vers **un autre compte**, ou vers un post **déjà
attaché** à un autre créneau — c'est exactement le cas du même lien recollé
chaque jour.

**2. Le profil TikTok** pour le reste : un scrape Apify par compte, puis
appariement de tous ses créneaux en attente.

## L'appariement

L'ancrage est **temporel**, pas textuel : le post que le créateur vient de
publier est le dernier de son profil.

Les créneaux sont triés par heure de déclaration, les posts par heure de
publication, et on apparie dans l'ordre — le premier coché prend le plus ancien
post éligible. Trois garde-fous :

| Garde-fou | Effet |
| --- | --- |
| **Unicité** | un post déjà attaché à un créneau n'est jamais réattribué |
| **Fenêtre** | le post doit dater de moins de 24 h avant le clic (15 min de tolérance après, l'horodatage TikTok peut être en avance) |
| **Nombre d'images** | un deck de 6 slides ne peut pas être un post de 3 → veto |

Les **hashtags** et le **son** ne font que confirmer, ils n'opposent pas de veto :
un créateur réécrit souvent sa légende et change parfois le son, un désaccord ne
prouve donc rien. Les signaux qui ont corroboré sont écrits dans
`resolution_detail`, pour que l'admin sache sur quoi l'appariement tient.

## La cadence

```
coché « publié »  →  +5 min  →  +10 min  →  +20 min  →  +2 h  →  introuvable
```

TikTok met de quelques secondes à quelques minutes à exposer un post neuf, et un
créateur peut cocher avant d'avoir posté. Les deux premières tentatives couvrent
le cas normal, les deux dernières un retard franc.

Au bout (≈ 2 h 55), le créneau passe **`introuvable`**. C'est un signal, pas une
panne : un créneau coché sans publication ressemble exactement à ça. C'est ce qui
transforme « posté » de **déclaré** en **vérifié** — jusqu'ici `classement_comptes_etat`
comptait des cases cochées, sans rien vérifier.

## Coût

Un créneau dont le lien est bon ne coûte **aucun** appel Apify : une redirection
HTTP au pire. Le scrape de profil n'arrive que sur les liens inexploitables, et
sert **tous** les créneaux en attente du compte d'un coup.

Le drain traite au plus 4 comptes par passage — un scrape de profil prend
plusieurs secondes, au-delà le run frôle le plafond Edge. À la minute, ça fait
240 comptes/heure, très au-dessus du débit réel (~100 publications/jour).

## Schéma

`passages` : `resolution_statut` (`a_resoudre` / `resolu` / `introuvable`),
`resolution_tentatives`, `resolution_prochaine_at`, `resolution_at`,
`resolution_detail`

Index partiel `passages_file_resolution_idx` sur `resolution_prochaine_at`, pour
la lecture de file.

## L'autre moitié : publier sans le déclarer

Tout ce qui précède part du clic du créateur. Un créateur qui publie **sans
jamais cocher** n'entrait donc dans aucune file : rien à résoudre, rien à
relever — ses créneaux restaient à 0 publié quoi qu'il fasse sur TikTok.

Le relevé de vues du soir (`metriques`, cron `metriques-soir`) scrape déjà le
profil de chaque compte, dates de publication comprises, et n'en gardait que les
sommes. Il apparie maintenant aussi les créneaux jamais déclarés
(`rattraperCreneauxNonDeclares`) : **aucun appel Apify de plus**.

L'ancrage n'est plus le clic — il n'y en a pas — mais le **jour prévu** : un post
publié le jour J remplit le créneau prévu le jour J, même jour calendaire Paris.
Les garde-fous ne bougent pas : unicité du post, veto sur le nombre d'images,
ordre chronologique des deux côtés.

Le créneau rattrapé est marqué `publication_non_declaree`. Il compte comme publié
partout — classement, stats, file de review — et la file de surveillance affiche
« 4 publié(s) sans être déclaré(s) », de quoi rappeler au créateur de cocher.

## Ce que le classement compte

`classement_comptes_etat` comptait `publie_at is not null` : une case cochée.
Elle compte maintenant les publications que TikTok n'a **pas démenties** —
`resolution_statut = 'introuvable'` sort du numérateur. Les deux erreurs
symétriques disparaissent :

| Cas | Avant | Après |
| --- | --- | --- |
| publie sans cocher | 0/8 → INACTIF | 4/8, « 4 non déclaré(s) » |
| coche sans publier | 7/7 → BIEN | 2/7, « 5 coché(s) sans publication » |

## Un profil, un compte

`comptes.handle_tiktok` n'a jamais porté de contrainte d'unicité, contrairement
à `comptes_reference.handle_tiktok`. Vu en prod : **deux comptes actifs, deux
créateurs différents** (`poster_id` distincts, personas « Sofia Ionescu » et
« Sofia Marin »), le même `@sofia.intelepciune718`. Le compte qui ne publiait
pas affichait **13 800 vues et 1 100 likes** — ceux du profil du voisin — pour
**0 post publié**, ce qui ressemble à s'y méprendre à un bug de suivi. C'en
était un, mais dans les données, pas dans le tracking : son classement INACTIF
était juste, ses vues ne l'étaient pas.

Trois conséquences, corrigées :

- **l'appariement** mettait les créneaux des deux comptes en concurrence sur les
  mêmes posts sans le savoir : `pris` se calculait par compte. Il se calcule
  maintenant par **profil** (`comptesDuMemeHandle`), sinon le rattrapage des
  non-déclarés aurait recopié les 4 posts réels du profil sur les 8 créneaux
  vides du jumeau — le faux positif exact qu'il doit éviter ;
- **l'analytics** compte deux fois le même profil (`compte_metrics` est écrit
  pour chaque compte) ;
- **l'index d'unicité** (`0246`) empêche la situation de se reproduire. Il ne
  peut pas être posé tant qu'un doublon existe : la migration le tente, et
  sinon nomme les profils à nettoyer sans toucher aux données.

La file de surveillance affiche un badge **« Profil TikTok partagé »** sur les
comptes concernés, calculé sur la liste déjà chargée — aucune requête de plus.

## Ce qui reste

- **Valider le lien au collage**, côté UI : l'oEmbed TikTok
  (`https://www.tiktok.com/oembed?url=…`, déjà utilisé par `resoudre-tiktok`)
  dit gratuitement si une URL est un vrai post. Refuser un lien de profil sur
  place éviterait d'avoir à le rattraper.
- **Rattraper l'historique profond** : le rattrapage remonte à 7 jours par
  défaut (`{ jours }` sur `metriques` pour ouvrir la fenêtre), et le scrape ne
  voit que les 30 derniers posts encore en ligne.
- **Remonter les `introuvable`** dans l'admin — l'information est en base, et la
  règle du classement la cite, mais il n'y a pas d'écran pour les lister.

## Où c'est dans le code

- `src/features/moteur/resolutionPublication.ts` — logique pure : cadence,
  lecture des liens, corroboration, appariement (testé dans
  `resolutionPublication.test.ts`)
- `supabase/functions/_shared/resolution_publication.ts` — copie Deno + le run,
  et `rattraperCreneauxNonDeclares` (le profil comme source de vérité)
- `supabase/functions/resolution-publication/index.ts` — le drain
- `supabase/functions/metriques/index.ts` — relevé du soir, qui appelle le
  rattrapage avec le profil qu'il vient de scraper
- `supabase/migrations/0242_resolution_publication.sql` — colonnes, trigger,
  amorçage 48 h, cron
- `supabase/migrations/0245_publications_non_declarees.sql` —
  `publication_non_declaree`, garde-fou du trigger, et le classement qui cesse
  de compter les créneaux démentis
- `supabase/migrations/0246_handle_tiktok_unique.sql` — unicité du pseudo TikTok
  sur les comptes actifs (posée seulement si aucun doublon ne subsiste)
