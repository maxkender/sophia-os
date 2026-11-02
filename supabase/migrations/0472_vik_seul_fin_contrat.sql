-- 0472 — VIk Studios seulement, contrat terminé, doublons, « To fund by hand ».
--
-- 1. Needs you : les cartes « Contract to link » / doublon seulement pour les
--    contrats de VIk Studios (et Micabo, en attendant la décision) ; l'alerte
--    « contrat hors VIk Studios » est retirée (Calyra et Louis Kender sont
--    ignorées : aucune carte). Les lignes accueils restent.
-- 2. contrat_termine_arreter(contrat, fin, par) : un contrat terminé chez Upwork
--    (par le freelance ou par nous hors de l'OS) : un arrêt (source manuel, motif)
--    (le trigger arrets_immediat désactive posteur et comptes, coupe les
--    relances, ajoute « To remove from Slack »), rien à fermer ni à payer par
--    l'API, semaines non payées sorties de la paie (exclu), trace « Contract
--    ended by freelancer on … ». Aucun message.
-- 3. « To fund by hand » (liste et carte) : sans les posteurs désactivés ni les
--    contrats de test.
-- 4. Carte doublon : l'ancien profil (actif ou arrêté, comptes, dernier post),
--    les deux contrats avec leurs liens, la HM de chaque contrat, et une
--    proposition (2e compte, réembauche, nouveau contrat à fermer).
-- 5. Les 2 contrats de test (44801168, 44801175) retirés (retire_at) et leurs
--    posteurs TEST désactivés.
--
-- Additive : 2 fonctions, needs_you et paie_a_financer_liste modifiées.
-- Aucune ligne supprimée.

create or replace function public.contrat_termine_arreter(p_contrat text, p_fin date default null, p_par text default 'nous')
returns table (poster_id uuid, nom text)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v record;
  v_id uuid;
  v_texte text := format('Contract ended by %s on %s',
                         case when p_par = 'freelance' then 'freelancer' else 'us (on Upwork)' end,
                         coalesce(to_char(p_fin, 'FMDD Mon YYYY'), to_char(now() at time zone 'Europe/Paris', 'FMDD Mon YYYY')));
begin
  if not (coalesce(auth.jwt() ->> 'role', '') = 'service_role' or current_user = 'postgres' or public.is_admin()) then
    raise exception 'contrat_termine_arreter : réservé à la fonction upwork et à l''admin' using errcode = '42501';
  end if;
  for v in
    select pr.id, nullif(btrim(concat_ws(' ', pr.prenom, pr.nom)), '') as nom
      from public.profiles pr
     where pr.is_active
       and pr.upwork_contract_id::text = p_contrat
       and exists (select 1 from public.user_roles ur where ur.user_id = pr.id and ur.role = 'poster')
       and not exists (select 1 from public.hub_posteurs h where h.profile_id = pr.id)
       and not exists (select 1 from public.contrats_test t where t.contrat_id = p_contrat)
  loop
    -- L'arrêt : le trigger arrets_immediat désactive, coupe les relances prévues et ajoute « To remove from Slack ».
    insert into public.arrets (poster_id, source, motif, sans_message, statut)
    values (v.id, 'manuel', v_texte, true, 'a_faire')
    returning id into v_id;
    -- Rien à fermer ni à payer par l'API : le contrat est déjà terminé chez Upwork.
    update public.arrets
       set etapes = (select coalesce(jsonb_agg(case when e->>'action' = 'paie'
                       then jsonb_build_object('action', 'paie', 'statut', 'sans_objet',
                                               'detail', 'contrat déjà terminé sur Upwork : rien à fermer, pas de paie par l''OS', 'at', now())
                       else e end), '[]'::jsonb)
                     from jsonb_array_elements(etapes) e),
           maj_at = now()
     where id = v_id;
    update public.relances_prevues set statut = 'ecarte', raison = 'contrat_termine', maj_at = now()
     where poster_id = v.id and statut in ('prevu', 'main');
    update public.demandes_arret set decision = 'contrat_termine', decide_at = now()
     where poster_id = v.id and decision is null;
    -- Sorti de la paie : ses semaines pas encore payées.
    update public.paie_semaines set exclu = true, exclu_raison = v_texte
     where poster_id = v.id and paye_at is null and not coalesce(exclu, false);
    insert into public.recrue_evenements (poster_id, type, at, detail, cle)
    values (v.id, 'contrat_termine', now(), v_texte, p_contrat)
    on conflict (poster_id, type, cle) do nothing;
    poster_id := v.id;
    nom := v.nom;
    return next;
  end loop;
end;
$$;
revoke all on function public.contrat_termine_arreter(text, date, text) from public, anon;
grant execute on function public.contrat_termine_arreter(text, date, text) to authenticated, service_role;

-- La carte doublon : tout ce qu'il faut pour décider.
create or replace function public.doublon_resume(p_contrat text)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  a record;
  p record;
  v_comptes int;
  v_dernier date;
  v_hm_nouveau text;
  v_hm_ancien text;
  v_proposition text;
begin
  select * into a from public.accueils where contrat_id = p_contrat;
  if not found then
    return 'Doublon possible';
  end if;
  -- L'ancien profil : relié à ce contrat, sinon même nom (le plus récent actif d'abord).
  select pr.* into p
    from public.profiles pr
   where pr.upwork_contract_id::text = p_contrat
      or (lower(btrim(pr.prenom)) = lower(btrim(a.prenom)) and lower(btrim(coalesce(pr.nom, ''))) = lower(btrim(coalesce(a.nom, ''))))
   order by coalesce(pr.upwork_contract_id::text = p_contrat, false) desc, pr.is_active desc, pr.created_at desc
   limit 1;
  if not found then
    return coalesce(a.raison, 'Doublon possible');
  end if;
  select count(*) filter (where c.is_active) into v_comptes from public.comptes c where c.poster_id = p.id;
  select max(pa.publie_at)::date into v_dernier
    from public.passages pa join public.comptes c on c.id = pa.compte_id
   where c.poster_id = p.id and pa.publie_url is not null;
  v_hm_nouveau := coalesce(a.hm_upwork_nom, (select h.nom from public.hm_upwork h where h.upwork_id = a.hm_upwork_id), '?');
  v_hm_ancien := coalesce((select concat_ws(' ', m.prenom, m.nom) from public.profiles m where m.id = p.manager_id), '?');
  v_proposition := case
    when p.upwork_contract_id::text = p_contrat and not p.is_active then 'contract already ended on Upwork: nothing to do'
    when not p.is_active then 'rehire: reactivate the old profile on the new contract'
    when p.upwork_contract_id is not null and p.upwork_contract_id::text <> p_contrat and v_dernier >= current_date - 14
      then '2nd account: same person, the new contract pays a 2nd account'
    else 'new contract to close: the same person is already active' end;
  return format('Old profile: %s (%s) · %s active account(s) · last post %s · HM %s · old contract %s%s · new contract %s (HM on Upwork: %s) %s · Proposal: %s',
                nullif(btrim(concat_ws(' ', p.prenom, p.nom)), ''),
                case when p.is_active then 'active' else 'stopped' end,
                v_comptes, coalesce(to_char(v_dernier, 'DD/MM'), 'never'), v_hm_ancien,
                coalesce(p.upwork_contract_id::text, 'none'),
                coalesce(' https://www.upwork.com/nx/wm/workroom/' || p.upwork_contract_id::text || '/overview', ''),
                p_contrat, v_hm_nouveau,
                'https://www.upwork.com/nx/wm/workroom/' || p_contrat || '/overview',
                v_proposition);
end;
$$;
revoke all on function public.doublon_resume(text) from public, anon;
grant execute on function public.doublon_resume(text) to authenticated;

do $p$
declare
  v_def text := pg_get_functiondef('public.needs_you()'::regprocedure);
  v_pense text := $a$coalesce(a.raison, case when a.statut = 'doublon' then 'Doublon possible' else 'Pas relié à un posteur' end)$a$;
  v_pense_neuf text := $a$case when a.statut = 'doublon' then public.doublon_resume(a.contrat_id) else coalesce(a.raison, 'Pas relié à un posteur') end$a$;
  v_where text := $a$     where a.statut in ('a_relier', 'doublon')$a$;
  v_where_neuf text := $a$     where a.statut in ('a_relier', 'doublon')
       and coalesce(a.organisation_id, '2074065383597823773') in ('2074065383597823773', '1990051114607612379')$a$;
  v_fin text := $a$      from public.paie_a_financer f
     where f.finance_at is null$a$;
  v_fin_neuf text := $a$      from public.paie_a_financer f
     where f.finance_at is null
       and not exists (select 1 from public.contrats_test t where t.contrat_id = f.contrat_id)
       and exists (select 1 from public.profiles pf where pf.id = f.poster_id and pf.is_active)$a$;
  v_hv text := $a$    union all
    select 'hors_vik:' || a.contrat_id$a$;
  v_ancre text := $a$    union all
    select 'samedi:' || cp.id$a$;
  i int;
  j int;
begin
  if (length(v_def) - length(replace(v_def, v_pense, ''))) / length(v_pense) <> 1
     or (length(v_def) - length(replace(v_def, v_where, ''))) / length(v_where) <> 1
     or (length(v_def) - length(replace(v_def, v_fin, ''))) / length(v_fin) <> 1
     or (length(v_def) - length(replace(v_def, v_hv, ''))) / length(v_hv) <> 1
     or (length(v_def) - length(replace(v_def, v_ancre, ''))) / length(v_ancre) <> 1 then
    raise exception '0472 : needs_you ne correspond pas';
  end if;
  -- L'alerte hors VIk (0470) : du bloc hors_vik jusqu'au bloc samedi qui le suit.
  i := position(v_hv in v_def);
  j := position(v_ancre in v_def);
  if j <= i then
    raise exception '0472 : needs_you : blocs dans un ordre inattendu';
  end if;
  v_def := substr(v_def, 1, i - 1) || substr(v_def, j);
  v_def := replace(replace(replace(v_def, v_pense, v_pense_neuf), v_where, v_where_neuf), v_fin, v_fin_neuf);
  execute v_def;
end;
$p$;

do $p$
declare
  v_def text := pg_get_functiondef('public.paie_a_financer_liste()'::regprocedure);
  v_w text := $a$   where f.finance_at is null$a$;
begin
  if (length(v_def) - length(replace(v_def, v_w, ''))) / length(v_w) <> 1 then
    raise exception '0472 : paie_a_financer_liste ne correspond pas';
  end if;
  execute replace(v_def, v_w, $a$   where f.finance_at is null
     and not exists (select 1 from public.contrats_test t where t.contrat_id = f.contrat_id)
     and coalesce(p.is_active, false)$a$);
end;
$p$;

-- Les 2 contrats de test : retirés, leurs posteurs TEST désactivés (rien n'est supprimé).
update public.contrats_test set retire_at = now() where contrat_id in ('44801168', '44801175') and retire_at is null;
update public.profiles set is_active = false
 where id in (select t.poster_id from public.contrats_test t where t.contrat_id in ('44801168', '44801175') and t.poster_id is not null)
   and is_active;
update public.comptes set is_active = false
 where poster_id in (select t.poster_id from public.contrats_test t where t.contrat_id in ('44801168', '44801175') and t.poster_id is not null)
   and is_active;

notify pgrst, 'reload schema';
