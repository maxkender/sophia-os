-- 0836 (22/11, Max) : un posteur Ruul à 2 comptes TikTok est payé pour les deux au même endroit, sur son compte Ruul
-- actuel : pas de 2e compte Ruul ni de 2e vérification. La réponse officielle (Help, bot) et une consigne. Additif.
insert into public.reponses_officielles (question, reponse, ordre, actif, portee, niveau, formulations)
select 'Ruul: I have 2 TikTok accounts, do I need a second Ruul account or a second verification?',
       'You are paid for both accounts in the same place, your current Ruul account: no new Ruul account or verification needed.',
       75, true, 'ruul', 'bot',
       array['I have two emails for my two accounts', 'I can only do one verification on Ruul', 'will I be paid for both accounts on Ruul']
where not exists (select 1 from public.reponses_officielles where question like 'Ruul: I have 2 TikTok accounts%');
update public.reponses_officielles set valide_at = now()
 where question like 'Ruul: I have 2 TikTok accounts%' and valide_at is null;

insert into public.support_consignes (texte, actif)
select x, true from unnest(array[
  'Ruul et 2 comptes TikTok : le posteur ne crée ni 2e compte Ruul ni 2e vérification (ni 2e email) ; il est payé pour les deux comptes sur son compte Ruul actuel. Chaque message de doublement Ruul le dit.'
]) x
where not exists (select 1 from public.support_consignes c where c.texte = x);
