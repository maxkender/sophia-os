-- 0875 : un nouveau podz entre au palier 1 DÈS SA CRÉATION, et seulement un
--   podz en images finies (suite de 0874, question d'Adrien du 27/11 : « même
--   lorsque création d'un podz c'est bien mis en place que 7 langues
--   s'ouvrent et doivent être livrées ? »).
--
-- 1. TOUT DE SUITE. Avant, la tâche horaire `podz-paliers` faisait entrer un
--    nouveau label 100 % podz au palier 1 et ouvrait ses 7 langues jusqu'à une
--    heure après la création du podz. Désormais un déclencheur sur `pods`
--    (création, ou podz réactivé / rattaché à un label) le fait dans la même
--    transaction : quand l'agent démarre, ses 7 langues sont déjà ouvertes et
--    attendent dans « Langues à PRÉPARER » (`npm run boite`). La tâche horaire
--    reste en filet.
-- 2. IMAGES FINIES SEULEMENT. Un podz en texte + banque (`pods.langues` nul,
--    l'OS traduit) n'a pas de liste de langues : au palier, il n'aurait eu
--    aucune place, donc aucun compte. Il garde l'ancien test ; la bascule
--    manuelle le refuse.
--
-- ✅ Appliquée le 2026-11-27 (MCP). Une fonction, un déclencheur, deux
-- fonctions mises à jour. Retour arrière : `drop trigger pods_palier_entree on
-- public.pods`, `drop function public.podz_palier_entree(uuid)`, réappliquer
-- les deux fonctions de 0874.

set lock_timeout = '5s';

-- L'entrée d'un label au palier 1 : label 100 % podz créé depuis `podz_paliers.depuis`,
-- sans palier, avec un podz ACTIF en images finies. Rend vrai s'il est entré.
create or replace function public.podz_palier_entree(p_label uuid)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_depuis timestamptz := coalesce((select (valeur->>'depuis')::timestamptz from reglages where cle = 'podz_paliers'), now());
begin
  if p_label is null then
    return false;
  end if;
  if not exists (
    select 1
      from labels l join labels_100_podz v on v.label_id = l.id
     where l.id = p_label and l.palier_podz is null and l.created_at >= v_depuis
       and exists (select 1 from pods p where p.label_id = l.id and p.actif and p.langues is not null)
  ) then
    return false;
  end if;
  update labels set palier_podz = 1, palier_podz_depuis = now() where id = p_label;
  insert into podz_paliers_journal (label_id, de, a, par, raison)
  values (p_label, null, 1, 'auto', jsonb_build_object('regle', 'nouveau label 100 % podz'));
  perform public.podz_palier_ouvrir_langues(p_label);
  return true;
end;
$function$;

revoke all on function public.podz_palier_entree(uuid) from public, anon, authenticated;
grant execute on function public.podz_palier_entree(uuid) to service_role;

create or replace function public.pods_palier_entree_declencheur()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if new.actif and new.label_id is not null and new.langues is not null then
    perform public.podz_palier_entree(new.label_id);
  end if;
  return null;
end;
$function$;

drop trigger if exists pods_palier_entree on public.pods;
-- Pas sur `langues` : `podz_langue` réécrit la liste, il ne doit pas se rappeler lui-même.
create trigger pods_palier_entree
  after insert or update of actif, label_id on public.pods
  for each row execute function public.pods_palier_entree_declencheur();

-- La tâche horaire : même entrée (images finies seulement), puis montées et langues.
create or replace function public.podz_paliers_maj()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  cfg jsonb := coalesce((select valeur from reglages where cle = 'podz_paliers'), '{}'::jsonb);
  v_depuis timestamptz := coalesce((cfg->>'depuis')::timestamptz, now());
  v_seuil numeric := coalesce((cfg->>'seuil_r')::numeric, 0.9);
  v_min integer := coalesce((cfg->>'passages_min')::integer, 14);
  v_jours integer := coalesce((cfg->>'jours_min')::integer, 7);
  v_max smallint := coalesce(jsonb_array_length(cfg->'paliers'), 3)::smallint;
  r record;
  s record;
  v_entres jsonb := '[]';
  v_montes jsonb := '[]';
  v_langues jsonb := '{}';
  v_ouvertes text[];
begin
  if auth.uid() is not null and not public.is_admin() then
    raise exception 'podz : réservé aux admins' using errcode = '42501';
  end if;

  for r in
    select l.id, l.slug
      from labels_100_podz v join labels l on l.id = v.label_id
     where l.palier_podz is null and v.pod_actif and l.created_at >= v_depuis
  loop
    if public.podz_palier_entree(r.id) then
      v_entres := v_entres || to_jsonb(r.slug);
    end if;
  end loop;

  for r in
    select l.id, l.slug, l.palier_podz
      from labels l
     where l.palier_podz is not null and l.palier_podz < v_max
       and coalesce(l.palier_podz_depuis, now()) <= now() - make_interval(days => v_jours)
  loop
    select * into s from public.podz_label_r_semaine(r.id);
    if coalesce(s.passages, 0) >= v_min and coalesce(s.r_median, 0) > v_seuil then
      update labels set palier_podz = r.palier_podz + 1, palier_podz_depuis = now() where id = r.id;
      insert into podz_paliers_journal (label_id, de, a, par, raison)
      values (r.id, r.palier_podz, r.palier_podz + 1, 'auto',
              jsonb_build_object('r_semaine', s.r_median, 'passages', s.passages, 'seuil', v_seuil));
      v_montes := v_montes || jsonb_build_object('label', r.slug, 'palier', r.palier_podz + 1, 'r', s.r_median, 'passages', s.passages);
    end if;
  end loop;

  for r in select l.id, l.slug from labels l where l.palier_podz is not null loop
    v_ouvertes := public.podz_palier_ouvrir_langues(r.id);
    if cardinality(v_ouvertes) > 0 then
      v_langues := v_langues || jsonb_build_object(r.slug, to_jsonb(v_ouvertes));
    end if;
  end loop;

  return jsonb_build_object('entres', v_entres, 'montes', v_montes, 'langues_ouvertes', v_langues);
end;
$function$;

-- La bascule d'un ancien label : refusée pour un podz en texte + banque.
create or replace function public.podz_passer_en_paliers(p_label uuid, p_palier smallint default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_avant smallint;
  v_apres smallint;
  v_comptes integer;
  v_ouvertes text[] := '{}';
begin
  if auth.uid() is not null and not public.is_admin() then
    raise exception 'podz : réservé aux admins' using errcode = '42501';
  end if;
  if not exists (select 1 from labels_100_podz where label_id = p_label) then
    raise exception 'podz : ce label n''est pas un label 100 %% podz';
  end if;
  select palier_podz into v_avant from labels where id = p_label for update;
  if p_palier is distinct from 0
     and not exists (select 1 from pods p where p.label_id = p_label and p.actif and p.langues is not null) then
    raise exception 'podz : pas de podz actif en images finies sur ce label (un podz en texte + banque garde l''ancien test)';
  end if;
  select count(distinct cl.compte_id)::integer into v_comptes
    from compte_labels cl join comptes c on c.id = cl.compte_id and c.is_active
   where cl.label_id = p_label;
  if p_palier = 0 then
    v_apres := null;
  else
    v_apres := coalesce(p_palier, case when v_comptes <= 7 then 1 when v_comptes <= 14 then 2 else 3 end);
    if v_apres not between 1 and 3 then
      raise exception 'podz : palier % inconnu (1, 2 ou 3 ; 0 pour revenir à l''ancien test)', v_apres;
    end if;
  end if;
  if v_apres is not distinct from v_avant then
    return jsonb_build_object('ok', true, 'change', false, 'palier', v_avant, 'comptes', v_comptes);
  end if;
  update labels set palier_podz = v_apres, palier_podz_depuis = case when v_apres is null then null else now() end
   where id = p_label;
  insert into podz_paliers_journal (label_id, de, a, par, raison)
  values (p_label, v_avant, v_apres, case when auth.uid() is null then 'claude' else 'admin' end,
          jsonb_build_object('regle', case when v_apres is null then 'retour à l''ancien test' else 'bascule d''un ancien label' end,
                             'comptes', v_comptes));
  if v_apres is not null then
    v_ouvertes := public.podz_palier_ouvrir_langues(p_label);
  end if;
  return jsonb_build_object('ok', true, 'change', true, 'de', v_avant, 'palier', v_apres, 'comptes', v_comptes,
                            'langues_ouvertes', to_jsonb(v_ouvertes));
end;
$function$;
