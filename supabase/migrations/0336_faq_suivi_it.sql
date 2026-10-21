-- 0336 : le journal de la FAQ suit ce que l'IT guy fait d'un bug.
--
-- Sur un bug, la FAQ se tait et l'IT guy prend le relais (docs/faq-automatique.md).
-- Le journal disait seulement « l'IT guy le prend », sans savoir s'il l'avait
-- vu : c'était le cas de Regina le 21/10, pris en charge mais rien ne le montrait.
-- `slack-faq` lit déjà le fil de chaque question qu'il suit ; il note maintenant
-- où en est l'IT guy :
--   pris_en_charge  son « on it » est dans le fil (ticket ouvert, ✅ attendu) ;
--   repondu         une réponse de l'équipe est arrivée dans le fil après coup.
--
-- Additive : deux colonnes nullables.
-- Retour arrière : alter table public.chatbot_questions drop column it_statut,
--   drop column it_maj_at;

alter table public.chatbot_questions
  add column if not exists it_statut text,
  add column if not exists it_maj_at timestamptz;

alter table public.chatbot_questions
  drop constraint if exists chatbot_questions_it_statut_check,
  add constraint chatbot_questions_it_statut_check
    check (it_statut is null or it_statut in ('pris_en_charge', 'repondu'));

-- Les bugs déjà vus le 21/10 : un « on it » gardé comme réponse de l'équipe.
update public.chatbot_questions
   set it_statut = 'pris_en_charge', it_maj_at = coalesce(it_maj_at, now())
 where etat = 'bug' and it_statut is null and reponse_humaine ~* '^\s*on it\M';
