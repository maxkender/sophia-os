# Hub ↔ OS : posteurs venus du site (`hub-posteurs`)

Le Hub (sophia-culture.com, projet Lovable « Sophia Culture Hub ») reçoit des
candidatures de posteurs slideshow sur son site. Ces posteurs **ne passent pas
par Upwork** : Max les valide un par un dans le Hub, le Hub les paie chaque
semaine, et l'OS reste l'endroit où ils vivent (compte, slideshows, posts,
recruteur, zone Slack). Cette fonction Edge est le seul point de contact entre
les deux.

## Authentification

- Secret partagé `HUB_SECRET` (Supabase → Edge Functions → Secrets, projet
  Sophia OS SLIDESHOW). La même valeur est posée côté Hub sous
  `OS_HUB_SECRET` (Lovable → Settings → Secrets). Jamais dans le dépôt, jamais
  dans un chat.
- En-tête `x-hub-secret`. Pas de JWT (`verify_jwt = false` dans
  `supabase/config.toml`). Sans secret configuré, tout est refusé (401).
- `CRON_SECRET` et `SUPABASE_URL` doivent exister (déjà le cas) :
  `creer_posteur` appelle `manage-users` en interne avec le secret des crons.

## Contrat

`POST {SUPABASE_URL}/functions/v1/hub-posteurs`, corps JSON `{ "action": …,
… }`. Réponse `{ "ok": true, … }` ou `{ "ok": false, "error": "…" }`.

| Action | Entrée | Sortie |
|---|---|---|
| `ping` | — | `{ version }` |
| `stats_pays` | — | `by_langue: [{ langue, actifs }]`, `by_zone: [{ zone, recruteur, actifs }]` — posteurs actifs (rôle `poster`, `is_active`) par langue (`profiles.nationalite`) et par zone de leur recruteur (`profiles.zone_recrutement`). L'OS ne connaît pas le pays d'un posteur Upwork : le Hub mappe pays → langue. |
| `creer_posteur` | `hub_id` (uuid de la candidature), `prenom`, `nom`, `email_perso`, `pays_code` (ISO-2), `pays_nom`, `langue`, `applications` (`["sophia"]`, `["unswipe"]` ou les deux), `deux_telephones`, `source: "site"` | `profile_id`, `email_os` (login `prenom+initiale@sophia.com`), `password` (temporaire, `must_change_password`), `manager: { id, prenom, nom, email } \| null`, `existed`. Idempotent : un second appel avec le même `hub_id` rend le profil existant, `password: null`. |
| `posts_semaine` | `profile_ids: [uuid]` (≤ 500), `lundi: "YYYY-MM-DD"` | `rows: [{ profile_id, prevus, publies, manques, dernier_post_at, is_active }]` sur la semaine Paris lundi → dimanche (passages + vidéos du pod 3). |
| `maj_posteur` | `profile_id`, `is_active?`, `deux_telephones?` | `{ ok }` |

### Ce que fait `creer_posteur`

1. Cherche le recruteur dont `zone_recrutement` contient le nom du pays comme
   mot entier (`_shared/hub_posteurs.ts`, testé : « Portugal » → « Spain +
   Portugal », « Russia » ≠ « Russian-speaking »). Recruteurs actifs seulement,
   premier par email. Aucun → `manager: null`, le Hub le signale.
2. Appelle `manage-users` `create` (poster, premier compte perso dans la
   langue, `parts_applications = { unswipe: 100 }` si Unswipe seul — sinon le
   chemin Sophia historique).
3. Pose `profiles.source = 'site'`, `hub_id`, `email_perso`, `pays`,
   `deux_telephones`, `must_change_password = true`, `manager_id`.

Le Hub envoie ensuite lui-même le login, l'invitation Slack et le guide au
posteur, et prévient le recruteur. Rien n'est envoyé depuis l'OS.

## Côté OS, ce qui change pour ces posteurs

- Page Posters : chip « site » (`profiles.source`), case « 2 téléphones ».
- Ils sont payés par le Hub, pas sur Upwork : un HM ne leur crée pas de
  milestone. Tout le reste (zone Slack, warm-up, 2 posts/jour, posts dans l'OS)
  est identique.

## Migration

`supabase/migrations/0275_codes_application_consignes_hub.sql`, à appliquer
à la main (SQL Editor ou MCP), comme toutes les migrations de ce dépôt.
