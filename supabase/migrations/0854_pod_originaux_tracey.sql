-- 0854 : podz 26 « Originaux @traceygreen589 (Atala + Artura) » et son label
--   `tracey`, lancé par Adrien le 24/11 : le PREMIER podz 100 % podz qui sert
--   DEUX applications (décision d'Adrien du 24/11 : « autoriser des podz 100 %
--   podz qui couvrent plusieurs apps »).
--   Modèle : @traceygreen589 (2,1 k abonnés), des listes « 10/10 hobbies that
--   actually work if you have adhd » (705 k et 532 k) en slides blanches et en
--   Arial : une couverture avec une IRM, puis un loisir par slide (son nom, une
--   accroche aux mots soulignés, une photo à gauche, une colonne de texte, une
--   chute). Elle glisse sa pub (Brainmaxx) dans un des loisirs.
--   Le podz écrit des ORIGINAUX à son style exact, en images finies, en
--   anglais. Chaque post porte DEUX slides d'appli : la slide « running » avec
--   le logo d'Atala, une slide « learning to look at art » avec le logo
--   d'Artura, chacune marquée `position_app: "<slug>"` au dépôt ; l'OS en tire
--   une variante par appli et chaque compte du label publie celle de SON appli
--   (la fonction `pods` accepte ces labels multi-applis depuis le 24/11).
-- Label dédié, 100 % podz, qui sert Atala ET Artura (deux lignes
-- `label_applications`) ; `labels.application_id` : Atala, l'appli de sa
-- première slide d'appli. Genre nul (son public est mixte). Nom sans suffixe
-- `_run` ni `_art` : il sert les deux (le formulaire des labels le signale).
-- Aucun compte : la règle « démarrage d'un podz » ou Pilotage. Atala et Artura
-- sont encore inactives : rien n'est publié avant leur activation.
-- Langues : l'anglais, ouvert et prêt (0781).
-- BLEO : même écart « même famille » que les autres labels 100 % podz (6 jours).
-- Podz sûr : validation automatique 5 h après le dépôt (0323, 0635).
-- Le jeton de l'agent est posé à part (empreinte seulement, jamais en clair).
-- ✅ Appliquée le 2026-11-24 (MCP). Additive, idempotente.

insert into public.labels (slug, nom, couleur, genre, application_id)
select 'tracey', 'tracey', '#1f3b63', null, a.id
from public.applications a
where a.slug = 'atala'
on conflict (slug) do nothing;

insert into public.label_applications (label_id, application_id)
select l.id, a.id
from public.labels l
join public.applications a on a.slug in ('atala', 'artura')
where l.slug = 'tracey'
on conflict (label_id, application_id) do nothing;

insert into public.pods (slug, nom, label_id, auto_validation, auto_validation_heures, langues, langues_pretes)
select 'originaux_tracey', 'Originaux @traceygreen589 (Atala + Artura)', l.id, true, 5, array['en'], array['en']
from public.labels l
where l.slug = 'tracey'
on conflict (slug) do nothing;

update public.reglages
   set valeur = jsonb_set(valeur, '{garde_fous,meme_famille_jours_labels,tracey}', '6'::jsonb)
 where cle = 'bleo'
   and valeur->'garde_fous' ? 'meme_famille_jours_labels'
   and not (valeur->'garde_fous'->'meme_famille_jours_labels' ? 'tracey');
