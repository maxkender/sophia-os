-- 0609 : Relecture native · on retire le questionnaire et le kit (29/10).
--
-- Trouver des relecteurs natifs s'est révélé trop dur. Le système s'appuie
-- désormais sur la banque d'exemples natifs (0423) et sur des fiches langue
-- écrites à partir d'eux. Un relecteur, s'il y en a un, corrigera seulement
-- les posts publiés. Le questionnaire (0376) et le kit (0377, 0378) partent
-- avec leurs données : en prod au 29/10, 5 réponses du compte de test
-- d'Adrien, aucune écriture du kit, et les 15 posts du kit.
--
-- Gardés : relecteurs_natifs (sans questionnaire_termine_at), fiches_appli et
-- leurs versions, l'interrupteur, et kit_natif_horodater, qui horodate encore
-- exemples_natifs (0423).
--
-- Retour arrière : rejouer la partie C de 0376, puis 0377 et 0378.

drop table if exists public.kit_natif_ecritures;
drop table if exists public.kit_natif;
drop table if exists public.relecteur_questionnaire;

drop function if exists public.relecteur_voit_kit(int);
drop function if exists public.relecteur_peut_ecrire_kit(uuid, uuid);
drop function if exists public.presentations_applis_relecteur();
drop function if exists public.terminer_questionnaire_relecteur(uuid);
drop function if exists public.relecteur_peut_ecrire(uuid);

alter table public.relecteurs_natifs drop column if exists questionnaire_termine_at;

comment on table public.relecteurs_natifs is
  'Relecteurs natifs (0376, allégé par 0609) : un posteur natif par langue, qui corrigera les posts publiés dans sa langue.';
