-- Ordre Fal / Replicate pour le nettoyage d'images (réglage admin).
insert into public.reglages (cle, valeur)
values ('nettoyage', '{"provider_principal": "fal"}'::jsonb)
on conflict (cle) do nothing;
