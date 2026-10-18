# Guichet du site → OS (`hub-posteurs`)

Le site **Sophia Culture Hub** (projet Lovable) recrute les posters slideshow :
formulaire public, acceptation à la main dans *Hub › Slideshows › Poster
applications*, contrat signé en ligne. Dès la signature, il appelle la fonction
Edge `hub-posteurs` pour créer le poster dans l'OS, puis lui envoie ses
identifiants par email. Ce document décrit le contrat entre les deux.

## Ce que fait l'OS à la création

`creer_posteur` crée le poster par **le même chemin que l'admin**
(`manage-users`, action `create`, appelée avec `x-cron-secret`) :

- login `prenom+initiale@sophia.com` ; s'il est déjà pris, manage-users
  ajoute un numéro (`anab@`, puis `anab1@`, `anab2@`…) et le site envoie le
  login renvoyé par l'OS ;
- premier compte perso, labels, persona, référence — comme une création admin ;
- **langue de publication = langue du pays** (`LANGUE_PAR_PAYS`), pas la langue
  des emails choisie sur le formulaire ;
- **pays du compte** : envoyé à manage-users seulement quand la langue ne
  désigne pas un seul marché (en, ar, ru…), comme le front
  (`paysAEnvoyer`) ; sinon le trigger `comptes_pays_defaut` le déduit ;
- applications : Sophia seule = chemin historique ; UnSwipe seule =
  `{ unswipe: 100 }` ; les deux = `{ sophia: 50, unswipe: 50 }` ;
- **ouverture du pays et langue = le HM** dont `profiles.zone_recrutement`
  couvre le pays et qui gère la langue (`profiles.langues`) ; sans lui, le pays
  est fermé ;
- **rattachement = la cohorte Ruul** (décision du 17/10) : les posters du site
  n'ont pas de HM. `profiles.manager_id` pointe vers le profil « RUUL cohort »,
  dont l'id est dans le réglage `hub_posteurs` (`{"cohorte_ruul_id": …}`).
  Sans ce réglage, retour au HM de la zone (le moins chargé s'il y en a
  plusieurs). Payés chaque semaine par Ruul, suivis dans le salon Slack privé
  de la cohorte (#ruul-questions ; ils rejoignent aussi #welcome). Le lien
  d'invitation ne fait entrer que dans le workspace : la fonction
  `hub-slack-cohorte` (cron toutes les 15 min, migration 0304) retrouve le
  poster par son email perso et l'invite dans le salon (bot Slack, secret
  `SLACK_BOT_TOKEN2`, scopes `users:read`, `users:read.email`, `groups:write`,
  bot membre du salon ; `hub_posteurs.slack_ajoute_le` une fois fait). Leur accueil remplace les
  écrans Slack et Payments
  (`hub_ma_cohorte()`, migration 0297). L'écran Payments demande aussi le
  prénom et le nom de la pièce d'identité, obligatoires pour l'ajouter dans
  Ruul (« Next » verrouillé tant qu'ils ne sont pas enregistrés) : stockés dans
  `hub_posteurs.prenom_legal` / `nom_legal` (`hub_enregistrer_identite()`,
  migration 0298), lus par le site avec l'action `identites` (`hub_ids`).
  Le HM de la zone du pays est retenu (`hub_posteurs.hm_zone_id`, migration
  0299) : la page Posters range le poster dans cette zone, sous un bloc
  « RUUL cohort » à côté du HM, avec un filtre « cohorte RUUL seulement » ;
- mot de passe `12345678`, comme tous les comptes OS créés par l'admin, sans
  changement imposé ;
- le warm-up n'est **pas** lancé : le poster le démarre lui-même dans l'OS ;
- **lundi fixe** : le site envoie le lundi de démarrage (`start_monday`,
  gardé dans `hub_posteurs.debut_le`). Un warm-up lancé plus tôt se termine
  ce lundi à 00:00 (Paris), pas avant — trigger `comptes_warmup_jusqu_au_lundi_hub`
  de 0296. Premiers posts et paie partent donc du même lundi. Le « skip
  warmup » de l'admin reste immédiat.

Refus (le site les affiche sur la fiche, sans réessayer) :

| Code | Sens |
|---|---|
| `zone_non_ouverte` (422) | Aucun HM ne couvre le pays : zone pas encore dans l'OS. |
| `langue_non_geree` (422) | Un HM couvre le pays mais pas sa langue (ex. Danemark → `da`). Ajouter la langue au HM. |
| `pays_inconnu` (422) | Pays illisible. |
| `creation_refusee : …` (422) | manage-users a refusé (ex. pas de label pour l'application). |
| `creation_en_cours` (409) | Un appel précédent est en route ; réessayer après 5 min. |

Idempotence : `hub_posteurs.hub_id` = id de la candidature côté site. Un rejeu
ne recrée rien et renvoie `existed: true` ; si le poster ne s'est jamais
connecté, son mot de passe est remis à `12345678` et renvoyé (sinon
`password: null`, `deja_connecte: true` — le site ne renvoie alors pas
d'identifiants).

## Contrat

`POST {SUPABASE_URL}/functions/v1/hub-posteurs`, en-tête `x-hub-secret`.

| Action | Entrée | Sortie |
|---|---|---|
| `ping` | — | `{ ok, version }` |
| `zones` | — | `{ ok, ouverts: [{ pays_code, langue, hm_id }], fermes: [{ pays_code, raison, langue }], inconnus }` |
| `creer_posteur` | `hub_id, prenom, nom, email_perso, pays_code, pays_nom, applications, start_monday` (le reste est ignoré) | `{ ok, existed, profile_id, compte_id, email_os, password, langue, manager: { id, prenom, nom, email } }` |
| `posts_semaine` | `profile_ids` (≤ 500), `lundi` | `{ ok, rows: [{ profile_id, prevus, publies, manques, dernier_post_at, is_active }] }` |
| `stats_pays` | — | `{ ok, by_langue: [{ langue, actifs }] }` |

`posts_semaine` (RPC `hub_posts_semaine`) : prévus = passages planifiés de la
semaine hors brouillon et hors rappels ; manqués = planifiés avant aujourd'hui
(Paris) et non publiés ; `is_active` = profil actif et un compte perso actif
sorti du warm-up.

## Mise en service

1. **Migration** `0296_hub_posteurs.sql` : à passer à la main (SQL Editor ou
   MCP), comme les autres — jamais `supabase db push`.
2. **Secret** `OS_HUB_SECRET` : une longue valeur aléatoire, posée **à
   l'identique** dans les secrets des fonctions Supabase de l'OS et dans
   Lovable (*Settings → Secrets*). `CRON_SECRET` doit exister (déjà le cas).
3. **Déploiement** : le merge sur `main` déploie `hub-posteurs` (nouvelle
   fonction). `verify_jwt = false` vient de `supabase/config.toml`.
4. **Côté site** : rebrancher le pont (`osConfigured()`), appeler
   `createPosterInOs` à la signature, griser « Accepter » pour un pays absent de
   `zones.ouverts`, n'envoyer les identifiants que si `password` n'est pas
   nul, envoyer le lien de paiement dans la foulée, renseigner le lien Slack et
   le guide du posteur.

## Suite prévue

- **Slack** : fait pour la cohorte Ruul (`hub-slack-cohorte`, voir plus haut).
  L'API Slack ne permet pas d'inviter dans un workspace hors offre Enterprise :
  le lien d'invitation reste dans l'email, et il expire au bout de 30 jours.
