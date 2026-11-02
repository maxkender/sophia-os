-- Prompt 21, ajout : la fréquence des passages Upwork, réglable par l'admin.
--
-- - Réglage upwork_frequences (minutes : 15, 30, 60 ou 120) : accueil
--   (« Welcome check », 30), reponses (« Upwork replies », 30), etapes
--   (« Step checks », 60). Admin seulement.
-- - Les crons accueil-auto, reponses-upwork (et recrues-check, 0422) tournent
--   toutes les 15 minutes ; chaque fonction demande passage_du() : son réglage et son
--   dernier passage disent si elle agit. Un changement vaut au passage suivant.
-- - Un 429 d'Upwork : passage_429() double l'intervalle pour la journée (Paris)
--   et le signale dans Needs you (a_faire, type upwork).
-- - frequences_upwork_etat() : la carte Switches (intervalles réglés et
--   réellement utilisés) et la carte Health (appels Upwork du jour / 40 000).

insert into public.reglages (cle, valeur) values
  ('upwork_frequences', '{"accueil": 30, "reponses": 30, "etapes": 60}'::jsonb)
on conflict (cle) do nothing;

create or replace function public.reglage_admin_seulement(p_cle text)
returns boolean
language sql
immutable
as $$
  select p_cle = any (array['automation_pause', 'accueil_auto', 'relances_auto', 'lundi_message_auto', 'lundi_soir_auto',
                            'kill_auto', 'arret_auto', 'reponses_auto', 'rappels_reprise_le', 'faq_automatique',
                            'kill_message_auto', 'paie_api', 'paie_minimum_posts', 'paie_auto_heure', 'paie_kill6_des',
                            'paie_plafond_ligne', 'paie_plafond_jour', 'upwork_frequences'])
      or p_cle like '%texte%';
$$;

create table if not exists public.passages_auto (
  tache          text primary key,
  dernier_at     timestamptz,
  double_le      date,
  dernier_429_at timestamptz,
  maj_at         timestamptz not null default now()
);

comment on table public.passages_auto is
  'Prompt 21 (0421) : le dernier passage de chaque tâche Upwork (accueil, reponses, etapes) et l''intervalle doublé du jour après un 429.';

alter table public.passages_auto enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'passages_auto' and policyname = 'passages_auto lecture admin') then
    create policy "passages_auto lecture admin" on public.passages_auto for select to authenticated using ((select public.is_admin()));
  end if;
end $$;

/** L'intervalle réglé d'une tâche, en minutes (15, 30, 60 ou 120 ; sinon le défaut). */
create or replace function public.frequence_reglee(p_tache text)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select case when x.v in (15, 30, 60, 120) then x.v
              else case p_tache when 'etapes' then 60 else 30 end end
    from (select (select (r.valeur ->> p_tache)::int from public.reglages r where r.cle = 'upwork_frequences') as v) x;
$$;

/** L'intervalle réellement utilisé : doublé toute la journée (Paris) après un 429. */
create or replace function public.frequence_effective(p_tache text)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select public.frequence_reglee(p_tache)
         * case when exists (select 1 from public.passages_auto p
                              where p.tache = p_tache and p.double_le = (now() at time zone 'Europe/Paris')::date)
                then 2 else 1 end;
$$;

/**
 * La tâche doit-elle agir maintenant ? Oui si son dernier passage date d'au
 * moins son intervalle (2 minutes de marge pour le cron) ; le passage est
 * alors noté. Deux appels en même temps : un seul a « oui ». Service seulement.
 */
create or replace function public.passage_du(p_tache text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ok boolean;
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception 'réservé au service';
  end if;
  insert into public.passages_auto (tache) values (p_tache) on conflict (tache) do nothing;
  update public.passages_auto
     set dernier_at = now(), maj_at = now()
   where tache = p_tache
     and (dernier_at is null
          or dernier_at <= now() - make_interval(mins => public.frequence_effective(p_tache)) + interval '2 minutes')
  returning true into v_ok;
  return coalesce(v_ok, false);
end;
$$;

/**
 * Upwork a répondu 429 : l'intervalle de la tâche (toutes, si on ne sait pas
 * laquelle) est doublé pour la journée, et c'est signalé une fois par jour
 * dans Needs you. Service seulement.
 */
create or replace function public.passage_429(p_tache text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_jour date := (now() at time zone 'Europe/Paris')::date;
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception 'réservé au service';
  end if;
  insert into public.passages_auto (tache)
  select t from unnest(case when p_tache is null then array['accueil', 'reponses', 'etapes'] else array[p_tache] end) t
  on conflict (tache) do nothing;
  update public.passages_auto
     set double_le = v_jour, dernier_429_at = now(), maj_at = now()
   where p_tache is null or tache = p_tache;
  insert into public.a_faire (cle, type, gravite, titre, detail, lien)
  values ('upwork429:' || v_jour, 'upwork', 'issue', 'Upwork : trop de requêtes (429)',
          'Les passages Upwork tournent deux fois moins souvent jusqu''à ce soir minuit (Overview → Switches).', '/admin/auto')
  on conflict (cle) do update set maj_at = now(),
         detail = 'Les passages Upwork tournent deux fois moins souvent jusqu''à ce soir minuit (Overview → Switches). Dernier 429 : '
                  || to_char(now() at time zone 'Europe/Paris', 'HH24:MI');
end;
$$;

revoke all on function public.passage_du(text) from public, anon, authenticated;
revoke all on function public.passage_429(text) from public, anon, authenticated;

/** Les cartes Switches et Health d'Overview (admin, Head of Ops). */
create or replace function public.frequences_upwork_etat()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'réservé à l''admin et au Head of Ops';
  end if;
  return jsonb_build_object(
    'taches', (select jsonb_agg(jsonb_build_object(
                 'tache', t, 'reglee', public.frequence_reglee(t), 'effective', public.frequence_effective(t),
                 'dernier_at', (select p.dernier_at from public.passages_auto p where p.tache = t),
                 'dernier_429_at', (select p.dernier_429_at from public.passages_auto p where p.tache = t)) order by o)
                 from unnest(array['accueil', 'reponses', 'etapes']) with ordinality as x(t, o)),
    'appels_jour', (select count(*) from public.upwork_appels a
                     where a.at >= ((now() at time zone 'Europe/Paris')::date)::timestamp at time zone 'Europe/Paris'),
    'limite', 40000,
    'alerte', 30000);
end;
$$;

revoke all on function public.frequences_upwork_etat() from public, anon;
grant execute on function public.frequences_upwork_etat() to authenticated;

-- Accueil et réponses toutes les 15 minutes (commande inchangée : jamais de secret écrit
-- ici). recrues-check suit en 0422, une fois sa nouvelle version déployée.
do $$
declare
  v_nom text;
begin
  foreach v_nom in array array['accueil-auto', 'reponses-upwork'] loop
    if exists (select 1 from cron.job where jobname = v_nom) then
      perform cron.schedule(v_nom, '*/15 * * * *', (select command from cron.job where jobname = v_nom));
    else
      raise exception 'cron % introuvable', v_nom;
    end if;
  end loop;
end $$;

-- Needs you : un 429 d'Upwork est « Bloqué », type upwork_limite.
create or replace function public.needs_you()
returns table (
  cle          text,
  categorie    text,
  type         text,
  poster_id    uuid,
  nom          text,
  cohorte      date,
  hm           text,
  pays         text,
  vu           text,
  pense        text,
  confiance    numeric,
  urgence      text,
  rang         integer,
  cree_at      timestamptz,
  actions      text[],
  ref          text,
  lien         text,
  valeur       text,
  compteur     integer,
  contestation boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_lundi   date := date_trunc('week', (now() at time zone 'Europe/Paris'))::date;
  v_seuil   numeric := coalesce((select (rg.valeur ->> 'seuil')::numeric from public.reglages rg where rg.cle = 'reponses_reglages'), 0.8);
  v_semaine date := date_trunc('week', (now() at time zone 'Europe/Paris'))::date - 7;
  v_kill6   date := coalesce((select (rg.valeur #>> '{}')::date from public.reglages rg where rg.cle = 'paie_kill6_des'), date '2026-11-02');
begin
  if not (public.is_admin() or coalesce(auth.jwt() ->> 'role', '') = 'service_role') then
    raise exception 'needs_you : réservé à l''admin et au Head of Ops';
  end if;
  return query
  with items as (
    -- Pas pu répondre : messages reçus pas classés ; questions de paie. Pas sûr : classés sous le seuil.
    select 'reponse:' || r.id as cle,
           case when r.cas_ia is not null and r.statut = 'classe' and coalesce(r.confiance, 0) < v_seuil and r.liste = 'a_lire'
                then 'pas_sur' else 'pas_pu_repondre' end as categorie,
           case when r.liste = 'paie' then 'question_paie'
                when r.cas_ia is not null and r.statut = 'classe' and coalesce(r.confiance, 0) < v_seuil then 'reponse_peu_sure'
                else 'message_a_lire' end as type,
           r.poster_id, null::text as nom_secours,
           left(coalesce(r.texte, ''), 400) as vu,
           case when r.liste = 'paie' then 'Question de paie : l''OS a répondu d''attendre'
                when r.cas_ia is not null then format('Classé « %s » à %s %%', r.cas_ia, round(coalesce(r.confiance, 0) * 100))
                else 'Pas su classer' || coalesce(' : ' || r.erreur, '') end as pense,
           r.confiance,
           case when r.liste = 'paie' then 'paie' else 'rien' end as urgence,
           r.recu_at as cree_at,
           case when r.cas_ia is not null then array['valider', 'classer', 'ouvrir'] else array['classer', 'ouvrir'] end as actions,
           r.id::text as ref, '/admin/auto/received' as lien, r.cas_ia as valeur, 1 as compteur
      from public.posteur_reponses r
     where r.lu_at is null and r.corrige_at is null
       and ((r.statut = 'classe' and r.liste in ('a_lire', 'paie')) or r.statut = 'erreur')
    union all
    -- Pas pu répondre : questions que la FAQ ne couvre pas, une seule fois avec leur compteur.
    select 'faq:' || md5(lower(btrim(q.question))), 'pas_pu_repondre', 'question_faq',
           (array_agg(q.user_id order by q.created_at desc))[1], (array_agg(q.slack_nom order by q.created_at desc))[1],
           left(min(q.question), 400),
           coalesce('Réponse proposée : ' || left((array_agg(q.reponse order by q.created_at desc) filter (where q.reponse is not null))[1], 300),
                    'La FAQ ne couvre pas cette question'),
           null::numeric, 'rien', min(q.created_at),
           array['repondre', 'ignorer'],
           string_agg(q.id::text, ',' order by q.created_at), '/admin/auto/faq',
           (array_agg(q.reponse order by q.created_at desc) filter (where q.reponse is not null))[1],
           count(*)::int
      from public.chatbot_questions q
     where q.etat in ('a_traiter', 'a_valider', 'relance') and not coalesce(q.test, false)
     group by lower(btrim(q.question))
    union all
    -- To do et Issues (paie, Slack…) : bloqué ou à faire à la main.
    select 'afaire:' || a.id, case when a.type = 'slack' then 'a_la_main' else 'bloque' end,
           case when a.type = 'slack' then 'retirer_slack' when a.type = 'upwork' then 'upwork_limite'
                when a.gravite = 'issue' then 'paiement_urgent' else 'paiement' end,
           a.poster_id, null, a.titre, coalesce(a.detail, ''), null,
           case when a.type = 'paie' then 'paie' else 'rien' end, a.created_at,
           array['fait'], a.id::text, a.lien, null, 1
      from public.a_faire a
     where a.fait_at is null
    union all
    -- Bloqué : messages qui n'ont pas pu partir (Upwork, Slack), 7 derniers jours.
    select 'message:' || m.id, 'bloque', 'message_pas_parti', m.poster_id, null,
           left(m.texte, 300), 'Pas parti : ' || coalesce(m.upwork_erreur, m.slack_erreur, m.erreur, 'erreur'), null,
           case when m.type = 'kill' then 'kill' else 'rien' end, m.created_at,
           array['ignorer', 'ouvrir'], m.id::text, '/admin/auto/sent', null, 1
      from public.posteur_messages m
     where m.created_at > now() - interval '7 days'
       and (m.upwork_statut = 'erreur' or m.slack_statut in ('erreur', 'introuvable'))
    union all
    select 'nudge:' || n.id, 'bloque', 'message_pas_parti', n.poster_id, null,
           left(n.texte, 300), 'Pas parti : ' || n.slack_erreur, null, 'rien', n.envoye_at,
           array['ignorer', 'ouvrir'], n.id::text, '/admin/auto/sent', null, 1
      from public.nudges n
     where n.slack_erreur is not null and n.envoye_at > now() - interval '7 days' and n.resolu_at is null
    union all
    select 'repondu:' || r.id, 'bloque', 'message_pas_parti', r.poster_id, null,
           left(coalesce(r.reponse_texte, ''), 300), 'Réponse pas partie : ' || coalesce(r.erreur, 'erreur'), null, 'rien', r.recu_at,
           array['ignorer', 'ouvrir'], r.id::text, '/admin/auto/received', null, 1
      from public.posteur_reponses r
     where r.reponse_statut = 'erreur' and r.recu_at > now() - interval '7 days'
    union all
    -- Bloqué : une recrue sans aucun canal (ni contrat Upwork, ni Slack).
    select 'sans_canal:' || p.id, 'bloque', 'sans_canal', p.id, null,
           'Ni contrat Upwork relié, ni Slack', 'L''OS ne peut rien lui envoyer', null,
           'lundi', p.created_at, array['ouvrir', 'ignorer'], p.id::text, '/admin/auto/recruits', null, 1
      from public.profiles p
     where p.is_active and p.cohorte_lundi >= v_lundi
       and p.slack_user_id is null and p.upwork_contract_id is null
       and exists (select 1 from public.user_roles ur where ur.user_id = p.id and ur.role = 'poster')
    union all
    -- Bloqué : contrats à relier, doublons.
    select 'accueil:' || a.contrat_id, 'bloque', case when a.statut = 'doublon' then 'doublon' else 'contrat_a_relier' end,
           a.poster_id, nullif(btrim(concat_ws(' ', a.prenom, a.nom)), ''),
           format('Contrat %s%s', a.contrat_id, coalesce(' · ' || a.job_titre, '')),
           coalesce(a.raison, case when a.statut = 'doublon' then 'Doublon possible' else 'Pas relié à un posteur' end), null,
           case when a.cohorte_lundi >= v_lundi then 'lundi' else 'rien' end, a.created_at,
           array['ouvrir', 'ignorer'], a.contrat_id, '/admin/auto/recruits', null, 1
      from public.accueils a
     where a.statut in ('a_relier', 'doublon')
    union all
    -- Bloqué : tarif du contrat impossible à déduire (hors paie automatique).
    select 'tarif:' || t.contrat_id, 'bloque', 'tarif_manquant', p.id, null,
           coalesce(t.raison, 'Milestones illisibles'), 'Tarif du contrat à fixer (Payroll → Contract rate)', null,
           'paie', t.lu_at, array['ouvrir', 'ignorer'], t.contrat_id, '/admin/auto/payroll', null, 1
      from public.contrats_tarifs t
      join public.profiles p on p.upwork_contract_id = t.contrat_id and p.is_active
     where t.rythme = 'a_verifier' and t.force_tarif is null
    union all
    -- Bloqué : la connexion Upwork (erreur, ou bientôt périmée : 2 semaines sans appel).
    select 'upwork:' || u.compte, 'bloque', 'jeton_upwork', null, 'Upwork',
           coalesce(u.derniere_erreur, format('Dernier appel le %s', to_char(u.dernier_appel_at at time zone 'Europe/Paris', 'DD/MM HH24:MI'))),
           case when u.statut = 'erreur' then 'La connexion Upwork ne marche plus : la reconnecter' else 'La connexion expire bientôt' end, null,
           'paie', coalesce(u.alerte_at, now()), array['ouvrir'], u.compte, '/admin/reglages#upwork', null, 1
      from public.upwork_connexion u
     where u.statut = 'erreur' or u.dernier_appel_at < now() - interval '10 days'
    union all
    -- Bloqué : une tâche automatique en erreur (24 dernières heures).
    select 'cron:' || j.jobname, 'bloque', 'tache_erreur', null, j.jobname,
           left((array_agg(d.return_message order by d.start_time desc))[1], 300),
           format('%s échec(s) depuis 24 h', count(*)), null, 'rien', max(d.start_time),
           array['ignorer'], j.jobname, '/admin/auto/logs', null, count(*)::int
      from cron.job_run_details d
      join cron.job j on j.jobid = d.jobid
     where d.status = 'failed' and d.start_time > now() - interval '24 hours'
       -- ~8 000 passages par jour : on ne lit que les derniers (l'historique entier prend 3 s).
       and d.runid > (select max(x.runid) from cron.job_run_details x) - 20000
     group by j.jobname
    union all
    -- Pas sûr : lien TikTok introuvable (ne compte pas pour la règle des 6 tant qu'il n'est pas confirmé) ou pas encore résolu.
    select 'lien:' || pa.id, 'pas_sur', case when pa.resolution_statut = 'introuvable' then 'lien_introuvable' else 'lien_pas_resolu' end,
           c.poster_id, null,
           pa.publie_url || coalesce(' · ' || pa.resolution_detail, ''),
           case when pa.resolution_statut = 'introuvable' then 'Introuvable sur TikTok : faux lien, ou post supprimé ?'
                else 'Pas encore résolu après 24 h' end,
           -- Urgent seulement sous la règle des 6 (il ne compte pas tant qu'il n'est pas confirmé).
           null, case when pa.date_publication_prevue >= v_kill6 then 'paie' else 'rien' end, coalesce(pa.publie_at, pa.created_at),
           array['compter', 'corriger_lien', 'ignorer'], pa.id::text, pa.publie_url, pa.publie_url, 1
      from public.passages pa
      join public.comptes c on c.id = pa.compte_id
     where pa.publie_url is not null and pa.lien_confirme_at is null
       and pa.date_publication_prevue >= (now() at time zone 'Europe/Paris')::date - 7
       and (pa.resolution_statut = 'introuvable'
            or (pa.resolution_statut = 'a_resoudre' and coalesce(pa.publie_at, pa.created_at) < now() - interval '24 hours'))
    union all
    -- Pas sûr : compte TikTok introuvable au dernier relevé (handle faux ?).
    select 'compte:' || w.compte_id, 'pas_sur', case when c.warmup_started_at is not null then 'warmup_introuvable' else 'compte_introuvable' end,
           c.poster_id, null, '@' || w.handle,
           case when c.warmup_started_at is not null then 'Start warmup cliqué, mais compte introuvable au relevé du ' else 'Compte introuvable au relevé du ' end
             || to_char(w.releve_at at time zone 'Europe/Paris', 'DD/MM HH24:MI') || ' : handle faux ?',
           null, case when pr.cohorte_lundi >= v_lundi then 'lundi' else 'rien' end, w.releve_at,
           array['corriger_handle', 'ignorer'], w.compte_id::text, 'https://www.tiktok.com/@' || w.handle, w.handle, 1
      from (select distinct on (x.compte_id) x.* from public.ckd_warmup_releves x
             where x.releve_at > now() - interval '3 days' order by x.compte_id, x.releve_at desc) w
      join public.comptes c on c.id = w.compte_id and c.is_active
      join public.profiles pr on pr.id = c.poster_id and pr.is_active
     where w.existe = false
    union all
    -- Pas sûr : shadowban supposé.
    select 'shadowban:' || s.compte_id, 'pas_sur', 'shadowban', s.poster_id, null,
           '@' || coalesce(s.handle, '?') || ' · ' || s.type,
           'Shadowban supposé depuis le ' || to_char(s.depuis, 'DD/MM'), null, 'rien', s.calcule_at,
           array['ouvrir', 'ignorer'], s.compte_id::text, '/admin/auto/decisions', null, 1
      from public.ckd_shadowban s
     where s.recreation_at is null and s.nouveau_compte_id is null
    union all
    -- Pas sûr : un retour de l'agent de relecture dont aucun point n'est vu sur plus de la moitié des slides (3 derniers jours).
    select 'relecture:' || ra.id, 'pas_sur', 'relecture_doute', ra.poster_id, null,
           left(ra.brouillon, 400),
           'L''agent relève ' || (select string_agg(d->>'code', ', ') from jsonb_array_elements(ra.defauts) d where d->>'niveau' = 'remarque'),
           (select min((d->>'confiance')::numeric) from jsonb_array_elements(ra.defauts) d where d->>'niveau' = 'remarque'),
           'rien', ra.created_at, array['juste', 'faux'], ra.id::text, ra.publie_url, null, 1
      from public.relectures_auto ra
     where ra.statut = 'fait' and ra.brouillon is not null and ra.created_at > now() - interval '3 days'
       and coalesce(ra.envoi, '') not like 'rejeté%'
       and not exists (select 1 from public.relecture_avis av where av.relecture_id = ra.id)
       and exists (select 1 from jsonb_array_elements(ra.defauts) d where d->>'niveau' = 'remarque')
       and not exists (select 1 from jsonb_array_elements(ra.defauts) d
                        where d->>'niveau' = 'remarque' and (d->>'confiance')::numeric >= 0.6)
    union all
    -- Pas sûr : liaison contrat ↔ posteur sans nom qui correspond (ou à 2 lettres près).
    select 'liaison:' || l.poster_id, 'pas_sur', 'liaison_incertaine', l.poster_id, null,
           format('Contrat %s · freelance « %s »', l.contrat_id, coalesce(l.freelancer_nom, '?')),
           case when l.regle = 3 then 'Noms proches (2 lettres près) : même personne ?' else 'Les noms ne correspondent pas : même personne ?' end,
           case when l.regle = 3 then 0.6 else 0.3 end, 'paie', l.cree_at,
           array['confirmer', 'delier'], l.poster_id::text, '/admin/auto/recruits', null, 1
      from public.liaisons_a_verifier() l
     where l.regle is null or l.regle = 3
    union all
    -- Pas sûr : Kill sous les 6 posts, alors que des liens introuvables ne sont pas vérifiés.
    select 'kill_incomplet:' || ps.id, 'pas_sur', 'kill_incomplet', ps.poster_id, null,
           format('%s posts avec lien · %s lien(s) introuvable(s) pas vérifié(s)', ps.faits,
                  (select sum((d->>'douteux')::int) from jsonb_array_elements(ps.detail_comptes) d)),
           'Kill proposé sur des données incomplètes : vérifier les liens d''abord', null, 'kill', ps.calcule_at,
           array['ouvrir'], ps.id::text, '/admin/auto/payroll', null, 1
      from public.paie_semaines ps
     where ps.semaine = v_semaine and ps.action = 'kill' and ps.paye_at is null and not ps.exclu
       and exists (select 1 from jsonb_array_elements(ps.detail_comptes) d where coalesce((d->>'douteux')::int, 0) > 0)
    union all
    -- À faire à la main : remboursement à demander (arrêt complet).
    select 'remboursement:' || a.id, 'a_la_main', 'remboursement', a.poster_id, null,
           (select e->>'detail' from jsonb_array_elements(a.etapes) e where e->>'action' = 'remboursement' limit 1),
           'Remboursement à demander sur Upwork, puis le contrat à fermer', null, 'paie', a.created_at,
           array['fait', 'ouvrir'], a.id::text, '/admin/auto/payroll', null, 1
      from public.arrets a
     where exists (select 1 from jsonb_array_elements(a.etapes) e where e->>'action' = 'remboursement' and e->>'statut' = 'a_faire')
    union all
    -- À faire à la main : décisions du samedi pas validées (7 derniers jours).
    select 'samedi:' || cp.id, 'a_la_main', 'samedi_non_valide', cp.poster_id, null,
           format('%s · %s', cp.regle, coalesce(cp.action, '')), 'Décision du samedi pas encore validée', null, 'kill', cp.created_at,
           array['ouvrir'], cp.id::text, '/admin/auto/decisions', null, 1
      from public.ckd_propositions cp
     -- Seulement le samedi et le dimanche de la décision : ensuite, elle est dépassée.
     where cp.type = 'samedi' and cp.decision is null and cp.jour >= (now() at time zone 'Europe/Paris')::date - 1
  )
  select i.cle, i.categorie, i.type, i.poster_id,
         coalesce(nullif(btrim(concat_ws(' ', pr.prenom, pr.nom)), ''), i.nom_secours, pr.email),
         pr.cohorte_lundi, hm.prenom, (select a.pays from public.accueils a where a.poster_id = i.poster_id limit 1),
         i.vu, i.pense, i.confiance, i.urgence,
         case i.urgence when 'lundi' then 1 when 'paie' then 2 when 'kill' then 3 else 4 end,
         i.cree_at, i.actions, i.ref, i.lien, i.valeur, i.compteur,
         exists (select 1 from public.reviews rv where rv.poster_id = i.poster_id
                  and rv.contestee_at is not null and rv.contestation_traitee_at is null)
    from items i
    left join public.profiles pr on pr.id = i.poster_id
    left join public.profiles hm on hm.id = pr.manager_id
   where not exists (select 1 from public.needs_you_ignores ig where ig.cle = i.cle)
   order by 13, i.cree_at;
end;
$$;
