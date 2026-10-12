# Guichet du site → OS (`hub-posteurs`)

Le site **Sophia Culture Hub** (projet Lovable) recrute les posters slideshow :
formulaire public, acceptation à la main dans *Hub › Slideshows › Poster
applications*, contrat signé en ligne. Dès la signature, il appelle la fonction
Edge `hub-posteurs` pour créer le poster dans l'OS, puis lui envoie ses
identifiants par email. Ce document décrit le contrat entre les deux.

## Ce que fait l'OS à la création

`creer_posteur` crée le poster par **le même chemin que l'admin**
(`manage-users`, action `create`, appelée avec `x-cron-secret`) :

- login `prenom+initiale@sophia.com` (collision gérée par manage-users) ;
- premier compte perso, labels, persona, référence — comme une création admin ;
- **langue de publication = langue du pays** (`LANGUE_PAR_PAYS`), pas la langue
  des emails choisie sur le formulaire ;
- applications : Sophia seule = chemin historique ; UnSwipe seule =
  `{ unswipe: 100 }` ; les deux = `{ sophia: 50, unswipe: 50 }` ;
- **HM = celui dont `profiles.zone_recrutement` couvre le pays** et qui gère
  la langue (`profiles.langues`). Plusieurs : le moins chargé ;
- mot de passe provisoire aléatoire, **changement obligatoire à la première
  connexion** (`must_change_password`) ;
- le warm-up n'est **pas** lancé : le poster le démarre lui-même dans l'OS ;
- **lundi fixe** : le site envoie le lundi de démarrage (`start_monday`,
  gardé dans `hub_posteurs.debut_le`). Un warm-up lancé plus tôt se termine
  ce lundi à 00:00 (Paris), pas avant — trigger `comptes_warmup_jusqu_au_lundi_hub`
  de 0278. Premiers posts et paie partent donc du même lundi. Le « skip
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
connecté, il reçoit un **nouveau** mot de passe provisoire (sinon
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

1. **Migration** `0278_hub_posteurs.sql` : à passer à la main (SQL Editor ou
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

- **Slack** : un bot (app Slack, événement `team_join`) reconnaît le poster par
  son email perso (`hub_posteurs.email_perso`) et l'ajoute au salon de son HM.
  L'API Slack ne permet pas d'inviter dans un workspace hors offre Enterprise :
  le lien d'invitation reste dans l'email.
