-- 0741 : ouverture du Monténégro (ME) et de la Bosnie-Herzégovine (BA) (Max, 17/11), comme la Serbie (RS).
-- 1. Paie : zone C (7 $/semaine), payables par Upwork et par Ruul (ruul_tarif et la paie Upwork lisent zones_paie_pays).
-- 2. Langue : « sr » (mêmes contenus que RS) pour le parrainage ; le code (accueil, hub, pays proposés) fait de même.
-- 3. Recrutement : même HM que RS (hm_pays), parrainage ouvert comme RS (parrainage_pays), ligne d'objectifs vide.
-- Additif : lignes ajoutées (rien si elles existent déjà), une fonction recréée avec deux paires en plus.

insert into public.zones_paie_pays (pays, zone)
values ('ME', 'C'), ('BA', 'C')
on conflict (pays) do nothing;

insert into public.hm_pays (pays, hm_id, hm_nom, zone)
select v.pays, r.hm_id, r.hm_nom, r.zone
  from public.hm_pays r cross join (values ('ME'), ('BA')) v(pays)
 where r.pays = 'RS'
on conflict (pays) do nothing;

insert into public.parrainage_pays (pays, envoi_auto, recrutement_ouvert)
select v.pays, r.envoi_auto, r.recrutement_ouvert
  from public.parrainage_pays r cross join (values ('ME'), ('BA')) v(pays)
 where r.pays = 'RS'
on conflict (pays) do nothing;

insert into public.pays_objectifs (pays)
values ('ME'), ('BA')
on conflict (pays) do nothing;

create or replace function public.parrainage_langue_pays(p_pays text)
returns text
language sql
immutable
as $function$
  select coalesce((select l from (values
    ('FR','fr'),('MC','fr'),('BE','fr'),('LU','fr'),('CH','de'),('DE','de'),('AT','de'),('LI','de'),('IT','it'),('SM','it'),('ES','es'),
    ('MX','es-419'),('CO','es-419'),('AR','es-419'),('CL','es-419'),('PE','es-419'),('EC','es-419'),('CR','es-419'),('UY','es-419'),
    ('VE','es-419'),('BO','es-419'),('PY','es-419'),('GT','es-419'),('DO','es-419'),('HN','es-419'),('NI','es-419'),('PA','es-419'),('SV','es-419'),
    ('PT','pt'),('BR','pt-BR'),('AO','pt'),('MZ','pt'),('NL','nl'),('PL','pl'),('RO','ro'),('MD','ro'),('HU','hu'),('CZ','cs'),('SK','sk'),
    ('BG','bg'),('GR','el'),('CY','el'),('HR','hr'),('SI','sl'),('RS','sr'),('ME','sr'),('BA','sr'),('SE','sv'),('NO','no'),('DK','da'),('FI','fi'),('EE','et'),
    ('LV','lv'),('LT','lt'),('TR','tr'),('IL','he'),('AE','ar'),('SA','ar'),('EG','ar'),('MA','ar'),('RU','ru'),('BY','ru'),('KZ','ru'),('JP','ja')
  ) m(p, l) where m.p = upper(p_pays)), 'en');
$function$;
