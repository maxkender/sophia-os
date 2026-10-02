# Multi-applications : Sophia + Unswipe (labels partagés)

L'OS fabrique des slideshows qui promeuvent une application. Jusqu'ici :
Sophia (culture générale). Désormais aussi : **Unswipe** (reprendre le contrôle
de son temps). Ce document est la référence du modèle et de son déploiement.

## 1. Le modèle

- **Les comptes portent des LABELS, pas des applications.** Identité d'un compte
  (bio, lien, persona) : Sophia, toujours.
- **Un label sert une ou plusieurs applications** (`label_applications`), avec
  un **angle** par application : un texte injecté dans les prompts de pertinence
  et de placement de cette application (« Clean Girl × Unswipe : reprends le
  contrôle de ton temps »).
  - **Règle d'héritage** : un label SANS ligne sert Sophia. Un oubli de backfill
    ne peut jamais vider le stock Sophia.
  - Labels système (`hook`, `ugc-ai-video`) : aucune application.
- **Sources et contenus ne sont plus rattachés à une application.** Un post
  TikTok importé une fois sert toutes les applications de ses labels.
  (`application_id` reste sur ces tables, figé à Sophia, pour les lecteurs
  historiques — bundles figés manage-users / papier-cm, persona, UGC vidéo,
  recrutement. Ne PAS le supprimer.)
- **Pertinence par contenu × application** (`contenu_pertinences`) : notée pour
  chaque application servie par les labels du contenu et dotée d'un prompt de
  pertinence (active ou non : un label coché pour Unswipe l'est exprès, et
  préparer le stock avant l'activation évite de perdre des contenus). Une
  application sans prompt n'est pas notée — jamais de repli sur le prompt
  Sophia. Une note par passage d'import (un appel modèle), Sophia d'abord.
  - `contenus.pertinence_score` = pertinence de la PORTE d'import = **max** des
    applications servies (identique au score Sophia pour un contenu Sophia seul).
    Un contenu n'est rejeté que s'il n'est pertinent pour AUCUNE application.
  - `eligible` = la note d'import calculée avec CE score passe le seuil
    (`elo_seuil_import`), ou import forcé.
  - Pool **Sophia** : exclut seulement une ligne Sophia **explicitement** non
    éligible (pas de ligne = éligible : stock historique, créations manuelles,
    variations). Pool **autre application** : il FAUT une ligne éligible.
- **Prompts distincts par application** : `pertinence` / `placement_sophia`
  (Sophia, clés historiques), `pertinence_<slug>` / `placement_<slug>` (autres).
  Un prompt manquant pour une application non-Sophia = échec franc (jamais de
  repli silencieux sur le texte Sophia).
- **ELO, tierlist, classement : PARTAGÉS.** Un passage Unswipe consomme le même
  budget `restants` du contenu qu'un passage Sophia.
- **Deck placé** : Sophia reste dans `contenu_langues.slides` (inchangé). Les
  autres applications dans `contenu_langue_decks` (contenu × langue × variante),
  cuits à partir d'une base SANS placement (`slides_base` : OCR source, ou
  traduction propre de la langue écrite par ce chemin).
- **Répartition par compte** : `comptes.parts_applications` jsonb
  (`{"sophia":70,"unswipe":30}`), `NULL` = 100 % Sophia. Restreinte aux
  applications que ses labels servent, actives et ciblant sa langue
  (`applications.langues`, `NULL` = toutes). Un compte dont les labels ne servent
  QUE Unswipe publie 100 % Unswipe. Tenue par **fenêtre glissante** (déficit) sur
  ses 10 derniers posts : en 70/30, toute suite de 10 posts compte 7/3.
- **Chemin historique** : un compte dont les parts effectives sont 100 % Sophia
  (le cas de tous les comptes tant qu'on ne règle rien) suit exactement le code
  d'avant — pas de fenêtre lue, pas de deck d'application.
- **Repli** : si l'application demandée ne peut pas être servie, le créneau
  passe sur Sophia et le passage le dit (`application_visee_id`, `repli_motif`).
  Motifs : `reserve_vide`, `deck_ineligible` (base polluée par une pub Sophia),
  `deck_echec` (prompt manquant, placement impossible), `budget` (la nuit a
  dépassé son budget de cuisson des decks non-Sophia : aucune nouvelle cuisson après 60 s de lot, arrêt de toute cuisson à 90 s).
  Pilotage les affiche. Un compte qu'aucun repli ne peut servir (labels 100 %
  Unswipe, Unswipe inactive) ne baisse pas son quota et sort de la chaîne du
  drain, pour ne pas bloquer les autres.
- **Même contenu, deux applications** : autorisé, y compris sur le même compte,
  mais pas à moins de 7 jours d'écart (stats et doublons TikTok).
- **Unswipe = slideshows classiques uniquement** : un compte UGC reste Sophia.
- **Sélecteur d'application de l'admin** : filtre les prompts, les stats et la
  réserve. Plus les labels, sources, contenus ni comptes.

## 2. Schéma (migration 0256, additive)

| Objet | Rôle |
|---|---|
| `applications.langues text[]`, `applications.actif bool` | langues ciblées (`NULL` = toutes), interrupteur |
| `label_applications(label_id, application_id, angle)` | applications servies par un label |
| `contenu_pertinences(contenu_id, application_id, score, raison, note, eligible, angles, prompt_cle)` | pertinence par application |
| `contenu_langue_decks(contenu_langue_id, contenu_id, langue, application_id, variante, statut, raison, slides, placement)` | deck placé hors Sophia (`statut` : `pret` / `echec` / `ineligible`) |
| `passages.application_id` (défaut Sophia), `passages.application_visee_id`, `passages.repli_motif` | application promue, repli |
| `posts.application_id` (défaut Sophia) | copie pour les pages posteur/admin |
| `comptes.parts_applications jsonb` | répartition ; écriture réservée admin (trigger) |
| vue `label_application_reserve` | réserve par label × application |
| vue `stats_posts` + colonne `application_id` (en fin) | stats par application |

Constantes : Sophia = `00000000-0000-4000-8000-000000000001`,
Unswipe = `00000000-0000-4000-8000-000000000003` (0258).

Logique pure partagée : `src/features/moteur/multiApp.ts` (tests vitest) et sa
copie Deno `supabase/functions/_shared/multi_app.ts` (synchro testée). Lectures
base : `supabase/functions/_shared/applications_moteur.ts`, qui sonde la
présence de 0256 et retombe sur le comportement 100 % Sophia si la migration
n'est pas passée.

## 3. Déploiement (ordre impératif)

Les fonctions Edge se déploient au merge sur `main` ; les migrations se passent
à la main (SQL Editor ou MCP), hors fenêtres nocturnes (21:50–23:15 UTC,
03:55–04:15 UTC).

1. ✅ (2026-10-02) **Appliquer 0256 AVANT le merge** (additive : rien ne change pour le code en
   place). Filet de sécurité si l'ordre est inversé : le code sonde le schéma
   (lecture GET de `label_applications`, `applications.langues/actif`,
   `passages.application_id`) et reste sur le chemin 100 % Sophia tant que
   0256 manque. Une sonde illisible (réseau, 5xx) ne pénalise jamais un compte
   100 % Sophia (chemin d'avant) ; un compte qui demande une autre application,
   un import ou un deck échouent alors et sont rejoués — sans bascule
   silencieuse vers Sophia.
2. **Merger** la branche (Edge auto-déployées, front Vercel). Sophia tourne à
   l'identique : aucun compte n'a de répartition, aucun label ne sert Unswipe.
   Vérifier la nuit suivante : même volume de posts (~280/jour), pas de pic de
   quotas baissés.
3. **Admin → Sources → @barevanillascent → « Oublier ce compte » → « Tout
   supprimer »** (supprime les images micabo du stockage ; la source est visible
   sans filtre depuis le merge), puis **appliquer 0257 depuis le SQL Editor**
   (purge micabo, Hook unique, unicités globales). Rattrapage des ~950 médias
   Hook inclus.
4. **Appliquer 0258** : Unswipe créée INACTIVE, sans langue. À ce stade,
   Unswipe = 0 % partout : aucune application inactive n'est jamais choisie,
   aucun label ne la sert, aucun compte n'a de part.
5. Relire / compléter `pertinence_unswipe` et `placement_unswipe` (Réglages →
   Prompts, sélecteur sur Unswipe).
6. **Quand on décide de démarrer** : Pilotage → Applications, choisir les
   langues d'Unswipe, cocher Unswipe sur les labels voulus (+ angle), lancer le
   rattrapage de pertinence Unswipe du stock, puis activer Unswipe
   (l'activation est refusée tant que les deux prompts sont vides).
7. Posters : régler la répartition des comptes concernés (défaut 100 % Sophia).

`manage-users` et `papier-cm` tournent sur des bundles figés : ils continuent
de lire `application_id` (toujours Sophia) et n'ont pas besoin d'être
reconstruits pour cette évolution.

## 4. Phase 2 (prévue, pas livrée)

Posts **doubles** : une slide Sophia + une slide Unswipe, quand les deux
pertinences dépassent un seuil élevé sur un label commun. Le modèle le permet
déjà : variante `dual:sophia+unswipe` dans `contenu_langue_decks`, poids 0,5 par
application dans la fenêtre de répartition (`EntreeFenetre.poids`), et une
colonne `passages.application_secondaire_id` à ajouter.
