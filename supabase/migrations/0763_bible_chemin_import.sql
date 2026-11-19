-- 0763 : la Bible devient le chemin de l'import (décisions d'Adrien du 19/11).
--
-- 1. LES SEUILS (`reglages.bleo.sources`) :
--      * r_min et r_vs_label_min : 1 → 0,95. Lus par la règle du lundi
--        (`bleo_lundi_sources`) ET par le verdict des essais
--        (`sources_essais_juger`) : les deux passent à « r au-dessus de 0,95 ».
--      * lot_max : 6 → 8 mises à jour par jour (environ 5 sources de plus sont
--        retenues chaque lundi à 0,95 ; à 6 par jour la semaine ne suffisait plus).
--      * nouvelles_par_jour : 2 → 1000, c'est-à-dire plus de quota sur les
--        sources neuves. (0 voudrait dire « à l'arrêt », pas « sans limite ».)
--        Toujours une source à la fois : c'est la séquence qui étale la charge.
-- 2. `bible_lancer_batch(comptes)` : « Lancer l'import » de la Bible. Pour
--    chaque compte du prochain batch (avec sa langue) : crée la source, lui pose
--    le label de sa carte, et la passe par `maj_sources_ajouter` (mêmes règles
--    que la page Sources : essai de 30 posts dans un label déjà porté, sinon ses
--    100 posts les plus vus). Refusés, avec la raison : compte à podzer, label
--    encore proposé, langue manquante, compte déjà source. Tout le batch part
--    dans UNE séquence (une source à la fois) si rien ne tourne ; sinon il
--    attend le lot suivant (6 h 37).
-- 3. `label_propose_valider` : la carte reste en place après la validation.
--    Depuis la refonte (0758) les comptes sont rangés par carte
--    (`label_propose_id`) ; l'ancienne version l'effaçait et le compte tombait
--    dans « Sans label ». La carte passe au badge « existe ».
--
-- ✅ Appliquée le 2026-11-19 (MCP).
--
-- Retour arrière : remettre r_min 1, r_vs_label_min 1, lot_max 6,
-- nouvelles_par_jour 2 dans `reglages.bleo.sources` ; `drop function
-- public.bible_lancer_batch(jsonb)` ; `label_propose_valider` de 0745.

set lock_timeout = '5s';

-- 1. Les seuils.
update public.reglages
   set valeur = jsonb_set(valeur, '{sources}',
         coalesce(valeur->'sources', '{}'::jsonb)
           || jsonb_build_object('r_min', 0.95, 'r_vs_label_min', 0.95, 'lot_max', 8, 'nouvelles_par_jour', 1000),
         true),
       updated_at = now()
 where cle = 'bleo';

-- 2. Lancer l'import du prochain batch.
create or replace function public.bible_lancer_batch(p_comptes jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  e jsonb;
  b public.bible_comptes;
  v_label uuid;
  v_label_nom text;
  v_langue text;
  v_source uuid;
  v_existante uuid;
  v_file jsonb;
  v_refus text;
  v_resultats jsonb := '[]'::jsonb;
  -- La source dont l'ajout a ouvert la séquence, et celles à y joindre.
  v_premiere uuid;
  v_suite jsonb := '[]'::jsonb;
  v_suite_ids uuid[] := '{}';
  v_semaine date := date_trunc('week', now() at time zone 'Europe/Paris')::date;
begin
  if not public.is_admin_strict() then
    raise exception 'réservé à l''admin' using errcode = '42501';
  end if;
  if p_comptes is null or jsonb_typeof(p_comptes) <> 'array' or jsonb_array_length(p_comptes) = 0 then
    raise exception 'bible : aucun compte à lancer';
  end if;
  if jsonb_array_length(p_comptes) > 200 then
    raise exception 'bible : 200 comptes au plus par lancement';
  end if;

  for e in select value from jsonb_array_elements(p_comptes) loop
    b := null;
    v_refus := null;
    begin
      select * into b from bible_comptes where id = (e->>'id')::uuid for update;
      -- Pas de `lower` : certains codes ont une région en majuscules (pt-BR).
      v_langue := btrim(coalesce(e->>'langue', ''));

      if b.id is null then
        v_refus := 'compte introuvable';
      elsif b.supprime_at is not null then
        v_refus := 'à la corbeille';
      elsif b.etape <> 'prochain_batch' then
        v_refus := 'pas dans le prochain batch';
      elsif b.a_podzer then
        v_refus := 'à podzer : pas d''import';
      elsif v_langue !~ '^[a-z]{2,3}(-[A-Za-z0-9]{2,4})?$' then
        v_refus := 'langue manquante';
      else
        -- Le label est celui de la carte du compte, et seulement s'il existe pour de bon.
        select l.id, l.nom into v_label, v_label_nom
          from labels_proposes lp
          join labels l on l.id = lp.label_id
         where lp.id = b.label_propose_id and lp.statut <> 'refuse';
        select id into v_existante
          from comptes_reference
         where public.bible_handle(handle_tiktok) = b.handle
         limit 1;
        if v_label is null then
          v_refus := 'label à créer';
        elsif v_existante is not null then
          v_refus := 'déjà une source';
        end if;
      end if;

      if v_refus is not null then
        v_resultats := v_resultats || jsonb_build_object(
          'id', e->>'id', 'handle', b.handle, 'statut', 'refuse', 'raison', v_refus);
      else
        insert into comptes_reference (handle_tiktok, niche, langue)
        values (b.handle, v_label_nom, v_langue)
        returning id into v_source;
        perform public.set_labels_source(v_source, array[v_label]);
        v_file := public.maj_sources_ajouter(v_source);
        update bible_comptes set langue = v_langue, etape = 'importe', etape_at = now() where id = b.id;

        v_resultats := v_resultats || jsonb_build_object(
          'id', b.id, 'handle', b.handle, 'statut', v_file->>'file', 'label', v_label_nom,
          'essai_max', v_file->'essai_max', 'prevu_le', v_file->>'prevu_le', 'compte_reference_id', v_source);
        if v_file->>'file' = 'lancee' then
          v_premiere := v_source;
        elsif v_premiere is not null then
          v_suite := v_suite || jsonb_build_object('id', v_source, 'handle', b.handle, 'langue', v_langue);
          v_suite_ids := v_suite_ids || v_source;
        end if;
      end if;
    exception when others then
      -- Un compte en erreur n'arrête pas le batch : ce qu'il avait écrit est défait, les autres passent.
      v_resultats := v_resultats || jsonb_build_object(
        'id', e->>'id', 'handle', b.handle, 'statut', 'erreur', 'raison', sqlerrm);
    end;
  end loop;

  -- Une seule séquence pour tout le batch. `maj_sources_ajouter` a ouvert la
  -- séquence avec la première source ; les suivantes l'ont trouvée en cours et
  -- attendraient le lot du lendemain. On les y joint ici, dans la même
  -- transaction : aucun worker n'a encore pu lire la séquence.
  if v_premiere is not null and jsonb_array_length(v_suite) > 0 then
    update reglages
       set valeur = jsonb_set(
             jsonb_set(valeur, '{comptes}', (valeur->'comptes') || v_suite),
             '{journal}',
             coalesce(valeur->'journal', '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
               'at', now(), 'niveau', 'info',
               'message', format('Batch de la Bible : %s source(s) dans la séquence', jsonb_array_length(v_suite) + 1)))),
           updated_at = now()
     where cle = 'maj_sources_run'
       and valeur->>'statut' = 'running'
       and jsonb_array_length(valeur->'comptes') = 1
       and valeur->'comptes'->0->>'id' = v_premiere::text;
    if found then
      update bleo_sources_decisions set lancee_le = now()
       where semaine = v_semaine and compte_reference_id = any (v_suite_ids);
      select jsonb_agg(case when (r->>'compte_reference_id')::uuid = any (v_suite_ids)
                            then (r - 'prevu_le') || jsonb_build_object('statut', 'lancee')
                            else r end order by o)
        into v_resultats
        from jsonb_array_elements(v_resultats) with ordinality as t(r, o);
    end if;
  end if;

  return jsonb_build_object('resultats', v_resultats);
end;
$function$;

comment on function public.bible_lancer_batch(jsonb) is
  'Bible (0763) : lance l''import de comptes du prochain batch ([{id, langue}]). Crée chaque source avec le label de sa carte et la passe par maj_sources_ajouter ; tout le batch dans une séquence si rien ne tourne. Refuse, avec la raison : à podzer, label à créer, langue manquante, déjà une source. Rend {resultats: [{id, handle, statut: lancee | attente | refuse | erreur, raison, essai_max, prevu_le}]}.';

revoke all on function public.bible_lancer_batch(jsonb) from public, anon;
grant execute on function public.bible_lancer_batch(jsonb) to authenticated;

-- 3. Valider un label proposé : la carte reste, avec le badge « existe ».
create or replace function public.label_propose_valider(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  p public.labels_proposes;
  v_label uuid;
  v_app uuid;
begin
  if not public.is_admin_strict() then raise exception 'réservé à l''admin' using errcode = '42501'; end if;
  select * into p from public.labels_proposes where id = p_id for update;
  if p.id is null then raise exception 'label proposé introuvable'; end if;
  if p.statut = 'valide' then return jsonb_build_object('ok', true, 'label_id', p.label_id, 'deja', true); end if;
  if p.statut = 'refuse' then raise exception 'ce label a été refusé'; end if;
  if cardinality(p.application_ids) = 0 then
    raise exception 'Choisis d''abord une app existante pour ce label%',
      case when cardinality(p.apps_attente) > 0 then ' (' || array_to_string(p.apps_attente, ', ') || ' n''existe pas encore)' else '' end;
  end if;
  select id into v_label from public.labels where lower(nom) = p.nom limit 1;
  if v_label is null then
    v_app := p.application_ids[1];
    insert into public.labels (nom, slug, style_theme, application_id)
    values (p.nom, replace(p.nom, '_', '-'), nullif(btrim(coalesce(p.description_da, '')), ''), v_app)
    returning id into v_label;
  end if;
  insert into public.label_applications (label_id, application_id)
  select v_label, a from unnest(p.application_ids) a
  on conflict do nothing;
  update public.labels_proposes
     set statut = 'valide', label_id = v_label, decide_par = auth.uid(), decide_at = now(),
         badge = case when section is not null then 'existe' else badge end
   where id = p.id;
  -- 0763 : les comptes gardent leur carte (label_propose_id) et prennent le vrai label.
  update public.bible_comptes set label_id = v_label where label_propose_id = p.id;
  return jsonb_build_object('ok', true, 'label_id', v_label);
end;
$function$;
