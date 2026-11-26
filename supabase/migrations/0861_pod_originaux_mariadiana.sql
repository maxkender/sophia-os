-- 0861 : podz 29 « Originaux @mariadianatudor (Artura) » et son label
--   `mariadiana_art`, lancé par Adrien le 25/11 : le premier podz 100 % podz
--   d'Artura seule.
--   Modèle : @mariadianatudor (253 abonnés, un seul post), « Paintings That
--   Devour My Soul » (36,9 k vues, 1 087 enregistrements, 29/10) : une
--   couverture sombre (une foule au musée devant un tableau, le titre blanc),
--   puis un tableau par slide sur fond blanc cassé, en TikTok Sans : le titre
--   de l'œuvre centré en haut, le tableau à gauche, un paragraphe à droite qui
--   continue le titre (« [The Kiss] is a profound exploration of… »), l'artiste
--   sous le tableau.
--   Le podz écrit des ORIGINAUX à son style exact, en images finies, en
--   anglais, avec des œuvres du domaine public (Met Open Access, CC0). Une des
--   slides d'œuvre cite Artura à la première personne, son LOGO posé sous le
--   paragraphe, marquée `position_app: "artura"` au dépôt.
-- Label dédié, 100 % podz, qui sert Artura SEULE (label_applications et
-- labels.application_id), suffixe `_art` comme l'attend l'identité des comptes
-- d'Artura (thème « art », 23/11). Genre nul. Aucun compte : la règle
-- « démarrage d'un podz » ou Pilotage. Artura est encore inactive : rien n'est
-- publié avant son activation, la file et la validation marchent.
-- Langues : l'anglais, ouvert et prêt (0781).
-- BLEO : même écart « même famille » que les autres labels 100 % podz (6 jours).
-- Podz sûr : validation automatique 5 h après le dépôt (0323, 0635).
-- Le jeton de l'agent est posé à part (empreinte seulement, jamais en clair).
-- ✅ Appliquée le 2026-11-25 (MCP). Additive, idempotente.

insert into public.labels (slug, nom, couleur, genre, application_id)
select 'mariadiana_art', 'mariadiana_art', '#2b2118', null, a.id
from public.applications a
where a.slug = 'artura'
on conflict (slug) do nothing;

insert into public.label_applications (label_id, application_id)
select l.id, a.id
from public.labels l
join public.applications a on a.slug = 'artura'
where l.slug = 'mariadiana_art'
on conflict (label_id, application_id) do nothing;

insert into public.pods (slug, nom, label_id, auto_validation, auto_validation_heures, langues, langues_pretes)
select 'originaux_mariadiana', 'Originaux @mariadianatudor (Artura)', l.id, true, 5, array['en'], array['en']
from public.labels l
where l.slug = 'mariadiana_art'
on conflict (slug) do nothing;

update public.reglages
   set valeur = jsonb_set(valeur, '{garde_fous,meme_famille_jours_labels,mariadiana_art}', '6'::jsonb)
 where cle = 'bleo'
   and valeur->'garde_fous' ? 'meme_famille_jours_labels'
   and not (valeur->'garde_fous'->'meme_famille_jours_labels' ? 'mariadiana_art');
