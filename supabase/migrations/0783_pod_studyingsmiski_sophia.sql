-- 0783 : le podz 23 « Remakes @studyingsmiski » sert Sophia, plus micabo
--   (Adrien, 20/11, juste après 0782).
--   Le label créé par 0782 change d'application et de nom : `cozy_study`
--   (un nom en `_study` donne l'identité de micabo aux comptes,
--   docs/applications.md § 5) devient `cozy_girl` (thème smart_girl, genre
--   femme, niche « books and culture »). Même ligne (même id) : le pod, son
--   jeton et sa livraison en attente restent attachés.
--   Le label n'a aucun compte : rien n'a été diffusé.
--   Là où @studyingsmiski met Turbo AI, les remakes mettent Sophia (sa vraie
--   icône de l'App Store).
-- BLEO : la clé « même famille » suit le nouveau slug.
-- La livraison sm-001, en attente, est redéposée avec la slide Sophia ; ses
-- anciennes variantes micabo (`decks_applications`) sont effacées à part
-- (un label Sophia n'en a pas).
-- ✅ Appliquée le 2026-11-20 (MCP). Idempotente.

update public.labels
   set slug = 'cozy-girl',
       nom = 'cozy_girl',
       application_id = (select id from public.applications where slug = 'sophia')
 where slug = 'cozy-study';

delete from public.label_applications la
 using public.labels l, public.applications a
 where la.label_id = l.id and la.application_id = a.id
   and l.slug = 'cozy-girl' and a.slug <> 'sophia';

insert into public.label_applications (label_id, application_id)
select l.id, a.id
from public.labels l
join public.applications a on a.slug = 'sophia'
where l.slug = 'cozy-girl'
on conflict (label_id, application_id) do nothing;

update public.pods
   set nom = 'Remakes @studyingsmiski (Sophia)'
 where slug = 'remakes_studyingsmiski';

update public.reglages
   set valeur = jsonb_set(
         valeur #- '{garde_fous,meme_famille_jours_labels,cozy-study}',
         '{garde_fous,meme_famille_jours_labels,cozy-girl}', '6'::jsonb)
 where cle = 'bleo'
   and valeur->'garde_fous' ? 'meme_famille_jours_labels';
