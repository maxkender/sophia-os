-- 0856 : podz 27 « Originaux @raretheory_ (Sophia) » et son label
--   `raretheory`, lancé par Adrien le 24/11.
--   Modèle : @raretheory_ (10,3 k abonnés, « Helping Teens »), des listes en
--   slides bordeaux unies, texte crème en Arial Narrow, tout en minuscules
--   (« u », « ur ») : « topic to research when u're bored » (652 k, 104 k
--   enregistrements ; la partie 1 : 151 k), une couverture au titre justifié
--   avec deux petites photos à droite, puis une catégorie par slide
--   (« 03 — History & Civilizations » et 14 sujets) ; ses listes « skills
--   i'm glad i started learning at 14 » (47 k) posent une petite photo à
--   droite du titre et un paragraphe justifié.
--   Le podz écrit des ORIGINAUX à son style exact, en images finies, en
--   anglais. Sophia y est une slide du milieu de la liste (« 05 — where i
--   actually learn them »), avec son LOGO à la place de la petite photo,
--   jamais une capture de l'appli.
-- Label dédié, 100 % podz, qui sert Sophia SEULE (label_applications et
-- labels.application_id). Genre nul (des listes de culture générale pour les
-- ados, sans visage). Aucun compte : la règle « démarrage d'un podz » ou
-- Pilotage. Voie 2 dès le premier original validé (images finies).
-- Langues : l'anglais, ouvert et prêt (0781).
-- BLEO : même écart « même famille » que les autres labels 100 % podz (6 jours).
-- Podz sûr : validation automatique 5 h après le dépôt (0323, 0635).
-- Le jeton de l'agent est posé à part (empreinte seulement, jamais en clair).
-- ✅ Appliquée le 2026-11-24 (MCP). Additive, idempotente.

insert into public.labels (slug, nom, couleur, genre, application_id)
select 'raretheory', 'raretheory', '#700030', null, a.id
from public.applications a
where a.slug = 'sophia'
on conflict (slug) do nothing;

insert into public.label_applications (label_id, application_id)
select l.id, a.id
from public.labels l
join public.applications a on a.slug = 'sophia'
where l.slug = 'raretheory'
on conflict (label_id, application_id) do nothing;

insert into public.pods (slug, nom, label_id, auto_validation, auto_validation_heures, langues, langues_pretes)
select 'originaux_raretheory', 'Originaux @raretheory_ (Sophia)', l.id, true, 5, array['en'], array['en']
from public.labels l
where l.slug = 'raretheory'
on conflict (slug) do nothing;

update public.reglages
   set valeur = jsonb_set(valeur, '{garde_fous,meme_famille_jours_labels,raretheory}', '6'::jsonb)
 where cle = 'bleo'
   and valeur->'garde_fous' ? 'meme_famille_jours_labels'
   and not (valeur->'garde_fous'->'meme_famille_jours_labels' ? 'raretheory');
