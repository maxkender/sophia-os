-- 0724 : podz 15 « Remakes @sagace.fr (Sophia) » et son label `sagace`,
--   lancé par Adrien le 15/11 (après la relance de mentalmaxxing, 0723).
--   @sagace.fr publie en français des listes « 10/10 » (« Compétence 10/10 à
--   apprendre avant 20 ans », « … au lieu de scroller ») : une couverture
--   toujours pareille (une falaise en pâte à modeler, un philosophe qui tire la
--   corde nouée à un « 10/10 » sculpté, les lignes en brun et noir), puis une
--   compétence par slide avec une vraie vidéo YouTube et le temps qu'il faut.
--   Tubes à 482 k, 352 k, 202 k, 153 k et 149 k (août et septembre), relevé
--   du 15/11.
--   Le podz les refait avec SA couverture à l'identique (décor refait sans son
--   texte ni son @) et Sophia en étape de la liste, à la place de sa slide
--   « ABONNE-TOI ». Proche du podz 13 (Kaja), mais pas pareil : sa couverture,
--   ses cartes YouTube sombres, sa ligne « 1 heure pour apprendre ».
--   Le texte est dans l'image : un deck par langue, en français seul (la langue
--   du compte).
-- Label 100 % podz (voie 2 de BLEO, comme Kaja et Fathomly), qui sert Sophia
-- SEUL (label_applications). La voie n'est plus une colonne : `voie(labels)`
-- la lit dans la vue `labels_100_podz` (un seul pod, tous ses contenus valides
-- livrés en images finies), donc 2 dès le premier remake validé.
-- Genre non fixé : ses sujets (argent, éloquence, cuisine, sport, tours de
-- main) parlent aux deux.
-- Aucun compte n'est rattaché au label : il prend ses comptes français par
-- la règle « démarrage d'un podz » (test sur `test_pod_comptes` comptes) ou
-- par Adrien et Max (Pilotage).
-- BLEO : même écart « même famille » que les autres labels 100 % podz (6 jours).
-- Podz sûr : validation automatique 5 h après le dépôt (0323, 0635).
-- Le jeton de l'agent est posé à part (empreinte seulement, jamais en clair).
-- ✅ Appliquée le 2026-11-15 (MCP). Additive, idempotente.

insert into public.labels (slug, nom, couleur, genre, application_id)
select 'sagace', 'Sagace', '#b9692f', null, a.id
from public.applications a
where a.slug = 'sophia'
on conflict (slug) do nothing;

insert into public.label_applications (label_id, application_id)
select l.id, a.id
from public.labels l
join public.applications a on a.slug = 'sophia'
where l.slug = 'sagace'
on conflict (label_id, application_id) do nothing;

insert into public.pods (slug, nom, label_id, auto_validation, auto_validation_heures, langues)
select 'remakes_sagace', 'Remakes @sagace.fr (Sophia)', l.id, true, 5, array['fr']
from public.labels l
where l.slug = 'sagace'
on conflict (slug) do nothing;

update public.reglages
   set valeur = jsonb_set(valeur, '{garde_fous,meme_famille_jours_labels,sagace}', '6'::jsonb)
 where cle = 'bleo'
   and valeur->'garde_fous' ? 'meme_famille_jours_labels'
   and not (valeur->'garde_fous'->'meme_famille_jours_labels' ? 'sagace');
