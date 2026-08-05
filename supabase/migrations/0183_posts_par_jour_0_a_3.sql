-- Fallback minuit : si le pool labels×langue ne peut pas remplir le quota,
-- on baisse posts_par_jour jusqu'au nombre réellement assigné (peut être 0).
-- 0 = pas d'assignation tant qu'un humain ne remonte pas le quota.

alter table public.comptes
  drop constraint if exists comptes_posts_par_jour_check;

alter table public.comptes
  add constraint comptes_posts_par_jour_check
  check (posts_par_jour >= 0 and posts_par_jour <= 3);
