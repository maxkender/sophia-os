-- 0273 : zone de recrutement d'un recruteur (HM, DM, Head of Ops).
--
-- profiles.zone_recrutement : les pays dont le recruteur s'occupe, tels que la
-- master list Notion les écrit (« Turkey + Israel », « France »…). Ses
-- créateurs en héritent par `manager_id` : la page Posters les range par zone.
-- À ne pas confondre avec la zone de PAIEMENT A/B/C des guides créateur
-- (posterGuide.ts), déduite de la langue — d'où ce nom.
--
-- Additive : colonne nullable, aucune lecture existante ne change. Le
-- remplissage ne touche qu'une zone encore vide (rejouable sans écraser une
-- zone modifiée depuis l'OS).

alter table public.profiles add column if not exists zone_recrutement text;

alter table public.profiles drop constraint if exists profiles_zone_recrutement_format;
alter table public.profiles add constraint profiles_zone_recrutement_format check (
  zone_recrutement is null
  or (zone_recrutement = btrim(zone_recrutement) and length(zone_recrutement) between 1 and 80)
);

comment on column public.profiles.zone_recrutement is
  'Zone d''un recruteur (pays gérés, master list Notion). Ses créateurs en héritent via manager_id. Sans rapport avec la zone de paiement A/B/C.';

-- Recruteurs déjà dans l'OS, d'après la master list Notion (10/10/2026).
update public.profiles p
set zone_recrutement = z.zone
from (values
  ('amandac@sophia.com', 'Turkey + Israel'),
  ('luciad1@sophia.com', 'Italy + Croatia + Slovenia'),
  ('krisa@sophia.com', 'Spain + Portugal'),
  ('pelinsue@sophia.com', 'Poland + Netherlands'),
  ('reginan@sophia.com', 'Germany + Norway'),
  ('waqass@sophia.com', 'Romania + Sweden'),
  ('erlam@sophia.com', 'Estonia + Finland + Russian-speaking'),
  ('margheritap@sophia.com', 'Greece + Denmark'),
  ('sarab@sophia.com', 'France'),
  ('afafw@sophia.com', 'UAE + Slovakia')
) as z(email, zone)
where p.email = z.email and p.zone_recrutement is null;
