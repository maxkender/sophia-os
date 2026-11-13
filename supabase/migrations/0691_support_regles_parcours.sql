-- 0691 : Support suit le parcours Ruul définitif (Max, 12/11).
-- 1. Trois règles de plus dans Support → Règles (lues par le bot partout) : mot de passe 12345678,
--    ne pas répondre aux emails (Help), le parcours Ruul (relances, report, arrêt, 14 jours).
-- 2. Le catalogue : plus de #questions ; la date limite dite « dimanche minuit (heure de Paris) ».
-- Additif pour les règles ; deux textes du catalogue modifiés à la demande de Max.
insert into public.support_infos (cle, titre, valeur, ordre)
select v.cle, v.titre, v.valeur, v.ordre
  from (values
    ('mot_de_passe', 'Mot de passe',
     'Password: 12345678 for everyone. The login is the @sophia.com address shown in the welcome email. There is never a "Set my password" link: if a poster can''t log in, the OS resets the password to 12345678 and emails the login again.', 14),
    ('emails_help', 'Répondre aux emails',
     'Don''t reply to our emails: click Help on your dashboard, you''ll get an answer there. (A reply to an email is still read and answered by email.)', 15),
    ('parcours_ruul', 'Parcours Ruul',
     'Ruul posters: one reminder per missing step (log in, TikTok, warm-up with 5+ follows, Slack); a Ruul reminder every 2 days until "It''s done" (6 at most). Not ready by Sunday midnight (Paris time): they simply start the following Monday. 14 days with no activity at all: access closed. "I do not wish to continue" at the bottom of every email closes the access after a confirmation; the last week posted is still paid.', 16)
  ) as v(cle, titre, valeur, ordre)
 where not exists (select 1 from public.support_infos s where s.cle = v.cle);

update public.faq_reponses
   set texte = replace(texte, 'then tell us in #questions.', 'then click Help on your dashboard and tell us.'), updated_at = now()
 where texte like '%tell us in #questions.%';

update public.faq_reponses
   set texte = replace(texte, 'before Sunday midnight', 'before Sunday midnight (Paris time)'), updated_at = now()
 where texte like '%before Sunday midnight%' and texte not like '%Sunday midnight (Paris time)%';
