# FAQ automatique

Un seul cerveau dans l'OS, deux entrées : **#questions sur Slack** et **la bulle
d'aide du dashboard**. Il répond à partir du guide Notion et des réponses
validées par l'admin. Ce qui est cassé, il le laisse à l'IT guy. Ce qu'il ne
sait pas arrive dans l'OS, page **Assistant → À traiter**. Ce dont il n'est
pas sûr aussi, avec sa réponse déjà écrite : l'admin la valide avant qu'elle
parte.

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
 repondu               bug          a_valider / a_traiter      hors_sujet
 il répond          il se tait :        « I've passed your     rien
 (fil Slack /       l'IT guy le prend    question to the team »
  bulle)                                 → OS › Assistant › À traiter
                                                |
                          a_valider : sa réponse est pré-remplie, l'admin la
                          relit et l'envoie ; a_traiter : l'admin l'écrit (faq-admin)
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

## Source de vérité : Notion, puis les réponses validées

- **Le guide Notion fait foi** (Poster Guide, Manager Guide). Une règle qui
  change (paiement hebdomadaire, montants par zone, process) se modifie **dans
  Notion**. L'OS le recopie chaque heure, le cerveau et la bulle suivent : rien
  à toucher dans l'OS.
- **Les réponses validées** (`chatbot_contexte`, page Assistant) ne servent qu'à
  ce que le guide ne dit pas. Elles naissent surtout de « À traiter » (case
  « ajouter à la base ») ou d'une réponse de l'équipe dans un fil Slack. Si
  elles contredisent le guide, le guide gagne.
- **Le chemin d'une réponse** : question sans réponse → l'admin répond dans
  l'OS → réponse validée (automatique la fois suivante). Quand elle revient
  souvent, ou que c'est une vraie règle, elle monte dans Notion (Quick answers)
  et sort des réponses validées. La base reste courte, le guide complet.
- **Les montants** sont dans le Manager Guide, jamais dans le Poster Guide : le
  cerveau ne lit le Manager Guide que pour un manager. Un poster qui demande son
  montant reçoit la règle (« celui de ton contrat Upwork, demande à ton
  manager en privé »).

## Quand il n'est pas sûr

Le cerveau ne répond seul (« repondu ») que quand il est sûr. Quand le guide
parle du sujet sans couvrir clairement le cas (une règle proche, un cas
particulier, une info qui a pu changer), il tranche « incertain » : il écrit sa
réponse probable, mais **rien ne part**. Sur Slack, seul le message d'attente
est posté ; dans la bulle, la personne lit que sa question est transmise. La
question arrive dans « À traiter », état **À valider**, la réponse déjà dans la
case : tu la relis, la corriges si besoin, et « Valider et envoyer ». Une
réponse de l'équipe dans le fil entre-temps la règle, comme pour « À traiter ».
Quand le guide ne dit rien d'utile, c'est « inconnu » : la case est vide.

## La frontière avec l'IT guy

Écrite **une seule fois**, dans `supabase/functions/_shared/frontiere_it.ts`,
et lue par les deux : le cerveau l'a dans son prompt, `it-guy/AGENT.md` y
renvoie. **Ce qui est cassé est à l'IT guy, « comment faire / est-ce que je
dois » est à la FAQ.** Message mixte ou doute : c'est cassé.

La FAQ voit chaque message en premier (quelques secondes contre 30 min). Elle
se tait sur un bug, et l'IT guy ignore un fil où l'appli a répondu, sauf si
l'auteur dit ensuite que ça n'a pas marché. Le message d'attente ne règle rien :
un bug mal classé reste à l'IT guy. Son « on it » dans le fil (posté avec le
compte d'Adrien) n'est pas une réponse : sur une question en attente, il la
passe en suivi IT (« pris en charge »), et sa réponse suivante la règle. Un
retour (review) que la personne conteste est un problème technique : la FAQ
se tait, l'IT guy compare le post à l'original.

## Jamais deux réponses à la même question

- **Le bot répond en premier** (quelques secondes) : l'équipe voit sa réponse
  dans le fil et n'a pas à répondre.
- **Juste avant de poster**, il relit le fil : si quelqu'un a déjà répondu
  (l'équipe ou un autre poster), il se tait. Un simple « same here » ou « +1 »
  ne compte pas. Une réponse de l'équipe règle la question ; celle d'un poster
  la laisse dans « À traiter » si le guide ne la couvrait pas, pour que l'admin
  vérifie.
- **Depuis l'OS** (« À traiter »), même relecture avant d'envoyer : si quelqu'un
  de l'équipe a répondu dans le fil entre-temps, rien ne part, la page le dit
  et la question sort de la liste. Une réponse de l'équipe dans le fil sort
  aussi la question de « À traiter » toute seule. Un « on it » n'est pas une
  réponse : celui de l'IT guy la fait passer en suivi IT.
- **L'IT guy** ne touche pas un fil où le bot a répondu, et le bot se tait sur
  les bugs. Le journal suit ce que l'IT guy en fait, d'après le fil : « pas
  encore pris », « pris en charge » (son « on it », la proposition attend un ✅
  dans #a-os-tickets), puis « réglé » (sa réponse est arrivée dans le fil). Un message modifié ou renvoyé par Slack ne donne pas de seconde
  réponse.

## Mise en service

1. **Migration** `0331_faq_automatique.sql` : l'appliquer comme les autres
   (SQL editor ou `execute_sql`), en remplaçant `<CRON_SECRET>` par le secret
   des crons, puis l'enregistrer dans `supabase_migrations.schema_migrations`.
   À faire **avant** le merge : le front lit les nouvelles colonnes.
2. **Merge** sur `main` : Vercel déploie le front, la CI redéploie `chatbot` et
   déploie `slack-faq`, `guides-notion`, `faq-admin` (avec leur
   `verify_jwt = false` de `supabase/config.toml`).
3. **Notion** : l'intégration de `NOTION_TOKEN` (celle qui écrit « Hired »)
   doit avoir accès aux deux guides. Pour la reconnaître : base Recruitment
   Targets → `•••` → Connexions, c'est celle qui y est connectée. Puis, sur le
   Poster Guide et sur le Manager Guide : `•••` → Connexions → chercher son
   nom → Confirmer (les sous-pages suivent). Enfin, page Assistant →
   « Recopier maintenant » : le message dit ce qui manque.
4. **Slack**, dans l'appli **« Sophia OS »** (celle de Check, Kill or Double,
   secrets `SLACK_HM_BOT_TOKEN` / `SLACK_HM_SIGNING_SECRET`), **pas** « Sophia
   Comments » (comment masters), sur api.slack.com/apps :
   - *OAuth & Permissions* → *Scopes* → *Bot Token Scopes* → ajouter
     `channels:history`, `users:read` (et `chat:write` s'il manque), puis le
     bandeau jaune → *reinstall your app* → *Allow* ;
   - dans Slack, `/invite @Sophia OS` dans #questions ;
   - **après le déploiement de `slack-faq`** (sinon Slack refuse l'URL) :
     *Event Subscriptions* → *Enable Events* → Request URL
     `https://mbikecieskoobeizixig.supabase.co/functions/v1/slack-faq`
     (Slack affiche *Verified*), puis *Subscribe to bot events* → *Add Bot
     User Event* → `message.channels` → *Save Changes*.

   Pour une appli Slack à part : secrets `SLACK_FAQ_BOT_TOKEN` et
   `SLACK_FAQ_SIGNING_SECRET` (sinon `SLACK_HM_BOT_TOKEN` /
   `SLACK_HM_SIGNING_SECRET`).
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
