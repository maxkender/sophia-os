-- 0868 : podz 31 « Remakes @ssazem (Sophia) » et son label `ssazem`, lancé
--   par Adrien le 27/11 (« reprendre le compte », sans clé d'IA).
--   Modèle : @ssazem (16,5 k abonnés), des citations de réconfort en anglais
--   (« #fyp #venting »), cinq slides carrées par post : une photo de cinéma
--   ou d'animal en carte aux coins arrondis sur un cadre noir, du grain, et
--   une phrase en Times, tout en minuscules, coupée en deux blocs (le début
--   calé à gauche, la suite calée à droite) : « believe in sudden positive
--   shifts, / things can change for you at anytime. » (222 k vues, 7 k
--   enregistrements, 22/09), « sily you thinking you're behind / when you've
--   already come this far. » (56,7 k).
--   Le podz REFAIT ses posts qui ont marché, en images finies, en anglais :
--   ses phrases et sa mise en page, avec les photos de la banque de l'OS
--   (label alpha_male d'abord, sans célébrité ni texte), sans aucune image
--   générée. Sophia y est une des cinq phrases (ni la première ni la
--   dernière), avec son LOGO posé sous la phrase, jamais une capture.
-- Label dédié, 100 % podz, qui sert Sophia SEULE (label_applications et
-- labels.application_id). Genre homme (ses photos et la banque alpha_male).
-- Aucun compte : la règle « démarrage d'un podz » ou Pilotage. Voie 2 dès le
-- premier remake validé (images finies).
-- Langues : l'anglais, ouvert et prêt (0781).
-- BLEO : même écart « même famille » que les autres labels 100 % podz (6 jours).
-- Podz sûr : validation automatique 5 h après le dépôt (0323, 0635).
-- Le jeton de l'agent est posé à part (empreinte seulement, jamais en clair).
-- ✅ Appliquée le 2026-11-27 (MCP). Additive, idempotente.

insert into public.labels (slug, nom, couleur, genre, application_id)
select 'ssazem', 'ssazem', '#2B3A4A', 'homme', a.id
from public.applications a
where a.slug = 'sophia'
on conflict (slug) do nothing;

insert into public.label_applications (label_id, application_id)
select l.id, a.id
from public.labels l
join public.applications a on a.slug = 'sophia'
where l.slug = 'ssazem'
on conflict (label_id, application_id) do nothing;

insert into public.pods (slug, nom, label_id, auto_validation, auto_validation_heures, langues, langues_pretes)
select 'remakes_ssazem', 'Remakes @ssazem (Sophia)', l.id, true, 5, array['en'], array['en']
from public.labels l
where l.slug = 'ssazem'
on conflict (slug) do nothing;

update public.reglages
   set valeur = jsonb_set(valeur, '{garde_fous,meme_famille_jours_labels,ssazem}', '6'::jsonb)
 where cle = 'bleo'
   and valeur->'garde_fous' ? 'meme_famille_jours_labels'
   and not (valeur->'garde_fous'->'meme_famille_jours_labels' ? 'ssazem');
