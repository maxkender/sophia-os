-- 0316 : la langue d'un compte garde la casse de sa région (`pt-BR`).
--
-- Les 4 comptes brésiliens (créés le 17/10) n'ont reçu aucun post le 19/10 :
-- `manage-users` met la langue en minuscules à la création (`pt-br`), alors
-- que le moteur ne connaît que `pt-BR` (LANGUES_CIBLES, gemini, hashtags,
-- front). Chaque deck levait « Langue pt-br hors langues cibles », les 10
-- essais échouaient, et minuit concluait à tort « pool OK, compte pas atteint ».
--
-- Corriger `manage-users` demande de republier son bundle à la main. Ce
-- trigger remet la région en majuscules à l'écriture, quel que soit le chemin :
-- `xx-yy` devient `xx-YY`. `es-419` (région chiffrée) n'est pas touché.
--
-- Les 4 comptes existants ont été corrigés à la main le 19/10
-- (`update comptes set langue = 'pt-BR' where langue = 'pt-br'`).
--
-- Retour arrière : `drop trigger comptes_langue_region on public.comptes;
-- drop function public.comptes_langue_region();`

create or replace function public.comptes_langue_region()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.langue ~* '^[a-z]{2}-[a-z]{2}$' then
    new.langue := lower(split_part(new.langue, '-', 1)) || '-' || upper(split_part(new.langue, '-', 2));
  end if;
  return new;
end;
$$;

drop trigger if exists comptes_langue_region on public.comptes;
create trigger comptes_langue_region
  before insert or update of langue on public.comptes
  for each row execute function public.comptes_langue_region();
