-- 0765 : Bible · la section « runvik » devient « atala », reliée à l'application.
--
-- La Bible (0758) rangeait les comptes de running sous une section « runvik »,
-- avec l'appli « Runvik – running » EN ATTENTE (un texte dans `apps_attente`,
-- faute d'application dans l'OS). L'appli a son nom, Atala, et existe depuis
-- 0764 : la section prend son nom, et ses cartes comme ses comptes portent la
-- vraie application (`application_ids`) au lieu du texte en attente.
--
-- Ce que ça change :
--  - `labels_proposes.section` : 'runvik' → 'atala' (8 cartes au 19/11), la
--    contrainte n'accepte plus 'runvik' ;
--  - `labels_proposes` et `bible_comptes` (22 comptes au 19/11) :
--    « Runvik – running » sort de `apps_attente`, l'id d'Atala entre dans
--    `application_ids` (sans doublon, les autres applications restent).
-- Rien d'autre ne lit ces colonnes (ni le moteur, ni l'import).
--
-- À appliquer APRÈS 0764 (l'application doit exister) et juste APRÈS le
-- déploiement du front : le front d'avant écrit encore la section 'runvik'
-- (refusée ensuite, « rafraîchis la page »), celui d'après écrit 'atala'
-- (refusée avant). Idempotente.
--
-- Retour arrière : remettre la contrainte avec 'runvik' et l'ancien front ;
-- les `apps_attente` d'origine ne se retrouvent pas (les comptes resteraient
-- rangés sous leurs cartes, sans le texte « Runvik – running »).

do $m$
declare
  v_atala constant uuid := '00000000-0000-4000-8000-000000000004';
  v_attente constant text := 'Runvik – running';
begin
  if not exists (select 1 from public.applications where id = v_atala) then
    raise exception '0765 : appliquer 0764 d''abord (application Atala absente)';
  end if;

  alter table public.labels_proposes drop constraint if exists labels_proposes_section_check;

  update public.labels_proposes
     set section = 'atala'
   where section = 'runvik';

  update public.labels_proposes
     set apps_attente = array_remove(apps_attente, v_attente),
         application_ids = case when v_atala = any(application_ids) then application_ids
                                else array_append(application_ids, v_atala) end
   where v_attente = any(apps_attente)
      or (section = 'atala' and not v_atala = any(application_ids));

  update public.bible_comptes
     set apps_attente = array_remove(apps_attente, v_attente),
         application_ids = case when v_atala = any(application_ids) then application_ids
                                else array_append(application_ids, v_atala) end
   where v_attente = any(apps_attente);

  alter table public.labels_proposes add constraint labels_proposes_section_check
    check (section is null or section in ('atala', 'micabo', 'sophia', 'idees'));
end
$m$;
