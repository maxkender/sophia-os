-- 0647 : podz 13 « Remakes @kaja.learn (Sophia) » et son label `Kaja`.
--   @kaja.learn, c'est Kaja, une appli concurrente de Sophia (« Just like
--   Duolingo but for anything ») : ses listes « 10/10 skills » (couverture avec
--   sa mascotte, « HOW TO » + la compétence en couleur, une vraie vidéo YouTube
--   et le temps qu'il faut) font 15 k vues médianes sur 30 jours, avec des tubes
--   à 2,9 M, 2,5 M et 1,2 M, et 6 à 9 % d'enregistrements (relevé du 4/11).
--   Le podz les refait avec notre mascotte Sophia sur la couverture et Sophia
--   en étape de la liste, à la place de sa slide d'appli de fin.
--   Le texte est dans l'image : un deck par langue, en anglais seul pour
--   commencer (décision d'Adrien du 4/11). Tous les sujets qui marchent chez
--   lui sont gardés (même décision).
-- Label 100 % podz (voie 2 de BLEO, comme Fathomly), qui sert Sophia SEUL
-- (label_applications). Genre `homme` : son public, ses sujets (rizz, flirt,
-- small talk, glow up) et les prénoms des comptes qui le portent.
-- Aucun compte n'est rattaché au label : Adrien et Max choisissent les 3
-- comptes Sophia anglais qui le portent (Pilotage).
-- Podz sûr : validation automatique 5 h après le dépôt (0323, 0635).
-- Le jeton de l'agent est posé à part (empreinte seulement, jamais en clair).
-- Additive, idempotente.

insert into public.labels (slug, nom, couleur, genre, application_id, voie)
select 'kaja', 'Kaja', '#0e6e70', 'homme', a.id, 2
from public.applications a
where a.slug = 'sophia'
on conflict (slug) do nothing;

insert into public.label_applications (label_id, application_id)
select l.id, a.id
from public.labels l
join public.applications a on a.slug = 'sophia'
where l.slug = 'kaja'
on conflict (label_id, application_id) do nothing;

insert into public.pods (slug, nom, label_id, auto_validation, auto_validation_heures)
select 'remakes_kaja', 'Remakes @kaja.learn (Sophia)', l.id, true, 5
from public.labels l
where l.slug = 'kaja'
on conflict (slug) do nothing;
