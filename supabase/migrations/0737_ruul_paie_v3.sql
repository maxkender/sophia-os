-- 0737 : paie Ruul sur le moteur de la paie Upwork (Max, 17/11).
-- 1. ruul_lot_preparer : les montants viennent de paie_calculer_v3 (le même calcul que la paie Upwork :
--    comptes, posts faits / prévus, tarif, retenue, détail par compte). Payable = READY chez Ruul
--    (profiles.ruul_onboarding, lu par l'API toutes les heures) ; les autres restent « reporte » et
--    passent au lundi suivant dès qu'ils sont READY (mécanisme existant des reportés).
-- 2. Les lignes inhabituelles (rattrapage, bonus, au-dessus du plafond, calcul « à voir ») attendent
--    l'OK de Max (ruul_ligne_valider) ; seules les lignes READY et validées partent chez Ruul.
-- 3. ruul_lot : colonnes du tableau (statut Ruul, comptes, posts, tarif, retenue, détail du bonus,
--    total net, à vérifier, validé) et le devis Ruul (frais compris) une fois calculé.
-- 4. ruul_lot_a_envoyer : les lignes à envoyer chez Ruul (une par posteur), pour le devis et le paiement.
-- Additif : colonnes ajoutées, fonctions remplacées ; aucune donnée existante modifiée ici, rien n'est payé.

alter table public.ruul_paiements
  add column if not exists retenue numeric not null default 0,
  add column if not exists detail_comptes jsonb,
  add column if not exists statut_calcul text,
  add column if not exists raison_calcul text,
  add column if not exists a_verifier text[] not null default '{}',
  add column if not exists valide_montant numeric,
  add column if not exists valide_par uuid references auth.users(id),
  add column if not exists valide_at timestamptz;

alter table public.ruul_lots
  add column if not exists ruul_devis jsonb,
  add column if not exists ruul_devis_at timestamptz;

-- Une ligne inhabituelle est validée quand Max a dit OK sur ce montant-là (un recalcul qui change le
-- montant annule l'OK).
create or replace function public.ruul_ligne_validee(rp public.ruul_paiements)
returns boolean language sql immutable as $$
  select cardinality(rp.a_verifier) = 0
      or (rp.valide_at is not null and rp.valide_montant = rp.montant + rp.bonus);
$$;

create or replace function public.ruul_lot_preparer(p_semaine date default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_semaine date := coalesce(p_semaine, public.ruul_semaine_a_payer());
  v_lot public.ruul_lots;
  v_plafond numeric := coalesce((select (valeur #>> '{}')::numeric from public.reglages where cle = 'paie_plafond_ligne'), 30);
begin
  if coalesce(auth.role(), '') in ('anon', 'authenticated') and not public.is_admin() then
    raise exception 'réservé à l''admin et au Head of Ops';
  end if;
  if extract(isodow from v_semaine) <> 1 then raise exception 'la semaine doit commencer un lundi'; end if;
  insert into public.ruul_lots (semaine) values (v_semaine) on conflict (semaine) do nothing;
  select * into v_lot from public.ruul_lots where semaine = v_semaine;
  if v_lot.statut <> 'prepare' then
    return jsonb_build_object('ok', false, 'erreur', 'lot ' || v_lot.statut || ' : verrouillé');
  end if;

  update public.ruul_paiements set statut = 'reporte', lot_id = null, maj_at = now()
   where lot_id = v_lot.id and statut = 'a_payer';

  -- 0737 : le calcul de la paie Upwork (paie_calculer_v3), pour les posteurs Ruul.
  insert into public.ruul_paiements as rp (poster_id, semaine, statut, montant, tarif, nb_comptes, faits, prevus, retenue,
                                           detail_comptes, statut_calcul, raison_calcul, rattrapage, raison_report, bonus, bonus_ids)
  select v.poster_id, v_semaine, 'reporte', greatest(coalesce(v.montant, 0), 0), v.tarif, v.nb_comptes, v.faits, v.prevus,
         coalesce(v.retenue, 0), v.detail_comptes, v.statut, v.raison, false, null, 0, '{}'
    from public.paie_calculer_v3(v_semaine) v
    join public.profiles pr on pr.id = v.poster_id
    left join public.hub_posteurs h on h.profile_id = pr.id
   where pr.canal_paie = 'ruul' and not coalesce(h.exclu_suivi, false)
  on conflict (poster_id, semaine) do update
     set montant = excluded.montant, tarif = excluded.tarif, nb_comptes = excluded.nb_comptes,
         faits = excluded.faits, prevus = excluded.prevus, retenue = excluded.retenue,
         detail_comptes = excluded.detail_comptes, statut_calcul = excluded.statut_calcul,
         raison_calcul = excluded.raison_calcul, maj_at = now()
   where rp.statut in ('a_payer', 'reporte', 'annule') and (rp.lot_id is null or rp.lot_id = v_lot.id);

  insert into public.ruul_paiements as rp (poster_id, semaine, statut, montant, bonus, bonus_ids)
  select b.poster_id, v_semaine, 'reporte', 0, sum(b.montant), array_agg(b.id)
    from public.bonus b
   where b.canal_paie = 'ruul' and b.statut in ('a_valider', 'a_payer') and b.montant > 0
   group by b.poster_id
  on conflict (poster_id, semaine) do update
     set bonus = excluded.bonus, bonus_ids = excluded.bonus_ids, maj_at = now()
   where rp.statut in ('a_payer', 'reporte', 'annule') and (rp.lot_id is null or rp.lot_id = v_lot.id);

  -- Payable : email Ruul et READY chez Ruul (0737, à la place de « Active »).
  update public.ruul_paiements rp
     set statut = case
                    when exists (select 1 from public.paie_semaines ps where ps.poster_id = rp.poster_id and ps.semaine = rp.semaine and ps.paye_at is not null) then 'annule'
                    when rp.montant + rp.bonus <= 0 then 'annule'
                    when nullif(btrim(coalesce(pr.ruul_email, '')), '') is not null and pr.ruul_onboarding = 'READY' then 'a_payer'
                    else 'reporte' end,
         lot_id = case
                    when rp.montant + rp.bonus > 0 and nullif(btrim(coalesce(pr.ruul_email, '')), '') is not null and pr.ruul_onboarding = 'READY'
                         and not exists (select 1 from public.paie_semaines ps where ps.poster_id = rp.poster_id and ps.semaine = rp.semaine and ps.paye_at is not null)
                    then v_lot.id end,
         raison_report = case
                    when exists (select 1 from public.paie_semaines ps where ps.poster_id = rp.poster_id and ps.semaine = rp.semaine and ps.paye_at is not null) then 'déjà payé sur Upwork cette semaine'
                    when rp.montant + rp.bonus <= 0 then '0 post cette semaine : 0 $'
                    when nullif(btrim(coalesce(pr.ruul_email, '')), '') is null then 'email Ruul manquant (reporté)'
                    when pr.ruul_onboarding is distinct from 'READY' then 'en attente : pas encore READY chez Ruul (' || coalesce(pr.ruul_onboarding, 'pas dans Ruul') || ')'
                  end,
         maj_at = now()
    from public.profiles pr
   where pr.id = rp.poster_id and rp.semaine = v_semaine
     and rp.statut in ('a_payer', 'reporte', 'annule') and (rp.lot_id is null or rp.lot_id = v_lot.id);

  -- Les semaines reportées d'avant, dès que le posteur est READY.
  update public.ruul_paiements rp
     set statut = 'a_payer', lot_id = v_lot.id, rattrapage = true, raison_report = null, maj_at = now()
    from public.profiles pr
   where pr.id = rp.poster_id and rp.statut = 'reporte' and rp.semaine < v_semaine and rp.lot_id is null
     and rp.montant + rp.bonus > 0
     and nullif(btrim(coalesce(pr.ruul_email, '')), '') is not null and pr.ruul_onboarding = 'READY'
     and not exists (select 1 from public.paie_semaines ps where ps.poster_id = rp.poster_id and ps.semaine = rp.semaine and ps.paye_at is not null);

  -- Les lignes inhabituelles : l'OK de Max avant l'envoi.
  update public.ruul_paiements rp
     set a_verifier = array_remove(array[
           case when rp.rattrapage then 'rattrapage (semaine du ' || to_char(rp.semaine, 'DD/MM') || ')' end,
           case when rp.bonus > 0 then 'bonus ' || rp.bonus || ' $' end,
           case when rp.montant > v_plafond then 'au-dessus du plafond (' || v_plafond || ' $)' end,
           case when rp.statut_calcul is not null and rp.statut_calcul <> 'ok' then 'calcul à voir' || coalesce(' : ' || rp.raison_calcul, '') end
         ], null)
   where rp.lot_id = v_lot.id and rp.statut = 'a_payer';

  update public.ruul_lots l
     set total = coalesce((select sum(montant + bonus) from public.ruul_paiements where lot_id = l.id and statut = 'a_payer'), 0),
         nb = (select count(distinct poster_id) from public.ruul_paiements where lot_id = l.id and statut = 'a_payer'),
         prepare_at = now(),
         ruul_devis = null, ruul_devis_at = null
   where l.id = v_lot.id;
  return jsonb_build_object('ok', true, 'semaine', v_semaine,
    'nb', (select nb from public.ruul_lots where id = v_lot.id),
    'total', (select total from public.ruul_lots where id = v_lot.id),
    'a_valider', (select count(*) from public.ruul_paiements rp where rp.lot_id = v_lot.id and rp.statut = 'a_payer' and not public.ruul_ligne_validee(rp)),
    'sans_post', (select count(*) from public.ruul_paiements where semaine = v_semaine and statut = 'annule' and raison_report like '0 post%'),
    'reportes', (select count(*) from public.ruul_paiements where statut = 'reporte'));
end;
$function$;

-- L'OK (ou le retrait de l'OK) de Max sur les lignes inhabituelles d'un posteur, dans un lot pas encore envoyé.
create or replace function public.ruul_ligne_valider(p_poster uuid, p_semaine date, p_ok boolean)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_lot public.ruul_lots;
  n int;
begin
  if not public.is_admin() then raise exception 'réservé à l''admin'; end if;
  select * into v_lot from public.ruul_lots where semaine = p_semaine;
  if v_lot.id is null then return jsonb_build_object('ok', false, 'erreur', 'lot introuvable'); end if;
  if v_lot.statut <> 'prepare' then return jsonb_build_object('ok', false, 'erreur', 'lot déjà ' || v_lot.statut); end if;
  update public.ruul_paiements
     set valide_montant = case when p_ok then montant + bonus end,
         valide_par = case when p_ok then auth.uid() end,
         valide_at = case when p_ok then now() end,
         maj_at = now()
   where lot_id = v_lot.id and poster_id = p_poster and statut = 'a_payer';
  get diagnostics n = row_count;
  update public.ruul_lots set ruul_devis = null, ruul_devis_at = null where id = v_lot.id;
  return jsonb_build_object('ok', n > 0, 'lignes', n);
end;
$function$;

-- Les lignes à envoyer chez Ruul : une par posteur (ses semaines additionnées), READY, toutes validées.
create or replace function public.ruul_lot_a_envoyer(p_semaine date)
returns table (poster_id uuid, email text, prenom text, nom text, montant numeric, posts integer, bonus numeric,
               semaines date[], ids uuid[])
language sql
stable
security definer
set search_path to 'public'
as $$
  select pr.id, lower(btrim(pr.ruul_email)),
         coalesce(nullif(btrim(h.prenom_legal), ''), nullif(btrim(pr.prenom), ''), split_part(pr.ruul_email, '@', 1)),
         coalesce(nullif(btrim(h.nom_legal), ''), nullif(btrim(pr.nom), ''), '-'),
         round(sum(rp.montant + rp.bonus), 2), coalesce(sum(rp.faits), 0)::int, round(sum(rp.bonus), 2),
         array_agg(rp.semaine order by rp.semaine), array_agg(rp.id order by rp.semaine)
    from public.ruul_lots l
    join public.ruul_paiements rp on rp.lot_id = l.id and rp.statut = 'a_payer'
    join public.profiles pr on pr.id = rp.poster_id
    left join public.hub_posteurs h on h.profile_id = pr.id
   where l.semaine = p_semaine
     and (public.is_admin() or coalesce(auth.role(), '') = 'service_role')
     and pr.ruul_onboarding = 'READY' and nullif(btrim(coalesce(pr.ruul_email, '')), '') is not null
   group by pr.id, h.prenom_legal, h.nom_legal
  having bool_and(public.ruul_ligne_validee(rp)) and sum(rp.montant + rp.bonus) >= 1
   order by 2;
$$;

create or replace function public.ruul_lot_noter_devis(p_semaine date, p_devis jsonb)
returns void
language sql
security definer
set search_path to 'public'
as $$
  update public.ruul_lots set ruul_devis = p_devis, ruul_devis_at = now()
   where semaine = p_semaine and coalesce(auth.role(), '') = 'service_role';
$$;

create or replace function public.ruul_lot(p_semaine date default null)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v_semaine date := coalesce(p_semaine, public.ruul_semaine_a_payer());
  v_lot public.ruul_lots;
  v_plafond numeric := coalesce((select (valeur #>> '{}')::numeric from public.reglages where cle = 'paie_plafond_ligne'), 30);
begin
  if not public.is_admin() then
    raise exception 'réservé à l''admin et au Head of Ops';
  end if;
  select * into v_lot from public.ruul_lots where semaine = v_semaine;
  return jsonb_build_object(
    'semaine', v_semaine,
    'lot', case when v_lot.id is null then null else to_jsonb(v_lot) - 'rapprochement' - 'ruul_devis' end,
    'rapprochement', v_lot.rapprochement,
    'devis', v_lot.ruul_devis,
    'devis_at', v_lot.ruul_devis_at,
    'totaux', jsonb_build_object(
      'payable', coalesce((select sum(x.montant + x.bonus) from public.ruul_paiements x
                            where v_lot.id is not null and x.lot_id = v_lot.id and x.statut in ('a_payer', 'paye')), 0),
      'nb_payable', (select count(distinct x.poster_id) from public.ruul_paiements x
                      where v_lot.id is not null and x.lot_id = v_lot.id and x.statut in ('a_payer', 'paye')),
      'a_valider', (select count(distinct x.poster_id) from public.ruul_paiements x
                     where v_lot.id is not null and x.lot_id = v_lot.id and x.statut = 'a_payer' and not public.ruul_ligne_validee(x)),
      'pret', coalesce((select sum(e.montant) from public.ruul_lot_a_envoyer(v_semaine) e), 0),
      'nb_pret', (select count(*) from public.ruul_lot_a_envoyer(v_semaine)),
      'en_attente', coalesce((select sum(x.montant + x.bonus) from public.ruul_paiements x
                               where x.statut = 'reporte' and x.montant + x.bonus > 0), 0),
      'nb_en_attente', (select count(distinct x.poster_id) from public.ruul_paiements x
                         where x.statut = 'reporte' and x.montant + x.bonus > 0)),
    'lignes', coalesce((
      select jsonb_agg(x order by x->>'nom') from (
        select jsonb_build_object(
          'poster_id', pr.id,
          'nom', coalesce(nullif(btrim(concat_ws(' ', pr.prenom, pr.nom)), ''), pr.email),
          'ruul_email', pr.ruul_email,
          'ruul_onboarding', pr.ruul_onboarding,
          'pays', public.paie_pays_posteur(pr.id),
          'semaines', jsonb_agg(jsonb_build_object('id', rp.id, 'semaine', rp.semaine, 'montant', rp.montant, 'rattrapage', rp.rattrapage,
                                                   'statut', rp.statut, 'nb_comptes', rp.nb_comptes, 'faits', rp.faits, 'prevus', rp.prevus,
                                                   'tarif', rp.tarif, 'retenue', rp.retenue, 'detail_comptes', rp.detail_comptes,
                                                   'paye_at', rp.paye_at, 'ecart', rp.ecart, 'bonus', rp.bonus,
                                                   'bonus_detail', (select jsonb_agg(jsonb_build_object('type', b.type, 'montant', b.montant, 'detail', b.detail))
                                                                      from public.bonus b where b.id = any(rp.bonus_ids)),
                                                   'a_verifier', to_jsonb(rp.a_verifier), 'valide', public.ruul_ligne_validee(rp)) order by rp.semaine),
          'bonus', sum(rp.bonus),
          'total', sum(rp.montant + rp.bonus),
          'a_verifier', coalesce((select jsonb_agg(distinct v) from public.ruul_paiements y, unnest(y.a_verifier) v
                                   where y.lot_id = v_lot.id and y.poster_id = pr.id and y.statut = 'a_payer'), '[]'::jsonb),
          'valide', bool_and(public.ruul_ligne_validee(rp)),
          'valide_at', max(rp.valide_at),
          'alertes', array_remove(array[
             case when nullif(btrim(coalesce(pr.ruul_email, '')), '') is null then 'email Ruul manquant' end,
             case when pr.ruul_premier_paiement_at is null then '1er paiement' end,
             case when bool_or(rp.rattrapage) then 'rattrapage' end,
             case when sum(rp.bonus) > 0 then 'bonus de parrainage inclus' end,
             case when sum(rp.montant) > v_plafond then 'au-dessus du plafond par ligne (' || v_plafond || ' $)' end], null)) x
          from public.ruul_paiements rp
          join public.profiles pr on pr.id = rp.poster_id
         where rp.lot_id = v_lot.id and rp.statut in ('a_payer', 'paye')
         group by pr.id) t), '[]'::jsonb),
    'reportes', coalesce((
      select jsonb_agg(jsonb_build_object(
               'poster_id', pr.id, 'nom', coalesce(nullif(btrim(concat_ws(' ', pr.prenom, pr.nom)), ''), pr.email),
               'ruul_statut', pr.ruul_statut, 'ruul_compte', pr.ruul_compte, 'ruul_onboarding', pr.ruul_onboarding,
               'semaine', rp.semaine, 'montant', rp.montant + rp.bonus, 'raison', rp.raison_report)
             order by pr.prenom, rp.semaine)
        from public.ruul_paiements rp join public.profiles pr on pr.id = rp.poster_id
       where rp.statut = 'reporte'
          or (rp.statut = 'annule' and rp.semaine = v_semaine)), '[]'::jsonb));
end;
$function$;

revoke all on function public.ruul_lot_a_envoyer(date) from public, anon;
revoke all on function public.ruul_lot_noter_devis(date, jsonb) from public, anon, authenticated;
revoke all on function public.ruul_ligne_valider(uuid, date, boolean) from public, anon;
grant execute on function public.ruul_lot_a_envoyer(date) to authenticated, service_role;
grant execute on function public.ruul_lot_noter_devis(date, jsonb) to service_role;
grant execute on function public.ruul_ligne_valider(uuid, date, boolean) to authenticated;
