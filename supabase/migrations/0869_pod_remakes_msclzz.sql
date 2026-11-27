-- 0869 : podz 32 « Remakes @msclzz (Sophia) » et son label `msclzz`, lancé
--   par Adrien le 27/11 (« pas d'ia, reprends image du compte »).
--   Modèle : @msclzz (8,1 k abonnés, « Seeing what others refuse to look
--   at »), des guides de psychologie sociale en anglais en diaporamas
--   verticaux sur fond noir : une couverture « How To Make People Remember
--   You » (203 k vues), un avertissement « READ THIS BEFORE YOU USE IT »,
--   puis une étape par slide (un titre en capitales aux mots en violet, des
--   paragraphes courts, une phrase en violet, une image noir et blanc
--   détourée) ; ses tubes : « How To Make Anyone Like You » (279 k), « How To
--   Make People Love Talking To You » (200 k). Sa dernière slide vend son
--   ebook : on ne la reprend jamais.
--   Le podz REFAIT ses posts qui ont marché, en images finies, en anglais :
--   ses textes, sa mise en page, SES images (sans célébrité), aucune image
--   générée. Sophia y est une étape du milieu, avec son LOGO à la place de
--   l'image, jamais une capture.
-- Label dédié, 100 % podz, qui sert Sophia SEULE (label_applications et
-- labels.application_id). Genre nul (charisme et conversation, pour tous).
-- Aucun compte : la règle « démarrage d'un podz » ou Pilotage. Voie 2 dès le
-- premier remake validé (images finies).
-- Langues : l'anglais, ouvert et prêt (0781).
-- BLEO : même écart « même famille » que les autres labels 100 % podz (6 jours).
-- Podz sûr : validation automatique 5 h après le dépôt (0323, 0635).
-- Le jeton de l'agent est posé à part (empreinte seulement, jamais en clair).
-- ✅ Appliquée le 2026-11-27 (MCP). Additive, idempotente.

insert into public.labels (slug, nom, couleur, genre, application_id)
select 'msclzz', 'msclzz', '#8A54FA', null, a.id
from public.applications a
where a.slug = 'sophia'
on conflict (slug) do nothing;

insert into public.label_applications (label_id, application_id)
select l.id, a.id
from public.labels l
join public.applications a on a.slug = 'sophia'
where l.slug = 'msclzz'
on conflict (label_id, application_id) do nothing;

insert into public.pods (slug, nom, label_id, auto_validation, auto_validation_heures, langues, langues_pretes)
select 'remakes_msclzz', 'Remakes @msclzz (Sophia)', l.id, true, 5, array['en'], array['en']
from public.labels l
where l.slug = 'msclzz'
on conflict (slug) do nothing;

update public.reglages
   set valeur = jsonb_set(valeur, '{garde_fous,meme_famille_jours_labels,msclzz}', '6'::jsonb)
 where cle = 'bleo'
   and valeur->'garde_fous' ? 'meme_famille_jours_labels'
   and not (valeur->'garde_fous'->'meme_famille_jours_labels' ? 'msclzz');
