-- 0580 : ouverture de 5 pays (demande de Max, 9/11) : Bolivie, Équateur,
-- Venezuela, Liban, Arabie saoudite.
--
-- Zone de paie (comme leurs voisins déjà ouverts) : BO, EC, VE, LB en zone C
-- (comme MX, CO, AR) ; SA en zone B (comme AE). Langue de publication : la
-- plus parlée parmi celles de l'OS : es-419 (BO, EC, VE), ar (LB, SA). Le
-- routage des HM se fait par la langue (es-419 : Kris ; ar : Nana, Amanda).
-- Parrainage : envoi et recrutement ouverts, comme les autres pays.
-- Additif : des lignes de réglage par pays ; un pays déjà présent n'est pas touché.

insert into public.zones_paie_pays (pays, zone) values
  ('BO', 'C'), ('EC', 'C'), ('VE', 'C'), ('LB', 'C'), ('SA', 'B')
on conflict (pays) do nothing;

insert into public.parrainage_pays (pays, envoi_auto, recrutement_ouvert, maj_at) values
  ('BO', true, true, now()), ('EC', true, true, now()), ('VE', true, true, now()),
  ('LB', true, true, now()), ('SA', true, true, now())
on conflict (pays) do nothing;
