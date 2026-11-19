-- 0769 : Bible · un rattachement ne retire plus aucun bloc, et il s'annule
-- (signalement d'Adrien du 19/11 : le bloc `classic_girl_run` rattaché par
-- erreur à `beau_smart_girl`, « pas moyen de remettre sur le label d'avant »).
--
-- Ce qui s'est passé (0767) : `beau_smart_girl` avait déjà son bloc, donc les 7
-- comptes de running y ont été versés et l'ancien bloc est passé `refuse`. Il
-- disparaissait de la page ET de la liste « Changer de label » : aucun chemin
-- de retour. Les 7 comptes et le bloc ont été remis à la main depuis
-- `bible_historique` (19/11, 16 h).
--
-- Désormais :
--   * `bible_carte_rattacher` ne retire plus le bloc d'origine : vidé de ses
--     comptes, il reste proposé et reste dans les listes de choix ;
--   * il note ce qu'il a fait sur ce bloc (`labels_proposes.rattachement` :
--     le bloc rejoint, les comptes déplacés, l'état d'avant) ;
--   * `bible_carte_detacher(bloc)` l'annule : les comptes déplacés (pas encore
--     importés) reviennent, ou le bloc reprend son état de proposition.
--
-- ✅ Appliquée le 2026-11-19 (MCP).
--
-- Retour arrière : `bible_carte_rattacher` de 0767 ; `drop function
-- public.bible_carte_detacher(uuid)` ; la colonne peut rester.

set lock_timeout = '5s';

alter table public.labels_proposes add column if not exists rattachement jsonb;

comment on column public.labels_proposes.rattachement is
  'Bible (0769) : le dernier rattachement de ce bloc à un label de l''OS, pour pouvoir l''annuler. {label, fusion, vers (bloc rejoint), comptes[], autres[], avant {statut, badge, section, application_ids, apps_attente}, at}. Nul : rien à annuler.';

create or replace function public.bible_carte_rattacher(p_carte uuid, p_label uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  k public.labels_proposes;
  l record;
  v_cible uuid;
  v_comptes uuid[];
  v_autres uuid[];
  v_avant jsonb;
begin
  if not public.is_admin_strict() then
    raise exception 'réservé à l''admin' using errcode = '42501';
  end if;
  select * into k from labels_proposes where id = p_carte for update;
  if k.id is null or k.statut = 'refuse' then
    raise exception 'bible : bloc introuvable';
  end if;
  if k.label_id is not null then
    raise exception 'bible : ce bloc a déjà son label';
  end if;
  select * into l from public.bible_label_section(p_label);
  if l.nom is null then
    raise exception 'bible : label introuvable';
  end if;

  v_avant := jsonb_build_object('statut', k.statut, 'badge', k.badge, 'section', k.section,
                                'application_ids', to_jsonb(k.application_ids), 'apps_attente', to_jsonb(k.apps_attente));

  select id into v_cible from labels_proposes
   where label_id = p_label and statut <> 'refuse' and id <> p_carte
   order by (section is null), ordre nulls last, propose_at
   limit 1;

  if v_cible is not null then
    -- Le label a déjà son bloc : les comptes le rejoignent. Le bloc d'origine RESTE (vide, toujours proposé).
    update labels_proposes set section = l.section, badge = 'existe', ordre = coalesce(ordre, 50)
     where id = v_cible and section is null;
    with deplaces as (
      update bible_comptes
         set label_propose_id = v_cible, label_id = p_label, application_ids = l.apps, apps_attente = '{}'
       where label_propose_id = p_carte
      returning id)
    select coalesce(array_agg(id), '{}') into v_comptes from deplaces;
    with seconds as (
      update bible_comptes set autres_cartes = array_replace(autres_cartes, p_carte, v_cible)
       where p_carte = any (autres_cartes)
      returning id)
    select coalesce(array_agg(id), '{}') into v_autres from seconds;
    update labels_proposes
       set rattachement = jsonb_build_object('label', l.nom, 'fusion', true, 'vers', v_cible, 'comptes', to_jsonb(v_comptes),
                                             'autres', to_jsonb(v_autres), 'avant', v_avant, 'at', now())
     where id = p_carte;
    return jsonb_build_object('carte_id', v_cible, 'origine_id', p_carte, 'fusion', true, 'comptes', cardinality(v_comptes), 'label', l.nom);
  end if;

  update labels_proposes
     set label_id = p_label, statut = 'valide', badge = 'existe', section = l.section,
         application_ids = l.apps, apps_attente = '{}', decide_par = auth.uid(), decide_at = now()
   where id = p_carte;
  with ranges as (
    update bible_comptes
       set label_id = p_label, application_ids = l.apps, apps_attente = '{}'
     where label_propose_id = p_carte
    returning id)
  select coalesce(array_agg(id), '{}') into v_comptes from ranges;
  update labels_proposes
     set rattachement = jsonb_build_object('label', l.nom, 'fusion', false, 'vers', null, 'comptes', to_jsonb(v_comptes),
                                           'autres', '[]'::jsonb, 'avant', v_avant, 'at', now())
   where id = p_carte;
  return jsonb_build_object('carte_id', p_carte, 'origine_id', p_carte, 'fusion', false, 'comptes', cardinality(v_comptes), 'label', l.nom);
end;
$function$;

comment on function public.bible_carte_rattacher(uuid, uuid) is
  'Bible (0767, 0769) : rattache un bloc sans vrai label à un label de l''OS. Ses comptes prennent le label ; si le label avait déjà son bloc, ils le rejoignent (le bloc d''origine reste, vide). Le rattachement est noté sur le bloc d''origine et s''annule avec bible_carte_detacher. Rend {carte_id, origine_id, fusion, comptes, label}.';

-- Annuler le rattachement d'un bloc.
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

  if coalesce((r->>'fusion')::boolean, false) then
    -- Les comptes versés dans l'autre bloc reviennent, sauf ceux qui ont été importés ou déplacés depuis.
    update bible_comptes b
       set label_propose_id = p_carte, label_id = null, application_ids = v_apps, apps_attente = v_attente
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

comment on function public.bible_carte_detacher(uuid) is
  'Bible (0769) : annule le rattachement d''un bloc à un label de l''OS. Les comptes versés dans un autre bloc reviennent (sauf importés ou déplacés depuis), ou le bloc reprend son état de proposition. Rend {carte_id, comptes, label}.';

revoke all on function public.bible_carte_detacher(uuid) from public, anon;
grant execute on function public.bible_carte_detacher(uuid) to authenticated;
