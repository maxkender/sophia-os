-- 0669 : une source ajoutée passe par la file des mises à jour, une source à la
-- fois (décision d'Adrien du 11/11).
--
-- Jusqu'ici, « Ajouter une source » lançait tout de suite l'extraction de tout
-- son profil (jusqu'à 600 slideshows), en parallèle de tout le reste. Une source,
-- ça passe ; plusieurs le même jour chargent la base.
--
-- `maj_sources_ajouter(source)` :
--   * inscrit la source dans les décisions de la semaine (`peu_de_mesures`,
--     raison `ajout`) ;
--   * si aucune mise à jour ne tourne, la lance tout de suite (circuit du bouton,
--     `maj_sources_demarrer` : nouveaux posts seulement, donc tout son profil
--     pour une source neuve, sauf ses posts de moins de 7 jours) ;
--   * sinon, elle part au lot suivant (`bleo_sources_lot`, 6 h 37), en tête.
--
-- Retour arrière : le formulaire rappelle `demarrerImportCompte` ; la fonction
-- peut rester.

create or replace function pg_temp.bleo_patcher(p_fn regprocedure, p_paires text[])
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
      raise exception '0669 : % : bloc % trouvé % fois (attendu 1), rien n''est changé', p_fn, i, n;
    end if;
    d := replace(d, p_paires[2 * i - 1], p_paires[2 * i]);
  end loop;
  execute d;
end;
$function$;

create or replace function public.maj_sources_ajouter(p_compte uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_semaine date := date_trunc('week', now() at time zone 'Europe/Paris')::date;
  v_compte jsonb;
  v_demarrage jsonb;
begin
  if auth.uid() is not null and not public.is_admin() then
    raise exception 'sources : réservé aux admins' using errcode = '42501';
  end if;

  select jsonb_build_object('id', id, 'handle', handle_tiktok, 'langue', langue) into v_compte
    from comptes_reference where id = p_compte and is_active;
  if v_compte is null then
    raise exception 'sources : source introuvable ou inactive';
  end if;

  insert into bleo_sources_decisions (semaine, compte_reference_id, posts, decision, raison)
  values (v_semaine, p_compte, 0, 'peu_de_mesures', 'ajout')
  on conflict (semaine, compte_reference_id) do update
     set decision = 'peu_de_mesures', raison = 'ajout'
   where bleo_sources_decisions.lancee_le is null;

  if coalesce((select valeur->>'statut' from reglages where cle = 'maj_sources_run'), '') <> 'running' then
    v_demarrage := public.maj_sources_demarrer(jsonb_build_array(v_compte));
    if v_demarrage->>'action' <> 'deja' then
      update bleo_sources_decisions set lancee_le = now()
       where semaine = v_semaine and compte_reference_id = p_compte;
      return jsonb_build_object('file', 'lancee');
    end if;
  end if;
  return jsonb_build_object('file', 'attente');
end;
$function$;

comment on function public.maj_sources_ajouter(uuid) is
  'Sources (0669) : une source ajoutée passe par la file des mises à jour. Lancée tout de suite si rien ne tourne, sinon au lot suivant (6 h 37), en tête. Rend {file: lancee | attente}.';

revoke all on function public.maj_sources_ajouter(uuid) from public, anon;
grant execute on function public.maj_sources_ajouter(uuid) to authenticated, service_role;

-- Les sources ajoutées passent en tête du lot suivant.
select pg_temp.bleo_patcher('public.bleo_sources_lot(boolean)'::regprocedure, array[
$a$row_number() over (order by d.r_mediane desc nulls last, d.meilleur_vues desc nulls last, cr.handle_tiktok) as rang$a$,
$b$row_number() over (order by (d.raison = 'ajout') desc, d.r_mediane desc nulls last, d.meilleur_vues desc nulls last, cr.handle_tiktok) as rang$b$
]);
