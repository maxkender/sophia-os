-- 0850 : Bible · une section par application, sans liste figée (demande du
-- 23/11 : « pourquoi je ne peux pas choisir Artura ici ? … ça doit être
-- automatique quand on crée une appli »).
--
-- Jusqu'ici `labels_proposes.section` n'acceptait que quatre valeurs écrites
-- en dur ('atala', 'micabo', 'sophia', 'idees' : contrainte de 0765), et
-- l'écran avait la même liste. Artura (0846) n'y était pas, et toute nouvelle
-- application aurait demandé une migration de plus.
--
--  - La contrainte `labels_proposes_section_check` est remplacée par un
--    déclencheur : la section est NULL, 'idees', ou le slug d'une application
--    qui existe (`applications.slug`), active ou non. Une application créée
--    dans l'OS a donc sa section tout de suite, Artura comprise.
--  - `bible_label_section` (la section d'un label de l'OS) : Sophia d'abord,
--    puis Micabo, puis Atala comme avant, puis les autres applications dans
--    l'ordre de leur création ; Sophia par défaut. UnSwipe reste hors de la
--    Bible (elle n'y a jamais eu de section) : un label qui ne sert qu'elle se
--    range sous Sophia, comme avant.
--
-- Aucune donnée n'est modifiée. Le front lit la table `applications` pour
-- dresser ses sections (plus le catalogue du code, pour ne pas attendre).
--
-- ✅ Appliquée le 2026-11-24 (MCP), avant le merge du front. Idempotente.
--
-- Retour arrière (tant qu'aucun bloc n'a une section hors des quatre d'origine) :
--   drop trigger labels_proposes_section_valide on public.labels_proposes;
--   drop function public.labels_proposes_section_valide();
--   alter table public.labels_proposes add constraint labels_proposes_section_check
--     check (section is null or section in ('atala', 'micabo', 'sophia', 'idees'));
--   et `bible_label_section` de 0767.

set lock_timeout = '5s';

create or replace function public.labels_proposes_section_valide()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
begin
  if new.section is not null and new.section <> 'idees'
     and not exists (select 1 from public.applications a where a.slug = new.section) then
    raise exception 'section inconnue : % (attendu : le slug d''une application, ou idees)', new.section
      using errcode = '23514';
  end if;
  return new;
end;
$function$;

drop trigger if exists labels_proposes_section_valide on public.labels_proposes;
create trigger labels_proposes_section_valide
  before insert or update of section on public.labels_proposes
  for each row execute function public.labels_proposes_section_valide();

alter table public.labels_proposes drop constraint if exists labels_proposes_section_check;

-- Le nom d'un label, les applications qu'il sert et sa section dans la Bible.
create or replace function public.bible_label_section(p_label uuid, out nom text, out apps uuid[], out section text)
language sql
stable
security definer
set search_path to 'public'
as $function$
  select l.nom, x.apps,
         coalesce((select a.slug from applications a
                    where a.id = any (x.apps) and a.slug <> 'unswipe'
                    order by coalesce(array_position(array['sophia', 'micabo', 'atala'], a.slug), 99), a.created_at
                    limit 1), 'sophia')
    from labels l
   cross join lateral (
     select coalesce((select array_agg(la.application_id) from label_applications la where la.label_id = l.id),
                     array[l.application_id]) as apps) x
   where l.id = p_label;
$function$;
