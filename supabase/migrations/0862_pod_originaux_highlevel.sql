-- 0862 : podz 30 « Originaux @highlevelgame_ (Artura) » et son label
--   `highlevel_art`, lancé par Adrien le 25/11.
--   Modèle : @highlevelgame_ (101 k abonnés, « Make your crush obsessed »),
--   des conseils de séduction pour hommes en cartes de texte : papier blanc
--   cassé, texte bordeaux en serif (Vollkorn), une couverture en capitales
--   (« HOW TO TEXT LIKE A MAN NOT A BOY. » 3,8 M et 3,7 M, « DESTROY HER EGO
--   WITH THESE WORDS. » 2,1 M, « HOW TO GIVE A GIRL BUTTERFLIES. » 1,4 M),
--   puis un conseil par carte (« Remember small details. », « Instead of: …
--   Say: … »), « The rule underneath all of it », et « Follow so you don't
--   miss what's next. ».
--   Le podz écrit des ORIGINAUX à son style exact, en images finies, en
--   anglais. Artura y est un des conseils, demandé par Adrien : « Know how to
--   talk about art. » (l'emmener au musée et lui raconter l'histoire d'un
--   tableau), avec un vrai tableau du domaine public (Met Open Access) et le
--   LOGO d'Artura, jamais une capture ; marquée `position_app: "artura"`.
-- Label dédié, 100 % podz, qui sert Artura SEULE (label_applications et
-- labels.application_id), suffixe `_art` comme l'attend l'identité des comptes
-- d'Artura. Genre `homme` (le modèle et son public). Aucun compte : la règle
-- « démarrage d'un podz » ou Pilotage. Artura est encore inactive : rien n'est
-- publié avant son activation, la file et la validation marchent.
-- Langues : l'anglais, ouvert et prêt (0781).
-- BLEO : même écart « même famille » que les autres labels 100 % podz (6 jours).
-- Podz sûr : validation automatique 5 h après le dépôt (0323, 0635).
-- Le jeton de l'agent est posé à part (empreinte seulement, jamais en clair).
-- ✅ Appliquée le 2026-11-25 (MCP). Additive, idempotente.

insert into public.labels (slug, nom, couleur, genre, application_id)
select 'highlevel_art', 'highlevel_art', '#6b2525', 'homme', a.id
from public.applications a
where a.slug = 'artura'
on conflict (slug) do nothing;

insert into public.label_applications (label_id, application_id)
select l.id, a.id
from public.labels l
join public.applications a on a.slug = 'artura'
where l.slug = 'highlevel_art'
on conflict (label_id, application_id) do nothing;

insert into public.pods (slug, nom, label_id, auto_validation, auto_validation_heures, langues, langues_pretes)
select 'originaux_highlevel', 'Originaux @highlevelgame_ (Artura)', l.id, true, 5, array['en'], array['en']
from public.labels l
where l.slug = 'highlevel_art'
on conflict (slug) do nothing;

update public.reglages
   set valeur = jsonb_set(valeur, '{garde_fous,meme_famille_jours_labels,highlevel_art}', '6'::jsonb)
 where cle = 'bleo'
   and valeur->'garde_fous' ? 'meme_famille_jours_labels'
   and not (valeur->'garde_fous'->'meme_famille_jours_labels' ? 'highlevel_art');
