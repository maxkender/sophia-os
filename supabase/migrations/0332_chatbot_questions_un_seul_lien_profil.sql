-- 0332 : chatbot_questions n'a plus qu'un lien vers profiles (user_id).
--
-- 0331 avait ajouté `traite_par references profiles` : avec deux clés vers la
-- même table, PostgREST ne sait plus quel profil embarquer dans
-- `select … profiles(prenom, nom, email)` et répond « more than one
-- relationship was found » — la page Assistant (Questions posées, À traiter,
-- journal) cassait. `traite_par` reste une colonne uuid sans clé étrangère :
-- c'est une trace, pas une relation qu'on lit. Le front nomme aussi la clé
-- qu'il suit (`profiles!chatbot_questions_user_id_fkey`), pour qu'un lien de
-- plus ne recasse rien.
--
-- Déjà appliquée en prod le 21/10.
-- Retour arrière : inutile (rajouter la clé recasserait l'embed sans indice).

alter table public.chatbot_questions
  drop constraint if exists chatbot_questions_traite_par_fkey;

notify pgrst, 'reload schema';
