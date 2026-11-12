-- 0683 : « Le cerveau du bot », partie 3 (Max, 12/11). 10 tests sur de vrais cas, avec la
-- réponse attendue. Un test peut simuler des demandes passées (colonne historique) pour le cas
-- « même question pour la 3e fois ». Les tests ne font que simuler : rien n'est envoyé ni écrit
-- sur une fiche. Additif : une colonne, dix lignes de test.

alter table public.bot_tests add column if not exists historique jsonb;

insert into public.bot_tests (message, poster_id, profil, source, attendu_niveau, attendu_contient, attendu_action, note)
select v.message, v.poster_id::uuid, null, v.source, v.niveau, v.contient, v.action, v.note
  from (values
  ('Hi, I still haven''t received my payment for the last two weeks. Where is it?',
   'a615c950-31a7-4afc-b547-dd2a0b403987', 'help', 'bot', array['It''s done']::text[], null::text,
   'Cerveau 12/11 · Yanis (Ruul Active, 2 semaines reportées) : pas « finalise ton compte », mais vérifier identité + moyen de paiement puis « It''s done ».'),
  ('How do I get paid?', 'ec500ac3-f7c0-41b1-b8fc-7c462877e11a', 'help', 'bot', array['Ruul']::text[], null,
   'Cerveau 12/11 · Ruul Invited : créer son compte Ruul depuis l''invitation, puis « It''s done ».'),
  ('I joined Ruul. Is there anything else I need to do to get paid?', '278e2c97-3d02-4086-a161-ccd499bb072d', 'help', 'bot', array['It''s done']::text[], null,
   'Cerveau 12/11 · Ruul Active : identité + moyen de paiement, puis « It''s done ».'),
  ('My weekly milestone is not funded on Upwork. When will I be paid?', 'cf74ae48-9f2f-4e80-8286-9418e82e4c72', 'help', 'max', array[]::text[], null,
   'Cerveau 12/11 · Maria Eugenia (Upwork, milestone non financé, contrat pas relié) : on vérifie, à Max.'),
  ('I still don''t have my payment.', 'b8a31752-fa0e-47aa-a2b9-cde0de935d6a', 'help', 'adrien', array[]::text[], null,
   'Cerveau 12/11 · même question pour la 3e fois (historique simulé) : pas la même réponse, à Adrien.'),
  ('When do I get paid?', 'b8a31752-fa0e-47aa-a2b9-cde0de935d6a', 'help', 'bot', array['Monday']::text[], null,
   'Cerveau 12/11 · Upwork : le lundi, d''après ses données.'),
  ('How much will I get paid this week?', '9973bc05-905f-44a2-8652-e7a7ad927863', 'slack_salon', null, array['Help']::text[], null,
   'Cerveau 12/11 · salon Slack : rien de perso, vers Help.'),
  ('Please stop my contract, I want to quit.', '9973bc05-905f-44a2-8652-e7a7ad927863', 'help', null, array[]::text[], 'arret',
   'Cerveau 12/11 · STOP clair : action arrêt.'),
  ('Can I manage a second account?', '278e2c97-3d02-4086-a161-ccd499bb072d', 'help', null, array['reviewed every week']::text[], null,
   'Cerveau 12/11 · 2e compte : seulement par la décision du samedi.'),
  ('Where is my Upwork milestone?', 'ec500ac3-f7c0-41b1-b8fc-7c462877e11a', 'help', null, array['Ruul']::text[], null,
   'Cerveau 12/11 · posteur Ruul qui parle d''Upwork : la réponse parle de Ruul, jamais d''Upwork.')
  ) as v(message, poster_id, source, niveau, contient, action, note)
 where not exists (select 1 from public.bot_tests b where b.note = v.note);

update public.bot_tests
   set historique = jsonb_build_array(
         jsonb_build_object('cree_at', '2026-11-10T09:00:00Z', 'categorie', 'paie', 'texte', 'Where is my payment for last week?',
                            'bot_reponse', 'You''re paid every Monday for the week before.'),
         jsonb_build_object('cree_at', '2026-11-11T09:00:00Z', 'categorie', 'paie', 'texte', 'I didn''t get my payment yet.',
                            'bot_reponse', 'You''re paid every Monday for the week before.'))
 where note like 'Cerveau 12/11 · même question pour la 3e fois%' and historique is null;
