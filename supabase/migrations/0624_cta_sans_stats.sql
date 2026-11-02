-- 0624 : plus de stats ni de tirage de forme pour le CTA (décision d'Adrien, 30/10).
--
-- Les vues ne jugent pas un CTA : elles se comptent dès que le post s'affiche,
-- alors que le CTA n'arrive qu'à la slide 4 ou plus loin. Les écarts mesurés
-- en 0621 (± 5 à 8 %) n'étaient que du bruit. L'OS ne tire donc plus de forme,
-- ni pondérée ni au hasard, et ne calcule plus de poids :
--   * plus de calcul du lundi (`cta-lundi`), ni de `cta_stats`, ni de
--     `cta_agregats()` ;
--   * plus de classement automatique (`cta-classer`) : le classement déjà
--     fait reste dans `cta_formes`, comme aide pour choisir les exemples des
--     fiches label, et se relance à la main ({ classer: {} } sur cta-formes).
-- Les fiches label deviennent écrites (le format du deck, où va l'appli, des
-- exemples de placements réussis), comme les fiches langue (docs/cta.md).
--
-- Retour arrière : rejouer les parties D et E de 0621 et 0622.

do $$
begin
  if exists (select 1 from cron.job where jobname = 'cta-lundi') then
    perform cron.unschedule('cta-lundi');
  end if;
  if exists (select 1 from cron.job where jobname = 'cta-classer') then
    perform cron.unschedule('cta-classer');
  end if;
end $$;

drop function if exists public.cta_agregats();
drop table if exists public.cta_stats;

comment on table public.cta_formes is
  'Forme de chaque texte de CTA publié (0621). Plus de tirage ni de stats depuis 0624 : une aide pour choisir les exemples des fiches label.';
