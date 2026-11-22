# API du QG

Lecture seule, pour le QG. Aucune écriture, nulle part. Quatre routes, le même en-tête `x-qg-token` :

| Route | Contenu |
|---|---|
| `GET /api/qg/apps?from&to` | les chiffres par application et par jour (agrégats, aucune donnée personnelle) |
| `GET /api/qg/control/recrutement?cohorte=AAAA-MM-JJ` | l'entonnoir d'une cohorte, Ruul et Upwork, les bloqués nommément, la santé des canaux |
| `GET /api/qg/control/paie?semaine=AAAA-MM-JJ` | la paie d'une semaine posteur par posteur (attendu, payé, écart) et les plaintes de paie des 7 derniers jours |
| `GET /api/qg/control/autres` | kills non finis, incidents et tickets, support en retard, bots et crons, posts du jour, comptes introuvables ou en shadowban probable |

Les routes `control/*` sont nominatives (noms des posteurs, `poster_id`) : elles sont faites pour le contrôle par le
QG et ne doivent pas être affichées publiquement.

## `GET /api/qg/apps`

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

## `GET /api/qg/control/recrutement?cohorte=AAAA-MM-JJ`

`cohorte` : le lundi de démarrage de la cohorte (obligatoire, un lundi). Réponse :

```json
{
  "ok": true, "cohorte": "2026-11-16",
  "objectifs": [{ "pays": "FR", "nombre": 10 }],
  "totaux": { "upwork": 130, "ruul": 211 },
  "etapes": { "upwork": ["offre_acceptee", "…"], "ruul": ["candidature", "…"] },
  "entonnoir": { "upwork": [{ "etape": "offre_acceptee", "n": 130 }, …], "ruul": […] },
  "par_pays":  { "upwork": [{ "pays": "FR", "recrues": 12, "etapes": { "connexion": 9, … } }], "ruul": […] },
  "par_hm":    { "upwork": [{ "hm": "…", "recrues": 30, "etapes": { … } }], "ruul": […] },
  "bloques":   { "upwork": { "connexion": [{ "nom", "pays", "hm", "poster_id", "contrat_id", "site_id", "etapes" }] }, "ruul": { … } },
  "arretes":   [{ "canal", "nom", "pays", "hm", "poster_id", "raison": "stop | inactif", "derniere_etape_manquante" }],
  "sante_canaux": {
    "emails":   { "envoyes", "livres", "refuses", "ouverts", "en_attente", "refus_detail": [ … ] },
    "whatsapp": { "disponible": false, "note": "…" },
    "relances": { "upwork_slack": { "statut/canal": n }, "ruul_emails": { "envoyees", "en_erreur" } },
    "nudges":   { "os": { "envoyes", "reussis", "en_echec", "echecs": [ … ] }, "ruul": { "envoyes", "reussis", "en_echec" } }
  }
}
```

- **Upwork** : chaque offre acceptée de la cohorte (`accueils`, compte Vik Studios, hors doublons et hors autre
  activité), plus les posteurs Upwork de la cohorte sans offre reliée. Étapes : `offre_acceptee` → `profil_os` →
  `connexion` (1re connexion au dashboard) → `slack` (relié) → `compte_tiktok` (le @ existe sur TikTok) → `warmup`
  (« Start warm-up » pressé) → `abonnements_5` (5 abonnements au moins) → `premier_post` (au moins un post publié la
  1re semaine).
- **Ruul (site)** : chaque candidature acceptée dont la cohorte est ce lundi (`ruul_cohortes`). Étapes :
  `candidature` → `acceptee` → `signee` → `profil_os` → `ajoute_ruul` → `pret_ruul` (prêt à être payé) → `connexion`
  → `slack` → `compte_tiktok` → `warmup` → `abonnements_5` → `premier_post` → `premiere_paie`.
- `entonnoir`, `par_pays`, `par_hm` comptent les recrues qui ont franchi chaque étape (une étape peut être franchie
  sans la précédente, par exemple un posteur Ruul qui poste sans être encore prêt sur Ruul).
- `bloques` : pour chaque étape, les recrues actives (ni arrêtées, ni STOP) dont c'est la **première étape
  manquante** dans l'ordre ci-dessus, avec le détail de toutes leurs étapes (date ou valeur ; `null` = pas faite).
- `arretes` : les recrues désactivées ou qui ont demandé l'arrêt.
- `sante_canaux` porte sur les recrues de la cohorte :
  - `emails` : les emails envoyés à leurs adresses (OS, Ruul, perso, candidature, offre) depuis 4 semaines avant la
    cohorte. `livres` = livrés, `refuses` = refusés (rebond, blocage), `ouverts` = dernier événement « opened », « clicks »
    ou « loadedByProxy » (Brevo ne garde que le dernier événement : c'est un minimum).
  - `whatsapp` : l'OS n'envoie rien par WhatsApp (aucun canal, aucun journal) : toujours `disponible: false`.
  - `relances` : les relances d'étape Upwork/Slack (`relances_prevues`, par statut et canal) et les relances
    email Ruul (`ruul_email_relances`, celles en erreur à part).
  - `nudges` : les nudges de l'OS depuis 4 semaines avant la cohorte (réussis = sans erreur de canal ; le détail des
    échecs) et les nudges Ruul.

## `GET /api/qg/control/paie?semaine=AAAA-MM-JJ`

`semaine` : le lundi de la **semaine travaillée** (lundi → dimanche), payée le lundi suivant (`paye_le`). Réponse :

```json
{
  "ok": true, "semaine": "2026-11-09", "paye_le": "2026-11-16", "devise": "USD",
  "posteurs": [{
    "poster_id": "…", "nom": "…", "canal": "upwork | ruul", "pays": "FR",
    "attendu": {
      "posts_prevus": 14, "posts_faits": 13, "tarif": 10, "comptes": 1, "comptes_payes": 1, "doublement": false,
      "retenue": 0, "montant_regle": 10, "statut_regle": "ok", "raison_regle": null, "action": "payer",
      "montant_decide": 10, "exclu": false, "correction": null,
      "bonus": 5, "comment_master": 0, "bonus_detail": [ … ],
      "jours_panne": [{ "jour": "2026-11-20", "raison": "…" }], "absences": [ … ], "kill": [ … ], "kill_sans_paie": null,
      "total": 15
    },
    "paye": { "total": 15, "upwork_paiements": [ … ], "upwork_jalons": [ … ], "bonus_payes": 5, "ruul_lignes": [ … ] },
    "ecart": 0
  }],
  "totaux": { "posteurs", "attendu", "paye", "ecart", "avec_ecart" },
  "plaintes_7j": [{ "id", "poster_id", "nom", "source", "statut", "niveau", "categorie", "le", "texte",
                    "paie_semaine": { "attendu", "paye", "ecart" } }]
}
```

- **Attendu** : `montant_regle` est le calcul de la règle de paie de l'OS pour cette semaine (`paie_calculer_v3`,
  le même que la liste de paie : posts prévus et faits, tarif, comptes payés, retenue). `montant_decide` est ce qui a
  été arrêté : la ligne de paie enregistrée (corrigée à la main le cas échéant) pour Upwork, les lignes du lot Ruul
  non annulées pour Ruul. `doublement` = plus d'un compte payé. `bonus` = les bonus payés le lundi `paye_le` (non
  retirés), dont `comment_master`. `jours_panne` = les jours comptés comme faits (panne), `absences` = les absences
  déclarées qui touchent la semaine, `kill` = les arrêts de la semaine, `kill_sans_paie` = un kill sans paie décidé
  pour la semaine. `total` = 0 si kill sans paie, sinon `montant_decide` (à défaut `montant_regle`) + `bonus`.
- **Payé** : Upwork = les paiements par l'API (`paie_paiements_api`, statut `paye` ou `deja_payee`, montant
  approuvé) + les bonus payés ; on y joint les jalons de la semaine. Ruul = les lignes du lot payées (montant +
  bonus), avec leur statut chez Ruul.
- **`ecart`** = payé − attendu (négatif : il manque de l'argent au posteur ; positif : trop payé).
- **`plaintes_7j`** : les demandes de support des 7 derniers jours (Upwork, email, Help, Slack) sur la paie
  (catégorie paie, ou Ruul/Upwork/autre qui parle de paiement), rapprochées du posteur et de sa paie pour la semaine
  demandée.

## `GET /api/qg/control/autres`

Sans paramètre. Réponse : `jour` (Paris) et

| Clé | Contenu |
|---|---|
| `kills_non_finis.arrets` | arrêts non annulés pas encore au statut `fait` (étapes et erreur) |
| `kills_non_finis.kills_auto` | kills automatiques détectés, ni partis ni annulés |
| `kills_non_finis.controle` | les incohérences relevées par `kills_controle` (killé mais encore dans Slack, contrat encore ouvert…) |
| `incidents` | incidents support ouverts (titre, catégorie, nombre de posteurs, ticket) |
| `tickets_ouverts` | demandes avec un ticket technique pas encore réglé |
| `support_en_retard` | demandes ouvertes depuis plus de 24 h et 48 h, par niveau, et les 30 plus anciennes |
| `bots` | la santé des automatisations (`auto_sante` : chaque tâche, dernier passage, en erreur, en retard ; Upwork) |
| `crons` | nombre de crons actifs, crons en échec sur 24 h (avec le dernier message), dernier passage de chaque cron parmi les 100 000 derniers passages (`dernier: null` = pas de passage récent, normal pour un cron hebdomadaire) |
| `posts_du_jour` | les posts prévus aujourd'hui par statut, et les comptes actifs qui avaient des posts prévus dans les 7 derniers jours mais aucun aujourd'hui |
| `comptes_introuvables` | les @ TikTok introuvables (`handles_introuvables`) |
| `shadowban_probable` | les comptes repérés en shadowban probable, pas encore recréés (`ckd_shadowban`) |

## Mise en œuvre

- `supabase/migrations/0834_qg_apps.sql` : la fonction `qg_apps(from, to)`, réservée au service (`service_role`).
- `supabase/migrations/0837_qg_controles.sql` : `qg_recrutement(cohorte)`, `qg_paie(semaine)`, `qg_autres()`, réservées
  au service. Elles réutilisent les fonctions de l'OS (`cohorte_recrues`, `ruul_cohortes`, `paie_calculer_v3`,
  `auto_sante`, `kills_controle`, `handles_introuvables`), réservées à l'admin : `qg_comme_admin()` pose l'identité
  d'un admin pour la seule transaction en cours (`set_config` local, rien n'est écrit).
- `supabase/functions/qg/index.ts` + `_shared/qg.ts` (routes, paramètres, jeton en temps constant, tests `qg_test.ts`).
- `vercel.json` : la réécriture `/api/qg/:path*`.

## Tests (22/11)

**`apps`, 8 semaines du 28/09 au 22/11**

1,2 s côté base, environ 0,9 Mo de JSON : 25 081 posts, 134 lignes par jour, 817 par label, 2 629 par pays,
0 post sans application, 0 posteur sans tarif ; coût total 21 635 $, identique dans les trois découpages.

**`control/recrutement`, cohorte du 16/11** : 130 recrues Upwork, 211 Ruul ; 856 emails (728 livrés, 127 refusés,
168 ouverts) ; 262 nudges OS (95 en échec) ; 225 Ko.

**`control/paie`, semaine du 9/11** : 469 posteurs, attendu 3 889,50 $, payé 3 751 $, 18 posteurs avec un écart
(−138,50 $) ; 39 plaintes de paie sur 7 jours ; 323 Ko.

**`control/autres`, 22/11** : 46 incohérences de kill, 22 incidents ouverts, 1 ticket, 15 demandes ouvertes depuis
plus de 24 h (8 depuis plus de 48 h), 136 crons (aucun en échec sur 24 h), 13 comptes sans post aujourd'hui,
3 @ introuvables, 15 shadowbans probables ; 77 Ko.
