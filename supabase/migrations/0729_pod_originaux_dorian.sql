-- 0729 : podz 16 « Originaux @dorian.frog (Sophia) » et son label `dorian`,
--   lancé par Adrien le 15/11.
--   @dorian.frog (11 k abonnés, en anglais) est un compte UGC de Wondering,
--   une appli concurrente de Sophia (« Duolingo for anything ») : des icebergs
--   de hobbies (« Iceberg of ADHD hobbies », 2 M, 1,1 M, 417 k) et des listes
--   « 5 niche… » sur fond blanc avec des tableaux (« 8 coding projects that
--   are genuinely f*cking difficult » 1,2 M, « 5 niche ways to disgustingly
--   improve your critical thinking » 569 k), l'appli en dernier item.
--   Le podz écrit des ORIGINAUX dans ses deux formats, à son style exact (sa
--   grenouille, ses décors d'iceberg), en images finies, en anglais ; Sophia y
--   entre comme un item de la liste (un téléphone qui montre l'appli) ou
--   comme un hobby de l'iceberg (son icône).
-- Label 100 % podz, qui sert Sophia SEUL (label_applications). Sa voie se
-- calcule (`voie(labels)`, vue `labels_100_podz`) : 2 dès le premier original
-- validé, puisque tout est livré en images finies.
-- Genre non fixé. Aucun compte : la règle « démarrage d'un podz » ou Pilotage.
-- BLEO : même écart « même famille » que les autres labels 100 % podz (6 jours).
-- Podz sûr : validation automatique 5 h après le dépôt (0323, 0635).
-- Le jeton de l'agent est posé à part (empreinte seulement, jamais en clair).
-- ✅ Appliquée le 2026-11-15 (MCP). Additive, idempotente.

insert into public.labels (slug, nom, couleur, genre, application_id)
select 'dorian', 'Dorian', '#77b9c3', null, a.id
from public.applications a
where a.slug = 'sophia'
on conflict (slug) do nothing;

insert into public.label_applications (label_id, application_id)
select l.id, a.id
from public.labels l
join public.applications a on a.slug = 'sophia'
where l.slug = 'dorian'
on conflict (label_id, application_id) do nothing;

insert into public.pods (slug, nom, label_id, auto_validation, auto_validation_heures, langues)
select 'originaux_dorian', 'Originaux @dorian.frog (Sophia)', l.id, true, 5, array['en']
from public.labels l
where l.slug = 'dorian'
on conflict (slug) do nothing;

update public.reglages
   set valeur = jsonb_set(valeur, '{garde_fous,meme_famille_jours_labels,dorian}', '6'::jsonb)
 where cle = 'bleo'
   and valeur->'garde_fous' ? 'meme_famille_jours_labels'
   and not (valeur->'garde_fous'->'meme_famille_jours_labels' ? 'dorian');
