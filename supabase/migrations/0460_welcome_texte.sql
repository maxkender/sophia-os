-- Le texte du welcome (reglages.accueil_message_texte), remplacé tel quel à la demande de Max (30/10).
update public.reglages
   set valeur = to_jsonb($w$Hi {prenom}, welcome to Vik Studios!

You start posting on Monday {date}.

IMPORTANT: if you don't want to do this job, or you won't be ready to post consistently every day from Monday {date}, reply STOP here right now and don't log in anywhere. We'll close the contract, no hard feelings.

Everything you need:
• Your dashboard: {url}
• Login: {email} · Password: {mot_de_passe}
• Your TikTok account to create: @{handle} (use exactly this name)
• Our guide: {guide}

Join our Slack now: {slack}
• Use your PERSONAL email, not the dashboard login above.
• Use your FULL NAME (first and last name). This is IMPORTANT: it's how we recognize you.

Before Sunday midnight:
1. Log in to your dashboard.
2. Create the TikTok account shown on your dashboard, with the exact @ and your personal email.
3. Click Start warmup, then warm the account up like a real person: scroll a few minutes a day, like and follow accounts in the general knowledge niche. This is the most important step: without it, your posts get 0 views.

For any other question, please ask on Slack, in #questions.$w$::text),
       updated_at = now()
 where cle = 'accueil_message_texte';
