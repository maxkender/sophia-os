-- 0804 : les règles du bot à jour (Max, 21/11, « SUPPORT + BOTS », points 4 et 5). Rien n'est supprimé : les règles
-- périmées ou en double sont désactivées (actif / active / bot_actif = false), les autres réécrites, les manquantes créées.
-- Priorité : 1) réponses officielles, 2) règles (consignes + règles des bots), 3) une page Notion par sujet.

-- 1. Réponses officielles.
update public.reponses_officielles set reponse = $t$1. Click Help on your dashboard: you get an answer right away, and if needed it goes to our team.
2. Slack, in the right channel: #posting-help for problems with your posts, #ruul-posters or #upwork-posters for your platform.
3. Money or anything personal: ask Help. We answer you privately (by email and in Help), never in a public channel.$t$, maj_at = now()
 where id = 'f0404840-9edd-4586-a44e-a36970d40ba9';
update public.reponses_officielles set reponse = $t$Ask Help on your dashboard: we answer you privately (by email and in Help) with your week, the amount and the date. Never post amounts in a public channel.$t$, maj_at = now()
 where id = '9dfde107-dd65-4bbe-afd9-c7bfff807eb4';
update public.reponses_officielles set reponse = $t$Every Monday, for the week of posts that just ended (Monday → Sunday), through Ruul. Nothing to submit. Ready on Ruul before Sunday 23:59 (Paris) = paid on Monday. Because of bank validation, the money usually reaches your account 1 to 2 business days later (Tuesday or Wednesday). Your first payment is the Monday after your first week of posts. Payment questions are answered privately (email and Help).$t$,
       valide_at = coalesce(valide_at, now()), maj_at = now()
 where id = 'd8155c2a-385e-4ebc-8c25-856c347ccd5c';
update public.reponses_officielles set reponse = $t$Here is how referral works:
- Your friend doesn't need Upwork or any freelancing account: they apply directly with the link we email them.
- Same job as yours: 2 posts a day, 7 days a week, warm-up first, start on a Monday, ongoing week after week.
- Your friend will see their own pay on their dashboard.
- You get a $10 bonus once your friend's first week has been paid, once per friend, with your next pay (on your Upwork contract, or in your Monday Ruul payment). Never in cash.
- Tell your friend to watch their inbox (and spam folder): the email comes from Vik Studios.
- You can follow each referral's status on your dashboard ("Refer a friend"): invited → applied → accepted → started → bonus paid.$t$,
       valide_at = coalesce(valide_at, now()), maj_at = now()
 where id = 'd728d6cb-8c94-41c4-9e7e-cae71936028f';
update public.reponses_officielles set reponse = $t$Within 24 hours you receive an invitation email from Ruul. Create your account FROM that email, with the email address shown on your dashboard. Then verify your ID, add your bank account and click It's done on your dashboard. Already have a Ruul account with another email? Reply with that email: we update it on our side and Ruul sends you a new invitation. The code is sent by Ruul (click "Resend code", check your spam folder).$t$, maj_at = now()
 where id = 'b3a63f77-819f-4ee4-9bc4-ecf01d3a2b2a';
update public.reponses_officielles set reponse = $t$Your contract doesn't end on its own: it continues as long as you post. Just keep posting as usual.$t$, maj_at = now()
 where id = '8ab8a374-505e-4639-ac94-0d8a094a996e';
update public.reponses_officielles set portee = 'tous', question = 'Which countries can I refer a friend from?', maj_at = now()
 where id = 'd8050db0-84ff-4b9e-8629-6baba516b9d9';
update public.reponses_officielles set question = 'What happens to the TikTok account?',
       reponse = $t$The TikTok account is used to promote an app. It belongs to you, but you can't post anything else on it. It is usually deleted once the collaboration ends.$t$, maj_at = now()
 where id = '73a89418-f088-4c2c-9d1a-f0696a8e85c4';
update public.reponses_officielles set reponse = $t$Follow at least 5 accounts in your language, in the niche of the app you post for (such as general knowledge or study content). Staying in your own language and in your app's niche tells TikTok what your account is about.$t$, maj_at = now()
 where id = 'f3c6c383-a1cf-4a64-9dc3-0db2b022ea07';
update public.reponses_officielles set reponse = $t$Your first post is always on a Monday, after your warm-up. New slideshows appear at midnight. Also check if a feedback note is covering your posts on your dashboard and tap "Got it" to clear it. If you have been posting every day and nothing is scheduled today, it's on our side: the technical team is looking into it and you don't need to post today.$t$, maj_at = now()
 where id = '55bdea1f-7ae7-401d-8047-09c62fcf8d8e';
-- Doublons et pied « Automatic answer » : retirés du bot.
update public.reponses_officielles set actif = false, maj_at = now()
 where left(id::text, 8) in ('cc168103', 'b91d4d71', 'eccf2303', '5a1e8385');

-- Un texte modifié perd sa validation (trigger) : les réponses réécrites ci-dessus sont validées (OK de Max du 21/11).
update public.reponses_officielles set valide_at = now()
 where actif and valide_at is null and left(id::text, 8) in ('f0404840', '9dfde107', 'b3a63f77', 'd8050db0', '73a89418', '8ab8a374', 'f3c6c383', '55bdea1f');

-- 2. Consignes du support (périmées réécrites, doublons désactivés).
update public.support_consignes set texte = $t$[Règle fixe] Tarifs par semaine : zone A 14 $, zone B 10 $, zone C 7 $. 2e compte : décidé le JEUDI, proposé au posteur qui doit l'accepter ; paie × 2 à partir du lundi qui suit son accord. Ne le promets jamais, ne dis jamais oui ni non : « Extra accounts are reviewed every week based on consistency and results. »$t$, maj_at = now()
 where id = 'fe347160-046c-4bdc-8b78-198cfeb94b8a';
update public.support_consignes set texte = $t$[Règle fixe] ARRÊT : une demande claire (« STOP », « I want to end the contract », « I want to stop », « quit » et leurs équivalents dans toutes les langues) = fin immédiate de la collaboration. Doute (frustration, « I'm going to stop if… », « the app stopped », « stop sending me… ») : une seule question « Do you want to end our collaboration? Yes / No », jamais un arrêt. Message de fin : « We're ending our collaboration today, thank you for your understanding. » + « Your last week will of course be paid on Monday [date]. » seulement si une semaine est due.$t$, maj_at = now()
 where id = 'e898dfe8-9f5e-474b-a008-0b3c8e3c8bec';
update public.support_consignes set texte = $t$[Règle fixe] Réponds tout de suite avec la vraie réponse, précise (son prénom, sa semaine, son montant, sa date, son étape). « We're checking your case, you'll get an answer within 24 h » seulement si tu remontes vraiment la demande. Tout ce qui est personnel ou financier part en privé (email + Help, jamais en DM Slack) ; dans un salon, réponds la règle générale et « I've answered you privately ».$t$, maj_at = now()
 where id = '05679c20-5133-411f-9741-6b8e1cb54212';
update public.support_consignes set texte = $t$[Règle fixe] Ruul : identité refusée → la raison et comment refaire ; 2e refus → proposer Upwork (lien du profil Upwork). Pays ou banque non acceptés par Ruul → Upwork automatiquement. Pays fermés au recrutement : Portugal, Indonésie.$t$, maj_at = now()
 where id = '5bf7c846-8eed-41cb-8ce2-d9d8404ad63d';
update public.support_consignes set texte = $t$[Règle fixe] Paie : chaque lundi pour la semaine qui vient de finir (lundi → dimanche). Upwork : sur milestone ; cite la semaine, le montant et la date tirés de sa fiche. Ruul : jamais Upwork ni milestone ; pas prêt → l'étape exacte qui lui manque + « Ready before Sunday 23:59 (Paris) = paid on Monday » ; l'argent arrive 1 à 2 jours ouvrés après le lundi (validation bancaire), pas d'escalade avant jeudi. Si tu ne trouves pas la donnée d'argent : escalade.$t$, maj_at = now()
 where id = 'e455f433-bf74-47af-9a70-a7073c5b5d3c';
update public.support_consignes set actif = false, maj_at = now() where left(id::text, 8) in ('f8a32f88', 'c494b9cb');

-- Les règles cibles qui n'avaient aucune source.
insert into public.support_consignes (texte, actif)
select x, true from (values
  ($t$[Règle fixe] POSTEUR ARRÊTÉ : plus aucune réponse ni relance. S'il écrit encore, une seule réponse : « Your collaboration has been ended. »$t$),
  ($t$[Règle fixe] « JE VEUX ÊTRE PAYÉ SUR UPWORK » (posteur Ruul) : la 1re fois, explique Ruul une fois (pas de frais, payé le lundi, sa prochaine étape). S'il redemande : exception Upwork (lien de son profil Upwork, offre de la HM, plateforme UPWORK à l'acceptation).$t$),
  ($t$[Règle fixe] « JE N'AI PAS DE POSTS » : posteur arrêté → dis-le ; erreur de notre côté (tâche ratée, assignation en panne, aucun post prévu après le warm-up) → « The technical team is looking into it » + ticket #os-tickets ; il a ses posts → montre où les trouver ; raison inconnue → réponse neutre, pas d'escalade.$t$),
  ($t$[Règle fixe] POSTS / LIENS : s'il a posté, c'est bon. Son indisponible, slot raté, lien oublié : les réponses officielles. Bugs connus (texte sur la photo, images qui ne correspondent pas, mauvaise langue, image qui ne se télécharge pas, étape 5) : la réponse officielle ; seulement un bug vraiment nouveau ou un écran cassé → ticket #os-tickets.$t$),
  ($t$[Règle fixe] BONUS QUESTIONNAIRE : seulement pour les 30 posteurs ciblés, envoyé dès le questionnaire terminé (Upwork : bonus immédiat ; Ruul : prochain lot du lundi). Ne le propose jamais à quelqu'un qui n'est pas ciblé.$t$),
  ($t$[Règle fixe] COMMENT MASTERS : cycle de 4 semaines (le dernier a démarré le lundi 3/11, le prochain le lundi 1/12). Ne propose jamais le rôle toi-même. Aux Comment Masters, réponds avec les règles en place (où est la demande, comment poster, paiement).$t$),
  ($t$[Règle fixe] PARRAINAGE : 10 $ au parrain après la 1re semaine PAYÉE de l'ami, une fois par ami, avec sa prochaine paie. Jamais de date, jamais de montant pour l'ami, jamais de cash ; l'ami n'a pas besoin d'Upwork. Statut de chaque ami : sa fiche.$t$)
) v(x)
where not exists (select 1 from public.support_consignes c where c.texte = v.x);

-- 3. Règles des bots.
update public.regles_bots set regle = replace(regle, 'Doubler se décide seulement le samedi', 'Doubler se décide le JEUDI (Max), puis le posteur accepte'), maj_at = now()
 where id = 'e61204b9-1f7b-4810-a9e8-b22d166da03b';
update public.regles_bots set regle = $t$Un 2e compte n'est accordé QUE par la décision du JEUDI (Max), puis l'accord du posteur. Ne le promets jamais, ne dis jamais oui ni non : réponds mot pour mot « Extra accounts are reviewed every week based on consistency and results. »$t$, maj_at = now()
 where id = '8a77471e-51d5-4ca4-aeee-81a817b2ee7f';
update public.regles_bots set regle = regle || $t$ Exception : un vrai bug nouveau, ou « pas de posts » par notre faute : « The technical team is looking into it » + ticket #os-tickets.$t$, maj_at = now()
 where id = 'a8bb20e9-35f9-4203-b1d7-95efe1533ae8' and regle not like '%technical team%';
update public.regles_bots set regle = $t$Parrainage, bonus : 10 $ au parrain dès que la 1re semaine de l'ami a été PAYÉE, une seule fois par ami, jamais en cash. Parrain sur Upwork : bonus sur son contrat. Parrain Ruul : avec son paiement Ruul du lundi.$t$, maj_at = now()
 where id = 'ece43bc6-7c88-414e-a476-bde038b8ec8c';
update public.regles_bots set regle = $t$Posteur Ruul (canal_paie = ruul) : payé chaque lundi via Ruul, jamais sur Upwork. Ne parle jamais d'Upwork, de milestone, de « Submit », ni de retenue. Question d'argent : réponse en privé (email + Help), jamais en DM Slack ni dans un salon ; dans le salon : « I've answered you privately ».$t$, maj_at = now()
 where id = '0ccec7cc-8722-4a03-8946-80dd631eb284';
update public.regles_bots set regle = replace(replace(regle, '(paie, kill, doubler, recréer, samedi)', '(paie, arrêt, doubler, recréer)'), 'Max les décide dans Weekly decisions', 'Max les décide dans Aujourd''hui'), maj_at = now()
 where id = 'd7e9e466-0c1e-492c-b3af-576341eccb50';
update public.regles_bots set active = false, maj_at = now() where left(id::text, 8) in ('b33c9e70', '0e0bdda2');

-- 4. Contexte du chatbot : doublons, réponses internes et périmées retirées ; « bot » retiré.
update public.chatbot_contexte set actif = false, updated_at = now()
 where left(id::text, 8) in ('87cceee8', '68b8c715', '753f148b', 'd3ab6f7f', '1a91df62', 'e0bdb47b', '0793163d', 'ffaaeec9',
                             '4336d8c9', '3cf8d64f', '04cd1846', '5274014a', 'aacf026f', 'fe826b99', '2d548b9f');
update public.chatbot_contexte set contenu = $t$It's fine: if you posted, it counts. You can use "Delete and Edit" to add the text if you want, it isn't required.$t$, updated_at = now()
 where left(id::text, 8) = '1c4a7314';
update public.chatbot_contexte set contenu = $t$The review can be wrong: if you think it is, use Dispute.$t$, updated_at = now()
 where left(id::text, 8) = '52b02303';

-- 5. Document du support : arrêts et plateformes à jour.
update public.support_documents
   set contenu = replace(replace(replace(contenu,
         '- On ne propose jamais Ruul à un posteur Upwork, ni Upwork à un posteur Ruul.',
         '- Un posteur Ruul passe sur Upwork seulement par exception (pays ou banque refusés par Ruul, 2e refus d''identité, 2e demande).'),
         '- Les kills se font seulement le samedi.',
         '- Demande claire = fin immédiate (message de fin, contrat ou Ruul, Slack, compte). Doute = une seule question Yes / No.'),
         '1re paie Ruul le 23/11.', 'L''argent arrive 1 à 2 jours ouvrés après le lundi.'),
       maj_at = now()
 where id = 'd891dc0d-b195-41d3-a82a-d0b26fcb7cfd';
update public.documents set bot_actif = false where left(id::text, 8) in ('840eaaab', '289b25a9', 'c9d6c7b7', '4b630d95', '50052538');

-- 6. Faits qui changent.
update public.support_infos set valeur = 'Ruul: paid every Monday through Ruul for the week of posts that just ended (Monday to Sunday). Ready on Ruul before Sunday 23:59 (Paris) = paid on Monday. The money usually arrives 1 to 2 business days later (bank validation).', maj_at = now()
 where cle = 'paie_ruul';
update public.support_infos set valeur = 'Referral bonus: $10 to the person who referred a friend, once the friend''s first week has been paid. Once per friend, never in cash.', maj_at = now()
 where cle = 'bonus_parrainage';
update public.support_infos set valeur = 'Portugal (PT) and Indonesia (ID) are closed to new posters. A Ruul poster whose country or bank Ruul does not accept is paid on Upwork instead.', maj_at = now()
 where cle = 'pays_fermes';

-- 7. FAQ du posteur arrêté : une seule phrase.
update public.faq_reponses set texte = 'Your collaboration has been ended.', updated_at = now()
 where left(id::text, 8) in ('ea0509ca', '9bfb463a', 'e22087b4', '647f383d');

-- 8. Pages Notion : les pages archivées du guide manager et les pages du guide poster en conflit avec les règles ne sont
--    plus lues par les bots (à corriger dans Notion : Poster Guide, Quick answers, The job and your terms, Getting paid,
--    Slack and help, Joined through our website, FAQ for the assistant).
update public.guides_notion set bot_actif = false where bot_actif and chemin ilike '%archiv%';
update public.guides_notion set bot_actif = false
 where bot_actif and guide = 'poster'
   and titre in ('Vik Studios - TikTok Poster Guide', 'Quick answers', 'The job and your terms', 'Getting paid and missed posts',
                 'Slack and help', 'Joined through our website? Your dates, step by step', 'FAQ for the assistant');

-- 9. Arrêt : une demande claire = fin immédiate (OK de Max du 21/11).
insert into public.reglages (cle, valeur) values ('arret_immediat', 'true'::jsonb)
on conflict (cle) do update set valeur = 'true'::jsonb;
