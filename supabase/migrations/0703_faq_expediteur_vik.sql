-- 13/11 (Max) : « Vik Studios » partout. Les emails partent maintenant au nom de « Vik Studios »
-- <support@vikstudios.com> : la réponse FAQ du parrainage le dit.
update public.reponses_officielles
   set reponse = replace(reponse, 'the email comes from Sophia.', 'the email comes from Vik Studios.'),
       maj_at = now()
 where reponse like '%the email comes from Sophia.%';
