-- Posts par jour par compte poster : 1 à 3, défaut 1.
-- Pilote le quota d'assignation minuit (passages créés / jour).

update public.comptes
set posts_par_jour = 1
where posts_par_jour is null
   or posts_par_jour < 1
   or posts_par_jour > 3;

alter table public.comptes
  alter column posts_par_jour set default 1;

alter table public.comptes
  alter column posts_par_jour set not null;

alter table public.comptes
  drop constraint if exists comptes_posts_par_jour_check;

alter table public.comptes
  add constraint comptes_posts_par_jour_check
  check (posts_par_jour >= 1 and posts_par_jour <= 3);

-- Fallback global (comptes legacy / edge) : 1.
update public.reglages
set valeur = coalesce(valeur, '{}'::jsonb) || '{"posts_par_jour": 1}'::jsonb
where cle = 'frequence';
