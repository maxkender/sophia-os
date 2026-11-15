-- 0689 : textes Upwork (Max, 12/11, point 9). Plus de #questions (archivé) : la phrase Help ;
-- la date limite dite comme la règle (dimanche minuit, heure de Paris, la veille du lundi).
-- Modifie deux textes existants, à la demande de Max ; rien d'autre.
update public.reglages
   set valeur = to_jsonb(replace(replace(valeur #>> '{}',
         'For any other question, please ask on Slack, in #questions.',
         'Have a question or a problem? Click Help on your dashboard, you''ll get an answer there.'),
         'Before Sunday midnight:',
         'Before Sunday midnight (Paris time), the day before you start on Monday {date}:'))
 where cle = 'accueil_message_texte' and valeur #>> '{}' like '%#questions%';

update public.reglages
   set valeur = to_jsonb(replace(valeur #>> '{}', 'then tell us in #questions.', 'then click Help on your dashboard and tell us.'))
 where cle = 'debut_popup_follows_bloque' and valeur #>> '{}' like '%#questions%';
