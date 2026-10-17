-- 0278 : pays du compte, distinct de sa langue.
--
-- `comptes.langue` est la langue de PUBLICATION : c'est elle qui choisit le
-- deck traduit, et elle seule. Comme `PAYS_OS = LANGUES_CIBLES` côté front, un
-- code valait aussi « pays », donc les comptes du Royaume-Uni, des États-Unis,
-- d'Australie, de Nouvelle-Zélande et d'Irlande portaient tous `en` et le même
-- drapeau 🇬🇧. Impossible de voir d'un coup d'œil où est un posteur, ni de
-- bâtir des cibles de recrutement par pays.
--
-- `comptes.pays` porte donc le MARCHÉ du compte, en ISO-3166-1 alpha-2. Rien
-- dans le moteur ne le lit : l'assignation, la traduction et le placement
-- continuent de ne regarder que `langue`. C'est une colonne d'affichage et de
-- pilotage, pas de production.
--
-- Additive : colonne nullable, aucune lecture existante ne change.
-- Le remplissage déduit le pays de la langue, UNIQUEMENT là où la langue ne
-- désigne qu'un pays. Les langues parlées dans plusieurs de nos marchés sont
-- laissées à NULL volontairement, pour que le HM tranche au lieu de voir un
-- défaut faux : `en` (UK/US/AU/NZ/IE), `ar` (UAE/Égypte) et `es-419` (toute
-- l'Amérique latine). Rejouer la migration ne touche qu'un pays NULL.
-- Retour arrière : retirer la lecture côté front (listerComptes fait
-- `select *`), puis `alter table public.comptes drop column pays;`.

alter table public.comptes add column if not exists pays text;

alter table public.comptes drop constraint if exists comptes_pays_format;
alter table public.comptes add constraint comptes_pays_format check (
  pays is null or pays ~ '^[A-Z]{2}$'
);

comment on column public.comptes.pays is
  'Marché du compte en ISO-3166-1 alpha-2 (GB, US, AU...). Affichage et pilotage uniquement : le moteur ne lit que `langue`. NULL = à renseigner par le HM.';

create index if not exists comptes_pays_idx on public.comptes (pays) where pays is not null;

-- Pays déduit de la langue, là où la langue ne désigne qu'un seul de nos
-- marchés. `en`, `ar` et `es-419` restent NULL : à renseigner par le HM.
update public.comptes c
set pays = m.pays
from (values
  ('fr', 'FR'), ('de', 'DE'), ('it', 'IT'), ('es', 'ES'), ('pt', 'PT'),
  ('pt-BR', 'BR'), ('cs', 'CZ'), ('nl', 'NL'), ('el', 'GR'), ('hu', 'HU'),
  ('pl', 'PL'), ('ro', 'RO'), ('sv', 'SE'), ('tr', 'TR'), ('da', 'DK'),
  ('no', 'NO'), ('ru', 'RU'), ('hr', 'HR'), ('sl', 'SI'), ('sk', 'SK'),
  ('sr', 'RS'), ('he', 'IL'), ('fi', 'FI'), ('et', 'EE'), ('bg', 'BG')
) as m(langue, pays)
where c.langue = m.langue and c.pays is null;

-- Les comptes `en`, eux, sont tranchés un par un d'après l'intitulé de leur
-- contrat Upwork, qui impose le pays de résidence (« based in UK », « based in
-- United States »). Le compte de test de Max reste sans pays : il n'a pas de
-- marché. Appliquée le 13/10/2026 : ne pas la rejouer.
update public.comptes c
set pays = v.pays
from (values
  ('hadeethahs@sophia.com', 'GB'),  -- contrat 44195618, « based in UK »
  ('sophiem@sophia.com', 'GB'),     -- contrat 44182561, « based in UK »
  ('joannam@sophia.com', 'US'),     -- contrat 44596272, « based in United States »
  ('nicoles@sophia.com', 'US'),     -- contrat 44589509, « based in United States »
  ('laurae@sophia.com', 'US')       -- contrat 44509584, « based in USA »
) as v(email, pays)
where c.pays is null
  and c.poster_id = (select p.id from public.profiles p where p.email = v.email);
