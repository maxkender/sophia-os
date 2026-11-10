-- 0587 : le salon Slack des posteurs Ruul s'appelle #ruul-posters (avant :
-- #ruul-questions ; même salon, même id). Les règles des bots et les réponses
-- officielles qui le citent sont mises à jour (texte seulement).

update public.regles_bots set regle = replace(regle, '#ruul-questions', '#ruul-posters'), maj_at = now()
 where regle like '%#ruul-questions%';

update public.reponses_officielles set reponse = replace(reponse, '#ruul-questions', '#ruul-posters'), maj_at = now()
 where reponse like '%#ruul-questions%';
