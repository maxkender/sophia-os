# API du QG : `GET /api/qg/apps`

Lecture seule des chiffres de l'OS par application, pour le QG. Aucune écriture, aucune donnée personnelle
(pas de nom, d'email ni d'identifiant de posteur) : uniquement des agrégats.

## Appel

```
GET https://sophia-marketing-orga.vercel.app/api/qg/apps?from=2026-09-28&to=2026-11-22
x-qg-token: <QG_TOKEN>
```

- Vercel réécrit `/api/qg/*` vers la fonction Edge `qg`
  (`https://mbikecieskoobeizixig.supabase.co/functions/v1/qg/apps`, appelable aussi en direct, même en-tête).
- `x-qg-token` : le secret `QG_TOKEN` (variable d'environnement des fonctions Edge Supabase, 24 caractères au
  moins). Sans secret configuré, toute requête est refusée.
- `from`, `to` : obligatoires, `AAAA-MM-JJ`, jours de Paris, bornes incluses, `from ≤ to`, 190 jours au plus.

| Code | Cas |
|---|---|
| 200 | `{ ok: true, … }` (format ci-dessous) |
| 400 | paramètre manquant ou invalide |
| 401 | jeton absent ou faux |
| 404 | autre route que `apps` |
| 405 | autre méthode que `GET` |
| 500 | lecture impossible |

## Réponse

```json
{
  "ok": true,
  "from": "2026-09-28", "to": "2026-11-22",
  "fuseau": "Europe/Paris", "devise": "USD", "genere_at": "…",
  "applications": [{ "application_id": "…0001", "slug": "sophia", "nom": "Sophia" }],
  "jours":     [{ "jour": "2026-11-22", "application_id": "…", "posts": 175, "vues_total": 3659,
                  "vues_mediane": 154, "vues_mesurees": 14, "pct_10k": 0,
                  "comptes_actifs": 143, "posteurs_actifs": 131, "cout_posteurs_usd": 151.46 }],
  "par_label": [{ "jour": "…", "application_id": "…", "label": "alpha_male", …mêmes champs }],
  "par_pays":  [{ "jour": "…", "application_id": "…", "pays": "FR", …mêmes champs }],
  "controle":  { "posts": 25081, "posts_sans_application": 0, "posteurs_sans_tarif": 0, "cout_total_usd": 21635 }
}
```

Une ligne par (jour, application) dans `jours`, par (jour, application, label) dans `par_label`, par
(jour, application, pays) dans `par_pays`. Seules les combinaisons avec au moins un post sont rendues.

## Définitions

- **Application** : `passages.application_id`, l'application du post (pas celle du compte).
- **Post publié** : un passage au statut `publie`. Son jour : `publie_at` à l'heure de Paris (sinon la date prévue).
  Les reposts (rappels J+7) sont des posts publiés et sont comptés.
- **Vues** : les vues relevées du post à ce jour. `vues_total` = somme ; `vues_mediane` = médiane des posts
  mesurés ; `vues_mesurees` = nombre de posts qui ont un relevé. Les derniers jours ne sont pas mûrs (on juge un
  post à J+2 au plus tôt), donc leurs vues montent encore.
- **`pct_10k`** : part des posts mesurés à 10 000 vues ou plus, en %.
- **`comptes_actifs` / `posteurs_actifs`** : comptes et posteurs distincts qui ont publié au moins un post pour
  cette application ce jour-là (pour ce label ou ce pays dans les découpages). Ne s'additionnent pas entre
  applications : un posteur qui poste pour deux applications compte dans les deux.
- **Label** : `contenu_labels` → `labels.nom` du contenu posté (`(sans label)` sinon).
- **Pays** : `comptes.pays`, le pays du compte qui a posté.
- **Coût des posteurs** (`cout_posteurs_usd`, en dollars) : pour chaque posteur et chaque semaine (lundi →
  dimanche), *tarif de la semaine × nombre de ses comptes qui ont publié cette semaine-là*. Ce coût est réparti à
  parts égales sur ses posts de la semaine, donc entre applications, jours, labels et pays selon la part de ses
  posts. Tarif : Ruul → tarif Ruul du posteur, sinon celui de sa zone (`ruul_tarif`) ; Upwork → tarif de sa zone
  (`zones_paie_pays` → `zones_paie` : A 14 $, B 10 $, C 7 $), sinon `profiles.tarif_hebdo`. C'est une estimation
  au tarif, pas le montant payé (bonus, retenues et paiements manqués ne sont pas pris en compte). Les semaines à
  cheval sur `from` ou `to` sont comptées en entier puis réparties : seuls les jours demandés sont rendus.
  Les trois découpages donnent le même total (aux arrondis près).

## Mise en œuvre

- `supabase/migrations/0834_qg_apps.sql` : la fonction `qg_apps(from, to)`, réservée au service (`service_role`).
- `supabase/functions/qg/index.ts` + `_shared/qg.ts` (paramètres, jeton en temps constant, tests `qg_test.ts`).
- `vercel.json` : la réécriture `/api/qg/:path*`.

## Test (22/11, 8 semaines du 28/09 au 22/11)

1,2 s côté base, environ 0,9 Mo de JSON : 25 081 posts, 134 lignes par jour, 817 par label, 2 629 par pays,
0 post sans application, 0 posteur sans tarif ; coût total 21 635 $, identique dans les trois découpages.
