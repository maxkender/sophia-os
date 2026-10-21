-- 0337 : la FAQ fait valider ce dont elle n'est pas sûre.
--
-- Jusqu'ici le cerveau répondait (« repondu ») ou passait la main (« inconnu »
-- → « À traiter »). Entre les deux, quand le guide parle du sujet sans couvrir
-- clairement le cas, il a maintenant une cinquième décision, « incertain » : il
-- écrit sa réponse probable, rien ne part (sur Slack, seulement le message
-- d'attente), et la question arrive dans « À traiter » avec cette réponse
-- pré-remplie, état `a_valider`. L'admin vérifie, corrige si besoin, envoie.
-- Voir docs/faq-automatique.md.
--
-- Retour arrière :
--   update public.chatbot_questions set etat = 'a_traiter' where etat = 'a_valider';
--   puis remettre la contrainte et l'index de 0331.

alter table public.chatbot_questions
  drop constraint if exists chatbot_questions_etat_check;
alter table public.chatbot_questions
  add constraint chatbot_questions_etat_check check (
    etat is null or etat in (
      'repondu', 'bug', 'hors_sujet', 'a_valider', 'a_traiter', 'relance',
      'traite_admin', 'traite_slack', 'ignore'
    )
  );

drop index if exists public.chatbot_questions_a_traiter_idx;
create index if not exists chatbot_questions_a_traiter_idx
  on public.chatbot_questions (created_at desc)
  where etat in ('a_valider', 'a_traiter', 'relance');
