-- 0479 — Needs you : seulement ce qu'un humain doit faire maintenant.
--
-- 1. Shadowbans et liens introuvables sortent de Needs you (masterlist du
--    samedi, page Thursday pour la nouvelle cohorte).
-- 2. Décisions du samedi non validées : une seule carte qui résume
--    (« N decisions waiting in the masterlist » + lien), plus une par posteur.
-- 3. Ce qui se règle tout seul se ferme tout seul : contrat déjà terminé chez
--    Upwork (carte doublon / Contract to link), limite Upwork d'un jour passé,
--    « à payer avant fermeture » quand il n'y a rien à payer (aucun post avec
--    lien depuis 3 semaines, aucune semaine à payer).
-- 4. À financer : dans Payroll → Who to fund ; dans Needs you seulement si la
--    milestone n'est toujours pas financée le mardi 12:00 (Paris) qui suit.
-- 5. Les questions des HM au bot (rôle HM, ou Slack d'une HM) : type question_hm,
--    une section à part sur la page.
--
-- Additive : needs_you réécrite par remplacements à des ancres vérifiées (une
-- seule occurrence chacune). Aucune donnée touchée.

do $p$
declare
  v_def text := pg_get_functiondef('public.needs_you()'::regprocedure);
  v_debut int;
  v_fin int;
  v_ancre text;

begin
  if position('''question_hm''' in v_def) > 0 then
    return; -- déjà passée
  end if;

  -- 1a. Les liens introuvables : le bloc 'liens:' disparaît.
  v_debut := position(E'    union all\n    select ''liens:''' in v_def);
  v_fin := position(E'    union all\n    select ''compte:''' in v_def);
  if v_debut = 0 or v_fin <= v_debut then
    raise exception '0479 : bloc liens introuvable';
  end if;
  v_def := substr(v_def, 1, v_debut - 1) || substr(v_def, v_fin);

  -- 1b. Les shadowbans : le bloc 'shadowban:' disparaît.
  v_debut := position(E'    union all\n    select ''shadowban:''' in v_def);
  v_fin := position(E'    union all\n    select ''relecture:''' in v_def);
  if v_debut = 0 or v_fin <= v_debut then
    raise exception '0479 : bloc shadowban introuvable';
  end if;
  v_def := substr(v_def, 1, v_debut - 1) || substr(v_def, v_fin);

  -- 2. Les décisions du samedi : une seule carte.
  v_debut := position(E'    union all\n    select ''samedi:'' || cp.id' in v_def);
  v_fin := position(E'    union all\n    select ''contestation:''' in v_def);
  if v_debut = 0 or v_fin <= v_debut then
    raise exception '0479 : bloc samedi introuvable';
  end if;
  v_def := substr(v_def, 1, v_debut - 1) || $a$    union all
    select 'samedi:' || max(cp.jour)::text, 'a_la_main', 'samedi_non_valide', null::uuid, 'Saturday masterlist',
           format('%s decisions waiting in the masterlist', count(*)),
           'Check them and click Validate in Weekly decisions → Saturday.', null, 'kill', min(cp.created_at),
           array['ouvrir'], max(cp.jour)::text, '/admin/auto/decisions?onglet=samedi', null, count(*)::int
      from public.ckd_propositions cp
     where cp.type = 'samedi' and cp.decision is null and cp.jour >= (now() at time zone 'Europe/Paris')::date - 1
    having count(*) > 0
$a$ || substr(v_def, v_fin);

  -- 3a. La limite Upwork (429) d'un jour passé.
  v_ancre := E'      from public.a_faire a\n     where a.fait_at is null\n';
  if (length(v_def) - length(replace(v_def, v_ancre, ''))) / length(v_ancre) <> 1 then
    raise exception '0479 : ancre a_faire introuvable ou en double';
  end if;
  v_def := replace(v_def, v_ancre, v_ancre ||
    E'       and not (a.type = ''upwork'' and a.created_at < (date_trunc(''day'', now() at time zone ''Europe/Paris'') at time zone ''Europe/Paris''))\n');

  -- 3b. Contrat déjà terminé chez Upwork : plus de carte doublon / Contract to link.
  v_ancre := E'     where a.statut in (''a_relier'', ''doublon'')\n';
  if (length(v_def) - length(replace(v_def, v_ancre, ''))) / length(v_ancre) <> 1 then
    raise exception '0479 : ancre accueils introuvable ou en double';
  end if;
  v_def := replace(v_def, v_ancre, v_ancre || $a$       and not exists (select 1 from public.upwork_offres o
                        where o.contrat_id = a.contrat_id and (o.etat = 'Ended' or o.contrat_statut in ('CLOSED', 'ENDED')))
       and not (exists (select 1 from public.upwork_contrats u where u.contrat_id = a.contrat_id)
                and not exists (select 1 from public.upwork_contrats u where u.contrat_id = a.contrat_id and u.actif))
$a$);

  -- 3c. « À payer avant fermeture » seulement s'il y a quelque chose à payer.
  v_ancre := E'       and not exists (select 1 from jsonb_array_elements(a.etapes) e where e->>''action'' = ''remboursement'' and e->>''statut'' = ''a_faire'')\n    union all\n    select ''main:''';
  if (length(v_def) - length(replace(v_def, v_ancre, ''))) / length(v_ancre) <> 1 then
    raise exception '0479 : ancre fermeture introuvable ou en double';
  end if;
  v_def := replace(v_def, v_ancre, replace(v_ancre, E'    union all\n    select ''main:''', $a$       and (exists (select 1 from public.passages pa join public.comptes cz on cz.id = pa.compte_id
                     where cz.poster_id = a.poster_id and pa.publie_url is not null
                       and pa.date_publication_prevue >= (a.created_at at time zone 'Europe/Paris')::date - 21)
            or exists (select 1 from public.paie_semaines ps
                        where ps.poster_id = a.poster_id and ps.paye_at is null and not coalesce(ps.exclu, false)
                          and ps.semaine >= (a.created_at at time zone 'Europe/Paris')::date - 21
                          and coalesce(ps.montant_corrige, ps.montant, 0) > 0))
    union all
    select 'main:'$a$));

  -- 4. À financer : seulement si toujours pas financée le mardi 12:00 (Paris) qui suit.
  v_ancre := E'       and exists (select 1 from public.profiles pf where pf.id = f.poster_id and pf.is_active)\n';
  if (length(v_def) - length(replace(v_def, v_ancre, ''))) / length(v_ancre) <> 1 then
    raise exception '0479 : ancre a_financer introuvable ou en double';
  end if;
  v_def := replace(v_def, v_ancre, v_ancre || $a$       and (now() at time zone 'Europe/Paris') >=
           date_trunc('week', f.cree_at at time zone 'Europe/Paris') + interval '1 day 12 hours'
           + case when (f.cree_at at time zone 'Europe/Paris') >= date_trunc('week', f.cree_at at time zone 'Europe/Paris') + interval '1 day 12 hours'
                  then interval '7 days' else interval '0' end
$a$);
  v_ancre := $a$'The week is paid; Upwork needs you to confirm funding this milestone (non-enterprise account). Fund it on Upwork: the OS re-reads it every hour.'$a$;
  if position(v_ancre in v_def) = 0 then
    raise exception '0479 : texte a_financer introuvable';
  end if;
  v_def := replace(v_def, v_ancre, $a$'Still not funded on Tuesday 12:00 (Payroll → Who to fund). Fund it on Upwork: the OS re-reads it every hour.'$a$);

  -- 5. Les questions des HM : un type à part.
  v_ancre := $a$select 'faq:' || md5(lower(btrim(q.question))), 'pas_pu_repondre', 'question_faq',$a$;
  if (length(v_def) - length(replace(v_def, v_ancre, ''))) / length(v_ancre) <> 1 then
    raise exception '0479 : ancre faq introuvable ou en double';
  end if;
  v_def := replace(v_def, v_ancre, $a$select 'faq:' || md5(lower(btrim(q.question))), 'pas_pu_repondre',
           case when bool_or(coalesce(q.role, 'poster') <> 'poster'
                             or exists (select 1 from public.user_roles ur where ur.user_id = q.user_id
                                         and ur.role::text in ('hiring_manager', 'directing_manager', 'head_of_ops', 'admin'))
                             or exists (select 1 from public.hm_slack h where h.slack_user_id = q.slack_user_id))
                then 'question_hm' else 'question_faq' end,$a$);

  execute v_def;
end;
$p$;

notify pgrst, 'reload schema';
