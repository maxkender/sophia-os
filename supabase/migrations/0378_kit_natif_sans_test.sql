-- 0378 : Kit natif · plus de test des 3 premiers posts (27/10).
--
-- Décision d'Adrien : chaque relecteur écrit les 15 posts du kit dès qu'il a
-- envoyé son questionnaire, qu'il soit « invite » ou « actif ». On retire la
-- limite aux rangs 1 à 3 posée par 0377 ; le reste ne change pas (espace
-- ouvert, questionnaire envoyé, ses propres versions seulement).
-- `relecteur_voit_kit` garde son paramètre `p_rang` pour ne pas toucher aux
-- règles d'accès qui l'appellent.
-- Retour arrière : rejouer les deux fonctions de 0377.

create or replace function public.relecteur_voit_kit(p_rang int)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
           select 1
           from public.relecteurs_natifs r
           where r.profile_id = auth.uid()
             and r.questionnaire_termine_at is not null
             and r.statut in ('invite', 'actif')
         )
     and coalesce(
           (select (g.valeur ->> 'espace_ouvert')::boolean
            from public.reglages g
            where g.cle = 'relecture_native'),
           false
         );
$$;

create or replace function public.relecteur_peut_ecrire_kit(p_relecteur_id uuid, p_kit_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.relecteur_peut_ecrire(p_relecteur_id)
     and exists (
           select 1
           from public.relecteurs_natifs r
           join public.kit_natif k on k.id = p_kit_id and k.actif
           where r.id = p_relecteur_id
             and r.questionnaire_termine_at is not null
         );
$$;

comment on table public.kit_natif is
  'Kit natif (0377, 0378) : les slideshows que chaque relecteur écrit de A à Z après son questionnaire. Tous visibles dès le questionnaire envoyé.';
