-- 0871 : podz 34 « Icebergs @dorian.frog (Artura) » et son label
--   `dorian_art`, lancé par Adrien le 27/11 (« uniquement ce genre d'iceberg
--   adhd/autistic », « sans utiliser l'IA non plus »).
--   Modèle : @dorian.frog (12 k abonnés), et seulement ses icebergs de
--   loisirs en 2 slides : « Iceberg of Autistic hobbies » (2,1 M vues),
--   « Iceberg of ADHD hobbies » (1,1 M) et sa mise à jour (424 k) ; la
--   couverture bleu nuit à l'ovale, puis l'iceberg par étages, chaque loisir
--   en objet détouré avec son nom, « disagreed? ».
--   Le podz écrit des ORIGINAUX à ce format, en anglais, pour Artura : ses
--   étages de loisirs ADHD / autistes, et un loisir Artura (« one artura
--   painting a day », le LOGO d'Artura). Aucune image générée : sa
--   couverture (texte effacé sur l'aplat), un iceberg dessiné par code, et
--   des objets du Met (domaine public) détourés sur leur fond uni.
--   Le podz 16 (Sophia, label dorian) garde le reste de ce compte.
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
select 'dorian_art', 'dorian_art', '#0D2233', null, a.id
from public.applications a
where a.slug = 'artura'
on conflict (slug) do nothing;

insert into public.label_applications (label_id, application_id)
select l.id, a.id
from public.labels l
join public.applications a on a.slug = 'artura'
where l.slug = 'dorian_art'
on conflict (label_id, application_id) do nothing;

insert into public.pods (slug, nom, label_id, auto_validation, auto_validation_heures, langues, langues_pretes)
select 'originaux_dorian_art', 'Icebergs @dorian.frog (Artura)', l.id, true, 5, array['en'], array['en']
from public.labels l
where l.slug = 'dorian_art'
on conflict (slug) do nothing;

update public.reglages
   set valeur = jsonb_set(valeur, '{garde_fous,meme_famille_jours_labels,dorian_art}', '6'::jsonb)
 where cle = 'bleo'
   and valeur->'garde_fous' ? 'meme_famille_jours_labels'
   and not (valeur->'garde_fous'->'meme_famille_jours_labels' ? 'dorian_art');
