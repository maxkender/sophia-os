-- 0766 : les propositions de sources entrent dans la Bible, et pas d'essai dans
-- un label qui vient d'être créé (décisions d'Adrien du 19/11).
--
-- 1. PAS D'ESSAI DANS UN LABEL NEUF. Une source neuve n'importait d'abord que
--    ses 30 posts les plus vus dès que son label était porté par des comptes
--    (0686, 0721). Un label créé depuis moins de `label_neuf_jours` (5) jours a
--    besoin de matière tout de suite : ses sources s'importent sans essai (leurs
--    100 posts les plus vus, `posts_max_par_maj`), puis suivent la mise à jour
--    de la semaine. Réglage : `reglages.bleo.sources.label_neuf_jours` (0 : la
--    règle est éteinte).
-- 2. `sources_candidats_vers_bible(proposition, étape)` : l'onglet « Source
--    proposals » de la Bible. La proposition devient un compte de la Bible, dans
--    « À importer » ou « Prochain batch », rangé sous la carte de son label (une
--    carte « existe » est créée si le label de l'OS n'en avait pas ; un concept
--    arrive sans label). La proposition passe `valide` : pour l'agent éclaireur,
--    c'est un oui. Sa source n'existe qu'au lancement de l'import.
-- 3. `bible_lier_import` : quand une source est créée, la proposition du même
--    compte la retrouve (`compte_reference_id`) et passe `valide`, d'où qu'elle
--    vienne (Bible, ou source ajoutée à la main sur la page Sources) : son r
--    nourrit la mémoire de l'agent (`sources_candidats_rendement`).
-- 4. Rattrapage : 4 propositions mises à plus tard étaient devenues des sources
--    à la main (_plony_, don.loq, lena.psychologie, psychevaultt). Elles passent
--    `valide`, reliées à leur source, au lieu de rester à décider.
--
-- ✅ Appliquée le 2026-11-19 (MCP).
--
-- Retour arrière : `label_neuf_jours` à 0 ; `drop function
-- public.sources_candidats_vers_bible(uuid, text)` ; `bible_lier_import` de 0745.

set lock_timeout = '5s';

-- 1. Pas d'essai dans un label de moins de 5 jours.
update public.reglages
   set valeur = jsonb_set(valeur, '{sources,label_neuf_jours}', '5'::jsonb, true), updated_at = now()
 where cle = 'bleo' and not (coalesce(valeur->'sources', '{}'::jsonb) ? 'label_neuf_jours');

create or replace function pg_temp.sources_patcher(p_fn regprocedure, p_paires text[])
returns void
language plpgsql
as $function$
declare
  d text;
  i integer;
  n integer;
begin
  d := pg_get_functiondef(p_fn);
  for i in 1 .. array_length(p_paires, 1) / 2 loop
    n := (length(d) - length(replace(d, p_paires[2 * i - 1], ''))) / length(p_paires[2 * i - 1]);
    if n <> 1 then
      raise exception '0766 : % : bloc % trouvé % fois (attendu 1), rien n''est changé', p_fn, i, n;
    end if;
    d := replace(d, p_paires[2 * i - 1], p_paires[2 * i]);
  end loop;
  execute d;
end;
$function$;

select pg_temp.sources_patcher(
  'public.maj_sources_ajouter(uuid)'::regprocedure,
  array[
    $old$where crl.compte_reference_id = p_compte);$old$,
    $new$where crl.compte_reference_id = p_compte)
     -- 0766 : et pas dans un label créé depuis moins de `label_neuf_jours` (5)
     -- jours. Il lui faut de la matière tout de suite : pas d'essai.
     and not exists (select 1 from compte_reference_labels crl
                       join labels l on l.id = crl.label_id
                      where crl.compte_reference_id = p_compte
                        and l.created_at > now() - make_interval(days => greatest(0, coalesce((reg->>'label_neuf_jours')::integer, 5))));$new$
  ]
);

comment on function public.maj_sources_ajouter(uuid) is
  'Sources (0669, 0686, 0721, 0725, 0766) : une source ajoutée passe par la file. Neuve, dans un label porté par des comptes et créé depuis plus de `label_neuf_jours` (5) jours, elle est mise en essai (ses 30 posts les plus vus d''abord) ; sinon elle s''importe normalement (100 posts au plus par mise à jour). Lancée tout de suite si rien ne tourne, sinon elle attend. Rend {file: lancee | attente, essai_max, prevu_le}.';

-- 2. Une proposition de l'éclaireur devient un compte de la Bible.
create or replace function public.sources_candidats_vers_bible(p_id uuid, p_etape text default 'a_importer')
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  c public.sources_candidats;
  v_carte uuid;
  v_section text;
  v_label_nom text;
  v_apps uuid[] := '{}';
  v_nom text;
  v_essai text;
  v_n integer := 1;
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
    select l.nom,
           coalesce((select array_agg(la.application_id) from label_applications la where la.label_id = l.id), array[l.application_id])
      into v_label_nom, v_apps
      from labels l where l.id = c.label_id;
    select coalesce((select a.slug from applications a
                      where a.id = any (v_apps) and a.slug in ('sophia', 'micabo', 'atala')
                      order by array_position(array['sophia', 'micabo', 'atala'], a.slug) limit 1), 'sophia')
      into v_section;

    select id into v_carte from labels_proposes
     where label_id = c.label_id and statut <> 'refuse'
     order by (section is null), ordre nulls last, propose_at
     limit 1;
    if v_carte is not null then
      -- Une ancienne proposition sans section : elle devient la carte du label.
      update labels_proposes
         set section = v_section, badge = 'existe', ordre = coalesce(ordre, 50)
       where id = v_carte and section is null;
    else
      -- Le nom d'une carte : minuscules, chiffres et _ (« Inspo girly » → inspo_girly), unique.
      v_nom := coalesce(nullif(btrim(regexp_replace(lower(v_label_nom), '[^a-z0-9]+', '_', 'g'), '_'), ''), 'label');
      v_essai := v_nom;
      while exists (select 1 from labels_proposes where nom = v_essai and statut <> 'refuse') loop
        v_n := v_n + 1;
        v_essai := v_nom || '_' || v_n;
      end loop;
      insert into labels_proposes (nom, application_ids, apps_attente, statut, label_id, section, badge, ordre, decide_par, decide_at)
      values (v_essai, v_apps, '{}', 'valide', c.label_id, v_section, 'existe', 50, auth.uid(), now())
      returning id into v_carte;
    end if;
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
            case when v_carte is not null then v_apps else '{}'::uuid[] end, '{}',
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

comment on function public.sources_candidats_vers_bible(uuid, text) is
  'Bible (0766) : une proposition de l''agent éclaireur devient un compte de la Bible (étape a_importer ou prochain_batch), sous la carte de son label (créée si le label n''en avait pas ; un concept arrive sans label). La proposition passe valide ; sa source est créée au lancement de l''import. Rend {bible_id, handle, deja, carte_id, etape}.';

revoke all on function public.sources_candidats_vers_bible(uuid, text) from public, anon;
grant execute on function public.sources_candidats_vers_bible(uuid, text) to authenticated;

-- 3. À la création d'une source : la fiche de la Bible ET la proposition de l'éclaireur la retrouvent.
create or replace function public.bible_lier_import()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  update public.bible_comptes
     set compte_reference_id = new.id, statut = 'importe'
   where handle = public.bible_handle(new.handle_tiktok) and compte_reference_id is null;
  -- 0766 : la proposition de l'éclaireur pour ce compte retrouve sa source. Encore à décider (source ajoutée à
  -- la main) ou déjà passée par la Bible, elle est `valide` : le compte est une source.
  update public.sources_candidats
     set compte_reference_id = new.id, statut = 'valide', raison_refus = null,
         decide_le = coalesce(decide_le, now()), updated_at = now()
   where handle_tiktok = public.bible_handle(new.handle_tiktok) and compte_reference_id is null
     and statut in ('propose', 'plus_tard', 'valide');
  return null;
end;
$function$;

-- 4. Rattrapage : les propositions encore à décider dont le compte est déjà une source.
update public.sources_candidats sc
   set compte_reference_id = cr.id, statut = 'valide', raison_refus = null,
       decide_le = coalesce(sc.decide_le, now()), updated_at = now()
  from public.comptes_reference cr
 where public.bible_handle(cr.handle_tiktok) = sc.handle_tiktok
   and sc.compte_reference_id is null and sc.statut in ('propose', 'plus_tard');
