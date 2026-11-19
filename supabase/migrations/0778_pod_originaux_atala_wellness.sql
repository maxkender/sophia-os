-- 0778 : podz 20 « Originaux wellness (Atala) » et son label `wellness_run`,
--   lancé par Adrien le 19/11.
--   Modèle : @healthy_with_emma6 (« 6 habitudes wellness qui font leurs effets
--   au bout d'une semaine (validées par la science) ») : une couverture à deux
--   photos qui se chevauchent, puis une slide par habitude façon notes (le
--   titre et ses mots soulignés, une phrase d'intro, une colonne de texte, une
--   photo, la chute), et chez elle une slide pub en 5e place (CleanMenu).
--   Le podz écrit des ORIGINAUX à son style exact, en images finies, en
--   anglais, avec les photos de la banque de l'OS (action `photos`). Sa slide
--   pub devient la slide Atala : une fille qui court (banque) et la carte
--   d'Atala (icône, « Atala : AI Running Coach »), demande d'Adrien.
-- Label dédié, 100 % podz, qui sert Atala SEUL (label_applications et
-- labels.application_id), comme le podz 19. Le nom finit par `_run` : ses
-- comptes prennent l'identité du running (docs/applications.md § 5). Genre
-- `femme` (le modèle et son public). Aucun compte : la règle « démarrage d'un
-- podz » ou Pilotage. Atala est encore inactive : rien n'est publié avant son
-- activation. Voie 2 dès le premier original validé (images finies).
-- BLEO : même écart « même famille » que les autres labels 100 % podz (6 jours).
-- Podz sûr : validation automatique 5 h après le dépôt (0323, 0635).
-- Le jeton de l'agent est posé à part (empreinte seulement, jamais en clair).
-- ✅ Appliquée le 2026-11-19 (MCP). Additive, idempotente.

insert into public.labels (slug, nom, couleur, genre, application_id)
select 'wellness-run', 'wellness_run', '#c9b8a6', 'femme', a.id
from public.applications a
where a.slug = 'atala'
on conflict (slug) do nothing;

insert into public.label_applications (label_id, application_id)
select l.id, a.id
from public.labels l
join public.applications a on a.slug = 'atala'
where l.slug = 'wellness-run'
on conflict (label_id, application_id) do nothing;

insert into public.pods (slug, nom, label_id, auto_validation, auto_validation_heures, langues)
select 'originaux_atala_wellness', 'Originaux wellness (Atala)', l.id, true, 5, array['en']
from public.labels l
where l.slug = 'wellness-run'
on conflict (slug) do nothing;

update public.reglages
   set valeur = jsonb_set(valeur, '{garde_fous,meme_famille_jours_labels,wellness-run}', '6'::jsonb)
 where cle = 'bleo'
   and valeur->'garde_fous' ? 'meme_famille_jours_labels'
   and not (valeur->'garde_fous'->'meme_famille_jours_labels' ? 'wellness-run');
