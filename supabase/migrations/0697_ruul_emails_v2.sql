-- 0697 (Réparer Ruul, 13/11) : l'interrupteur du nouveau format des emails Ruul, éteint.
-- "on" : titre « Vik Studios », liens à usage unique sur le dashboard (/r/…), emails A/B par le moteur
-- du parcours (un seul système), confirmation d'arrêt. "off" : le format actuel. Additif : un réglage.
insert into public.reglages (cle, valeur)
select 'ruul_emails_v2', '"off"'::jsonb
 where not exists (select 1 from public.reglages where cle = 'ruul_emails_v2');
