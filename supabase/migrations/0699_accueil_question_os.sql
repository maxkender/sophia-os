-- 13/11 (Max) : dans l'accueil Upwork, la phrase des questions renvoie vers Help de l'OS,
-- mot pour mot la même que la bienvenue Ruul et l'encart du dashboard.
-- Remplace l'ancienne ligne (« #questions » sur Slack, ou la version courte « Click Help… »).
update public.reglages
   set valeur = to_jsonb(
         replace(
           replace(valeur #>> '{}',
             'For any other question, please ask on Slack, in #questions.',
             'Any question about the job? Ask it in the Sophia OS: log in to your dashboard and click Help. You''ll get an answer right away, and you can escalate to our team if needed.'),
           'Have a question or a problem? Click Help on your dashboard, you''ll get an answer there.',
           'Any question about the job? Ask it in the Sophia OS: log in to your dashboard and click Help. You''ll get an answer right away, and you can escalate to our team if needed.')),
       updated_at = now()
 where cle = 'accueil_message_texte'
   and jsonb_typeof(valeur) = 'string';
