# Multi-applications : Sophia + Unswipe (labels partagés)

L'OS fabrique des slideshows qui promeuvent une application. Jusqu'ici :
Sophia (culture générale). Désormais aussi : **Unswipe** (reprendre le contrôle
de son temps). Ce document est la référence du modèle et de son déploiement.

## 1. Le modèle

- **Les comptes portent des LABELS, pas des applications.** Identité d'un compte
  (bio, lien, persona) : Sophia, toujours.
- **Un label sert une ou plusieurs applications** (`label_applications`).
  Pas d'« angle » par label : le prompt de placement de l'application suffit
  (décision du 2026-10-08). Les colonnes `label_applications.angle` et
  `contenu_pertinences.angles` restent en base, inutilisées (`angles` est
  toujours écrite à `null`).
  - **Règle d'héritage** : un label SANS ligne sert Sophia. Un oubli de backfill
    ne peut jamais vider le stock Sophia.
  - Labels système (`hook`, `ugc-ai-video`) : aucune application.
  - Démarrer Unswipe = créer des labels **dédiés** cochés Unswipe seul. Ne pas
    retirer Sophia d'un label existant : tous ses comptes passeraient en 100 %
    Unswipe.
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
    (`elo_seuil_import`), ou import forcé. **Hors Sophia, il faut EN PLUS une
    pertinence ≥ 50** (`PERTINENCE_MIN_HORS_SOPHIA`, décision du 2026-10-09),
    import forcé compris : la note est dominée par les vues et la piste du
    compte source, un TikTok très vu passait hors sujet. Sophia : aucun
    plancher (son pool n'écarte que les lignes explicitement non éligibles).
    Un contenu hors Sophia sous le plancher pour TOUTES ses applications est
    rejeté dès l'étape 4 (aucun pool ne pourrait le servir). Effet indirect sur
    un compte mixte : une réserve Unswipe plus petite envoie plus de créneaux en
    repli Sophia (`repli_motif = reserve_vide`) — à surveiller. Le plancher
    vaut pour les lignes notées à partir du 2026-10-09 (0 ligne non-Sophia en
    base à cette date).
  - Pool **Sophia** : exclut seulement une ligne Sophia **explicitement** non
    éligible (pas de ligne = éligible : stock historique, créations manuelles,
    variations). Pool **autre application** : il FAUT une ligne éligible.
- **Prompts distincts par application** : `pertinence` / `placement_sophia`
  (Sophia, clés historiques), `pertinence_<slug>` / `placement_<slug>` (autres).
  Un prompt manquant pour une application non-Sophia = échec franc (jamais de
  repli silencieux sur le texte Sophia).
- **Tierlist et budget de passages : PAR APPLICATION (0270).** Chaque
  application a son rang, son budget, son cycle et sa mesure `m`, sur ses
  seuls posts : un post Unswipe ne consomme jamais le budget Sophia, et
  inversement. Sophia garde `contenus.tier & co` ; les autres applications
  vivent dans `contenu_tiers_application`, avec un tier d'entrée tiré de LEUR
  note d'import (voir `docs/tierlist.md` § « Par application »). Le rang
  Sophia d'un contenu partagé vient de la pertinence Sophia, plus du max.
  **Restent partagés** : le classement des comptes, l'ELO langue
  (`contenu_langues.score` / `nb_passages`, donc les variations), « déjà
  posté » (ordre des bandes de tirage) et l'écart de 7 jours entre deux
  applications sur un même contenu.
- **Deck placé** : Sophia reste dans `contenu_langues.slides` (inchangé). Les
  autres applications dans `contenu_langue_decks` (contenu × langue × variante),
  cuits à partir d'une base SANS placement (`slides_base` : OCR source, ou
  traduction propre de la langue écrite par ce chemin).
- **Concurrents, par application** (`_shared/concurrents.ts`,
  `motifConcurrentApplication`) :
  - Sophia : « vent now », « readup » (inchangé).
  - Unswipe : ceux de Sophia + les applis de temps d'écran — Unscroll, Opal
    (hors bijou / ongles / couleur), one sec (« one sec app », « onesec »),
    ScreenZen, AppBlock / AppBlocker, Clearspace (collés), Brick (« the
    brick », « brick app », « brick phone blocker » ; jamais « brick by
    brick »), Freedom (« freedom app », « Freedom blocks… »), Forest
    (« forest app » ou une ligne de titre « 3. forest »). Pas « jomo ».
    Mesuré sur les 77 212 slides du stock (2026-10-08) : aucun faux positif
    relevé avec ces conditions (sans elles : « brick by brick », « forest
    bathing », « a clear space », « freedom » au sens courant…) ; Unscroll est
    de loin le plus cité (97 slides, 82 contenus), puis Freedom (8), Forest (4),
    Brick (2).
  - micabo (0272) : ceux de Sophia + les applis d'étude de la table
    `concurrents` de micabo-os (19 noms au 2026-10-09 : Wilgo, Quizlet, Anki,
    Knowunity, StudySmarter, Studocu, Brainly, Gauth, Photomath, Turbo AI,
    StudyFetch, Revisely, Mindgrasp, Flashka, ElibroAI, Aistote, Nerdmask,
    Astra AI, PeECH), en mots entiers Unicode. « anki » jamais après « şu / o /
    bu / her » (« şu anki rekor » est du turc courant), « astra » jamais après
    « ad », « studysmarter » collé seulement. Mesuré sur les slides de
    micabo-os : Wilgo (83 slides), PeECH (29), Quizlet (11), ElibroAI (8).
  - **Position imposée** : comme pour Sophia, la première slide (hors
    couverture) qui cite un concurrent de l'application est la SEULE position
    permise du placement, même hors des 3 dernières slides ; le prompt demande
    de la remplacer entièrement. Elle est lue sur la base de la langue cible,
    sinon sur la base source (positions identiques entre langues). Sans
    concurrent : une des 3 dernières slides.
  - Une SEULE slide concurrente par contenu : une seconde slide qui cite un
    concurrent de l'application, ou une couverture qui en cite un, rend le
    contenu inéligible pour cette application (`ineligible`, en cache ; Sophia
    continue de le servir), de même qu'un deck dont la slide imposée serait la
    seule à porter du texte. Le nettoyage (`retirerConcurrent`) travaille
    LIGNE par ligne, puis phrase par phrase dans la ligne : sur un texte d'OCR
    coupé en lignes, une phrase ou une parenthèse à cheval sur deux lignes
    n'était retirée qu'à moitié (« (i use », « content worth your time /
    Open » d'une carte App Store incrustée). Mesuré sur le stock : un seul
    contenu a deux slides concurrentes, aucune couverture n'en cite. La slide
    imposée reste lisible pour le modèle, une variante qui cite un concurrent
    est rejetée, et le deck final repasse au nettoyage. Un deck en cache qui
    cite un concurrent est recuit.
  - Hashtags : ceux d'une ligne de langue sont PARTAGÉS par toutes les
    applications. Quand c'est le deck Unswipe qui les génère (ligne encore
    sans hashtags), sa base est nettoyée des concurrents d'Unswipe, pas
    seulement de ceux de Sophia ; le deck Sophia de cette langue les reprend
    tels quels. Assumé : retirer « forest app » du texte que voit le modèle des
    hashtags est sans danger pour un post Sophia. Aucun effet tant qu'aucun
    label ne sert Unswipe.
- **Répartition par compte** : `comptes.parts_applications` jsonb
  (`{"sophia":70,"unswipe":30}`), `NULL` = 100 % Sophia. Restreinte aux
  applications que ses labels servent, actives et ciblant sa langue
  (`applications.langues`, `NULL` = toutes). Un compte dont les labels ne servent
  QUE Unswipe publie 100 % Unswipe. Tenue par **fenêtre glissante** (déficit) sur
  ses 10 derniers posts : en 70/30, toute suite de 10 posts compte 7/3.
  Admin → Posters (ligne du compte dépliée) montre la carte « Répartition par
  application » dès qu'un label du compte sert une autre application que
  Sophia, y compris pour un compte 100 % Unswipe (pas de curseur : « Appliqué :
  Unswipe 100 % », ou en rouge « il ne publiera rien » avec TOUTES les causes :
  application désactivée, langue non ciblée — les deux à la fois dans l'état
  laissé par 0258 —, compte UGC). Un compte Sophia pur ne la voit pas, sauf
  s'il garde une répartition enregistrée devenue sans objet (à effacer).
- **Chemin historique** : un compte dont les parts effectives sont 100 % Sophia
  (le cas de tous les comptes tant qu'on ne règle rien) suit exactement le code
  d'avant — pas de fenêtre lue, pas de deck d'application.
- **Repli** : si l'application demandée ne peut pas être servie, le créneau
  passe sur Sophia et le passage le dit (`application_visee_id`, `repli_motif`).
  Motifs : `reserve_vide`, `deck_ineligible` (base polluée par une pub Sophia,
  seconde slide ou couverture concurrente…), `deck_echec` (prompt manquant,
  placement impossible, traduction en échec, panne…), `budget` (la nuit a
  dépassé son budget de cuisson des decks non-Sophia : aucune nouvelle cuisson après 60 s de lot, arrêt de toute cuisson à 90 s).
  Pilotage les affiche. Un compte qu'aucun repli ne peut servir (labels 100 %
  Unswipe, Unswipe inactive) ne baisse pas son quota et sort de la chaîne du
  drain, pour ne pas bloquer les autres — sauf si seul le budget de cuisson a
  manqué : il reste alors dans la chaîne, et un lot suivant (budget neuf) le
  reprend. Sa raison précise (« Compte 100 % Unswipe : Unswipe est
  désactivée… », « … ne cible pas la langue de ce compte… », réserve vide,
  deck refusé ou en échec avec la raison du dernier deck, budget) est écrite
  dans `assignation_journal` (0267) ; le panneau Minuit la lit. Sans ligne de
  journal, son diagnostic reconnaît lui-même un compte dont aucun label ne
  sert Sophia, et compte le pool Sophia d'un compte mixte sur ses seuls labels
  qui servent Sophia.
- **Journal de la nuit (`assignation_journal`), pour TOUS les comptes** : le
  drain de minuit écrit désormais le verdict de chaque compte qu'il traite,
  Sophia compris (avant, seule l'assignation globale l'écrivait, et minuit
  passe par le drain). Le bouton « Pourquoi » du panneau Minuit affiche donc,
  pour un compte Sophia incomplet aussi, la raison de la nuit (« 1/2 créé(s).
  <diagnostic du pool> ») ou « Minuit a échoué sur ce compte : … » au lieu
  d'une raison reconstituée sur l'état courant. Les posts, decks et quotas
  Sophia ne changent pas : seul ce texte change. Une assignation TEST n'écrit
  rien ; une assignation forcée (recharge posteur, révocation, post de plus)
  garde le verdict de la nuit et ne l'écrit que s'il manque ; une
  réassignation manuelle ordinaire le remplace.
- **Rappels J+7** : un rappel recopie les slides de sa source, pub comprise.
  Il n'est pas programmé si les labels actuels du compte ne servent plus
  l'application de la source (compte passé en « Unswipe seul » avec une
  source Sophia) : noté dans les erreurs de l'étape, la source reste
  candidate. Un rappel DÉJÀ posé avant le changement de labels reste en place
  (voir § 3, étape 6).
- **Même contenu, deux applications** : autorisé, y compris sur le même compte,
  mais pas à moins de 7 jours d'écart (stats et doublons TikTok).
- **Unswipe = slideshows classiques uniquement** : un compte UGC reste Sophia.
- **Sélecteur d'application de l'admin** : filtre les prompts, les stats et la
  réserve. Plus les labels, sources, contenus ni comptes.

## 2. Schéma (migration 0256, additive)

| Objet | Rôle |
|---|---|
| `applications.langues text[]`, `applications.actif bool` | langues ciblées (`NULL` = toutes), interrupteur |
| `label_applications(label_id, application_id, angle)` | applications servies par un label (`angle` : inutilisée) |
| `contenu_pertinences(contenu_id, application_id, score, raison, note, eligible, angles, prompt_cle)` | pertinence par application (`angles` : toujours `null`) |
| `contenu_langue_decks(contenu_langue_id, contenu_id, langue, application_id, variante, statut, raison, slides, placement)` | deck placé hors Sophia (`statut` : `pret` / `echec` / `ineligible`) |
| `passages.application_id` (défaut Sophia), `passages.application_visee_id`, `passages.repli_motif` | application promue, repli |
| `posts.application_id` (défaut Sophia) | copie pour les pages posteur/admin |
| `comptes.parts_applications jsonb` | répartition ; écriture réservée admin (trigger) |
| vue `label_application_reserve` | réserve par label × application |
| vue `stats_posts` + colonne `application_id` (en fin) | stats par application |

Migration 0270 (tiers par application, additive ; parties A puis B) :

| Objet | Rôle |
|---|---|
| `contenu_tiers_application(contenu_id, application_id, tier, passages_prevus, tier_cycle, tier_maj_at, tier_rapport)` | tier d'un contenu pour une application hors Sophia (CHECK `<> Sophia`, RLS admin) |
| vue `contenu_application_tier_etat` | avancement par contenu × application, sur ses passages ; tier d'entrée paresseux tant qu'aucune ligne n'est écrite ; aucune ligne pour un posteur (note et éligibilité réservées à l'admin) |
| vue `contenu_application_a_requalifier` | ses cycles terminés |
| `tier_initial_note(numeric)`, `passages_du_tier(text)` | miroirs SQL de `tierInitialDepuisNote` / `PASSAGES_PAR_TIER` |
| `contenu_tier_etat` (modifiée) | ne compte plus que les passages Sophia (preuve d'invariance dans la migration) |
| `label_application_reserve` (modifiée) | restants propres à chaque application : les réserves ne se recouvrent plus |
| `reglages.tierlist_applications_dernier_run` | trace de l'étape de minuit `tierlist_applications` |

Constantes : Sophia = `00000000-0000-4000-8000-000000000001`,
micabo = `00000000-0000-4000-8000-000000000002` (supprimée en 0257, recréée
INACTIVE en 0272), Unswipe = `00000000-0000-4000-8000-000000000003` (0258).

Logique pure partagée : `src/features/moteur/multiApp.ts` (tests vitest) et sa
copie Deno `supabase/functions/_shared/multi_app.ts` (synchro testée). Lectures
base : `supabase/functions/_shared/applications_moteur.ts`, qui sonde la
présence de 0256 et retombe sur le comportement 100 % Sophia si la migration
n'est pas passée. Une panne n'est JAMAIS prise pour une absence (Edge, et
front : `estErreurSchemaAbsent`) : tout 5xx et les codes PGRST000 à PGRST003
(dont le 503 PGRST002 « Could not query the database for the schema cache »)
rendent la sonde « illisible ». Seuls
comptent comme absence les codes 42P01, PGRST205, 42703, PGRST204, un 404, ou
un message explicite (« relation / column … does not exist », « Could not find
the table / … column »).

## 3. Déploiement (ordre impératif)

Les fonctions Edge se déploient au merge sur `main` ; les migrations se passent
à la main (SQL Editor ou MCP), hors fenêtres nocturnes (21:50–23:15 UTC,
03:55–04:15 UTC).

1. ✅ (2026-10-02) **Appliquer 0256 AVANT le merge** (additive : rien ne change pour le code en
   place). Filet de sécurité si l'ordre est inversé : le code sonde le schéma
   (lecture GET de `label_applications`, `applications.langues/actif`,
   `passages.application_id`) et reste sur le chemin 100 % Sophia tant que
   0256 manque. Une sonde illisible (réseau, 5xx) n'est pas une absence :
   l'assignation relit alors directement `label_applications` pour les labels
   du compte (deux essais). Tous ses labels servent Sophia → chemin d'avant,
   inchangé. Un label qui ne sert pas Sophia (compte 100 % Unswipe ou mixte),
   ou une relecture elle aussi en panne → le compte part en échec et sera
   rejoué (rattrapage de 4 h), sans baisse de quota et sans jamais recevoir un
   deck Sophia. Ce dernier cas vaut aussi pour un compte Sophia pur : c'est le
   seul écart avec le code d'avant, limité à une panne qui couvre la sonde et
   la relecture (1 à 2 s) puis cesse avant les lectures du pool — sans savoir
   ce que servent ses labels, le servir en Sophia serait parier. La révocation
   ADMIN d'un post lève de même (à rejouer) sur une sonde illisible, avant
   toute écriture : prise pour Sophia, elle rejetterait le slideshow d'un post
   Unswipe pour toute la flotte. De même, un compte qui demande une autre
   application, un import ou un deck échouent et sont rejoués — sans bascule
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
   Prompts, sélecteur sur Unswipe). Les brouillons de 0258 sont alignés sur
   l'enveloppe du code (slide imposée par le code, quelle que soit l'appli
   citée — Vent Now et Readup compris ; longueur comparable à la slide
   remplacée ; mention indirecte en mode instructif) et leurs exemples
   n'affirment aucune fonctionnalité (ni blocage, ni limite, ni chiffre), mais
   le pitch (fonctionnalités, chiffres réels) reste à écrire.
6. **Quand on décide de démarrer** : Pilotage → carte « Applications » →
   Unswipe → « Langues ciblées » (sans langue, aucun compte ne publie
   Unswipe) ; créer des labels dédiés cochés Unswipe seul (ne pas décocher
   Sophia d'un label existant) ; lancer le rattrapage de pertinence Unswipe du
   stock ; puis activer Unswipe (l'activation est refusée tant que les deux
   prompts sont vides). Commencer par 1 ou 2 comptes et vérifier le lendemain.
   **Compte existant passé en « Unswipe seul »** : supprimer d'abord ses
   rappels J+7 à venir non publiés (`passages` avec `est_rappel = true`,
   `date_publication_prevue` > aujourd'hui, et leurs posts) — posés avant le
   changement de labels, ils rejoueraient un post Sophia, pub comprise. Le
   plus simple : démarrer avec des comptes neufs.
7. Posters : régler la répartition des comptes concernés (défaut 100 % Sophia).

### Tiers par application (0270) — ordre impératif

Préalable : Unswipe (et toute application non-Sophia) **INACTIVE** — la partie
B de 0270 refuse de s'appliquer sinon.

1. **Merger** la PR (Edge et front). La sonde 0270 répond « absent » : aucune
   autre application n'est servie (repli Sophia, motif `reserve_vide`, raison
   « migration 0270 non appliquée »), l'étape de minuit écrit
   `{etat: "absent"}`, la carte Applications refuse l'activation. Sophia est
   identique : aucun passage non-Sophia ne peut naître, et TOUT import pose
   le rang Sophia comme avant (« historique », depuis la porte), même pour un
   contenu dont un label servirait déjà Unswipe — le rang Sophia « partagé »
   (pertinence Sophia) ou absent (« hors Sophia ») n'existe qu'une fois 0270
   appliquée ; une sonde illisible fait rejouer le pas d'import. L'étape de
   minuit `tierlist_applications` passe en DERNIER, après le lancement du
   drain, l'upscale et les variations : l'ordre et le moment des étapes Sophia
   sont ceux d'avant. Nuit suivante : ~280 posts, bloc tierlist habituel, pas
   de pic de quotas baissés, `tierlist_applications_dernier_run.etat =
   "absent"`.
2. Hors des fenêtres de nuit, de préférence à une heure calme et pages admin
   Pilotage / Réserve fermées, noter les chiffres d'AVANT (`select count(*),
   sum(restants) from contenu_tier_etat` ; `select count(*) from
   contenu_a_requalifier` ; `select * from label_application_reserve` ;
   `select count(*) from passages where application_id <> '…0001'` → 0), puis
   appliquer **0270a puis 0270b** (MCP `apply_migration`, deux appels :
   `0270a_tiers_application_table`, `0270b_tiers_application_vues` ; ou SQL
   Editor, une exécution par partie, puis l'insert de trace de l'en-tête du
   fichier). La partie B prouve l'invariance Sophia AVANT de remplacer quoi
   que ce soit (copies temporaires « avant » contre définitions « après » ;
   ≈ 2 s au calme, davantage sous charge, sans bloquer personne), annule tout
   au moindre écart, puis installe les deux vues Sophia en dernier : verrou
   exclusif tenu quelques millisecondes, obtenu en 2 s au plus par vue (sinon
   B échoue sans rien appliquer : la rejouer). Pendant cette attente, une
   lecture de ces vues attend derrière (au pire ≈ 4 s, sous les 8 s de
   statement_timeout). Chaque partie est **rejouable** telle quelle (appel
   MCP expiré après le COMMIT, doute) ; pour savoir ce qui est passé :
   `to_regclass` de `contenu_tiers_application`,
   `contenu_application_tier_etat`, `contenu_application_a_requalifier`.
3. Après : mêmes chiffres (à l'activité près), `select count(*) from
   contenu_application_tier_etat` → 0, pas d'`anon` dans les droits de la
   table `contenu_tiers_application` ni des deux vues par application (les
   deux fonctions pures `tier_initial_note` / `passages_du_tier` gardent
   EXECUTE pour PUBLIC, donc anon, EXPRÈS : comme `application_id_sophia()`,
   une fonction appelée par une vue est vérifiée avec les droits du LECTEUR,
   et les retirer à PUBLIC casserait `label_application_reserve` pour les
   lectures directes — sans risque, elles ne lisent aucune donnée),
   `schema_migrations` porte 0270a et 0270b. Sous 5 min, la sonde Edge passe à
   « prête ». Nuit suivante : Sophia identique,
   `tierlist_applications_dernier_run = {etat: "pret", applications:
   {unswipe: {examines: 0, …}}}`.
4. Seulement ensuite : langues ciblées, labels dédiés, **rattrapage de
   pertinence Unswipe** (il note désormais avec la piste du compte source,
   comme l'import), puis activation (§ 6 ci-dessus).

Ordre inverse (0270 avant le merge) : sûr tant qu'Unswipe reste inactive (B
refuse sinon), mais l'ancien front laisserait l'activer : déconseillé.

**Droits des vues par application.** `contenu_application_tier_etat` (et
donc `contenu_application_a_requalifier`) expose la note et l'éligibilité de
`contenu_pertinences`, table réservée à l'admin : un utilisateur connecté
NON admin (posteur) n'y lit aucune ligne. L'admin, l'Edge (`service_role`)
et les lectures directes voient tout. `contenu_tier_etat` garde, elle, le
SELECT `anon` hérité de 0237 (ses voisines l'ont perdu en 0253/0254) : 0270
ne touche pas à ses droits (Sophia identique). À trancher par le
propriétaire ; si personne ne la lit en anon, une migration séparée :
`revoke select on public.contenu_tier_etat from anon;`.

**Retour arrière.** Revenir sur le CODE après 0270 avec une application
non-Sophia active la resservirait sans limite (l'ancien code lit
`contenu_tier_etat`, désormais filtré sur Sophia) : **désactiver d'abord
toute application non-Sophia**, et ne jamais la réactiver avec ce code.
Revenir sur 0270 : `docs/sql/0270_retour_arriere.sql` (même préalable, le
script refuse sinon). Il remet `label_application_reserve` (0266) et
supprime les vues par application, mais GARDE le filtre Sophia de
`contenu_tier_etat` : neutre sans passage non-Sophia, il empêche sinon les
passages Unswipe de revenir dans le budget et le `m` de Sophia, et laisse la
partie B rejouable (sa preuve compare alors filtré contre filtré — testé
avec 30 passages non-Sophia en base). La table et les fonctions restent,
leur suppression (en commentaire) perd les tiers des autres applications.

`manage-users` et `papier-cm` tournent sur des bundles figés : ils continuent
de lire `application_id` (toujours Sophia) et n'ont pas besoin d'être
reconstruits pour cette évolution.

### micabo (0272) — préparation, aucun effet visible

micabo revient comme troisième application, pour reprendre les comptes et le
stock de micabo-os. Ce qui est en place :

- le motif de concurrents `micabo` (`_shared/concurrents.ts`, § 1), déployé
  avec les Edge au merge — inerte tant qu'aucun deck micabo n'est cuit ;
- 0272 : l'application (id `…0002`, langues fr / tr / de / es, INACTIVE) et
  ses deux prompts, repris de micabo-os en production (v2) et adaptés à
  l'enveloppe de Sophia (voir l'en-tête de la migration). Sans label qui la
  sert, rien n'est noté ni publié pour elle. **Ne plus rejouer 0257** : elle
  la supprimerait de nouveau, prompts compris.

- le label `classic_study` (slug `classic-study`, créé le 2026-10-09, vide) :
  sa ligne `label_applications` (micabo seul) a été posée dans la même
  instruction que le label, et **`labels.application_id` vaut micabo**, pas
  Sophia. Ce n'est pas un oubli : le bundle figé de `manage-users` ne tire ses
  labels (files et repli « label le moins utilisé ») que parmi ceux dont
  `labels.application_id` est Sophia — un label micabo vide serait sinon le
  « moins utilisé » et partirait sur une recrue Sophia (§ 4.1). Ne pas le
  remettre à Sophia.

- les créateurs et leurs comptes TikTok (2026-10-09, scripts
  `docs/sql/micabo_*.sql`) : 22 logins `x@sophia.com` recopiés de micabo-os
  (même id, même mot de passe, profil complet, aucun HM, aucun changement de
  mot de passe imposé) ; 4 créateurs déjà sur Sophia gardent leur login, ses
  comptes micabo y sont rattachés ; Eva (seul compte vidéo AI UGC, @eva.learn)
  reste dans micabo-os. 27 comptes TikTok recopiés **en sommeil**
  (`is_active = false`, sans label, warmup déjà fini) : ni vus ni servis.
  Le schéma privé `migration_micabo` garde la correspondance des ids et l'état
  micabo de chaque compte (`actif_micabo`, `labels_micabo`) pour le réveil ;
  les mots de passe chiffrés en ont été purgés.

Reste à faire, dans cet ordre : reprise du stock (contenus, decks, images),
puis, le jour de la bascule, réveil des comptes (`is_active = true` + label
`classic_study`), arrêt de ces comptes dans micabo-os, activation de micabo.

## 4. Plus tard (décidé, pas fait)

1. **`manage-users` : repli « label le moins utilisé ».** Quand on crée un
   poster et que la file de sa langue est vide, le bundle figé lui donne le
   label le moins utilisé de la langue, sans regarder `label_applications`.
   Un label « Unswipe seul » tout neuf (0 compte) serait donc donné aux
   prochaines recrues Sophia. Correctif à faire dans le bundle figé, en deux
   temps comme #300 / #302 (reconstruire le bundle, puis déployer).

## 5. Phase 2 (prévue, pas livrée)

Posts **doubles** : une slide Sophia + une slide Unswipe, quand les deux
pertinences dépassent un seuil élevé sur un label commun. Le modèle le permet
déjà : variante `dual:sophia+unswipe` dans `contenu_langue_decks`, poids 0,5 par
application dans la fenêtre de répartition (`EntreeFenetre.poids`), et une
colonne `passages.application_secondaire_id` à ajouter.
