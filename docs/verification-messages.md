# Comment l'OS vérifie avant d'écrire à une recrue (prompt 25 MAJ, point 6)

Mesuré sur la prod le 29/10/2026 au soir, sur la cohorte du 2 novembre
(109 recrues actives, hors RUUL). Rien n'a été envoyé pour ce rapport.

## 1. Les règles, message par message

| Message | Part quand | Données lues |
|---|---|---|
| Welcome (accueil) | offre acceptée sur Upwork ; une seule fois | contrat Upwork (`upwork_contrats`), offre acceptée, profil créé (`accueils`) |
| Relance du jour | 1 par jour au plus, 10 h-20 h heure du pays, seulement ce qui manque ; Slack si la recrue y est, Upwork 24 h après sans réaction, 5 sur Upwork au plus | les 7 étapes ci-dessous (`etapes_recrues_v2`) |
| « We can't find your TikTok account » | Start warmup cliqué et le @ introuvable deux relevés de suite (12 h après le clic) | `ckd_warmup_releves` |
| Lundi 10 h | une fois par posteur, la nouvelle cohorte reçoit en plus « ce qui manque » | les mêmes étapes |
| Lundi 20 h | 1er jour de posts, aucun post avec lien à 20 h (heure du pays), Upwork | `passages.publie_url` du lundi |

Chaque message est revérifié au moment de partir (étape faite entre-temps,
réponse reçue, déjà un message de la même famille aujourd'hui) et garde sa
raison et les données utilisées (Logs, carte Onboarding).

## 2. Les données, étape par étape

| Étape | Source | Mise à jour | Ce qui peut la fausser |
|---|---|---|---|
| 0. Sur Slack | `profiles.slack_user_id` (relié par e-mail, sinon par nom complet unique, ou par le lien du bot / Connect my Slack) | à l'arrivée (team_join) et une fois par jour | un nom porté par un autre membre ; une recrue qui rejoint avec un autre e-mail et un autre nom |
| 1. Connecté | `auth.users.last_sign_in_at` → `profiles.premiere_connexion_at` | à chaque passage de recrues-check (15 min) | **corrigé cette nuit** : ne se mettait à jour que si `relances_auto` n'était pas sur Off |
| 2. Compte TikTok trouvé | `ckd_warmup_releves.existe` (page publique TikTok) | relevé planifié + relu avant chaque relance ; 2 lectures si la page est illisible | le @ tapé autrement que celui de l'OS (variantes cherchées, @ demandé au Start warmup) ; une page TikTok bloquée (jamais « n'existe pas ») |
| 3. Start warmup | `comptes.warmup_started_at` (le clic) | immédiat | rien (le clic lui-même) |
| 4. Abonnements | `ckd_warmup_releves.abonnements` | idem 2 ; une relance sur le compte n'utilise qu'un relevé de moins de 12 h | un compte privé ou bloqué ; un relevé trop vieux (règle des 12 h) |
| Warm-up fini | `compte_pret()` : trouvé + Start warmup + ≥ 5 abonnements + aucune vidéo, ou capture « Warm-up done » validée | à chaque lecture | relevés illisibles après le clic (d'où la capture) |
| Posts avec lien | `passages.publie_url` collé le jour même ; retrouvé sur le profil (`resolution_statut`) | 5 min à 2 h 55 après le collage | un lien d'un autre compte, un post supprimé ou privé |

## 3. Simulation sur la cohorte du 2 novembre (aperçu « Preview », rien d'envoyé)

- **Relance du jour (29/10)** : 53 recrues. Exemples réels (données utilisées) :
  - Recrue 1 — slack + follows (connectée le 26/10, Start warmup le 26/10, @ trouvé, 2 abonnements) → Upwork ;
  - Recrue 2 — connexion (jamais connectée, vérifié dans `auth.users`) → Slack ;
  - Recrue 3 — slack (connectée le 28/10) → Upwork ;
  - Recrue 4 — slack + compte TikTok (pas de Start warmup) → Upwork ;
  - Recrue 5 — slack + follows (@ trouvé, 0 abonnement, relu en direct : 0) → Upwork ;
  - Recrue 6 — slack → Upwork ;
  - Recrue 7 — slack + connexion (jamais connecté, vérifié) → Upwork ;
  - Recrue 8 — follows (2 abonnements) → Slack ;
  - Recrue 9 — slack + connexion, **contrat non relié** : aucun canal, rien ne part ;
  - Recrue 10 — slack + follows (0 abonnement) → Upwork.
- **Lundi 10 h** : 109 messages (toute la cohorte), dont « ce qui manque » : vérifier le @ (introuvable), suivre N comptes, se connecter, créer le compte.
- **Lundi 20 h** : 107 recrues avec un contrat relié ; le message ne part qu'à celles sans post avec lien à 20 h.

## 4. Vérifié à la main (10 cas, et plus)

- **Compte TikTok** : 10 @ relus en direct le 29/10 à 23 h (5 trouvés, 5 introuvables après Start warmup) : **10/10 identiques** au dernier relevé de l'OS (mêmes abonnements : 0, 0, 10, 20, 13).
- **Connecté** : 3 recrues qui recevraient « log in » (recrues 2, 7 et 9) : **jamais connectées** dans `auth.users` (juste).
- **Slack (relié par le nom)** : 12 cas : l'e-mail Slack reprend le nom dans 11 cas ; 1 cas pas vérifiable par l'e-mail.

## 5. Taux d'erreur par étape, et ce qui est fait

| Étape | Erreurs mesurées | Taux | Au-dessus de 5 % ? |
|---|---|---|---|
| Connecté | 13 recrues connectées vues « pas connectées » (67 vs 80) | 12 % | **oui** — cause : la mise à jour ne tournait que si `relances_auto` ≠ Off. Corrigé (PR de cette nuit) : relue à chaque passage, même sur Off, sans rien envoyer. À recompter après le déploiement. |
| Sur Slack | 1 liaison par nom sur 12 pas vérifiable ; 39 des 53 recrues reliées le sont par le nom | ≤ 8 % (estimé) | **à la limite** — la liaison par nom reste un pari sur l'homonymie. Correctif livré (E2) : lien personnel par DM du bot et « Connect my Slack » ; à activer (interrupteur « Slack : DM de liaison », et secrets Slack pour Connect). |
| Compte TikTok trouvé | 0 page illisible sur 446 relevés ; 10/10 à la main | 0 % | non |
| Start warmup | clic direct | 0 % | non |
| Abonnements | 0 relevé de plus de 12 h ; 5/5 identiques à la main | 0 % | non |
| Warm-up fini | dérivé des deux précédents | 0 % mesuré | non |
| Posts avec lien (semaine du 26/10) | 54 introuvables + 56 liens d'un autre @ sur 1 743 | 3,1 % + 3,2 % | non chacun ; ensemble 6 % → message « This link is from @x, not your account @y » sur la page du post (E2) et message « post introuvable » (interrupteur, off) |

Remarques :
- 11 recrues ont cliqué Start warmup avec un @ introuvable : la recherche des @ proches
  ne tournait pas non plus sur Off ; corrigée avec la connexion (même PR).
- **À décider** : sur Off, `relances_auto` bloque aussi le message du lundi 10 h et le
  check de 20 h (leurs interrupteurs sont sur On). Le code s'arrête avant eux. À corriger
  si chaque interrupteur doit compter seul.
