-- 0510 — Filtre définitif : l'OS ne lit QUE l'organisation Upwork VIk Studios
-- (2074065383597823773). Calyra (« Maximilien Kender »), Micabo et toute autre
-- équipe sont ignorées par l'accueil, Contracts to link, Needs you, les
-- relances, la paie et Who to fund.
--
-- Côté base (remplacement d'un morceau ; la migration échoue s'il n'est pas trouvé) :
--   - auto_aujourdhui : « contrats à relier » sans les accueils classés ni hors VIk ;
--   - needs_you : cartes d'accueil seulement VIk et non classées ;
--   - contrats_sans_posteur (Contracts to link) : par l'id de l'organisation, plus par son nom ;
--   - paie_a_financer_liste (Who to fund) : seulement les contrats VIk ;
--   - etapes_recrues_v2, relances_recrues (relances) : sans les posteurs reliés à un contrat hors VIk.
-- La fonction upwork (ORGS_OS = VIk seul, et la paie refuse tout contrat hors
-- VIk) suit dans le même lot. Additif : aucune ligne modifiée.

do $m$
declare
  v_vik constant text := '''2074065383597823773''';
  v_def text;
  a text;
  b text;
begin
  -- auto_aujourdhui
  v_def := pg_get_functiondef('public.auto_aujourdhui'::regproc);
  a := $q$'contrats_a_relier', (select count(*) from public.accueils a where a.statut = 'a_relier'),$q$;
  b := $q$'contrats_a_relier', (select count(*) from public.accueils a where a.statut = 'a_relier' and a.classement is null
                                  and coalesce(a.organisation_id, $q$ || v_vik || $q$) = $q$ || v_vik || $q$),$q$;
  if position(a in v_def) = 0 then raise exception '0510 : auto_aujourdhui, morceau introuvable'; end if;
  execute replace(v_def, a, b);

  -- needs_you
  v_def := pg_get_functiondef('public.needs_you()'::regprocedure);
  a := $q$and coalesce(a.organisation_id, '2074065383597823773') in ('2074065383597823773', '1990051114607612379')$q$;
  b := $q$and coalesce(a.organisation_id, '2074065383597823773') = '2074065383597823773' and a.classement is null$q$;
  if position(a in v_def) = 0 then raise exception '0510 : needs_you, morceau introuvable'; end if;
  execute replace(v_def, a, b);

  -- contrats_sans_posteur
  v_def := pg_get_functiondef('public.contrats_sans_posteur'::regproc);
  a := $q$uc.organisation_nom = 'VIk Studios'$q$;
  b := $q$uc.organisation_id = '2074065383597823773'$q$;
  if position(a in v_def) = 0 then raise exception '0510 : contrats_sans_posteur, morceau introuvable'; end if;
  execute replace(v_def, a, b);

  -- paie_a_financer_liste
  v_def := pg_get_functiondef('public.paie_a_financer_liste()'::regprocedure);
  a := E'   where f.finance_at is null\n';
  b := E'   where f.finance_at is null\n'
    || E'     and coalesce((select uc.organisation_id from public.upwork_contrats uc where uc.contrat_id = f.contrat_id), ''2074065383597823773'') = ''2074065383597823773''\n';
  if position(a in v_def) = 0 then raise exception '0510 : paie_a_financer_liste, morceau introuvable'; end if;
  execute replace(v_def, a, b);

  -- etapes_recrues_v2 (relances, onboarding)
  v_def := pg_get_functiondef('public.etapes_recrues_v2()'::regprocedure);
  a := E'     where pr.is_active and pr.cohorte_lundi >= v_auj - 2\n';
  b := E'     where pr.is_active and pr.cohorte_lundi >= v_auj - 2\n'
    || E'       and coalesce((select uc.organisation_id from public.upwork_contrats uc where uc.contrat_id = pr.upwork_contract_id), ''2074065383597823773'') = ''2074065383597823773''\n';
  if position(a in v_def) = 0 then raise exception '0510 : etapes_recrues_v2, morceau introuvable'; end if;
  execute replace(v_def, a, b);

  -- relances_recrues
  v_def := pg_get_functiondef('public.relances_recrues'::regproc);
  a := E'     where pr.is_active and pr.cohorte_lundi >= v_auj - 1\n';
  b := E'     where pr.is_active and pr.cohorte_lundi >= v_auj - 1\n'
    || E'       and coalesce((select uc.organisation_id from public.upwork_contrats uc where uc.contrat_id = pr.upwork_contract_id), ''2074065383597823773'') = ''2074065383597823773''\n';
  if position(a in v_def) = 0 then raise exception '0510 : relances_recrues, morceau introuvable'; end if;
  execute replace(v_def, a, b);
end;
$m$;

notify pgrst, 'reload schema';
