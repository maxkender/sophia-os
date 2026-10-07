-- 0268 : onboarding en boucle pour un profil de test.
--
-- profiles.onboarding_en_boucle : l'onboarding réapparaît à CHAQUE connexion
-- (pas une seule fois), pour tester l'écran de bienvenue en boucle sur un
-- compte de test. Le front l'ignore pour tout autre profil. Additive.

alter table public.profiles add column onboarding_en_boucle boolean not null default false;
comment on column public.profiles.onboarding_en_boucle is
  'Profil de test : l''onboarding réapparaît à chaque connexion au lieu d''une seule fois.';
