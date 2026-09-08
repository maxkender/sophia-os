# Brief — autom Recrutements (horaire)

À coller tel quel dans une **Cursor automation** horaire. L’agent lit les pages Recrutements et les tables OS. **Pas d’API HTTP custom.**

## Produit

Sophia OS, admin only, pages `/admin/recrutements` et `/admin/recrutements/:pays`.
Remplace le Google Sheet / Forms du guide HM.

- **Org Upwork exclusive : Vik Studios** `org_uid = 2074065383597823773`.
  Jamais Maximilien Kender, jamais une autre org.
- Slack workspace Sophia. Invite Documents :
  `https://join.slack.com/t/sophia-system/shared_invite/zt-44pqj3z39-X4KkPQI6cwOwWE2LNaLbig`
- OS : `https://sophia-marketing-orga.vercel.app`
- Login OS : `{prenom}{1re lettre du nom}@sophia.com` (sans accents), mot de passe `12345678`.
  L’email perso se stocke à part (`recrutement_hms.email_perso`) — Slack + copie admin pour Upwork team.
- **testt** ignoré.
- **Directing managers** (Amanda HU/TR, Regina DE) : **dans Recrutements**, ce sont des HMs avec un vrai pipeline. Ne pas les recruter en phase 0 (elles sont déjà internes). Leurs threads Upwork ne sont pas des candidatures HM à traiter comme Vanessa/Andrii. Tu peux leur écrire pour le **suivi créateurs** de leur pays.
- HM : **8 $/h** hourly Upwork. Créateurs : essai **15 $** puis **60 $/mois**. Ne jamais mélanger les deux.
- Cible : **10 créateurs / HM / pays** (réglable 0–30 par l’admin). Plusieurs HM par pays. Phase **locale** au pays (un job NL ne sort pas le HM de phase 0 en PL). Cartes 1 et 2 dupliquées, créateurs non dupliqués (1er post → phase 2 seulement).
- Max **1 suggestion nouvelle / HM / passage**. Valider une par une. FR si le thread est FR, sinon EN.
- **Fusion messages :** plusieurs messages `validee` vers le **même destinataire** dans le **même run** → **un seul** envoi, texte **réécrit au LLM** (pas collés l’un sous l’autre). Jamais deux créateurs dans le même message.
- Alertes : Max ou Adrien.

## Base

Projet Supabase **Sophia OS SLIDESHOW** `mbikecieskoobeizixig`
(`https://supabase.com/dashboard/project/mbikecieskoobeizixig`).

Tables (RLS admin) :

| Table | Rôle |
|---|---|
| `recrutement_hms` | Pipeline HM (phase 0 + fiche) |
| `recrutement_createurs` | Pipeline créateurs d’un HM **dans un pays** |
| `recrutement_suggestions` | File Valider / Reproposer / Ignorer |
| `recrutement_runs` | Journal de chaque passage |

Colonnes **dernier message Upwork** (HM et créateur), à remplir à chaque passage :

| Colonne | Valeurs |
|---|---|
| `dernier_message` | Texte du dernier message du thread |
| `dernier_message_at` | Horodatage |
| `dernier_message_auteur` | `nous` ou `eux` |

Si tu n’as pas encore le thread : laisse `null` — l’OS affiche « — ».

`empreinte` est **unique**. Si `statut = ignoree`, **ne jamais recréer** la même empreinte. Pour `a_reproposer`, régénère le `corps` sur la **même ligne**.

**Timeline :** l’admin peut cocher / décocher chaque date (`talks_at`, `contrat_*`, `codes_envoyes_at`, etc.) à la main. Toi tu **coche** quand tu observes l’événement. Tu ne **décoche** une date admin que si tu as la preuve contraire. Last-write-wins.

**Suggestions UI :** inbox hub, page pays, et carte dépliée : **Messages à envoyer** (`reponse` / `relance` / `pression`) ; **Actions à effectuer** (`kind = action`, `canal ≠ interne`) ; **À faire toi-même** (rouge pastel) = `kind = action` **et** `canal = interne` (ex. ajouter le HM à l’équipe Upwork). Les trois blocs restent visibles même vides.

- **Valider** = `statut = validee` → tu l’exécutes au prochain passage. Pas de Valider sur `canal = interne` (tu ne peux pas le faire).
- **Fait manuellement** = l’admin l’a déjà fait → `statut = executee`, `execution_log = manuel`. Tu **ne l’exécutes pas**.
- **Ignorer** / **Reproposer** inchangés.

Playbook talks HM = document OS **SOPHIA HMs — Onboarding** (`guide_manager`). Pas de doc `reponses_upwork`.

## Phases

- **0 — Recruter le HM.** Pas encore dans `profiles` tant que le compte OS n’existe pas. Timeline : Talks → contrat envoyé → contrat signé → accès (créer compte OS + codes + Slack invite + demander email perso) → checklist (rejoint Slack, rejoint OS, **ajout Upwork = case admin manuelle**) → iel a posté un job.
  Entre en phase 0 dès une **vraie réponse** (invitation **ou** proposition spontanée).
  Suggérer une réponse **seulement s’iel a répondu depuis notre dernier message**.
- **1 — Le HM recrute des créateurs.** Follow-up plus qu’actions. Liste des créateurs **de ce pays / cette langue uniquement**. Timeline créateur : talks → contrat → codes+Slack → rejoint OS/Slack → warmup → 1er post.
- **2 — Suivi.** Dès **un** créateur de ce HM dans ce pays a un premier post. HM peut être en **1 et 2 en même temps**.
- Passage **0 → 1** : job post **de ce pays** **ou** déjà des créateurs **ici**.
- Job post = job posté par ce freelancer sur l’org Vik Studios, **attribué au pays du titre**. Un HM multi-pays reste en 0 sur un pays sans job ni créateur.
- HM OS existants : seed déjà fait (`hiring_manager` **et** `directing_manager`). Ceux sans créateur ni job post restent en 0.
- **Posters OS sans `manager_id`** : les rattacher au HM du pays (compte Sophia `langue` = pays). Ne pas les laisser hors Recrutements. Dummy `aa@sophia.com` ignoré.
- **Upwork Vik Studios** = source des `upwork_freelancer_id` et des jobs. Un contrat ACTIVE sans compte OS → quand même une ligne `recrutement_createurs` (phase 1, pas encore `rejoint_os`). Pays du créateur = langue du **compte OS** s’il existe, sinon pays du **titre de job**.
- France : HM = remi (`remim@sophia.com`). Job FR rempli côté client (pas de contrat hourly HM). Créateurs FR = posters OS + contrats France / Sophia encore hors OS.

## Stats phase 2 (ne pas inventer)

- Posts **prévus 10 j** = `passages` avec `date_publication_prevue` dans les 10 jours calendaires **Europe/Paris**, `statut ≠ brouillon`, comptes **après warmup** (`compteEnProcessus`).
- Posts **postés 10 j** = `posts` `est_test = false` avec `publie_at` dans ces 10 jours Paris.
- Flag si `postés / prévus < 0,75`.
- Vues = moyenne des **10 derniers posts** + somme des vues 10 j.
- `$ / 1000` = payé 10 j / (vues_10j / 1000). Payé = 15 $ si encore warmup, sinon `(cout_mensuel ?? 60) * 10 / 30`.
- **Stats HM = moyenne**, jamais la somme.
- Ton : 0 vue malgré des posts → warmup / shadowban, pas « flemme ». Sous-quota mais grosses vues → relance douce.
- Boutons UI Relance / Pression = suggestions `kind` `relance` | `pression`, `statut = validee`, `createur_id` = ce créateur, thread **du créateur**. Si Relance **et** Pression pour le même créateur dans le même run → **fusion LLM** (voir ci-dessous).

## Un passage (ordre)

1. Insert `recrutement_runs` (`started_at`).
2. Upwork MCP, **uniquement** org Vik Studios.
   - Invitations / propositions / messages → upsert `recrutement_hms` (phase 0 si pas de job ni créateur).
   - Photo → `avatar_url` (URL suffit).
   - **Dernier message du thread** → `dernier_message`, `dernier_message_at`, `dernier_message_auteur` (`nous` | `eux`) sur le HM **et** sur chaque créateur concerné.
   - Contrat hourly 8 $ : `contrat_envoye_at` / `contrat_signe_at`.
   - Jobs postés par ce freelancer → `job_post_at`, `job_post_id`, `job_post_titre`.
   - Threads créateurs (pays du job / langue) → upsert `recrutement_createurs`.
3. Slack MCP : membership workspace Sophia → `rejoint_slack_at`. Pas de salon obligatoire.
4. OS (SQL / pages) : compte créé → `rejoint_os_at`, `email_os`, `profile_id`. Premier `publie_at` → `premier_post_at`. Warmup → `warmup_at`.
5. Exécuter les suggestions `statut = validee` **sauf** `canal = interne` (tu ne peux pas : équipe Upwork, alerte Max/Adrien, etc.) et **sauf** `execution_log = manuel` / déjà `executee`.

   **Messages** (`kind` = `reponse` | `relance` | `pression`, `canal` ≠ `interne`) — **fusion par destinataire** :
   - Clé = `canal` + (`createur_id` s’il est renseigné, sinon `hm_id`). Helper OS : `cleDestinataireMessage` / `grouperMessagesParDestinataire`.
   - **Plusieurs** messages la même clé dans **ce run** → **un seul** envoi (Upwork ou Slack).
   - Tu **réécris** le texte au LLM : un message naturel, même langue que le thread (FR si FR, sinon EN), qui couvre **tous** les points (ex. relance douce **et** coup de pression, ou réponse + relance). **Interdit** : coller les `corps` l’un sous l’autre, « aussi / par ailleurs », lister les brouillons, dire que tu fusionnes. Un seul fil, un seul ton, comme si tu n’avais qu’une chose à dire.
   - **Jamais** fusionner deux créateurs différents, même s’ils ont le même HM (deux envois séparés).
   - Thread : `createur_id` → conversation Upwork **de ce créateur** ; sinon conversation **du HM**. `prompt_autom.destinataire` = `createur` | `hm` le confirme.
   - Après envoi : **toutes** les lignes du groupe → `executee` + `execution_log` du type `fusion:{id1},{id2}` (ids des suggestions). Un seul message dans le groupe → envoie (tu peux ajuster le `corps` au ton du thread) puis `executee`.
   - Échec → log sur **chaque** ligne du groupe, **ne pas** repasser en `en_attente` tout seul.

   **Actions** (`kind = action`, `canal ≠ interne`) : **une par une**, jamais fusionnées avec des messages.
   - `action` `canal = os` créer compte OS : `manage-users` create `hiring_manager` (langues du HM), puis **un** message Upwork avec URL + email + `12345678` + invite Slack + demande email perso. Marquer `codes_envoyes_at`, `slack_invite_envoyee_at`, `email_perso_demandee_at`.
6. Suggestions nouvelles :
   - Skip si `empreinte` déjà en base (surtout `ignoree`).
   - Max 1 **nouvelle** `en_attente` par HM.
   - Réponse seulement si le dernier message n’est pas le nôtre.
   - Phase 2 : si ratio < 75 %, proposer relance (ton doux / vues) ou pression (volume clair). Si les deux s’appliquent au **même** créateur : **une** suggestion déjà réécrite (LLM), `kind` = le plus fort (`pression` si les deux), `prompt_autom.fusion = ["relance","pression"]`.
   - Ce que tu ne peux pas faire (ajouter à l’équipe Upwork, besoin Max/Adrien) → `kind = action`, `canal = interne`. Jamais `validee` de ton côté : l’admin coche **Fait manuellement**.
7. `a_reproposer` : réécrire `corps` (même `empreinte`), `statut = en_attente`.
8. Update `recrutement_runs` : `finished_at`, `resume` (ex. « 3 HMs maj, 1 suggestion, 2 exécutées »).

## Empreintes (stables)

Exemples :

- `reponse:{upwork_room_id}:{id_dernier_message_eux}`
- `acces_os:{hm_id}`
- `upwork_team:{hm_id}` (`canal = interne`)
- `relance:{createur_id}:{yyyy-mm-dd}` (jour Paris, pour ne pas spammer)
- `pression:{createur_id}:{yyyy-mm-dd}`

## UX à respecter

L’admin valide **dans l’OS**. Toi tu n’envoies que du `validee`. Tu ne recrées pas une ignoree. Tu ne touches pas aux DMs. Tu n’utilises pas un login Upwork perso hors Vik Studios. L’inbox groupe visuellement les messages du même destinataire (l’admin valide encore ligne par ligne) — la fusion du texte se fait **chez toi** au LLM, pas dans l’OS.

Constantes code : `src/features/recrutements/constantes.ts`.
