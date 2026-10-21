# FAQ automatique

Un seul cerveau dans l'OS, deux entrées : **#questions sur Slack** et **la bulle
d'aide du dashboard**. Il répond à partir du guide Notion et des réponses
validées par l'admin. Ce qui est cassé, il le laisse à l'IT guy. Ce qu'il ne
sait pas arrive dans l'OS, page **Assistant → À traiter**.

**Au départ, tout est en mode test** : rien ne part sur Slack, la bulle répond
comme avant, et la page Assistant montre ce que le cerveau aurait fait.

## Le circuit

```
 #questions (Slack)            bulle d'aide (OS)
          \                        /
           -> LE CERVEAU (_shared/faq.ts)
              lit : guides_notion (Poster Guide + Manager Guide, recopiés chaque heure)
                  + chatbot_contexte (réponses validées par l'admin)
                         |
   +---------------------+----------------------+-----------------+
   |                     |                      |                 |
 repondu               bug                  a_traiter         hors_sujet
 il répond          il se tait :        « I've passed your     rien
 (fil Slack /       l'IT guy le prend    question to the team »
  bulle)                                 → OS › Assistant › À traiter
                                                |
                                     l'admin tape la réponse (faq-admin)
                                                |
                      elle repart là où la question a été posée :
                      fil Slack · pop-up du poster · message privé Slack au manager
                      + « ajouter à la base » → chatbot_contexte
```

| Pièce | Rôle |
|---|---|
| `slack-faq` | Reçoit chaque message des canaux suivis (événements Slack signés), répond en arrière-plan. Une réponse de l'équipe dans le fil sort la question de « À traiter ». L'auteur qui répond après une vraie réponse du bot la relance. |
| `chatbot` | La bulle d'aide. Test : l'ancien assistant répond, le cerveau tourne à côté (journal). Actif : le cerveau répond. |
| `guides-notion` | Recopie les guides Notion dans `guides_notion`, toutes les heures à :17 (seules les pages modifiées sont relues, tout est relu au moins une fois par jour). |
| `faq-admin` | Ce que fait l'admin : traiter (répondre), ignorer, ajouter une réponse à la base. |
| `chatbot_questions` | Le journal : une ligne par question, bulle ou Slack, avec la décision (`etat`), ce que le cerveau propose (`reponse_faq`), ce qui est vraiment parti (`reponse`), la réponse de l'équipe dans le fil (`reponse_humaine`). |
| `reglages.faq_automatique` | `mode_slack` (eteint / test / actif), `mode_os` (test / actif), `canaux_slack`, `message_attente`. Les modes se changent sur la page Assistant ; les canaux en SQL. |

## La frontière avec l'IT guy

Écrite **une seule fois**, dans `supabase/functions/_shared/frontiere_it.ts`,
et lue par les deux : le cerveau l'a dans son prompt, `it-guy/AGENT.md` y
renvoie. **Ce qui est cassé est à l'IT guy, « comment faire / est-ce que je
dois » est à la FAQ.** Message mixte ou doute : c'est cassé.

La FAQ voit chaque message en premier (quelques secondes contre 30 min). Elle
se tait sur un bug, et l'IT guy ignore un fil où l'appli a répondu, sauf si
l'auteur dit ensuite que ça n'a pas marché. Le message d'attente ne règle rien :
un bug mal classé reste à l'IT guy. Son « on it » dans le fil (posté avec le
compte d'Adrien) sort la question de « À traiter ».

## Mise en service

1. **Migration** `0331_faq_automatique.sql` : l'appliquer comme les autres
   (SQL editor ou `execute_sql`), en remplaçant `<CRON_SECRET>` par le secret
   des crons, puis l'enregistrer dans `supabase_migrations.schema_migrations`.
   À faire **avant** le merge : le front lit les nouvelles colonnes.
2. **Merge** sur `main` : Vercel déploie le front, la CI redéploie `chatbot` et
   déploie `slack-faq`, `guides-notion`, `faq-admin` (avec leur
   `verify_jwt = false` de `supabase/config.toml`).
3. **Notion** : l'intégration de `NOTION_TOKEN` (celle qui écrit « Hired »)
   doit avoir accès aux deux guides. Page du guide → `•••` → Connexions →
   ajouter l'intégration (les sous-pages suivent). Puis page Assistant →
   « Recopier maintenant » : le message dit ce qui manque.
4. **Slack**, dans l'appli de l'OS (celle des comment masters, sur
   api.slack.com/apps) :
   - *OAuth & Permissions* → Bot Token Scopes : `channels:history`,
     `chat:write`, `users:read`, puis réinstaller l'appli dans le workspace ;
   - *Event Subscriptions* → activer, Request URL :
     `https://mbikecieskoobeizixig.supabase.co/functions/v1/slack-faq`
     (Slack la vérifie tout de suite), puis *Subscribe to bot events* →
     `message.channels` ;
   - inviter l'appli dans #questions (`/invite @Sophia OS`).

   Pour une appli Slack à part : secrets `SLACK_FAQ_BOT_TOKEN` et
   `SLACK_FAQ_SIGNING_SECRET` (sinon `SLACK_BOT_TOKEN` / `SLACK_SIGNING_SECRET`).
5. **Laisser tourner en test 2-3 jours**, lire le journal (filtres Répondu /
   Bug → IT guy / À traiter), corriger le guide ou ajouter des réponses à la
   base. Puis passer Slack et/ou la bulle en **Actif** sur la page Assistant.

Garde-fou : rien ne part sur Slack tant que le guide n'a jamais été recopié
(sinon chaque question recevrait le message d'attente).

## Ajouter un canal

```sql
update public.reglages
   set valeur = jsonb_set(valeur, '{canaux_slack}', '["C0BL56RJH7T","C0BL0084Y3F"]'::jsonb),
       updated_at = now()
 where cle = 'faq_automatique';
```

Un canal privé demande en plus le scope `groups:history` et l'événement
`message.groups`. Les messages d'un manager (connu par `hm_slack`) passent par
le Manager Guide.

## Retour arrière

Le plus rapide : `mode_slack` → **Éteint** sur la page Assistant (la fonction
ne lit plus rien) et `mode_os` → **Test** (la bulle redevient l'ancien
assistant). Le reste : voir l'en-tête de la migration 0331.
