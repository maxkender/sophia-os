-- 0780 : podz 22 « Originaux @built.not.born61 (Atala) » et son label
--   `built_run`, lancé par Adrien le 19/11.
--   Modèle : @built.not.born61 (15 k abonnés, « Stop waiting. Start
--   building. »), des listes de conseils pour hommes en slides blanches :
--   une couverture en capitales grasses avec un homme détouré en noir et
--   blanc, une slide par conseil (« 2. Have a bright smile », un court texte,
--   une image détourée), « Follow for more » à la fin (« GLOW UP HACKS FOR
--   MEN. » 428 k).
--   Le podz écrit des ORIGINAUX à son style exact, en images finies, en
--   anglais. Atala y est un conseil (« courir ») avec un homme qui court
--   détouré, pris dans la banque de l'OS (label male_run), et le logo
--   d'Atala à côté (demande d'Adrien).
-- Label dédié, 100 % podz, qui sert Atala SEULE (label_applications et
-- labels.application_id). Le nom finit par `_run` : ses comptes prennent
-- l'identité du running (docs/applications.md § 5). Genre `homme` (le modèle
-- et son public). Aucun compte : la règle « démarrage d'un podz » ou
-- Pilotage. Atala est encore inactive : rien n'est publié avant son
-- activation. Voie 2 dès le premier original validé (images finies).
-- BLEO : même écart « même famille » que les autres labels 100 % podz (6 jours).
-- Podz sûr : validation automatique 5 h après le dépôt (0323, 0635).
-- Le jeton de l'agent est posé à part (empreinte seulement, jamais en clair).
-- ✅ Appliquée le 2026-11-19 (MCP). Additive, idempotente.

insert into public.labels (slug, nom, couleur, genre, application_id)
select 'built-run', 'built_run', '#1f1f1f', 'homme', a.id
from public.applications a
where a.slug = 'atala'
on conflict (slug) do nothing;

insert into public.label_applications (label_id, application_id)
select l.id, a.id
from public.labels l
join public.applications a on a.slug = 'atala'
where l.slug = 'built-run'
on conflict (label_id, application_id) do nothing;

insert into public.pods (slug, nom, label_id, auto_validation, auto_validation_heures, langues)
select 'originaux_atala_built', 'Originaux @built.not.born61 (Atala)', l.id, true, 5, array['en']
from public.labels l
where l.slug = 'built-run'
on conflict (slug) do nothing;

update public.reglages
   set valeur = jsonb_set(valeur, '{garde_fous,meme_famille_jours_labels,built-run}', '6'::jsonb)
 where cle = 'bleo'
   and valeur->'garde_fous' ? 'meme_famille_jours_labels'
   and not (valeur->'garde_fous'->'meme_famille_jours_labels' ? 'built-run');
