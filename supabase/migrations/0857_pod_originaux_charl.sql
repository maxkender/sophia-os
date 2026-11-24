-- 0857 : podz 28 « Originaux @charl.focus (Sophia) » et son label `charl`,
--   lancé par Adrien le 24/11.
--   Modèle : @charl.focus (9,6 k abonnés, « Stay focused »), en espagnol, des
--   guides de neurosciences du quotidien en slides noires carrées, en
--   Montserrat : une couverture en six images (IRM, cerveaux, silhouettes)
--   avec « cómo arreglar tu / DOPAMINA » au centre (362 k), « cómo dejar de /
--   PROCRASTINAR » (247 k), « cómo dejar de ser / INSEGURO » (116 k), puis
--   « 1 · nada te motiva. » et des paragraphes justifiés aux mots en gras,
--   avec des photos à droite ou en bas. Ses posts portent une slide d'appli :
--   unrespiro, un bloqueur d'applis (concurrent de Sophia, jamais chez nous).
--   Le podz écrit des ORIGINAUX à son style exact, en images finies, en
--   espagnol. Sophia y prend la place de sa slide d'appli, avec son LOGO,
--   jamais une capture de l'appli.
-- Label dédié, 100 % podz, qui sert Sophia SEULE (label_applications et
-- labels.application_id). Genre nul (des guides de concentration, sans
-- visage mis en avant). Aucun compte : la règle « démarrage d'un podz » ou
-- Pilotage. Voie 2 dès le premier original validé (images finies).
-- Langues : l'espagnol (es), ouvert et prêt (0781).
-- BLEO : même écart « même famille » que les autres labels 100 % podz (6 jours).
-- Podz sûr : validation automatique 5 h après le dépôt (0323, 0635).
-- Le jeton de l'agent est posé à part (empreinte seulement, jamais en clair).
-- ✅ Appliquée le 2026-11-24 (MCP). Additive, idempotente.

insert into public.labels (slug, nom, couleur, genre, application_id)
select 'charl', 'charl', '#1a1a1a', null, a.id
from public.applications a
where a.slug = 'sophia'
on conflict (slug) do nothing;

insert into public.label_applications (label_id, application_id)
select l.id, a.id
from public.labels l
join public.applications a on a.slug = 'sophia'
where l.slug = 'charl'
on conflict (label_id, application_id) do nothing;

insert into public.pods (slug, nom, label_id, auto_validation, auto_validation_heures, langues, langues_pretes)
select 'originaux_charl', 'Originaux @charl.focus (Sophia)', l.id, true, 5, array['es'], array['es']
from public.labels l
where l.slug = 'charl'
on conflict (slug) do nothing;

update public.reglages
   set valeur = jsonb_set(valeur, '{garde_fous,meme_famille_jours_labels,charl}', '6'::jsonb)
 where cle = 'bleo'
   and valeur->'garde_fous' ? 'meme_famille_jours_labels'
   and not (valeur->'garde_fous'->'meme_famille_jours_labels' ? 'charl');
