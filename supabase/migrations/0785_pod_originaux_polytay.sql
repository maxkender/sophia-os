-- 0785 : podz 25 « Originaux @polytay (Sophia) » et son label `polytay`,
--   lancé par Adrien le 20/11.
--   Modèle : @polytay (9,7 k abonnés, « learn everything »), des listes en
--   slides blanches pour la fille qui veut tout apprendre : une couverture en
--   collage de photos avec le titre en minuscules (« hobbies that make you
--   impossible to bore » 479 k), puis un élément par slide (deux photos à
--   gauche, « 1. reading with a pen » et deux paragraphes à droite), et
--   « thank you for watching / save & follow » à la fin. Ses listes de
--   chaînes YouTube (« youtube channels that are basically free university »
--   394 k) posent le logo de chaque chaîne en haut de la slide.
--   Le podz écrit des ORIGINAUX à son style exact, en images finies, en
--   anglais. Sophia y est un des éléments, avec son LOGO à la place de la
--   photo du haut, jamais une capture de l'appli (demande d'Adrien).
-- Label dédié, 100 % podz, qui sert Sophia SEULE (label_applications et
-- labels.application_id). Genre `femme` (le modèle et son public). Aucun
-- compte : la règle « démarrage d'un podz » ou Pilotage. Voie 2 dès le premier
-- original validé (images finies).
-- Langues : l'anglais, ouvert et prêt (0781).
-- BLEO : même écart « même famille » que les autres labels 100 % podz (6 jours).
-- Podz sûr : validation automatique 5 h après le dépôt (0323, 0635).
-- Le jeton de l'agent est posé à part (empreinte seulement, jamais en clair).
-- ✅ Appliquée le 2026-11-20 (MCP). Additive, idempotente.

insert into public.labels (slug, nom, couleur, genre, application_id)
select 'polytay', 'polytay', '#d9c7b0', 'femme', a.id
from public.applications a
where a.slug = 'sophia'
on conflict (slug) do nothing;

insert into public.label_applications (label_id, application_id)
select l.id, a.id
from public.labels l
join public.applications a on a.slug = 'sophia'
where l.slug = 'polytay'
on conflict (label_id, application_id) do nothing;

insert into public.pods (slug, nom, label_id, auto_validation, auto_validation_heures, langues, langues_pretes)
select 'originaux_polytay', 'Originaux @polytay (Sophia)', l.id, true, 5, array['en'], array['en']
from public.labels l
where l.slug = 'polytay'
on conflict (slug) do nothing;

update public.reglages
   set valeur = jsonb_set(valeur, '{garde_fous,meme_famille_jours_labels,polytay}', '6'::jsonb)
 where cle = 'bleo'
   and valeur->'garde_fous' ? 'meme_famille_jours_labels'
   and not (valeur->'garde_fous'->'meme_famille_jours_labels' ? 'polytay');
