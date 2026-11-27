-- 0870 : podz 33 « Originaux @scilla2047 (Artura) » et son label
--   `scilla_art`, lancé par Adrien le 27/11 (« sans IA, angle : apprendre à
--   regarder de nouveau, à apprécier l'art », des tableaux ou « des trucs de
--   musée »).
--   Modèle : @scilla2047 (26,9 k abonnés, « This too shall pass »), des
--   diaporamas de santé mentale en carrés blancs : une couverture (« What you
--   must heal from based on your coping mechanism », 1,4 M vues ; « How your
--   triggers reveal what you must heal from », 1,4 M), puis un point par
--   slide : un titre noir, un paragraphe en couleur assortie à l'image, une
--   œuvre d'art en dessous.
--   Le podz écrit des ORIGINAUX à son format exact, en anglais, sur un autre
--   angle : réapprendre à regarder, apprécier l'art ; les images sont de
--   vraies œuvres du domaine public (Met Open Access), jamais générées.
--   Artura y est un des points, avec son LOGO à côté du tableau, jamais une
--   capture.
-- Label dédié, 100 % podz, qui sert Artura SEULE (label_applications et
-- labels.application_id). Genre nul. Aucun compte : la règle « démarrage d'un
-- podz » ou Pilotage. Voie 2 dès le premier original validé (images finies).
-- Artura est encore inactive : rien n'est publié avant son activation.
-- Langues : l'anglais, ouvert et prêt (0781).
-- BLEO : même écart « même famille » que les autres labels 100 % podz (6 jours).
-- Podz sûr : validation automatique 5 h après le dépôt (0323, 0635).
-- Le jeton de l'agent est posé à part (empreinte seulement, jamais en clair).
-- ✅ Appliquée le 2026-11-27 (MCP). Additive, idempotente.

insert into public.labels (slug, nom, couleur, genre, application_id)
select 'scilla_art', 'scilla_art', '#2840A0', null, a.id
from public.applications a
where a.slug = 'artura'
on conflict (slug) do nothing;

insert into public.label_applications (label_id, application_id)
select l.id, a.id
from public.labels l
join public.applications a on a.slug = 'artura'
where l.slug = 'scilla_art'
on conflict (label_id, application_id) do nothing;

insert into public.pods (slug, nom, label_id, auto_validation, auto_validation_heures, langues, langues_pretes)
select 'originaux_scilla', 'Originaux @scilla2047 (Artura)', l.id, true, 5, array['en'], array['en']
from public.labels l
where l.slug = 'scilla_art'
on conflict (slug) do nothing;

update public.reglages
   set valeur = jsonb_set(valeur, '{garde_fous,meme_famille_jours_labels,scilla_art}', '6'::jsonb)
 where cle = 'bleo'
   and valeur->'garde_fous' ? 'meme_famille_jours_labels'
   and not (valeur->'garde_fous'->'meme_famille_jours_labels' ? 'scilla_art');
