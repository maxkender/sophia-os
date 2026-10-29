-- Prompt 22, parties 3, 4 et 10 : Overview, Recruits et Logs.
--
-- LECTURE SEULE : quatre fonctions de stats, aucune table, aucune donnée ni
-- aucun cron changé. Admin et Head of Ops (is_admin()) ; la cohorte RUUL
-- (hub_posteurs) est toujours exclue.
--
-- 1. auto_sante()       : Overview → Health. La connexion Upwork (état,
--                         expiration du jeton, dernière erreur, alerte si le
--                         jeton expire dans moins de 6 h et que le
--                         renouvellement a échoué) et le dernier passage de
--                         chaque tâche automatique (en retard / en erreur).
-- 2. auto_aujourdhui()  : Overview → Today. Les compteurs du jour.
-- 3. auto_semaine()     : Overview → This week. Lundi, jeudi, samedi, dimanche.
-- 4. auto_journal(...)  : Logs. Une ligne par action (recrue_evenements,
--                         messages, upwork_appels, arrets, Kills, paiements par
--                         l'API, changements de réglages, actions bloquées par
--                         la pause « paused »), filtres date, type, posteur.
--
-- Jamais la colonne cron.job.command (elle contient un secret).
-- Retour arrière : supprimer les quatre fonctions (rien d'autre ne change).

-- ---------------------------------------------------------------------------
-- 1. Health
-- ---------------------------------------------------------------------------
create or replace function public.auto_sante()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_taches jsonb;
  v_upwork jsonb;
begin
  if not public.is_admin() then
    raise exception 'auto_sante : réservé à l''admin et au Head of Ops' using errcode = '42501';
  end if;

  -- Le dernier passage de chaque tâche. ~8 000 passages de cron par jour : on
  -- ne lit que les ~10 derniers jours (assez pour la paie du lundi).
  with m as (select coalesce(max(runid), 0) as r from cron.job_run_details),
  t (tache, job, retard, passage, ordre) as (
    values ('recrues', 'recrues-check', interval '45 minutes', 'etapes', 1),
           ('accueil', 'accueil-auto', interval '45 minutes', 'accueil', 2),
           ('arrets', 'arrets', interval '150 minutes', null, 3),
           ('upwork', 'reponses-upwork', interval '45 minutes', 'reponses', 4),
           ('paie', 'paie-lundi', interval '8 days', null, 5),
           ('tiktok', 'ckd-warmup-releve', interval '13 hours', null, 6),
           ('minuit', 'minuit-vnext', interval '26 hours', null, 7)
  )
  select jsonb_agg(jsonb_build_object(
           'tache', t.tache,
           'job', t.job,
           'existe', j.jobid is not null,
           'actif', coalesce(j.active, false),
           'dernier_at', d.start_time,
           'statut', d.status,
           'message', left(d.return_message, 200),
           'passage_at', pa.dernier_at,
           'en_erreur', d.status = 'failed',
           'en_retard', j.jobid is null or not j.active or d.start_time is null
                        or d.start_time < now() - t.retard) order by t.ordre)
    into v_taches
    from t
    cross join m
    left join cron.job j on j.jobname = t.job
    left join lateral (select x.start_time, x.status, x.return_message
                         from cron.job_run_details x
                        where x.jobid = j.jobid and x.runid > m.r - 80000
                        order by x.runid desc limit 1) d on true
    left join public.passages_auto pa on pa.tache = t.passage;

  select jsonb_build_object(
           'statut', u.statut,
           'access_expire_at', u.access_expire_at,
           'derniere_erreur', u.derniere_erreur,
           'dernier_appel_at', u.dernier_appel_at,
           'renouvellement_at', r.at,
           'renouvellement_erreur', r.erreur,
           'expire_bientot', u.access_expire_at is not null and u.access_expire_at < now() + interval '6 hours',
           'alerte', u.access_expire_at is not null and u.access_expire_at < now() + interval '6 hours'
                     and (r.erreur is not null or u.statut = 'erreur' or u.access_expire_at < now()))
    into v_upwork
    from (select * from public.upwork_connexion order by connecte_at desc nulls last limit 1) u
    left join lateral (select a.at, left(a.erreur, 300) as erreur from public.upwork_appels a
                        where a.action = 'renouvellement' and a.at > now() - interval '7 days'
                        order by a.at desc limit 1) r on true;

  return jsonb_build_object('taches', coalesce(v_taches, '[]'::jsonb), 'upwork', v_upwork);
end;
$$;

revoke all on function public.auto_sante() from public, anon;
grant execute on function public.auto_sante() to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Today
-- ---------------------------------------------------------------------------
create or replace function public.auto_aujourdhui()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_jour   date := (now() at time zone 'Europe/Paris')::date;
  v_debut  timestamptz := ((now() at time zone 'Europe/Paris')::date)::timestamp at time zone 'Europe/Paris';
  v_lundi  date := date_trunc('week', (now() at time zone 'Europe/Paris'))::date;
  v_messages jsonb;
  v_kills  jsonb;
begin
  if not public.is_admin() then
    raise exception 'auto_aujourdhui : réservé à l''admin et au Head of Ops' using errcode = '42501';
  end if;

  -- Les messages partis aujourd'hui, par type (ce qui est simulé en test ou bloqué n'est pas compté).
  select coalesce(jsonb_object_agg(x.type, x.n), '{}'::jsonb) into v_messages
    from (select y.type, count(*)::int as n from (
            select n.type, n.poster_id from public.nudges n
             where n.envoye_at >= v_debut and n.slack_erreur is null
            union all
            select 'accueil', a.poster_id from public.accueils a
             where a.message_at >= v_debut and a.statut = 'envoye'
            union all
            select 'popup_' || m.type, m.poster_id from public.posteur_messages m
             where m.created_at >= v_debut
            union all
            select 'reponse_auto', r.poster_id from public.posteur_reponses r
             where r.reponse_at >= v_debut and r.reponse_statut = 'envoye'
          ) y
          where y.poster_id is null or not exists (select 1 from public.hub_posteurs h where h.profile_id = y.poster_id)
          group by y.type) x;

  -- Les Kills en cours, avec leur heure (le compte à rebours) ; « simule » = en test.
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', k.id, 'poster_id', k.poster_id,
           'nom', nullif(btrim(concat_ws(' ', p.prenom, p.nom)), ''),
           'etape', k.etape, 'statut', k.statut, 'prevu_at', k.prevu_at) order by k.prevu_at), '[]'::jsonb)
    into v_kills
    from public.kills_auto k
    left join public.profiles p on p.id = k.poster_id
   where k.annule_at is null
     and (k.statut = 'en_attente' or (k.statut = 'simule' and k.prevu_at > now()))
     and not exists (select 1 from public.hub_posteurs h where h.profile_id = k.poster_id);

  return jsonb_build_object(
    'jour', v_jour,
    'messages', v_messages,
    'kills', v_kills,
    'a_lire', (select count(*) from public.posteur_reponses r
                where r.lu_at is null and r.corrige_at is null
                  and ((r.statut = 'classe' and r.liste = 'a_lire') or r.statut = 'erreur')
                  and not exists (select 1 from public.hub_posteurs h where h.profile_id = r.poster_id)),
    'questions_paie', (select count(*) from public.posteur_reponses r
                        where r.lu_at is null and r.corrige_at is null and r.statut = 'classe' and r.liste = 'paie'
                          and not exists (select 1 from public.hub_posteurs h where h.profile_id = r.poster_id)),
    'contrats_a_relier', (select count(*) from public.accueils a where a.statut = 'a_relier'),
    -- Les arrêts dont une action reste à faire à la main (Slack, remboursement, fin de contrat, message), ou en erreur.
    'arrets_a_la_main', (select count(*) from public.arrets ar
                          where (ar.statut = 'erreur'
                                 or exists (select 1 from jsonb_array_elements(coalesce(ar.etapes, '[]'::jsonb)) e
                                             where e ->> 'action' in ('slack', 'remboursement', 'fermeture', 'message')
                                               and e ->> 'statut' in ('a_faire', 'erreur')))
                            and not exists (select 1 from public.hub_posteurs h where h.profile_id = ar.poster_id)),
    -- Les lignes de paie à vérifier : paiements par l'API « a_verifier », et lignes « a_voir » de la semaine finie pas payées.
    'paie_a_verifier', (select count(*) from public.paie_paiements_api pp where pp.statut = 'a_verifier')
                       + (select count(*) from public.paie_semaines ps
                           where ps.semaine = v_lundi - 7 and ps.statut = 'a_voir' and ps.paye_at is null
                             and not coalesce(ps.exclu, false)
                             and not exists (select 1 from public.hub_posteurs h where h.profile_id = ps.poster_id)));
end;
$$;

revoke all on function public.auto_aujourdhui() from public, anon;
grant execute on function public.auto_aujourdhui() to authenticated;

-- ---------------------------------------------------------------------------
-- 3. This week
-- ---------------------------------------------------------------------------
create or replace function public.auto_semaine()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_lundi date := date_trunc('week', (now() at time zone 'Europe/Paris'))::date;
  v_dim_debut timestamptz := ((date_trunc('week', (now() at time zone 'Europe/Paris'))::date + 6)::timestamp) at time zone 'Europe/Paris';
begin
  if not public.is_admin() then
    raise exception 'auto_semaine : réservé à l''admin et au Head of Ops' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'lundi', v_lundi,
    'aujourdhui', (now() at time zone 'Europe/Paris')::date,
    -- Lundi : la paie de la semaine finie, le message du lundi, le contrôle de 20 h.
    'paie', (select jsonb_build_object('statut', pa.statut, 'bilan', pa.dernier_bilan)
               from public.paie_auto pa where pa.semaine = v_lundi - 7),
    'paie_lignes', (select count(*) from public.paie_semaines ps
                     where ps.semaine = v_lundi - 7 and not coalesce(ps.exclu, false)
                       and not exists (select 1 from public.hub_posteurs h where h.profile_id = ps.poster_id)),
    'paie_payees', (select count(*) from public.paie_semaines ps
                     where ps.semaine = v_lundi - 7 and ps.paye_at is not null and not coalesce(ps.exclu, false)
                       and not exists (select 1 from public.hub_posteurs h where h.profile_id = ps.poster_id)),
    'lundi_messages', (select count(*) from public.nudges n where n.type = 'lundi' and n.periode = v_lundi),
    'lundi_soir', (select count(*) from public.nudges n where n.type = 'lundi_soir' and n.periode = v_lundi),
    -- Jeudi : le nudge.
    'jeudi_lance_at', (select c.lance_at from public.ckd_controles c where c.type = 'jeudi' and c.jour = v_lundi + 3
                        order by c.lance_at desc nulls last limit 1),
    'jeudi_nudges', (select count(*) from public.nudges n where n.type = 'jeudi' and n.periode = v_lundi),
    -- Samedi : Kill / Double, décidés ou pas.
    'samedi_lance_at', (select c.lance_at from public.ckd_controles c where c.type = 'samedi' and c.jour = v_lundi + 5
                         order by c.lance_at desc nulls last limit 1),
    'samedi_total', (select count(*) from public.ckd_propositions p where p.type = 'samedi' and p.jour = v_lundi + 5),
    'samedi_decides', (select count(*) from public.ckd_propositions p
                        where p.type = 'samedi' and p.jour = v_lundi + 5 and p.decision is not null),
    -- Dimanche : les Kills validés samedi, et les messages de Kill partis.
    'kills_a_envoyer', (select count(*) from public.ckd_propositions p
                         where p.type = 'samedi' and p.jour = v_lundi + 5 and p.decision = 'ne_pas_renouveler'),
    'kills_envoyes', (select count(*) from public.recrue_evenements e
                       where e.type = 'kill_message' and e.at >= v_dim_debut and e.at < v_dim_debut + interval '1 day'
                         and coalesce(e.detail, '') not like 'test%' and coalesce(e.detail, '') not like 'erreur%'));
end;
$$;

revoke all on function public.auto_semaine() from public, anon;
grant execute on function public.auto_semaine() to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Logs
-- ---------------------------------------------------------------------------
create or replace function public.auto_journal(
  p_du      date default null,
  p_au      date default null,
  p_source  text default null,
  p_poster  uuid default null,
  p_limite  integer default 500
)
returns table (
  at         timestamptz,
  source     text,
  action     text,
  auteur     text,
  poster_id  uuid,
  poster_nom text,
  canal      text,
  resultat   text,
  detail     text
)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_du    timestamptz := (coalesce(p_du, (now() at time zone 'Europe/Paris')::date - 6)::timestamp) at time zone 'Europe/Paris';
  v_au    timestamptz := ((coalesce(p_au, (now() at time zone 'Europe/Paris')::date) + 1)::timestamp) at time zone 'Europe/Paris';
  v_lim   integer := least(greatest(coalesce(p_limite, 500), 1), 2000);
begin
  if not public.is_admin() then
    raise exception 'auto_journal : réservé à l''admin et au Head of Ops' using errcode = '42501';
  end if;
  return query
  with u as (
    (select e.at, 'recrue'::text as source, e.type as action, null::uuid as auteur_id, e.poster_id, null::text as canal,
            case when e.detail like 'test%' then 'simule' when e.detail like 'erreur%' then 'erreur' else 'fait' end as resultat,
            left(e.detail, 300) as detail
       from public.recrue_evenements e
      where (p_source is null or p_source = 'recrue') and e.at >= v_du and e.at < v_au
        and (p_poster is null or e.poster_id = p_poster)
      order by e.at desc limit v_lim)
    union all
    (select n.envoye_at, 'message', n.type, n.envoye_par, n.poster_id, n.canal,
            case when n.slack_erreur is not null then 'erreur' else 'envoye' end,
            left(coalesce(n.slack_erreur, n.texte), 300)
       from public.nudges n
      where (p_source is null or p_source = 'message') and n.envoye_at >= v_du and n.envoye_at < v_au
        and (p_poster is null or n.poster_id = p_poster)
      order by n.envoye_at desc limit v_lim)
    union all
    (select coalesce(a.message_at, a.updated_at), 'message', 'accueil', a.relie_par, a.poster_id, 'upwork',
            case a.statut when 'envoye' then 'envoye' when 'simule' then 'simule' when 'erreur' then 'erreur' else a.statut end,
            left(coalesce(case when a.statut = 'erreur' then a.raison end, a.message_texte, a.raison), 300)
       from public.accueils a
      where (p_source is null or p_source = 'message')
        and (a.message_at is not null or a.statut in ('simule', 'erreur'))
        and coalesce(a.message_at, a.updated_at) >= v_du and coalesce(a.message_at, a.updated_at) < v_au
        and (p_poster is null or a.poster_id = p_poster)
      order by coalesce(a.message_at, a.updated_at) desc limit v_lim)
    union all
    (select m.created_at, 'message', 'popup_' || m.type, null::uuid, m.poster_id,
            case when m.slack_statut is not null then 'slack' when m.upwork_statut is not null then 'upwork' else 'tableau' end,
            case when m.slack_statut in ('erreur', 'introuvable') or m.upwork_statut = 'erreur' or m.erreur is not null then 'erreur'
                 else 'envoye' end,
            left(coalesce(m.slack_erreur, m.upwork_erreur, m.erreur, m.texte), 300)
       from public.posteur_messages m
      where (p_source is null or p_source = 'message') and m.created_at >= v_du and m.created_at < v_au
        and (p_poster is null or m.poster_id = p_poster)
      order by m.created_at desc limit v_lim)
    union all
    (select coalesce(r.reponse_at, r.traite_at, r.recu_at), 'message', 'reponse_auto', null::uuid, r.poster_id, r.canal,
            r.reponse_statut, left(coalesce(case when r.reponse_statut = 'erreur' then r.erreur end, r.reponse_texte), 300)
       from public.posteur_reponses r
      where (p_source is null or p_source = 'message')
        and r.reponse_statut is not null and r.reponse_statut <> 'aucune'
        and coalesce(r.reponse_at, r.traite_at, r.recu_at) >= v_du and coalesce(r.reponse_at, r.traite_at, r.recu_at) < v_au
        and (p_poster is null or r.poster_id = p_poster)
      order by coalesce(r.reponse_at, r.traite_at, r.recu_at) desc limit v_lim)
    union all
    -- Les appels Upwork (jamais la requête ni la réponse brutes).
    (select a.at, 'upwork', a.action, a.par,
            (select p.id from public.profiles p where a.contrat is not null and p.upwork_contract_id = a.contrat limit 1),
            'upwork',
            case when a.erreur is not null or coalesce(a.statut_http, 200) >= 400 then 'erreur' else 'ok' end,
            left(coalesce(a.erreur, a.contrat), 300)
       from public.upwork_appels a
      where (p_source is null or p_source = 'upwork') and a.at >= v_du and a.at < v_au
        and (p_poster is null or a.contrat = (select p.upwork_contract_id from public.profiles p where p.id = p_poster))
      order by a.at desc limit v_lim)
    union all
    (select ar.created_at, 'arret', 'arret_' || ar.source, ar.demande_par, ar.poster_id, null::text, ar.statut,
            left(coalesce(ar.erreur, ar.motif), 300)
       from public.arrets ar
      where (p_source is null or p_source = 'arret') and ar.created_at >= v_du and ar.created_at < v_au
        and (p_poster is null or ar.poster_id = p_poster)
      order by ar.created_at desc limit v_lim)
    union all
    (select coalesce(k.annule_at, k.parti_at, k.detecte_at), 'kill', 'kill_' || k.etape, k.annule_par, k.poster_id, null::text,
            k.statut, left(k.raison, 300)
       from public.kills_auto k
      where (p_source is null or p_source = 'kill')
        and coalesce(k.annule_at, k.parti_at, k.detecte_at) >= v_du and coalesce(k.annule_at, k.parti_at, k.detecte_at) < v_au
        and (p_poster is null or k.poster_id = p_poster)
      order by coalesce(k.annule_at, k.parti_at, k.detecte_at) desc limit v_lim)
    union all
    (select pp.updated_at, 'paie', 'paiement_api', pp.par, pp.poster_id, 'upwork', pp.statut,
            left(concat_ws(' · ', coalesce(pp.montant_approuve, pp.montant_reserve)::text || ' $', pp.erreur), 300)
       from public.paie_paiements_api pp
      where (p_source is null or p_source = 'paie') and pp.updated_at >= v_du and pp.updated_at < v_au
        and (p_poster is null or pp.poster_id = p_poster)
      order by pp.updated_at desc limit v_lim)
    union all
    (select j.at, 'reglage', j.cle, j.par, null::uuid, null::text, 'modifie', left(j.nouvelle::text, 200)
       from public.reglages_journal j
      where (p_source is null or p_source = 'reglage') and p_poster is null and j.at >= v_du and j.at < v_au
      order by j.at desc limit v_lim)
    union all
    -- Prompt 22, partie 2 : les actions bloquées par le grand interrupteur.
    (select b.at, 'pause', b.fonction || ' · ' || b.action, null::uuid, b.poster_id, null::text, b.motif, left(b.cible, 300)
       from public.actions_bloquees b
      where (p_source is null or p_source = 'pause') and b.at >= v_du and b.at < v_au
        and (p_poster is null or b.poster_id = p_poster)
      order by b.at desc limit v_lim)
  )
  select u.at, u.source, u.action,
         case when u.auteur_id is null then 'OS'
              else coalesce(nullif(btrim(concat_ws(' ', pa.prenom, pa.nom)), ''), '?') end,
         u.poster_id, nullif(btrim(concat_ws(' ', pp.prenom, pp.nom)), ''),
         u.canal, u.resultat, u.detail
    from u
    left join public.profiles pa on pa.id = u.auteur_id
    left join public.profiles pp on pp.id = u.poster_id
   where u.at is not null
     and (u.poster_id is null or not exists (select 1 from public.hub_posteurs h where h.profile_id = u.poster_id))
   order by u.at desc
   limit v_lim;
end;
$$;

revoke all on function public.auto_journal(date, date, text, uuid, integer) from public, anon;
grant execute on function public.auto_journal(date, date, text, uuid, integer) to authenticated;
