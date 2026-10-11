-- 0272 : reprise du parcours d'accueil là où le créateur l'a laissé.
--
-- L'accueil passe d'une pop-up (une vidéo, un bouton) à un parcours en
-- plusieurs écrans terminé par un quiz. Fermer l'onglet au milieu ne doit ni
-- tout faire recommencer, ni laisser sauter la fin.
--
-- `profiles.onboarding_etape` : index du dernier écran ATTEINT. On n'écrit
-- jamais de valeur plus petite (`greatest`), donc revenir en arrière pour
-- relire ne fait pas perdre la progression. `onboarding_vu_at`, posé par
-- `marquer_onboarding_vu` à la toute fin, reste le seul signal « terminé ».
--
-- Rien n'est remis à zéro : les créateurs déjà passés par l'ancienne pop-up
-- gardent leur `onboarding_vu_at` et ne reverront rien. Décision du 11/10/2026,
-- le nouveau parcours est pour les nouveaux.
--
-- Additive, idempotente.

alter table public.profiles
  add column if not exists onboarding_etape smallint not null default 0;

comment on column public.profiles.onboarding_etape is
  'Parcours d''accueil : index du dernier écran atteint. Ne décroît jamais. '
  'Terminé = onboarding_vu_at non nul.';

create or replace function public.enregistrer_onboarding_etape(etape smallint)
returns void
language sql
security definer
set search_path = public
as $$
  update public.profiles
     set onboarding_etape = greatest(onboarding_etape, greatest(etape, 0::smallint))
   where id = auth.uid();
$$;

comment on function public.enregistrer_onboarding_etape(smallint) is
  'Avance la progression du parcours d''accueil de l''appelant. Jamais en arrière.';

grant execute on function public.enregistrer_onboarding_etape(smallint) to authenticated;
