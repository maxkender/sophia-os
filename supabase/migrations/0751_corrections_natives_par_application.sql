-- 0751 (appliquée en base sous le nom 0743_corrections_natives_par_application, numéro pris
-- entre-temps sur main par 0743_support_corrections) : les corrections natives savent pour quelle application elles valent.
--
-- Décision d'Adrien du 17/11 : « j'abandonne l'idée d'avoir des fiches langue,
-- ce que je veux, c'est les corrections natives », et constat du même jour :
-- les corrections (0630) et les règles natives (0734) sont rangées par langue,
-- sans application. Or les relecteurs relisent des posts Sophia, micabo et
-- UnSwipe, et une partie de leurs retours porte sur la slide de l'appli (« une
-- app de culture générale comme Sophia »). Ces retours-là partaient dans la
-- traduction de TOUTES les applications de la langue.
--
-- 1. `corrections_natives.application_id` : NULL = correction de LANGUE (vaut
--    pour toutes les applications) ; remplie = correction propre à cette
--    application (elle ne va qu'au placement de cette application).
-- 2. La règle, posée à l'insertion par un déclencheur (donc aussi pour le code
--    déjà déployé) et appliquée au stock :
--      * la correction cite une application par son nom → cette application ;
--      * type `placement`, ou fragment pris sur la slide de l'appli du deck
--        relu → l'application du post relu (duel ou relecture) ;
--      * sinon NULL (langue).
--    L'admin peut la changer dans Relecture native → Corrections.
-- 3. `corrections_natives_bloc(langue)` (bloc de la TRADUCTION, commune à
--    toutes les applications) : même signature, mais ses « retours récents »
--    ne prennent plus que les corrections de langue. `regles_natives_a_consolider`
--    ne regarde plus qu'elles.
-- 4. Allemand et italien : une version 2 des règles natives est PROPOSÉE, la
--    version 1 moins la rubrique « La slide de l'appli » et moins les exemples
--    tirés d'une correction propre à une application. Rien ne change en
--    production tant qu'Adrien ne l'a pas validée (Relecture native → Règles).
--    Ses `corrections_ids` gardent celles de la version 1 : une correction
--    d'application reste « couverte », pour que la consolidation déjà
--    déployée ne la remette pas dans la version suivante.
--
-- Retour arrière : drop trigger corrections_natives_application on
--   public.corrections_natives ; rejouer `corrections_natives_bloc` et
--   `regles_natives_a_consolider` de 0734 ; rejeter les versions 2 proposées ;
--   la colonne peut rester.
-- ✅ Appliquée le 2026-11-18 à 13 h UTC (MCP). Idempotente.

set lock_timeout = '5s';

alter table public.corrections_natives
  add column if not exists application_id uuid references public.applications (id) on delete set null;

comment on column public.corrections_natives.application_id is
  '0751 : NULL = correction de langue (toutes les applications) ; sinon correction propre à cette application (placement de cette application seulement).';

create index if not exists corrections_natives_application
  on public.corrections_natives (langue, application_id) where statut = 'retenue';

-- L'application d'une correction, d'après le post relu.
create or replace function public.correction_native_application(
  p_duel uuid, p_relecture uuid, p_version text, p_slide integer, p_type text, p_fautif text, p_corrige text)
returns uuid
language sql
stable
set search_path to 'public'
as $$
  with src as (
    select
      coalesce(
        (select d.application_id from ab_traduction_duels d where d.id = p_duel),
        (select p.application_id from relectures_posts r join passages p on p.id = r.passage_id where r.id = p_relecture),
        '00000000-0000-4000-8000-000000000001'::uuid) as app,
      coalesce(
        (select case when p_version = 'actuel' then coalesce(d.slides_actuel, '[]'::jsonb)
                     when p_version = 'candidat' then coalesce(d.slides_candidat, '[]'::jsonb)
                     else coalesce(d.slides_actuel, '[]'::jsonb) || coalesce(d.slides_candidat, '[]'::jsonb) end
           from ab_traduction_duels d where d.id = p_duel),
        (select r.slides from relectures_posts r where r.id = p_relecture),
        '[]'::jsonb) as slides
  )
  select case
    when (select a.id from applications a
           where (coalesce(p_fautif, '') || ' ' || coalesce(p_corrige, '')) ~* ('\m' || a.slug || '\M')
           order by a.created_at limit 1) is not null
      then (select a.id from applications a
             where (coalesce(p_fautif, '') || ' ' || coalesce(p_corrige, '')) ~* ('\m' || a.slug || '\M')
             order by a.created_at limit 1)
    when p_type = 'placement' then src.app
    when p_slide is not null and exists (
           select 1 from jsonb_array_elements(case when jsonb_typeof(src.slides) = 'array' then src.slides else '[]'::jsonb end) s
            where s->>'position' = p_slide::text
              and s->>'position_sophia' = 'true'
              and position(lower(btrim(coalesce(p_fautif, ''))) in lower(coalesce(s->>'texte_overlay', ''))) > 0)
      then src.app
    else null
  end
  from src;
$$;
revoke all on function public.correction_native_application(uuid, uuid, text, integer, text, text, text) from public, anon;
grant execute on function public.correction_native_application(uuid, uuid, text, integer, text, text, text) to authenticated, service_role;

create or replace function public.corrections_natives_poser_application()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  if new.application_id is null then
    new.application_id := public.correction_native_application(
      new.duel_id, new.relecture_id, new.version, new.slide, new.type, new.fautif, new.corrige);
  end if;
  return new;
end;
$$;

drop trigger if exists corrections_natives_application on public.corrections_natives;
create trigger corrections_natives_application
  before insert on public.corrections_natives
  for each row execute function public.corrections_natives_poser_application();

-- Le stock : une seule fois (les lignes déjà rangées ne bougent plus).
update public.corrections_natives c
   set application_id = public.correction_native_application(c.duel_id, c.relecture_id, c.version, c.slide, c.type, c.fautif, c.corrige)
 where c.application_id is null
   and not exists (select 1 from public.regles_natives r where r.auteur = 'separation-par-application-0743');

-- Le bloc de la traduction : les règles validées de la langue, puis les
-- corrections de LANGUE retenues qu'elles ne couvrent pas encore.
create or replace function public.corrections_natives_bloc(p_langue text, p_max integer default 100)
returns text
language sql
stable
security invoker
set search_path to 'public'
as $$
  with regles as (
    select contenu, corrections_ids from regles_natives
     where langue = lower(p_langue) and statut = 'validee'
     limit 1
  ), recentes as (
    select * from (
      select * from (
        select distinct on (lower(btrim(c.fautif))) c.*
          from corrections_natives c
         where lower(c.langue) = lower(p_langue) and c.statut = 'retenue'
           and c.application_id is null
           and not exists (select 1 from regles r where c.id = any (r.corrections_ids))
         order by lower(btrim(c.fautif)), c.created_at desc
      ) u
      order by created_at desc
      limit greatest(coalesce(p_max, 100), 1)
    ) l
  ), bloc_regles as (
    select E'=== RÈGLES DES RELECTEURS NATIFS (' || upper(p_langue) || E') ===\n'
           || E'Des natifs relisent nos posts chaque semaine. Leurs retours, rassemblés en règles. Applique-les toutes :\n'
           || btrim(contenu) as texte
      from regles
  ), bloc_recentes as (
    select case when count(*) = 0 then null else
      E'=== RETOURS DES RELECTEURS NATIFS (' || upper(p_langue) || E') ===\n'
      || E'Des natifs ont relu nos traductions et relevé ceci. Applique ces corrections, et ne refais pas ces erreurs dans des phrases voisines :\n'
      || string_agg(
           '- [' || r.type || '] '
           || case when r.corrige is not null and btrim(r.corrige) <> ''
                   then 'au lieu de « ' || btrim(r.fautif) || ' », écris « ' || btrim(r.corrige) || ' »'
                   else 'évite « ' || btrim(r.fautif) || ' »' end
           || case when r.explication is not null and btrim(r.explication) <> '' then ' (' || btrim(r.explication) || ')' else '' end,
           E'\n' order by r.created_at desc)
    end as texte
      from recentes r
  )
  select nullif(concat_ws(E'\n\n', (select texte from bloc_regles), (select texte from bloc_recentes)), '');
$$;
grant execute on function public.corrections_natives_bloc(text, integer) to authenticated, service_role;

create or replace function public.regles_natives_a_consolider()
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (
    select 1
      from corrections_natives c
     where c.statut = 'retenue'
       and c.application_id is null
       and not exists (select 1 from regles_natives p where p.langue = lower(c.langue) and p.statut = 'proposee')
       and not exists (select 1 from regles_natives v where v.langue = lower(c.langue) and v.statut = 'validee'
                        and c.id = any (v.corrections_ids))
  );
$$;
revoke all on function public.regles_natives_a_consolider() from public, anon, authenticated;
grant execute on function public.regles_natives_a_consolider() to service_role;

-- Les règles validées d'une langue, sans ce qui est propre à une application :
-- la rubrique « La slide de l'appli » et les exemples d'une correction rangée
-- sous une application.
create or replace function pg_temp.regles_sans_application(p_langue text)
returns text
language plpgsql
as $$
declare
  v_contenu text;
  v_ids uuid[];
  l text;
  sortie text := '';
  dans_appli boolean := false;
  bas text;
begin
  select contenu, corrections_ids into v_contenu, v_ids
    from public.regles_natives where langue = p_langue and statut = 'validee';
  if v_contenu is null then return null; end if;
  foreach l in array regexp_split_to_array(replace(v_contenu, E'\r', ''), E'\n') loop
    if l ~ '^###' then
      dans_appli := l ~* 'slide de l.appli';
    end if;
    continue when dans_appli;
    bas := lower(l);
    continue when l ~ '^\s+-' and exists (
      select 1 from public.corrections_natives c
       where c.id = any (v_ids) and c.application_id is not null
         and position('« ' || lower(btrim(c.fautif)) || ' »' in bas) > 0);
    sortie := sortie || l || E'\n';
  end loop;
  return btrim(regexp_replace(sortie, E'\n{3,}', E'\n\n', 'g'));
end;
$$;

insert into public.regles_natives (langue, version, contenu, statut, corrections_ids, auteur)
select v.langue, v.version + 1, pg_temp.regles_sans_application(v.langue), 'proposee', v.corrections_ids,
       'separation-par-application-0743'
  from public.regles_natives v
 where v.statut = 'validee'
   and not exists (select 1 from public.regles_natives p where p.langue = v.langue and p.statut = 'proposee')
   and not exists (select 1 from public.regles_natives p where p.langue = v.langue and p.auteur = 'separation-par-application-0743')
   and pg_temp.regles_sans_application(v.langue) is distinct from btrim(replace(v.contenu, E'\r', ''));
