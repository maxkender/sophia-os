-- Prompt 21, P3 : la réponse d'attente à une question de paie que l'OS ne
-- peut pas régler seul (le message va ensuite dans « Pay questions »).
-- Modifiable dans Settings → Payroll messages.
insert into public.reglages (cle, valeur) values
  ('paie_reponse_attente_texte', to_jsonb('Thanks, we''re checking it. We''ll reply here within 24 hours.'::text))
on conflict (cle) do nothing;
