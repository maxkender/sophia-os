-- 0507 — Les recrues passent d'Onboarding aux posteurs normaux à leur lundi de début.
--
-- posteur_demarre(poster) : vrai quand la recrue a commencé (heure de Paris) :
--   - pas de cohorte (ancien posteur) : vrai ;
--   - cohorte_lundi > aujourd'hui : faux (Onboarding) ;
--   - choix de début « mardi » (Start Tuesday) : vrai à partir du mardi ;
--   - choix « reporter » encore sur ce lundi : faux (le report déplace la
--     cohorte au lundi suivant ; elle reste en Onboarding jusque-là) ;
--   - « keep », ou aucun choix (prête dimanche) : vrai dès le lundi.
--
-- Appliqué aux deux listes qui suivaient l'ancienne règle :
--   - posteurs_ayant_poste() (liste Posteurs) : ceux qui ont publié un post avec
--     lien, PLUS les recrues qui ont commencé ;
--   - onboarding_posteurs() (onglet Onboarding) : sans les recrues qui ont commencé.
-- Les autres vues (posts du jour, retards, paie, check du lundi soir, samedi)
-- suivent déjà les comptes et les posts.
--
-- Rien ne change sur les contrats, les milestones ou les messages. Additif :
-- une fonction, deux fonctions remplacées (onboarding_posteurs par remplacement
-- d'un morceau : la migration échoue s'il n'est pas trouvé).

create or replace function public.posteur_demarre(p_poster uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_auj   date := (now() at time zone 'Europe/Paris')::date;
  v_lundi date;
  v_choix text;
begin
  select pr.cohorte_lundi into v_lundi from public.profiles pr where pr.id = p_poster;
  if v_lundi is null then
    return true;
  end if;
  if v_lundi > v_auj then
    return false;
  end if;
  select d.choix into v_choix from public.debut_choix d where d.poster_id = p_poster and d.lundi = v_lundi;
  if v_choix = 'mardi' then
    return v_auj >= v_lundi + 1;
  end if;
  if v_choix = 'reporter' then
    return false;
  end if;
  return true;
end;
$$;
revoke all on function public.posteur_demarre(uuid) from public, anon;
grant execute on function public.posteur_demarre(uuid) to authenticated, service_role;

create or replace function public.posteurs_ayant_poste()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select distinct c.poster_id
    from public.passages pa
    join public.comptes c on c.id = pa.compte_id
   where pa.publie_url is not null
     and public.is_admin()
  union
  select pr.id
    from public.profiles pr
   where public.is_admin()
     and pr.is_active
     and pr.cohorte_lundi is not null
     and pr.cohorte_lundi <= (now() at time zone 'Europe/Paris')::date
     and pr.cohorte_lundi >= (now() at time zone 'Europe/Paris')::date - 28
     and exists (select 1 from public.user_roles r where r.user_id = pr.id and r.role = 'poster')
     and public.posteur_demarre(pr.id);
$$;
revoke all on function public.posteurs_ayant_poste() from public, anon;
grant execute on function public.posteurs_ayant_poste() to authenticated;

do $m$
declare
  v_def text := pg_get_functiondef('public.onboarding_posteurs()'::regprocedure);
  a text := 'where not coalesce(e.deuxieme, false);';
  b text := 'where not coalesce(e.deuxieme, false)
     and not public.posteur_demarre(e.poster_id);';
begin
  if position(a in v_def) = 0 then
    raise exception '0507 : filtre de onboarding_posteurs introuvable';
  end if;
  execute replace(v_def, a, b);
end;
$m$;

notify pgrst, 'reload schema';
