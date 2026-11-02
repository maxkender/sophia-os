-- Prompt 13 : les questions passent par #questions ; le @ TikTok dans la bienvenue.
--
-- 1. posteur_reponses.lien / transmis_par : un message envoyé à l'OS par une HM
--    (raccourci Slack « Send to OS ») garde le lien du message et qui l'a envoyé.
-- 2. slack_questions_texte / slack_questions_canal : le message épinglé de
--    #questions (bouton dans Settings → FAQ bot), en anglais, modifiable.
-- 3. accueil_message_texte : la ligne « • Your TikTok account to create:
--    @{handle} (use exactly this name) » juste après la ligne Login, et la fin
--    « Questions: post them in #questions. Please don't DM the team. ». Seulement
--    si le texte contient encore ces repères (un texte déjà changé à la main
--    n'est pas touché pour la fin ; la ligne @ n'est ajoutée qu'une fois).

alter table public.posteur_reponses add column if not exists lien text;
alter table public.posteur_reponses add column if not exists transmis_par uuid references public.profiles(id) on delete set null;
comment on column public.posteur_reponses.lien is
  'Prompt 13 : le lien Slack du message quand une HM l''a envoyé à l''OS (raccourci « Send to OS »).';

insert into public.reglages (cle, valeur) values
  ('slack_questions_texte', to_jsonb('Questions: post them in #questions. Please don''t DM the team.'::text)),
  ('slack_questions_canal', to_jsonb('C0BL56RJH7T'::text))
on conflict (cle) do nothing;

update public.reglages
   set valeur = to_jsonb(replace(
         valeur #>> '{}',
         E'• Login: {email} · Password: {mot_de_passe}\n',
         E'• Login: {email} · Password: {mot_de_passe}\n• Your TikTok account to create: @{handle} (use exactly this name)\n'
       )),
       updated_at = now()
 where cle = 'accueil_message_texte'
   and jsonb_typeof(valeur) = 'string'
   and position('{handle}' in valeur #>> '{}') = 0
   and position(E'• Login: {email} · Password: {mot_de_passe}\n' in valeur #>> '{}') > 0;

update public.reglages
   set valeur = to_jsonb(replace(
         valeur #>> '{}',
         'For any question about the work, ask on Slack.',
         'Questions: post them in #questions. Please don''t DM the team.'
       )),
       updated_at = now()
 where cle = 'accueil_message_texte'
   and jsonb_typeof(valeur) = 'string'
   and position('For any question about the work, ask on Slack.' in valeur #>> '{}') > 0;

notify pgrst, 'reload schema';
