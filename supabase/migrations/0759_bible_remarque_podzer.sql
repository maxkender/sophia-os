-- 0759 : Bible des comptes (Max, 18/11). Une remarque par compte (ex. « UGC (vraie personne) : changer les images »)
-- et une case « À podzer ». Ajout seulement, sur bible_comptes.
alter table public.bible_comptes add column if not exists remarque text;
alter table public.bible_comptes add column if not exists a_podzer boolean not null default false;
