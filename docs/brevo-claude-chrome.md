# Brevo : ce qu'il faut faire (à donner à Claude dans Chrome)

Copie tout le bloc ci-dessous dans Claude dans Chrome, connecté à Brevo, à l'hébergeur DNS de
vikstudios.com et à Supabase.

---

Tu configures l'envoi et la réception des emails de Vik Studios. Fais les étapes dans l'ordre et
arrête-toi pour me demander si une étape demande un paiement ou supprime quelque chose.
Ne montre jamais de clé ni de jeton à l'écran dans ta réponse finale.

## 1. Domaine d'envoi vikstudios.com (Brevo)
1. Brevo → Paramètres (en haut à droite) → **Expéditeurs, domaines et IP dédiées** → onglet
   **Domaines** → **Ajouter un domaine** : `vikstudios.com` (s'il n'y est pas déjà).
2. Choisis l'authentification manuelle : Brevo affiche des enregistrements DNS (code Brevo en TXT,
   DKIM, DMARC, éventuellement SPF).
3. Ouvre l'hébergeur DNS de vikstudios.com (regarde chez qui sont les serveurs de noms si tu ne
   sais pas : Cloudflare, OVH, GoDaddy, Google Domains…) et ajoute **exactement** ces
   enregistrements. Ne modifie ni ne supprime aucun enregistrement existant (surtout pas les MX
   de vikstudios.com : la boîte support@vikstudios.com doit continuer à recevoir ses emails).
   S'il existe déjà un enregistrement SPF (TXT `v=spf1 …`), ajoute `include:spf.brevo.com` dedans
   au lieu d'en créer un second.
4. Reviens dans Brevo et clique **Authentifier** jusqu'à ce que le domaine soit « Authentifié ».

## 2. Expéditeur « Sophia » <support@vikstudios.com> (Brevo)
1. Même page → onglet **Expéditeurs** → **Ajouter un expéditeur** : nom `Sophia`, email
   `support@vikstudios.com`.
2. Si Brevo demande une validation par email, ouvre la boîte support@vikstudios.com et clique le
   lien.

## 3. Réception des réponses (inbound parsing)
Les réponses des posteurs iront à `support@reply.vikstudios.com` (sous-domaine dédié, pour ne pas
toucher aux emails de support@vikstudios.com).
1. Lis la page https://developers.brevo.com/docs/inbound-parse-webhooks, section qui explique
   comment préparer le domaine : elle donne les enregistrements **MX** à créer pour un
   sous-domaine.
2. Chez l'hébergeur DNS de vikstudios.com, crée ces enregistrements MX pour le sous-domaine
   **`reply`** (donc `reply.vikstudios.com`), avec les valeurs et priorités de la doc Brevo.
   Rien d'autre ne change.
3. Génère un jeton aléatoire de 40 caractères (lettres et chiffres). Ne me le montre pas.
4. Supabase → projet `mbikecieskoobeizixig` → **Edge Functions** → **Secrets** → ajoute le secret
   `EMAIL_ENTRANT_TOKEN` avec ce jeton.
5. Crée le webhook de réception dans Brevo. S'il n'y a pas d'écran pour ça dans Brevo, utilise
   la page de la doc API « Create a webhook » (https://developers.brevo.com/reference/createwebhook,
   bouton **Try it**, avec la clé API Brevo du compte : Paramètres → SMTP & API → Clés API ;
   crée-en une nommée « inbound-setup » si besoin). Corps de la requête :
   ```json
   {
     "type": "inbound",
     "events": ["inboundEmailProcessed"],
     "domain": "reply.vikstudios.com",
     "url": "https://mbikecieskoobeizixig.supabase.co/functions/v1/support?entrant=brevo",
     "description": "Réponses des posteurs → OS",
     "auth": { "type": "bearer", "token": "<le jeton de l'étape 3>" }
   }
   ```
6. Vérifie que la réponse est un succès (un `id` de webhook).

## 4. Test
Depuis une boîte Gmail perso, envoie un email à `support@reply.vikstudios.com` avec le sujet
« Test » et le texte « When do I get paid? ». Dans les 2 minutes, il doit apparaître dans
Sophia OS → Support → Boîte (expéditeur inconnu si l'adresse Gmail n'est pas celle d'un posteur).

## 5. À me renvoyer
- Domaine vikstudios.com : authentifié oui / non.
- Expéditeur support@vikstudios.com : validé oui / non.
- MX de reply.vikstudios.com : créés (valeurs).
- Webhook inbound : créé (id), et résultat du test.
Ne me renvoie ni la clé API ni le jeton.
