-- Droits du Head of Ops. Séparé de 0260 parce qu'une nouvelle valeur d'enum
-- ne peut pas être UTILISÉE dans la transaction qui l'ajoute — même découpage
-- que 0192 / 0193 pour le directing manager.

-- `is_admin_strict()` : l'admin et personne d'autre. Pour les rares gardes de
-- COMPORTEMENT, par opposition aux gardes de DONNÉES, où le Head of Ops n'a aucune
-- raison d'hériter du privilège.
create or replace function public.is_admin_strict()
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select public.has_role(auth.uid(), 'admin');
$$;

grant execute on function public.is_admin_strict() to authenticated, service_role;

comment on function public.is_admin_strict() is
  'Admin au sens étroit. is_admin() inclut le Head of Ops depuis 0261 ; utiliser celle-ci quand le Head of Ops ne doit PAS hériter du privilège.';

create or replace function public.is_head_of_ops()
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select public.has_role(auth.uid(), 'head_of_ops');
$$;

grant execute on function public.is_head_of_ops() to authenticated, service_role;

-- Droits de DONNÉES de l'admin. Le directing manager n'est VOLONTAIREMENT pas
-- ajouté ici : les trois DM existants gardent leur périmètre d'origine.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select public.has_role(auth.uid(), 'admin')
      or public.has_role(auth.uid(), 'head_of_ops');
$$;

comment on function public.is_admin() is
  'Admin OU Head of Ops (0261). Pour l''admin seul, voir is_admin_strict(). Le directing manager n''en fait PAS partie.';

-- Le Head of Ops garde ses créateurs : tous les policies HM s'appliquent aussi à lui.
create or replace function public.is_hiring_manager()
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select public.has_role(auth.uid(), 'hiring_manager')
      or public.has_role(auth.uid(), 'directing_manager')
      or public.has_role(auth.uid(), 'head_of_ops');
$$;

-- Le délai minimum entre deux publications (0259) exempte les admins pour
-- qu'ils puissent réparer un créneau. Le Head of Ops ne publie pas : il reste soumis
-- au délai. C'est le seul endroit où l'élargissement ci-dessus aurait changé
-- un COMPORTEMENT et pas une visibilité, d'où la bascule vers la version
-- stricte. Corps identique à 0259 par ailleurs.
create or replace function public.exiger_delai_entre_publications()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  delai_min   int;
  precedent   timestamptz;
  restant_min int;
begin
  if new.statut::text <> 'publie' then return new; end if;
  if tg_op = 'UPDATE' and old.statut::text = 'publie' then return new; end if;
  if coalesce(new.est_test, false) then return new; end if;
  if public.is_admin_strict() then return new; end if;
  new.publie_at := now();
  select coalesce((valeur->>'delai_min_entre_posts')::int, 25) into delai_min
    from reglages where cle = 'frequence';
  delai_min := coalesce(delai_min, 25);
  if delai_min <= 0 then return new; end if;
  select max(p.publie_at) into precedent from posts p
   where p.compte_id = new.compte_id and p.id <> new.id and p.statut::text = 'publie'
     and p.publie_at is not null and coalesce(p.est_test, false) = false;
  if precedent is null then return new; end if;
  restant_min := ceil(
    extract(epoch from (precedent + make_interval(mins => delai_min) - now())) / 60.0
  );
  if restant_min <= 0 then return new; end if;
  raise exception
    'DELAI_ENTRE_PUBLICATIONS:% — attends encore % min avant de publier sur ce compte (délai minimum % min)',
    restant_min, restant_min, delai_min
    using errcode = 'check_violation';
end;
$$;
