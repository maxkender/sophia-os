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

## Où c'est dans le code

- `src/features/moteur/resolutionPublication.ts` — logique pure : cadence,
  lecture des liens, corroboration, appariement (testé dans
  `resolutionPublication.test.ts`)
- `supabase/functions/_shared/resolution_publication.ts` — copie Deno + le run
- `supabase/functions/resolution-publication/index.ts` — le drain
- `supabase/migrations/0242_resolution_publication.sql` — colonnes, trigger,
  amorçage 48 h, cron

## Ce qui reste

- **Valider le lien au collage**, côté UI : l'oEmbed TikTok
  (`https://www.tiktok.com/oembed?url=…`, déjà utilisé par `resoudre-tiktok`)
  dit gratuitement si une URL est un vrai post. Refuser un lien de profil sur
  place éviterait d'avoir à le rattraper.
- **Rattraper l'historique** : les 325 posts déjà publiés sans mesure. Même
  appariement, mais il faut scraper profond dans le profil, et TikTok ne garde
  que ce qui est encore en ligne.
- **Remonter les `introuvable`** dans l'admin — aujourd'hui l'information est en
  base, personne ne la voit.
