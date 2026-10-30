-- 0623 : la fiche CTA (30/10, demande d'Adrien).
--
-- La réécriture native lit quatre fiches : appli (quoi dire), langue (comment
-- le dire), label (quel CTA tirer) et la fiche CTA : les règles communes à
-- toutes les applis et toutes les langues pour écrire le CTA (un vrai conseil,
-- l'appli fondue dedans, même moule que les slides voisines…). Une seule fiche,
-- `cle = 'commune'`, versionnée comme les autres dans `bleo_fiches`, écrite par
-- l'admin dans la page Fiches. Rien ne la lit encore en production.
--
-- AJOUT SEULEMENT : une valeur de plus permise pour `bleo_fiches.sorte`.
-- Retour arrière : delete from bleo_fiches where sorte = 'cta'; puis remettre
-- la contrainte à ('langue', 'label', 'appli').

set lock_timeout = '5s';

alter table public.bleo_fiches drop constraint if exists bleo_fiches_sorte_check;
alter table public.bleo_fiches
  add constraint bleo_fiches_sorte_check check (sorte in ('langue', 'label', 'appli', 'cta'));
