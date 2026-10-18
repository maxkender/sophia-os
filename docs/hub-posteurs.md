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

## « Créateur Ruul => Sophia » : ce qu'il faudrait pour que ce soit vrai

**Ça ne l'est pas aujourd'hui.** C'est le site qui choisit l'application de
ses candidats : `APPLICATIONS_HUB` vaut `["sophia", "unswipe"]` et
`partsPourApplications` (`_shared/hub_posteurs.ts`) sait rendre
`{unswipe: 100}` comme `{sophia: 50, unswipe: 50}`. Au 18/10 les 7 comptes de
la cohorte sont bien sur Sophia, mais parce que le site a demandé `["sophia"]`,
pas parce qu'une règle l'impose.

La page `/admin/repartition` MODÉLISE la règle et la vérifie à chaque
ouverture (colonne d'écart de `simulation_repartition_cohorte`, migration
0309). Elle ne l'applique pas. Le jour où on décide de l'appliquer :

### Le minimum, à la création depuis le site

1. `_shared/hub_posteurs.ts` — `partsPourApplications` rend toujours la même
   chose. Soit `null` (chemin historique, vaut 100 % Sophia), soit
   `{sophia: 100}` explicite, ce qui immunise contre un changement futur du
   sens de `null`. Fonction pure, testable seule.
2. `_shared/hub_posteurs_test.ts` — ses assertions tombent, à réécrire dans le
   même commit.
3. `hub-posteurs/index.ts` — le site continuera d'envoyer `applications`.
   Refuser (nouveau code d'erreur, à ajouter au tableau du **Contrat**) ou
   ignorer. Si on ignore, garder la DEMANDE du site dans
   `hub_posteurs.applications`, pas ce qui a été appliqué : c'est la seule
   trace du désaccord.
4. Ce fichier — la phrase du **Contrat** sur `applications` devient fausse.

### Pour que ça tienne aussi hors du guichet

5. Un helper partagé `estPosterCohorteRuul(supabase, posterId)`, une seule
   définition de la cohorte dans l'OS.
6. `manage-users` — la garde va après `lireChoixCompte` et **avant**
   `createUser` : le fichier impose déjà cette discipline, un refus plus tard
   laisse un login orphelin. Donc pas dans `preparerCompte`.
7. Une migration avec un trigger sur `comptes.parts_applications` : sans elle,
   un admin rebascule un compte Ruul sur Unswipe depuis sa fiche
   (`majPartsApplicationsCompte`), et le trigger existant ne vérifie que
   `is_admin`.

### Côté front

8. Masquer le choix d'application quand la cible est un poster Ruul, plutôt
   que d'afficher des curseurs qui échoueront à l'enregistrement. Prérequis :
   le front doit savoir qui est Ruul, or `hub_posteurs` est en RLS admin
   seule — il faut un drapeau sur la ligne poster ou une RPC `security
   definer` rendant le booléen.

### Le jour où le moteur choisit vraiment l'application

9. **Aucun code serveur ne lit `reglages.repartition_applications`.** Il
   faudrait porter `src/features/moteur/repartition/scoreApplication.ts` vers
   `_shared/` et le brancher dans `manage-users`.
10. L'ordre compte : une recrue Ruul n'est pas un siège que le moteur peut
    attribuer. La garde doit court-circuiter le classement, et les comptes de
    la cohorte doivent compter normalement dans la présence — c'est ce qui
    fait que Sainte-Laguë se corrige seul. Voir l'en-tête de
    `src/features/moteur/repartition/provenance.ts`, qui explique pourquoi
    corriger la cible EN PLUS la corrigerait deux fois.

## Suite prévue

- **Slack** : fait pour la cohorte Ruul (`hub-slack-cohorte`, voir plus haut).
  L'API Slack ne permet pas d'inviter dans un workspace hors offre Enterprise :
  le lien d'invitation reste dans l'email, et il expire au bout de 30 jours.
