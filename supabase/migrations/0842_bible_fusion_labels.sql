-- 0842 : Bible · fusionner deux labels (demande du 23/11 : « possibilité de les
-- plier / déplier puis merge »).
--
-- `bible_carte_fusionner(source, cible)` verse tous les comptes d'un bloc dans
-- un autre bloc, quel qu'il soit (proposé ou vrai label de l'OS) : ils prennent
-- le bloc, le label et les apps de la cible. Le bloc d'origine RESTE (vide) et
-- note la fusion dans `rattachement` (fusion = true, vers = cible), comme un
-- rattachement de 0769 : elle s'annule avec `bible_carte_detacher`, depuis le
-- bouton « Rendre N comptes à … » du bloc cible.
--
-- `bible_carte_detacher` rend désormais aussi le label d'avant (`avant.label_id`)
-- aux comptes qui reviennent : un bloc qui avait un vrai label le retrouve. Les
-- anciens rattachements n'ont pas cette clé : ils reviennent sans label, comme
-- avant.
--
-- Le label de l'OS du bloc d'origine n'est pas touché (ni supprimé, ni modifié).
--
-- Retour arrière : `drop function public.bible_carte_fusionner(uuid, uuid)` ;
-- `bible_carte_detacher` de 0769.

set lock_timeout = '5s';

create or replace function public.bible_carte_fusionner(p_source uuid, p_cible uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  s public.labels_proposes;
  c public.labels_proposes;
  v_nom text;
  v_comptes uuid[];
  v_autres uuid[];
  v_avant jsonb;
begin
  if not public.is_admin_strict() then
    raise exception 'réservé à l''admin' using errcode = '42501';
  end if;
  if p_source = p_cible then
    raise exception 'bible : un label ne se fusionne pas avec lui-même';
  end if;
  select * into s from labels_proposes where id = p_source for update;
  select * into c from labels_proposes where id = p_cible for update;
  if s.id is null or s.statut = 'refuse' then
    raise exception 'bible : label d''origine introuvable';
  end if;
  if c.id is null or c.statut = 'refuse' or c.section is null then
    raise exception 'bible : label cible introuvable';
  end if;

  select coalesce(c.titre, l.nom, c.nom) into v_nom from (select 1) x left join labels l on l.id = c.label_id;

  v_avant := jsonb_build_object('statut', s.statut, 'badge', s.badge, 'section', s.section, 'label_id', s.label_id,
                                'application_ids', to_jsonb(s.application_ids), 'apps_attente', to_jsonb(s.apps_attente));

  with deplaces as (
    update bible_comptes
       set label_propose_id = p_cible, label_id = c.label_id,
           application_ids = c.application_ids, apps_attente = coalesce(c.apps_attente, '{}'),
           autres_cartes = array_remove(autres_cartes, p_cible)
     where label_propose_id = p_source
    returning id)
  select coalesce(array_agg(id), '{}') into v_comptes from deplaces;

  -- Les comptes qui avaient ce label en second : ils l'ont désormais sous la cible (sans doublon).
  with seconds as (
    update bible_comptes
       set autres_cartes = case
             when label_propose_id = p_cible or p_cible = any (autres_cartes) then array_remove(autres_cartes, p_source)
             else array_replace(autres_cartes, p_source, p_cible) end
     where p_source = any (autres_cartes)
    returning id)
  select coalesce(array_agg(id), '{}') into v_autres from seconds;

  update labels_proposes
     set rattachement = jsonb_build_object('label', v_nom, 'fusion', true, 'vers', p_cible, 'comptes', to_jsonb(v_comptes),
                                           'autres', to_jsonb(v_autres), 'avant', v_avant, 'at', now())
   where id = p_source;

  return jsonb_build_object('carte_id', p_cible, 'origine_id', p_source, 'fusion', true, 'comptes', cardinality(v_comptes), 'label', v_nom);
end;
$function$;

comment on function public.bible_carte_fusionner(uuid, uuid) is
  'Bible (0842) : fusionne un bloc dans un autre. Ses comptes prennent le bloc, le label et les apps de la cible ; le bloc d''origine reste, vide, et note la fusion (rattachement, fusion = true) : elle s''annule avec bible_carte_detacher. Rend {carte_id, origine_id, fusion, comptes, label}.';

revoke all on function public.bible_carte_fusionner(uuid, uuid) from public, anon;
grant execute on function public.bible_carte_fusionner(uuid, uuid) to authenticated;

-- Annuler : les comptes retrouvent aussi le label qu'ils avaient (avant.label_id).
create or replace function public.bible_carte_detacher(p_carte uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  k public.labels_proposes;
  r jsonb;
  v_avant jsonb;
  v_apps uuid[];
  v_attente text[];
  v_label uuid;
  v_comptes integer := 0;
begin
  if not public.is_admin_strict() then
    raise exception 'réservé à l''admin' using errcode = '42501';
  end if;
  select * into k from labels_proposes where id = p_carte for update;
  if k.id is null then
    raise exception 'bible : bloc introuvable';
  end if;
  r := k.rattachement;
  if r is null then
    raise exception 'bible : ce bloc n''a pas de rattachement à annuler';
  end if;
  v_avant := r->'avant';
  v_apps := array(select jsonb_array_elements_text(coalesce(v_avant->'application_ids', '[]'::jsonb))::uuid);
  v_attente := array(select jsonb_array_elements_text(coalesce(v_avant->'apps_attente', '[]'::jsonb)));
  v_label := nullif(v_avant->>'label_id', '')::uuid;

  if coalesce((r->>'fusion')::boolean, false) then
    -- Les comptes versés dans l'autre bloc reviennent, sauf ceux qui ont été importés ou déplacés depuis.
    update bible_comptes b
       set label_propose_id = p_carte, label_id = v_label, application_ids = v_apps, apps_attente = v_attente
     where b.id in (select (x)::uuid from jsonb_array_elements_text(coalesce(r->'comptes', '[]'::jsonb)) x)
       and b.label_propose_id = (r->>'vers')::uuid
       and b.compte_reference_id is null;
    get diagnostics v_comptes = row_count;
    update bible_comptes b
       set autres_cartes = array_replace(autres_cartes, (r->>'vers')::uuid, p_carte)
     where b.id in (select (x)::uuid from jsonb_array_elements_text(coalesce(r->'autres', '[]'::jsonb)) x);
    update labels_proposes
       set rattachement = null, statut = case when statut = 'refuse' then coalesce(v_avant->>'statut', 'a_valider') else statut end
     where id = p_carte;
  else
    -- Le bloc avait pris le label : il redevient la proposition qu'il était, ses comptes aussi.
    update labels_proposes
       set label_id = null, statut = coalesce(v_avant->>'statut', 'a_valider'), badge = coalesce(v_avant->>'badge', badge),
           section = coalesce(v_avant->>'section', section), application_ids = v_apps, apps_attente = v_attente,
           decide_par = null, decide_at = null, rattachement = null
     where id = p_carte;
    update bible_comptes b
       set label_id = null, application_ids = v_apps, apps_attente = v_attente
     where b.label_propose_id = p_carte and b.compte_reference_id is null;
    get diagnostics v_comptes = row_count;
  end if;

  return jsonb_build_object('carte_id', p_carte, 'comptes', v_comptes, 'label', r->>'label');
end;
$function$;
