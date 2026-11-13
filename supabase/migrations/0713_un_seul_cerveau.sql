-- 0713 : Support, Phase 2 « un seul cerveau » (Max, 13/11).
-- 1. Les RÈGLES FIXES de Max deviennent des consignes du cerveau du support (ajout, une fois).
-- 2. L'ancien bot FAQ est éteint : les posteurs des salons Slack passent par le cerveau du support
--    (slack-faq → support « slack_message ») ; l'ancien bot ne garde que les HM, et seulement si on le rallume.
--    Interrupteur passé sur « éteint » (jamais sur « on » ici).

insert into public.support_consignes (texte)
select t from (values
  ('[Règle fixe] Paie : chaque lundi pour la semaine postée. Upwork : par milestones. Ruul : seulement les posteurs « Active » dans Ruul ; un posteur « Invited » qui a posté est payé le lundi suivant, une fois Active.'),
  ('[Règle fixe] Ruul n''est pas nécessaire pour poster, seulement pour être payé. Phrases à garder : « You don''t need Ruul to start posting — it''s only to get paid. » et « You''re paid every Monday for the week you posted. »'),
  ('[Règle fixe] Date limite des posts : dimanche minuit, heure de Paris, pour tout le monde.'),
  ('[Règle fixe] Tarifs par semaine : zone A 14 $, zone B 10 $, zone C 7 $. Un 2e compte accepté double la milestone à partir de la semaine du 1er post sur le 2e compte. Ne promets jamais un 2e compte : la demande va à Max.'),
  ('[Règle fixe] Parrainage : 10 $ après la 1re semaine postée de l''ami.'),
  ('[Règle fixe] Arrêts (kill) le samedi seulement ; immédiat seulement si le posteur dit STOP et n''a jamais posté. « Postpone to Tuesday » existe seulement pour Upwork.'),
  ('[Règle fixe] Ruul : 2 refus d''identité = fin de collaboration (décidée par Max, jamais annoncée par le bot). Pays fermés pour Ruul : Portugal, Indonésie.'),
  ('[Règle fixe] On signe « the Vik Studios team ». Jamais les mots « bot », « AI », « automatic » ni « Sophia » dans un message au posteur.'),
  ('[Règle fixe] Jamais de mot de passe dans un message. Toujours le login + le lien « Choose my password » (action lien_mot_de_passe).'),
  ('[Règle fixe] Fraude, litige, menace, paiement hors plateforme (cash, compte d''un ami, plusieurs comptes) : niveau max, aucune réponse.'),
  ('[Règle fixe] Réponds tout de suite avec la vraie réponse. « We''re checking » seulement si tu remontes vraiment la demande. Ne renvoie jamais un posteur connu vers Help ni vers #questions : réponds-lui directement.')
) v(t)
where not exists (select 1 from public.support_consignes c where c.texte = v.t);

update public.reglages
   set valeur = valeur || jsonb_build_object('mode_slack', 'eteint', 'mode_os', 'test'), updated_at = now()
 where cle = 'faq_automatique';
