-- 0768 : Bible · choisir le label d'une proposition au moment de l'envoyer dans
-- le prochain batch (demande d'Adrien du 19/11).
--
-- `sources_candidats_vers_bible` (0766, 0767) rangeait la proposition sous la
-- carte du label que l'agent éclaireur proposait, ou sans label pour un concept.
-- Elle prend deux arguments de plus : avec `p_choisir`, c'est l'admin qui
-- décide. `p_carte` est le bloc choisi (un bloc existant, celui d'un label de
-- l'OS, ou un nouveau label tout juste proposé) ; nul : sans label. Sans
-- `p_choisir`, rien ne change (« À importer » en un clic).
--
-- L'ancienne signature (uuid, text) est retirée : la nouvelle a des valeurs par
-- défaut, les appels à deux arguments continuent de marcher.
--
-- ✅ Appliquée le 2026-11-19 (MCP).
--
-- Retour arrière : `drop function public.sources_candidats_vers_bible(uuid,
-- text, uuid, boolean)`, puis la définition de 0767.

set lock_timeout = '5s';

drop function if exists public.sources_candidats_vers_bible(uuid, text);

create or replace function public.sources_candidats_vers_bible(
  p_id uuid, p_etape text default 'a_importer', p_carte uuid default null, p_choisir boolean default false)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  c public.sources_candidats;
  v_carte uuid;
  v_label uuid;
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

  if p_choisir then
    -- L'admin a choisi : ce bloc-là (son label peut encore être une proposition), ou aucun.
    if p_carte is not null then
      select id, label_id, application_ids into v_carte, v_label, v_apps
        from labels_proposes where id = p_carte and statut <> 'refuse';
      if v_carte is null then
        raise exception 'bible : bloc introuvable';
      end if;
    end if;
  elsif c.sorte = 'label' and c.label_id is not null then
    -- Sans choix : la carte du label proposé par l'agent. Pour un concept, `label_id` n'est que le
    -- label le plus proche : le compte arrive sans label, à ranger à la main.
    v_carte := public.bible_carte_du_label_interne(c.label_id);
    select label_id, application_ids into v_label, v_apps from labels_proposes where id = v_carte;
  end if;

  select id into v_bible from bible_comptes where handle = c.handle_tiktok for update;
  if v_bible is not null then
    -- Déjà dans la Bible (ajouté à la main, ou à la corbeille) : il y prend l'étape demandée, et le bloc choisi.
    v_deja := true;
    update bible_comptes
       set supprime_at = null, etape = p_etape, etape_at = now(),
           label_propose_id = case when p_choisir then v_carte else coalesce(label_propose_id, v_carte) end,
           label_id = case when p_choisir then v_label else coalesce(label_id, v_label) end,
           application_ids = case when p_choisir then coalesce(v_apps, '{}'::uuid[]) else application_ids end,
           langue = coalesce(langue, c.langue)
     where id = v_bible;
  else
    insert into bible_comptes (handle, profil_url, statut, etape, etape_at, label_propose_id, label_id, application_ids, apps_attente,
                               langue, note_import, abonnes, vues_mediane, meilleur_post_vues, posts, miniatures_statut)
    values (c.handle_tiktok, 'https://www.tiktok.com/@' || c.handle_tiktok, 'a_trier', p_etape, now(), v_carte, v_label,
            coalesce(v_apps, '{}'::uuid[]), '{}',
            c.langue, nullif(btrim(coalesce(c.note, '')), ''),
            (c.chiffres->>'abonnes')::numeric::integer, (c.chiffres->>'vues_mediane')::numeric::integer, (c.chiffres->>'vues_max')::numeric::integer,
            coalesce((select jsonb_agg(jsonb_build_object('url', x->>'url', 'vues', x->'vues'))
                        from (select value from jsonb_array_elements(c.exemples) where coalesce(value->>'url', '') <> '' limit 3) t(x)), '[]'::jsonb),
            'a_faire')
    returning id into v_bible;
  end if;

  -- Le label retenu par l'admin se lit aussi sur la proposition : l'agent éclaireur relit ses décisions.
  update sources_candidats
     set statut = 'valide', raison_refus = null, decide_par = auth.uid(), decide_le = now(), updated_at = now(),
         label_id = case when p_choisir and v_label is not null then v_label else label_id end
   where id = p_id;

  return jsonb_build_object('bible_id', v_bible, 'handle', c.handle_tiktok, 'deja', v_deja, 'carte_id', v_carte, 'etape', p_etape);
end;
$function$;

comment on function public.sources_candidats_vers_bible(uuid, text, uuid, boolean) is
  'Bible (0766, 0767, 0768) : une proposition de l''agent éclaireur devient un compte de la Bible (étape a_importer ou prochain_batch). Sans p_choisir : sous la carte du label proposé (créée si besoin ; un concept arrive sans label). Avec p_choisir : sous le bloc p_carte choisi par l''admin (nul : sans label). La proposition passe valide ; sa source est créée au lancement de l''import. Rend {bible_id, handle, deja, carte_id, etape}.';

revoke all on function public.sources_candidats_vers_bible(uuid, text, uuid, boolean) from public, anon;
grant execute on function public.sources_candidats_vers_bible(uuid, text, uuid, boolean) to authenticated;
