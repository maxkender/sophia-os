-- Pause des assignations automatiques (cron minuit + rattrapage).
-- Manuel via /admin/minuit reste possible (body.manuel = true).

insert into public.reglages (cle, valeur)
values ('assignation_auto', '{"actif": true}'::jsonb)
on conflict (cle) do nothing;

notify pgrst, 'reload schema';
