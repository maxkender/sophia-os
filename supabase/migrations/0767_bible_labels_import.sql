-- 0767 : Bible · importer un compte en un clic, rattacher un bloc à un label
-- de l'OS (décisions d'Adrien du 19/11).
--
-- 1. `bible_lancer_batch` n'exige plus l'étape « prochain batch » : un compte
--    prêt (vrai label, pas à podzer, pas déjà source) s'importe d'un clic depuis
--    sa tuile, où qu'il soit. Le bouton du batch, lui, n'envoie toujours que le
--    prochain batch (c'est la page qui choisit la liste).
-- 2. `bible_carte_du_label(label)` : la carte d'un label de l'OS, créée s'il
--    n'en avait pas (« existe »). Sert à ranger un compte sous n'importe quel
--    label existant, pas seulement ceux qui avaient déjà une carte.
-- 3. `bible_carte_rattacher(carte, label)` : un bloc dont le label n'existait
--    pas (proposé, nouveau, à confirmer, idée) est rattaché à un label de l'OS.
--    Ses comptes prennent ce label et deviennent importables. Si le label avait
--    déjà sa carte, les comptes la rejoignent et l'ancienne carte est retirée.
-- 4. `sources_candidats_vers_bible` (0766) passe par la même fonction pour
--    trouver ou créer la carte du label : une seule règle.
--
-- Les comptes « à podzer » validés ne demandent rien en base : ils gardent
-- `a_podzer` et prennent l'étape `importe` (aucune source n'est créée).
--
-- ✅ Appliquée le 2026-11-19 (MCP).
--
-- Retour arrière : `bible_lancer_batch` de 0763, `sources_candidats_vers_bible`
-- de 0766 ; `drop function public.bible_carte_rattacher(uuid, uuid),
-- public.bible_carte_du_label(uuid), public.bible_carte_du_label_interne(uuid),
-- public.bible_label_section(uuid)`.

set lock_timeout = '5s';

-- Le nom d'un label, les applications qu'il sert et sa section dans la Bible
-- (Sophia d'abord, puis Micabo, puis Atala ; Sophia par défaut).
create or replace function public.bible_label_section(p_label uuid, out nom text, out apps uuid[], out section text)
language sql
stable
security definer
set search_path to 'public'
as $function$
  select l.nom, x.apps,
         coalesce((select a.slug from applications a
                    where a.id = any (x.apps) and a.slug in ('sophia', 'micabo', 'atala')
                    order by array_position(array['sophia', 'micabo', 'atala'], a.slug) limit 1), 'sophia')
    from labels l
   cross join lateral (
     select coalesce((select array_agg(la.application_id) from label_applications la where la.label_id = l.id),
                     array[l.application_id]) as apps) x
   where l.id = p_label;
$function$;

-- La carte d'un label de l'OS : la sienne, sinon une nouvelle (« existe »). Interne : sans contrôle d'accès.
create or replace function public.bible_carte_du_label_interne(p_label uuid)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  l record;
  v_carte uuid;
  v_nom text;
  v_essai text;
  v_n integer := 1;
begin
  select * into l from public.bible_label_section(p_label);
  if l.nom is null then
    raise exception 'bible : label introuvable';
  end if;

  select id into v_carte from labels_proposes
   where label_id = p_label and statut <> 'refuse'
   order by (section is null), ordre nulls last, propose_at
   limit 1;
  if v_carte is not null then
    -- Une ancienne proposition sans section : elle devient la carte du label.
    update labels_proposes
       set section = l.section, badge = 'existe', ordre = coalesce(ordre, 50)
     where id = v_carte and section is null;
    return v_carte;
  end if;

  -- Le nom d'une carte : minuscules, chiffres et _ (« Inspo girly » → inspo_girly), unique.
  v_nom := coalesce(nullif(btrim(regexp_replace(lower(l.nom), '[^a-z0-9]+', '_', 'g'), '_'), ''), 'label');
  v_essai := v_nom;
  while exists (select 1 from labels_proposes where nom = v_essai and statut <> 'refuse') loop
    v_n := v_n + 1;
    v_essai := v_nom || '_' || v_n;
  end loop;
  insert into labels_proposes (nom, application_ids, apps_attente, statut, label_id, section, badge, ordre, decide_par, decide_at)
  values (v_essai, l.apps, '{}', 'valide', p_label, l.section, 'existe', 50, auth.uid(), now())
  returning id into v_carte;
  return v_carte;
end;
$function$;

create or replace function public.bible_carte_du_label(p_label uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_carte uuid;
begin
  if not public.is_admin_strict() then
    raise exception 'réservé à l''admin' using errcode = '42501';
  end if;
  v_carte := public.bible_carte_du_label_interne(p_label);
  return (select jsonb_build_object('id', lp.id, 'nom', lp.nom, 'titre', lp.titre, 'section', lp.section, 'badge', lp.badge,
                                    'description_da', lp.description_da, 'label_id', lp.label_id, 'ordre', lp.ordre, 'statut', lp.statut,
                                    'label_nom', (select l.nom from labels l where l.id = lp.label_id))
            from labels_proposes lp where lp.id = v_carte);
end;
$function$;

comment on function public.bible_carte_du_label(uuid) is
  'Bible (0767) : la carte d''un label de l''OS, créée (« existe ») s''il n''en avait pas. Rend la carte.';

-- Rattacher un bloc sans vrai label à un label de l'OS.
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
  v_comptes integer;
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

  select id into v_cible from labels_proposes
   where label_id = p_label and statut <> 'refuse' and id <> p_carte
   order by (section is null), ordre nulls last, propose_at
   limit 1;

  if v_cible is not null then
    -- Le label a déjà sa carte : les comptes la rejoignent, ce bloc est retiré.
    update labels_proposes set section = l.section, badge = 'existe', ordre = coalesce(ordre, 50)
     where id = v_cible and section is null;
    update bible_comptes
       set label_propose_id = v_cible, label_id = p_label, application_ids = l.apps, apps_attente = '{}'
     where label_propose_id = p_carte;
    get diagnostics v_comptes = row_count;
    update bible_comptes set autres_cartes = array_replace(autres_cartes, p_carte, v_cible) where p_carte = any (autres_cartes);
    update labels_proposes set statut = 'refuse', decide_par = auth.uid(), decide_at = now() where id = p_carte;
    return jsonb_build_object('carte_id', v_cible, 'fusion', true, 'comptes', v_comptes, 'label', l.nom);
  end if;

  update labels_proposes
     set label_id = p_label, statut = 'valide', badge = 'existe', section = l.section,
         application_ids = l.apps, apps_attente = '{}', decide_par = auth.uid(), decide_at = now()
   where id = p_carte;
  update bible_comptes
     set label_id = p_label, application_ids = l.apps, apps_attente = '{}'
   where label_propose_id = p_carte;
  get diagnostics v_comptes = row_count;
  return jsonb_build_object('carte_id', p_carte, 'fusion', false, 'comptes', v_comptes, 'label', l.nom);
end;
$function$;

comment on function public.bible_carte_rattacher(uuid, uuid) is
  'Bible (0767) : rattache un bloc sans vrai label à un label de l''OS. Ses comptes prennent le label ; si le label avait déjà sa carte, ils la rejoignent et le bloc est retiré. Rend {carte_id, fusion, comptes, label}.';

revoke all on function public.bible_label_section(uuid) from public, anon, authenticated;
revoke all on function public.bible_carte_du_label_interne(uuid) from public, anon, authenticated;
revoke all on function public.bible_carte_du_label(uuid) from public, anon;
revoke all on function public.bible_carte_rattacher(uuid, uuid) from public, anon;
grant execute on function public.bible_carte_du_label(uuid) to authenticated;
grant execute on function public.bible_carte_rattacher(uuid, uuid) to authenticated;

-- Une proposition de l'éclaireur devient un compte de la Bible : même règle pour la carte du label.
create or replace function public.sources_candidats_vers_bible(p_id uuid, p_etape text default 'a_importer')
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  c public.sources_candidats;
  v_carte uuid;
  v_apps uuid[] := '{}';
  v_bible uuid;
  v_deja boolean := false;
begin
  if not public.is_admin_strict() then
    raise exception 'réservé à l''admin' using errcode = '42501';
  end if;
  if p_etape not in ('a_importer', 'prochain_batch') then
    raise exception 'bible : étape inconnue (%)', p_etape;
  end if;

  select * into c from sources_candidats where id = p_id for update;
  if c.id is null then
    raise exception 'bible : proposition introuvable';
  end if;
  if c.statut not in ('propose', 'plus_tard') then
    raise exception 'bible : @% est déjà décidée', c.handle_tiktok;
  end if;
  if exists (select 1 from comptes_reference where public.bible_handle(handle_tiktok) = c.handle_tiktok) then
    raise exception 'bible : @% est déjà une source', c.handle_tiktok;
  end if;

  -- La carte du label proposé. Pour un concept, `label_id` n'est que le label le
  -- plus proche : le compte arrive sans label, à ranger à la main.
  if c.sorte = 'label' and c.label_id is not null then
    v_carte := public.bible_carte_du_label_interne(c.label_id);
    select application_ids into v_apps from labels_proposes where id = v_carte;
  end if;

  select id into v_bible from bible_comptes where handle = c.handle_tiktok for update;
  if v_bible is not null then
    -- Déjà dans la Bible (ajouté à la main, ou à la corbeille) : il y prend l'étape demandée.
    v_deja := true;
    update bible_comptes
       set supprime_at = null, etape = p_etape, etape_at = now(),
           label_propose_id = coalesce(label_propose_id, v_carte),
           label_id = coalesce(label_id, case when v_carte is not null then c.label_id end),
           langue = coalesce(langue, c.langue)
     where id = v_bible;
  else
    insert into bible_comptes (handle, profil_url, statut, etape, etape_at, label_propose_id, label_id, application_ids, apps_attente,
                               langue, note_import, abonnes, vues_mediane, meilleur_post_vues, posts, miniatures_statut)
    values (c.handle_tiktok, 'https://www.tiktok.com/@' || c.handle_tiktok, 'a_trier', p_etape, now(), v_carte,
            case when v_carte is not null then c.label_id end,
            coalesce(v_apps, '{}'::uuid[]), '{}',
            c.langue, nullif(btrim(coalesce(c.note, '')), ''),
            (c.chiffres->>'abonnes')::numeric::integer, (c.chiffres->>'vues_mediane')::numeric::integer, (c.chiffres->>'vues_max')::numeric::integer,
            coalesce((select jsonb_agg(jsonb_build_object('url', x->>'url', 'vues', x->'vues'))
                        from (select value from jsonb_array_elements(c.exemples) where coalesce(value->>'url', '') <> '' limit 3) t(x)), '[]'::jsonb),
            'a_faire')
    returning id into v_bible;
  end if;

  update sources_candidats
     set statut = 'valide', raison_refus = null, decide_par = auth.uid(), decide_le = now(), updated_at = now()
   where id = p_id;

  return jsonb_build_object('bible_id', v_bible, 'handle', c.handle_tiktok, 'deja', v_deja, 'carte_id', v_carte, 'etape', p_etape);
end;
$function$;

-- Lancer l'import : un compte prêt part d'où qu'il soit (plus seulement du prochain batch).
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
  'Bible (0763, 0767) : lance l''import de comptes de la Bible ([{id, langue}]), d''où qu''ils soient (un clic sur la tuile, ou tout le prochain batch). Crée chaque source avec le label de sa carte et la passe par maj_sources_ajouter ; tout dans une séquence si rien ne tourne. Refuse, avec la raison : à podzer, label à créer, langue manquante, déjà une source. Rend {resultats: [{id, handle, statut: lancee | attente | refuse | erreur, raison, essai_max, prevu_le}]}.';
