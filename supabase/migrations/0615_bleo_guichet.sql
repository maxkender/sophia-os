-- 0615 : BLEO, le guichet des podz (L4, P1).
--
-- `bleo_verifier_depot(label, type_bleo, parent, accroche_norm, livraison)`
-- juge un dépôt d'original de podz avant qu'il entre dans la file : il rend
-- { ok: true, famille_id, generation, accroche_attendue } ou
-- { ok: false, code, message }. Codes, dans l'ordre où ils sont testés :
--
--   type_bleo_invalide     ni `full_test` ni `declinaison`
--   parent_interdit        un full test n'a pas de parent
--   accroche_existante     full test dont l'accroche (normalisée) existe déjà
--                          dans un contenu du label (D15 ; les livraisons en
--                          attente sont comparées par le guichet lui-même)
--   parent_requis          une déclinaison sans `parent_contenu_id`
--   parent_introuvable     parent absent, hors du label ou pas `valide`
--   famille_inconnue       parent pas encore rattaché (A2 tourne à 5 h 15)
--   famille_non_gagnante   la famille du parent n'est pas gagnante
--   famille_close          la famille est close (A9)
--   generation_max         la déclinaison dépasserait `boite.generation_max`
--   parent_non_gagnant     une génération 2 se déclare sur une génération 1
--                          dont le verdict n'est pas `gagnant`
--   quota_atteint          le parent a déjà `boite.declinaisons_par_parent`
--                          déclinaisons (validées ou en attente)
--   accroche_differente    génération 1 dont l'accroche n'est pas celle de la
--                          famille, mot pour mot (D35)
--   accroche_identique     génération 2 dont l'accroche n'a pas été reformulée (D35)
--
-- `p_livraison` : la livraison qu'un nouveau dépôt du même `source_id`
-- remplace, exclue du quota.
--
-- Et `reglages.bleo.podz` : `type_obligatoire` (faux tant que les outils des
-- podz n'envoient pas `type_bleo` ; vrai à la bascule des podz, lundi 2/11).
--
-- AJOUT SEULEMENT : une fonction de lecture et une clé de réglage.

set lock_timeout = '5s';

update public.reglages
   set valeur = valeur || jsonb_build_object('podz', coalesce(valeur->'podz', '{}'::jsonb) || '{"type_obligatoire": false}'::jsonb)
 where cle = 'bleo' and not (valeur ? 'podz');

create or replace function public.bleo_verifier_depot(
  p_label_id uuid,
  p_type_bleo text,
  p_parent_contenu_id uuid default null,
  p_accroche_norm text default null,
  p_livraison uuid default null
)
returns jsonb
language plpgsql
stable
set search_path to 'public'
as $$
declare
  reg jsonb;
  v_gen_max integer;
  v_quota integer;
  v_existante record;
  v_parent record;
  v_fam record;
  v_gen integer;
  v_faites integer;
begin
  if auth.uid() is not null and not public.is_admin() then
    raise exception 'bleo : réservé aux admins' using errcode = '42501';
  end if;
  select valeur into reg from reglages where cle = 'bleo';
  v_gen_max := coalesce((reg->'boite'->>'generation_max')::int, 2);
  v_quota := coalesce((reg->'boite'->>'declinaisons_par_parent')::int, 3);

  if p_type_bleo is null or p_type_bleo not in ('full_test', 'declinaison') then
    return jsonb_build_object('ok', false, 'code', 'type_bleo_invalide',
      'message', format('type_bleo : « full_test » ou « declinaison » (reçu : %s)', coalesce(p_type_bleo, 'rien')));
  end if;

  if p_type_bleo = 'full_test' then
    if p_parent_contenu_id is not null then
      return jsonb_build_object('ok', false, 'code', 'parent_interdit',
        'message', 'un full test n''a pas de parent : pour décliner une famille, type_bleo « declinaison »');
    end if;
    if p_accroche_norm is not null then
      select c.id, c.famille_id, f.verdict, f.close
        into v_existante
        from contenus c
        join contenu_labels cl on cl.contenu_id = c.id and cl.label_id = p_label_id
        left join bleo_familles f on f.id = c.famille_id
       where c.accroche_norm = p_accroche_norm and c.statut <> 'rejete'
       order by c.created_at
       limit 1;
      if found then
        return jsonb_build_object('ok', false, 'code', 'accroche_existante',
          'message', format('cette accroche existe déjà dans le label (contenu %s, famille %s) : pas de second full test ; si la famille est gagnante, la décliner depuis la boîte',
                            left(v_existante.id::text, 8), coalesce(v_existante.verdict, 'pas encore rattachée')),
          'contenu_id', v_existante.id, 'famille_id', v_existante.famille_id);
      end if;
    end if;
    return jsonb_build_object('ok', true, 'type_bleo', 'full_test', 'generation', 0);
  end if;

  -- Déclinaison.
  if p_parent_contenu_id is null then
    return jsonb_build_object('ok', false, 'code', 'parent_requis',
      'message', 'une déclinaison déclare son parent : parent_contenu_id (colonne « parent » de la boîte)');
  end if;
  select c.id, c.famille_id, coalesce(c.generation, 0) as generation, c.verdict, c.accroche_norm
    into v_parent
    from contenus c
    join contenu_labels cl on cl.contenu_id = c.id and cl.label_id = p_label_id
   where c.id = p_parent_contenu_id and c.statut = 'valide';
  if not found then
    return jsonb_build_object('ok', false, 'code', 'parent_introuvable',
      'message', format('parent %s introuvable dans le label (ou pas valide)', left(p_parent_contenu_id::text, 8)));
  end if;
  if v_parent.famille_id is null then
    return jsonb_build_object('ok', false, 'code', 'famille_inconnue',
      'message', 'le parent n''est pas encore rattaché à une famille (rattachement à 5 h 15) : le décliner demain');
  end if;
  select f.id, f.verdict, f.close, f.accroche_norm into v_fam from bleo_familles f where f.id = v_parent.famille_id;
  if v_fam.verdict is distinct from 'gagnante' then
    return jsonb_build_object('ok', false, 'code', 'famille_non_gagnante',
      'message', format('la famille du parent n''est pas gagnante (%s) : on ne décline que les familles gagnantes de la boîte', coalesce(v_fam.verdict, '—')),
      'famille_id', v_fam.id);
  end if;
  if v_fam.close then
    return jsonb_build_object('ok', false, 'code', 'famille_close',
      'message', 'la famille est close (ses déclinaisons ne rapportent plus) : elle n''est plus dans la boîte',
      'famille_id', v_fam.id);
  end if;
  v_gen := v_parent.generation + 1;
  if v_gen > v_gen_max then
    return jsonb_build_object('ok', false, 'code', 'generation_max',
      'message', format('le parent est déjà une génération %s : pas de génération %s (maximum %s)', v_parent.generation, v_gen, v_gen_max),
      'famille_id', v_fam.id);
  end if;
  if v_gen >= 2 and v_parent.verdict is distinct from 'gagnant' then
    return jsonb_build_object('ok', false, 'code', 'parent_non_gagnant',
      'message', format('une génération 2 se fait sur une génération 1 gagnante ; ce parent est « %s »', coalesce(v_parent.verdict, 'en_attente')),
      'famille_id', v_fam.id);
  end if;

  select (select count(*) from contenus c where c.parent_bleo_id = v_parent.id and c.statut <> 'rejete')
       + (select count(*)
            from pod_livraisons pl
           where pl.parent_contenu_id = v_parent.id
             and pl.id is distinct from p_livraison
             and (pl.statut = 'a_valider'
                  or (pl.statut = 'validee'
                      and not exists (select 1 from contenus c where c.id = pl.contenu_id and c.parent_bleo_id is not null))))
    into v_faites;
  if v_faites >= v_quota then
    return jsonb_build_object('ok', false, 'code', 'quota_atteint',
      'message', format('ce parent a déjà %s déclinaison(s) sur %s : prendre la ligne suivante de la boîte', v_faites, v_quota),
      'famille_id', v_fam.id);
  end if;

  if p_accroche_norm is not null and coalesce(v_fam.accroche_norm, v_parent.accroche_norm) is not null then
    if v_gen = 1 and p_accroche_norm <> coalesce(v_fam.accroche_norm, v_parent.accroche_norm) then
      return jsonb_build_object('ok', false, 'code', 'accroche_differente',
        'message', format('génération 1 : l''accroche reste celle de la famille, mot pour mot (« %s »)', coalesce(v_fam.accroche_norm, v_parent.accroche_norm)),
        'famille_id', v_fam.id);
    end if;
    if v_gen >= 2 and p_accroche_norm = coalesce(v_fam.accroche_norm, v_parent.accroche_norm) then
      return jsonb_build_object('ok', false, 'code', 'accroche_identique',
        'message', 'génération 2 : l''accroche est reformulée (même promesse, autres mots)',
        'famille_id', v_fam.id);
    end if;
  end if;

  return jsonb_build_object('ok', true, 'type_bleo', 'declinaison', 'famille_id', v_fam.id, 'generation', v_gen,
    'accroche_attendue', case when v_gen = 1 then 'identique' else 'reformulee' end, 'faites', v_faites);
end;
$$;

grant execute on function public.bleo_verifier_depot(uuid, text, uuid, text, uuid) to authenticated, service_role;

comment on function public.bleo_verifier_depot(uuid, text, uuid, text, uuid) is
  'BLEO, guichet des podz : juge un dépôt (full test ou déclinaison) et rend le code de refus, ou la famille et la génération.';
