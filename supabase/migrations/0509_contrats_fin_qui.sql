-- 0509 — « Contracts to end » : qui a fermé chaque contrat, et quand.
--
-- contrats_a_terminer(lundi) rendait « — » quand la case « Ended » n'avait pas
-- été cochée à la main. Ordre de lecture :
--   1. la case « Ended » cochée dans l'OS : le nom de la personne et l'heure ;
--   2. fermé par l'OS (appel Upwork « fermer_contrat » réussi) : « OS » et l'heure ;
--   3. fermé sur Upwork hors de l'OS (lu au relevé des contrats, 0472) :
--      « Max (Upwork) » quand c'est nous, « Freelancer (Upwork) » quand c'est
--      le posteur, et le jour de fin donné par Upwork.
-- Le contrat encore ouvert garde « — ».
--
-- Ready for Monday : « Who to fund » ne compte plus les lignes retirées (0508).
--
-- Additif : deux fonctions modifiées par remplacement d'un morceau (la
-- migration échoue s'il n'est pas trouvé). Aucune ligne modifiée.

do $m$
declare
  v_def text;
  a text;
  b text;
begin
  v_def := pg_get_functiondef('public.contrats_a_terminer(date)'::regprocedure);

  a := E'         f.termine_at,\n         coalesce(nullif(btrim(concat_ws('' '', qui.prenom, qui.nom)), ''''), qui.email)\n';
  b := E'         coalesce(f.termine_at, fin.at),\n'
    || E'         coalesce(nullif(btrim(concat_ws('' '', qui.prenom, qui.nom)), ''''), qui.email, fin.par)\n';
  if position(a in v_def) = 0 then raise exception '0509 : contrats_a_terminer, colonnes introuvables'; end if;
  v_def := replace(v_def, a, b);

  a := E'    left join public.profiles qui on qui.id = f.termine_par\n';
  b := E'    left join public.profiles qui on qui.id = f.termine_par\n'
    || E'    left join lateral (\n'
    || E'      select x.par, x.at from (\n'
    || E'        select 1 as rang, ''OS''::text as par, min(ap.at) as at\n'
    || E'          from public.upwork_appels ap\n'
    || E'         where ap.contrat = pr.upwork_contract_id and ap.action = ''fermer_contrat'' and ap.erreur is null\n'
    || E'        having min(ap.at) is not null\n'
    || E'        union all\n'
    || E'        select 2, case when ar.motif ilike ''Contract ended by freelancer%'' then ''Freelancer (Upwork)'' else ''Max (Upwork)'' end,\n'
    || E'               coalesce(to_date(substring(ar.motif from ''on ([0-9]{1,2} [A-Za-z]{3} [0-9]{4})$''), ''DD Mon YYYY'')::timestamp\n'
    || E'                          at time zone ''Europe/Paris'', ar.created_at)\n'
    || E'          from public.arrets ar\n'
    || E'         where ar.poster_id = t.poster_id and ar.annule_at is null and ar.motif ilike ''Contract ended by %''\n'
    || E'      ) x order by x.rang, x.at limit 1\n'
    || E'    ) fin on true\n';
  if position(a in v_def) = 0 then raise exception '0509 : contrats_a_terminer, jointure introuvable'; end if;
  v_def := replace(v_def, a, b);

  a := E'   order by f.termine_at is not null, t.decide_at;';
  b := E'   order by coalesce(f.termine_at, fin.at) is not null, t.decide_at;';
  if position(a in v_def) = 0 then raise exception '0509 : contrats_a_terminer, tri introuvable'; end if;
  execute replace(v_def, a, b);

  v_def := pg_get_functiondef('public.pret_lundi'::regproc);
  a := 'select count(*) into n from public.paie_a_financer f where f.finance_at is null;';
  b := 'select count(*) into n from public.paie_a_financer f where f.finance_at is null and f.retire_at is null;';
  if position(a in v_def) = 0 then raise exception '0509 : pret_lundi, morceau introuvable'; end if;
  execute replace(v_def, a, b);
end;
$m$;

notify pgrst, 'reload schema';
