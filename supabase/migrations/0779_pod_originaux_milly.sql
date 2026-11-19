-- 0779 : podz 21 « Originaux @bdnf.milly (Sophia) » et son label `milly`,
--   lancé par Adrien le 19/11.
--   Modèle : @bdnf.milly (30 k abonnés, « nootropics, biohacking,
--   intelligence »), des diaporamas de 4 slides en Cormorant Garamond sur un
--   fond uni (noir, gris, vert, orange, rouge) : une couverture aux mots de
--   tailles différentes entre deux filets avec une petite image IRM, puis des
--   slides de texte dense (« Every form of Intelligence » 380 k, « The secret
--   to Memorizing Anything » 367 k, « How to Study for 10+ Hours » 311 k).
--   Le podz écrit des ORIGINAUX à son style exact, en images finies, en
--   anglais. Sophia n'y est qu'un LOGO (jamais une capture de l'appli), sur
--   une slide de conseil : lire une leçon chaque soir, comme un entraînement
--   (demande d'Adrien).
-- Label dédié, 100 % podz, qui sert Sophia SEULE (label_applications et
-- labels.application_id). Genre non fixé (son public est mixte). Aucun
-- compte : la règle « démarrage d'un podz » ou Pilotage. Voie 2 dès le
-- premier original validé (images finies).
-- BLEO : même écart « même famille » que les autres labels 100 % podz (6 jours).
-- Podz sûr : validation automatique 5 h après le dépôt (0323, 0635).
-- Le jeton de l'agent est posé à part (empreinte seulement, jamais en clair).
-- ✅ Appliquée le 2026-11-19 (MCP). Additive, idempotente.

insert into public.labels (slug, nom, couleur, genre, application_id)
select 'milly', 'Milly', '#2b2140', null, a.id
from public.applications a
where a.slug = 'sophia'
on conflict (slug) do nothing;

insert into public.label_applications (label_id, application_id)
select l.id, a.id
from public.labels l
join public.applications a on a.slug = 'sophia'
where l.slug = 'milly'
on conflict (label_id, application_id) do nothing;

insert into public.pods (slug, nom, label_id, auto_validation, auto_validation_heures, langues)
select 'originaux_milly', 'Originaux @bdnf.milly (Sophia)', l.id, true, 5, array['en']
from public.labels l
where l.slug = 'milly'
on conflict (slug) do nothing;

update public.reglages
   set valeur = jsonb_set(valeur, '{garde_fous,meme_famille_jours_labels,milly}', '6'::jsonb)
 where cle = 'bleo'
   and valeur->'garde_fous' ? 'meme_famille_jours_labels'
   and not (valeur->'garde_fous'->'meme_famille_jours_labels' ? 'milly');
