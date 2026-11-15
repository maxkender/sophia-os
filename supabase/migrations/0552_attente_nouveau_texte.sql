-- 0552 : le message d'attente du bot FAQ devient « Thanks for your message!
-- I'm checking this and will get back to you today. » (à la place de « I've
-- passed your question to the team »). Ce n'est toujours pas une réponse :
-- texte_attente_equipe() le reconnaît, donc la question reste « sans réponse »,
-- la carte passe en ⚡ Urgent (problemes_faq_attente, 0541) et les bots ne
-- peuvent pas l'envoyer à la place d'une vraie réponse.
--
-- Additif : une fonction réécrite (les anciens textes restent reconnus).

create or replace function public.texte_attente_equipe(p_texte text)
returns boolean
language sql
immutable
as $$
  select coalesce(p_texte, '') ~* ('(passed|forwarded|sent|transferred|escalated|handed|relayed|shared)\s+(it\s+|this\s+)?(on\s+)?'
           || '((your|this|the)\s+)?((question|message|request|issue|query)\s+)?(on\s+|over\s+)?(to|with)\s+(the|our)\s+(team|admins?|managers?)')
      or coalesce(p_texte, '') ~* '(the|our)\s+team\s+will\s+(get\s+back|answer|reply|respond|look\s+into)'
      or coalesce(p_texte, '') ~* 'someone\s+(from|on)\s+(the|our)\s+team\s+will'
      -- 0552 : le nouveau message d'attente.
      or coalesce(p_texte, '') ~* 'i.?m\s+checking\s+(this|it)\s+and\s+will\s+get\s+back\s+to\s+you';
$$;
