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
- **langue de publication = langue du pays** (`langueDuPays` :
  `LANGUE_PAR_PAYS`, es-419 / pt-BR pour l'Amérique latine comme les comptes
  de l'OS ; Belgique et Luxembourg en `fr`, Suisse en `de` ; sinon la langue la
  plus fréquente des comptes du pays dans l'OS ; sinon `en`), pas la langue des
  emails choisie sur le formulaire ;
- **pays du compte** : envoyé à manage-users seulement quand la langue ne
  désigne pas un seul marché (en, ar, ru…), comme le front
  (`paysAEnvoyer`) ; sinon le trigger `comptes_pays_defaut` le déduit ;
- **application du compte : le moteur de l'OS la choisit** (19/11), d'après la
  cible de la page Allocation, comme pour toute autre recrue. Le champ
  `applications` envoyé par le site est gardé pour mémoire
  (`hub_posteurs.applications`), plus rien n'en dépend ;
- **ouverture du pays = l'OS, point** (décision du 06/11) : un pays est ouvert
  au site si et seulement s'il a une zone de paie active dans l'OS
  (`zones_paie_pays`, `retire_at` nul). Ni la zone d'une HM ni `hm_pays`
  n'ouvrent ou ne ferment plus rien. Un pays retiré est fermé (Portugal,
  02/11) ; un pays sans HM est ouvert (Canada). La HM de la zone (zone de
  recrutement, sinon `hm_pays`) n'est plus qu'une information ;
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
| `zone_non_ouverte` (422) | Le pays n'a pas de zone de paie active dans l'OS (`zones_paie_pays`). L'ajouter (ou le remettre) là pour l'ouvrir. |
| `sans_rattachement` (422) | Pas de cohorte Ruul configurée et pas de HM pour le pays. |
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
| `zones` | — | `{ ok, ouverts: [{ pays_code, langue, langue_os, zone, hm_id }], fermes: [{ pays_code, raison, langue }], inconnus }` : `ouverts` = tous les pays à zone de paie active ; `langue_os` = la langue du pays est connue (pas l'anglais par défaut) et des comptes actifs publient dans cette langue (bouton « Accept all valid » du site) |
| `creer_posteur` | `hub_id, prenom, nom, email_perso, pays_code, pays_nom, applications, start_monday`, `ref` facultatif (code de parrainage), `ruul_email`, `zone` et `tarif_semaine` facultatifs (ceux affichés à la signature ; absents : la zone du pays dans l'OS et son tarif au moment de la création sont figés sur la fiche, 0867) (le reste est ignoré, dont `zone_paiement`) | `{ ok, existed, profile_id, compte_id, email_os, password, langue, manager: { id, prenom, nom, email } }` |
| `posts_semaine` | `profile_ids` (≤ 500), `lundi` | `{ ok, rows: [{ profile_id, prevus, publies, manques, dernier_post_at, is_active }] }` |
| `stats_pays` | — | `{ ok, by_langue: [{ langue, actifs }] }` |
| `candidature` | `email, ref` (code `?ref=` gardé depuis la page creators) | `{ ok, relie, parrain_id?, invitation_id? }` : arrête les relances de parrainage (0561) |

Parrainage par email (0561) : l'OS demande au site d'envoyer les emails au filleul
(`POST HUB_EMAIL_URL`, en-tête `x-hub-secret`, `{ action: "envoyer_email", to, from_name, subject, html, text, tags, unsubscribe_url }`,
réponse `{ ok, message_id }`). Le site renvoie ouvert / cliqué / rebond à
`functions/v1/parrainage` (`{ action: "evenement", message_id, type }`, même en-tête).

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

## Qui choisit l'application d'un poster du site

**Le moteur de l'OS, comme pour toute autre recrue.** Décision du 19/11, qui
revient sur celle du 18/10.

Du 18/10 au 19/11, c'était le site, candidat par candidat : sa demande
(`["sophia"]`, `["unswipe"]` ou les deux) partait telle quelle dans
`parts_applications`, et un marqueur (`source: "hub-posteurs"`) disait à
`manage-users` de laisser son moteur de côté. Dans les faits le site demandait
toujours Sophia : 165 recrues sur 165 en 30 jours au 19/11, soit une recrue sur
trois (165 sur 462) hors de la cible posée dans Allocation. Mettre Atala à
100 % n'aurait donc touché que deux recrues sur trois.

### Ce que fait l'OS maintenant

- `hub-posteurs` n'envoie **aucune application** à `manage-users` : le corps
  est celui d'un recruteur qui n'a rien coché, sans marqueur ;
- `manage-users` choisit donc l'application par son moteur
  (`choisirApplicationPourCompte` : la File d'abord, puis l'application la plus
  en retard sur sa cible dans le marché du compte), puis le label ;
- interrupteur « Le moteur choisit l'application » éteint, ou aucune cible
  posée : le compte part sur Sophia, comme pour toute recrue ;
- la demande du site reste lue et rangée dans `hub_posteurs.applications`
  (`applicationsDemandees`, `_shared/hub_posteurs.ts`) : une trace, que plus
  rien ne lit. Le contrat du site ne change pas, il peut continuer d'envoyer
  le champ.

### Ce que la page Allocation en dit

Elle ne calcule plus de plancher par application ni de cible « impossible »,
et la projection ne réserve plus de tirages au site : le parcours d'un compte
a trois étapes (File, application, label) au lieu de quatre. Elle garde une
ligne d'information, « Site de recrutement : N recrues sur M en 30 jours »
(`simulation_recrues_site`, migrations 0310 et 0337, dont la répartition par
application n'est plus lue).

### Pour revenir en arrière

Renvoyer `parts_applications` depuis `hub-posteurs` suffit à imposer une
application à un candidat : `manage-users` traite une répartition explicite
comme un choix (`resoudreChoixCompte`). Il faudrait alors aussi remettre le
plancher dans la page (`provenance.ts`, retiré le 19/11), sinon elle
annoncerait de nouveau une cible que le site empêche d'atteindre.

## Suite prévue

- **Slack** : fait pour la cohorte Ruul (`hub-slack-cohorte`, voir plus haut).
  L'API Slack ne permet pas d'inviter dans un workspace hors offre Enterprise :
  le lien d'invitation reste dans l'email, et il expire au bout de 30 jours.
