-- 0837 : les routes de contrôle du QG (22/11, Max). Lecture seule : aucune écriture, nulle part.
--   GET /api/qg/control/recrutement?cohorte=AAAA-MM-JJ → qg_recrutement(cohorte)
--   GET /api/qg/control/paie?semaine=AAAA-MM-JJ        → qg_paie(semaine)
--   GET /api/qg/control/autres                          → qg_autres()
-- Les chiffres viennent des fonctions de l'OS (cohorte_recrues, ruul_cohortes, paie_calculer_v3, auto_sante,
-- handles_introuvables, kills_controle) : une seule logique, la même que les pages admin. Ces fonctions sont
-- réservées à l'admin : qg_comme_admin() pose, pour la seule transaction en cours, l'identité d'un admin
-- (set_config local, rien n'est écrit). Tout est réservé au service (la fonction Edge `qg`). Additif.

create or replace function public.qg_comme_admin()
returns void language plpgsql security definer set search_path = public as $$
declare v uuid;
begin
  select user_id into v from public.user_roles where role = 'admin' order by user_id limit 1;
  if v is null then raise exception 'qg : aucun admin'; end if;
  perform set_config('request.jwt.claims', jsonb_build_object('role', 'authenticated', 'sub', v)::text, true);
  perform set_config('request.jwt.claim.sub', v::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
end;
$$;

-- ---------------------------------------------------------------------------------------------------------------
-- 1. Recrutement : l'entonnoir d'une cohorte (lundi de démarrage), Ruul (site) et Upwork.
-- ---------------------------------------------------------------------------------------------------------------
create or replace function public.qg_recrutement(p_cohorte date)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v jsonb;
begin
  if extract(isodow from p_cohorte) <> 1 then
    raise exception 'qg_recrutement : % n''est pas un lundi', p_cohorte using errcode = '22023';
  end if;
  perform public.qg_comme_admin();

  with
  qg_cr as materialized (select * from public.cohorte_recrues(array[p_cohorte])),
  qg_ruul as materialized (
    select x from jsonb_array_elements(public.ruul_cohortes()) x where (x->>'cohorte')::date = p_cohorte
  ),
  upw as (
    select a.contrat_id, a.poster_id, upper(a.pays) as pays, a.hm_id, a.debut_at,
           nullif(btrim(concat_ws(' ', a.prenom, a.nom)), '') as nom, a.email
      from public.accueils a
     where a.cohorte_lundi = p_cohorte and a.organisation_id = '2074065383597823773'
       and coalesce(a.classement, '') not in ('autre_activite', 'hm') and coalesce(a.statut, '') <> 'doublon'
  ),
  cr_upw as (
    select cr.* from qg_cr cr join public.profiles p on p.id = cr.poster_id where coalesce(p.canal_paie, 'upwork') <> 'ruul'
  ),
  recrues as (
    select 'upwork'::text as canal,
           coalesce(cr.poster_id, u.poster_id)::text as poster_id, u.contrat_id, null::text as site_id,
           coalesce(cr.nom, u.nom) as nom, upper(coalesce(cr.pays, u.pays)) as pays, coalesce(cr.hm_id, u.hm_id) as hm_id,
           coalesce(cr.is_active, true) as actif, false as stop,
           jsonb_build_object(
             'offre_acceptee', to_jsonb(coalesce(u.debut_at, cr.offre_at)),
             'profil_os', case when coalesce(cr.poster_id, u.poster_id) is not null then 'true'::jsonb end,
             'connexion', to_jsonb(cr.premiere_connexion_at),
             'slack', case when cr.slack_lie then coalesce(to_jsonb(cr.slack_lie_at), 'true'::jsonb) end,
             'compte_tiktok', case when cr.tiktok_existe then coalesce(to_jsonb(cr.tiktok_vu_at), 'true'::jsonb) end,
             'warmup', to_jsonb(cr.warmup_started_at),
             'abonnements_5', case when cr.abonnements >= 5 then to_jsonb(cr.abonnements) end,
             'premier_post', case when exists (select 1 from jsonb_array_elements(coalesce(cr.semaine1, '[]'::jsonb)) s
                                               where (s->>'publies')::int > 0) then 'true'::jsonb end) as etapes
      from upw u full join cr_upw cr on cr.poster_id = u.poster_id
    union all
    select 'ruul', r.x->>'poster_id', null, r.x->>'site_id',
           coalesce(r.x->>'nom', cr.nom), upper(coalesce(r.x->>'pays', cr.pays)), coalesce(c.hm_id, cr.hm_id),
           coalesce(cr.is_active, true), coalesce((r.x->>'stop')::boolean, false),
           jsonb_build_object(
             'candidature', r.x #> '{etapes,candidature}',
             'acceptee', r.x #> '{etapes,acceptee}',
             'signee', r.x #> '{etapes,signee}',
             'profil_os', case when r.x->>'poster_id' is not null then 'true'::jsonb end,
             'ajoute_ruul', r.x #> '{etapes,ajoute_ruul}',
             'pret_ruul', r.x #> '{etapes,pret}',
             'connexion', coalesce(to_jsonb(cr.premiere_connexion_at), r.x #> '{etapes,os}'),
             'slack', coalesce(r.x #> '{etapes,slack}', case when cr.slack_lie then 'true'::jsonb end),
             'compte_tiktok', case when cr.tiktok_existe then coalesce(to_jsonb(cr.tiktok_vu_at), 'true'::jsonb) end,
             'warmup', coalesce(r.x #> '{etapes,warmup}', to_jsonb(cr.warmup_started_at)),
             'abonnements_5', case when cr.abonnements >= 5 then to_jsonb(cr.abonnements) end,
             'premier_post', r.x #> '{etapes,premier_post}',
             'premiere_paie', r.x #> '{etapes,premiere_paie}')
      from qg_ruul r
      left join public.ruul_candidatures c on c.site_id::text = r.x->>'site_id'
      left join qg_cr cr on cr.poster_id::text = r.x->>'poster_id'
  ),
  ordre(canal, n, etape) as (values
    ('upwork', 1, 'offre_acceptee'), ('upwork', 2, 'profil_os'), ('upwork', 3, 'connexion'), ('upwork', 4, 'slack'),
    ('upwork', 5, 'compte_tiktok'), ('upwork', 6, 'warmup'), ('upwork', 7, 'abonnements_5'), ('upwork', 8, 'premier_post'),
    ('ruul', 1, 'candidature'), ('ruul', 2, 'acceptee'), ('ruul', 3, 'signee'), ('ruul', 4, 'profil_os'),
    ('ruul', 5, 'ajoute_ruul'), ('ruul', 6, 'pret_ruul'), ('ruul', 7, 'connexion'), ('ruul', 8, 'slack'),
    ('ruul', 9, 'compte_tiktok'), ('ruul', 10, 'warmup'), ('ruul', 11, 'abonnements_5'), ('ruul', 12, 'premier_post'),
    ('ruul', 13, 'premiere_paie')),
  r2 as (
    select r.*, coalesce(nullif(btrim(concat_ws(' ', h.prenom, h.nom)), ''), 'sans HM') as hm,
           (select o.etape from ordre o
             where o.canal = r.canal and coalesce(r.etapes -> o.etape, 'null'::jsonb) = 'null'::jsonb
             order by o.n limit 1) as bloque_a
      from recrues r left join public.profiles h on h.id = r.hm_id
  ),
  faits as (
    select r.canal, r.pays, r.hm, o.n, o.etape,
           (coalesce(r.etapes -> o.etape, 'null'::jsonb) <> 'null'::jsonb) as fait
      from r2 r join ordre o on o.canal = r.canal
  ),
  entonnoir as (
    select canal, jsonb_agg(jsonb_build_object('etape', etape, 'n', n_fait) order by n) as j
      from (select canal, n, etape, count(*) filter (where fait) as n_fait from faits group by 1, 2, 3) x group by canal
  ),
  par_pays as (
    select canal, jsonb_agg(jsonb_build_object('pays', pays, 'recrues', tot, 'etapes', etapes) order by pays) as j
      from (select canal, pays, max(tot) as tot, jsonb_object_agg(etape, n_fait) as etapes
              from (select canal, coalesce(pays, '?') as pays, etape, count(*) over (partition by canal, coalesce(pays, '?'), etape) as tot,
                           count(*) filter (where fait) over (partition by canal, coalesce(pays, '?'), etape) as n_fait
                      from faits) y group by canal, pays) z group by canal
  ),
  par_hm as (
    select canal, jsonb_agg(jsonb_build_object('hm', hm, 'recrues', tot, 'etapes', etapes) order by hm) as j
      from (select canal, hm, max(tot) as tot, jsonb_object_agg(etape, n_fait) as etapes
              from (select canal, hm, etape, count(*) over (partition by canal, hm, etape) as tot,
                           count(*) filter (where fait) over (partition by canal, hm, etape) as n_fait
                      from faits) y group by canal, hm) z group by canal
  ),
  bloques as (
    select canal, jsonb_object_agg(bloque_a, liste) as j
      from (select canal, bloque_a,
                   jsonb_agg(jsonb_build_object('nom', nom, 'pays', pays, 'hm', hm, 'poster_id', poster_id,
                                                'contrat_id', contrat_id, 'site_id', site_id, 'etapes', etapes) order by nom) as liste
              from r2 where actif and not stop and bloque_a is not null group by canal, bloque_a) x group by canal
  ),
  arretes as (
    select jsonb_agg(jsonb_build_object('canal', canal, 'nom', nom, 'pays', pays, 'hm', hm, 'poster_id', poster_id,
                                        'raison', case when stop then 'stop' else 'inactif' end, 'derniere_etape_manquante', bloque_a)
                     order by canal, nom) as j
      from r2 where not actif or stop
  ),
  ids as (select distinct poster_id::uuid as id from r2 where poster_id is not null),
  adresses as (
    select distinct lower(e) as e from (
      select p.email as e from public.profiles p join ids on ids.id = p.id
      union all select p.ruul_email from public.profiles p join ids on ids.id = p.id
      union all select p.email_perso from public.profiles p join ids on ids.id = p.id
      union all select c.email from public.ruul_candidatures c join qg_ruul r on r.x->>'site_id' = c.site_id::text
      union all select c.ruul_email from public.ruul_candidatures c join qg_ruul r on r.x->>'site_id' = c.site_id::text
      union all select u.email from upw u) a where e is not null and e <> ''
  ),
  mails as (
    select m.* from public.emails_envois m
     where lower(m.destinataire) in (select e from adresses) and m.cree_at >= p_cohorte - 28
  )
  select jsonb_build_object(
    'cohorte', p_cohorte,
    'objectifs', (select coalesce(jsonb_agg(jsonb_build_object('pays', o.pays, 'nombre', o.recrues_nombre) order by o.pays), '[]'::jsonb)
                    from public.pays_objectifs o where o.recrues_lundi = p_cohorte),
    'totaux', (select jsonb_object_agg(canal, n) from (select canal, count(*) as n from r2 group by 1) t),
    'etapes', (select jsonb_object_agg(canal, etapes) from (select canal, jsonb_agg(etape order by n) as etapes from ordre group by 1) t),
    'entonnoir', coalesce((select jsonb_object_agg(canal, j) from entonnoir), '{}'::jsonb),
    'par_pays', coalesce((select jsonb_object_agg(canal, j) from par_pays), '{}'::jsonb),
    'par_hm', coalesce((select jsonb_object_agg(canal, j) from par_hm), '{}'::jsonb),
    'bloques', coalesce((select jsonb_object_agg(canal, j) from bloques), '{}'::jsonb),
    'arretes', coalesce((select j from arretes), '[]'::jsonb),
    'sante_canaux', jsonb_build_object(
      'emails', (select jsonb_build_object(
                   'envoyes', count(*),
                   'livres', count(*) filter (where m.livre_at is not null or m.statut = 'delivre'),
                   'refuses', count(*) filter (where m.statut = 'refuse'),
                   'ouverts', count(*) filter (where m.dernier_evenement in ('opened', 'clicks', 'loadedByProxy')),
                   'en_attente', count(*) filter (where m.statut not in ('delivre', 'refuse')),
                   'refus_detail', coalesce(jsonb_agg(jsonb_build_object('destinataire', m.destinataire, 'objet', m.objet,
                                                                          'evenement', m.dernier_evenement, 'erreur', m.erreur, 'at', m.cree_at)
                                                       order by m.cree_at desc) filter (where m.statut = 'refuse'), '[]'::jsonb))
                   from mails m),
      'whatsapp', jsonb_build_object('disponible', false, 'note', 'L''OS n''envoie rien par WhatsApp : aucun canal ni journal.'),
      'relances', jsonb_build_object(
        'upwork_slack', (select coalesce(jsonb_object_agg(k, n), '{}'::jsonb) from (
                           select rp.statut || coalesce('/' || rp.canal, '') as k, count(*) as n
                             from public.relances_prevues rp join ids on ids.id = rp.poster_id group by 1) t),
        'ruul_emails', (select jsonb_build_object('envoyees', count(*), 'en_erreur', count(*) filter (where re.erreur is not null))
                          from public.ruul_email_relances re join ids on ids.id = re.poster_id)),
      'nudges', jsonb_build_object(
        'os', (select jsonb_build_object('envoyes', count(*), 'reussis', count(*) filter (where nu.erreur_canal is null),
                                         'en_echec', count(*) filter (where nu.erreur_canal is not null),
                                         'echecs', coalesce(jsonb_agg(jsonb_build_object('poster_id', nu.poster_id, 'type', nu.type,
                                                                                         'erreur', nu.erreur_canal, 'at', nu.envoye_at)
                                                                      order by nu.envoye_at desc) filter (where nu.erreur_canal is not null), '[]'::jsonb))
                 from public.nudges nu join ids on ids.id = nu.poster_id
                where nu.envoye_at >= p_cohorte - 28),
        'ruul', (select jsonb_build_object('envoyes', count(*), 'reussis', count(*) filter (where rn.erreur is null),
                                           'en_echec', count(*) filter (where rn.erreur is not null))
                   from public.ruul_nudges rn join ids on ids.id = rn.poster_id))),
    'genere_at', now()
  ) into v;
  return v;
end;
$$;

-- ---------------------------------------------------------------------------------------------------------------
-- 2. Paie d'une semaine travaillée (lundi → dimanche, payée le lundi suivant) : attendu, payé, écart ; plaintes.
-- ---------------------------------------------------------------------------------------------------------------
create or replace function public.qg_paie(p_semaine date)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v jsonb; v_paye_le date := p_semaine + 7;
begin
  if extract(isodow from p_semaine) <> 1 then
    raise exception 'qg_paie : % n''est pas un lundi', p_semaine using errcode = '22023';
  end if;
  perform public.qg_comme_admin();

  with
  qg_calc as materialized (select * from public.paie_calculer_v3(p_semaine)),
  stocke as (select * from public.paie_semaines where semaine = p_semaine),
  api as (
    select poster_id,
           sum(coalesce(montant_approuve, 0)) filter (where statut in ('paye', 'deja_payee')) as paye,
           jsonb_agg(jsonb_build_object('statut', statut, 'contrat_id', contrat_id, 'reserve', montant_reserve,
                                        'approuve', montant_approuve, 'finance', montant_finance, 'jalon_approuve', jalon_approuve,
                                        'jalon_finance', jalon_finance, 'erreur', erreur, 'maj_at', updated_at) order by created_at) as lignes
      from public.paie_paiements_api where semaine = p_semaine group by poster_id
  ),
  jalons as (
    select p.id as poster_id, jsonb_agg(jsonb_build_object('jalon_id', j.jalon_id, 'nom', j.nom, 'contrat_id', j.contrat_id, 'raison', j.raison)) as j
      from public.paie_jalons_semaine j join public.profiles p on p.upwork_contract_id = j.contrat_id
     where j.semaine = p_semaine and j.annule_at is null group by p.id
  ),
  ruul as (
    select poster_id,
           sum(montant + coalesce(bonus, 0)) filter (where statut = 'paye') as paye,
           sum(montant + coalesce(bonus, 0)) filter (where statut <> 'annule') as decide,
           jsonb_agg(jsonb_build_object('statut', statut, 'montant', montant, 'bonus', bonus, 'ruul_statut', ruul_statut,
                                        'ruul_echec', ruul_echec, 'paye_at', paye_at, 'rattrapage', rattrapage, 'pourquoi', pourquoi)
                     order by created_at) as lignes
      from public.ruul_paiements where semaine = p_semaine group by poster_id
  ),
  bon as (
    select poster_id,
           sum(montant) filter (where retire_at is null and coalesce(statut, '') <> 'retire') as attendu,
           sum(montant) filter (where statut = 'paye') as paye,
           sum(montant) filter (where type = 'comment_master' and retire_at is null and coalesce(statut, '') <> 'retire') as comment_master,
           jsonb_agg(jsonb_build_object('type', type, 'montant', montant, 'statut', statut, 'detail', detail)) as lignes
      from public.bonus where lundi_bonus = v_paye_le group by poster_id
  ),
  panne as (
    select poster_id, jsonb_agg(jsonb_build_object('jour', jour, 'raison', raison) order by jour) as j, count(*) as n
      from public.jours_credites where jour between p_semaine and p_semaine + 6 group by poster_id
  ),
  absences as (
    select poster_id, jsonb_agg(jsonb_build_object('debut', debut, 'jours', jours, 'fin', fin, 'raison', raison, 'source', source)) as j
      from public.absences_declarees
     where debut <= p_semaine + 6 and coalesce(fin, debut + greatest(coalesce(jours, 1) - 1, 0)) >= p_semaine
     group by poster_id
  ),
  kills as (
    select poster_id, jsonb_agg(jsonb_build_object('source', source, 'statut', statut, 'motif', motif, 'semaine', semaine, 'le', created_at)) as j
      from public.arrets
     where annule_at is null and (semaine = p_semaine or created_at::date between p_semaine and p_semaine + 8)
     group by poster_id
  ),
  sans_paie as (
    select poster_id, raison, montant from public.paie_kills_sans_paie where semaine = p_semaine and annule_at is null
  ),
  posteurs as (
    select poster_id from qg_calc union select poster_id from stocke union select poster_id from api
    union select poster_id from ruul union select poster_id from bon
  ),
  lignes as (
    select pr.id as poster_id,
           coalesce(nullif(btrim(concat_ws(' ', pr.prenom, pr.nom)), ''), pr.email) as nom,
           coalesce(pr.canal_paie, 'upwork') as canal,
           public.paie_pays_posteur(pr.id) as pays,
           c.prevus, c.faits, c.tarif, c.nb_comptes, c.comptes_payes, c.retenue, c.montant as montant_regle, c.statut as statut_regle,
           c.raison as raison_regle, c.action,
           case when pr.canal_paie = 'ruul' then r.decide else coalesce(s.montant_corrige, s.montant) end as montant_decide,
           s.exclu, s.exclu_raison, s.raison_correction,
           coalesce(b.attendu, 0) as bonus_attendu, coalesce(b.comment_master, 0) as comment_master, b.lignes as bonus_lignes,
           coalesce(b.paye, 0) as bonus_paye,
           pa.j as jours_panne, ab.j as absences, k.j as kills, sp.raison as sans_paie_raison,
           a.paye as paye_upwork, a.lignes as api_lignes, jl.j as jalons,
           r.paye as paye_ruul, r.lignes as ruul_lignes
      from posteurs x
      join public.profiles pr on pr.id = x.poster_id
      left join qg_calc c on c.poster_id = x.poster_id
      left join stocke s on s.poster_id = x.poster_id
      left join api a on a.poster_id = x.poster_id
      left join jalons jl on jl.poster_id = x.poster_id
      left join ruul r on r.poster_id = x.poster_id
      left join bon b on b.poster_id = x.poster_id
      left join panne pa on pa.poster_id = x.poster_id
      left join absences ab on ab.poster_id = x.poster_id
      left join kills k on k.poster_id = x.poster_id
      left join sans_paie sp on sp.poster_id = x.poster_id
  ),
  calc as (
    select l.*,
           case when l.sans_paie_raison is not null then 0
                else coalesce(l.montant_decide, l.montant_regle, 0) end + l.bonus_attendu as attendu_total,
           case when l.canal = 'ruul' then coalesce(l.paye_ruul, 0)
                else coalesce(l.paye_upwork, 0) + l.bonus_paye end as paye_total
      from lignes l
  ),
  plaintes as (
    select d.id, d.poster_id, d.source, d.statut, d.niveau, d.categorie, d.cree_at, left(d.texte, 400) as texte,
           coalesce(nullif(btrim(concat_ws(' ', p.prenom, p.nom)), ''), d.slack_user, d.email_de) as nom
      from public.support_demandes d left join public.profiles p on p.id = d.poster_id
     where d.cree_at >= now() - interval '7 days'
       and (d.categorie in ('paie', 'paiement')
            or (d.categorie in ('ruul', 'upwork', 'autre', 'statut')
                and d.texte ~* '(pay|paid|payment|salary|money|milestone|\$|usd|bonus|invoice|fee)'))
  )
  select jsonb_build_object(
    'semaine', p_semaine, 'paye_le', v_paye_le, 'devise', 'USD',
    'posteurs', coalesce((select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
        'poster_id', c.poster_id, 'nom', c.nom, 'canal', c.canal, 'pays', c.pays,
        'attendu', jsonb_build_object(
          'posts_prevus', c.prevus, 'posts_faits', c.faits, 'tarif', c.tarif, 'comptes', c.nb_comptes, 'comptes_payes', c.comptes_payes,
          'doublement', coalesce(c.comptes_payes, 0) > 1, 'retenue', c.retenue,
          'montant_regle', c.montant_regle, 'statut_regle', c.statut_regle, 'raison_regle', c.raison_regle, 'action', c.action,
          'montant_decide', c.montant_decide, 'exclu', c.exclu, 'exclu_raison', c.exclu_raison, 'correction', c.raison_correction,
          'bonus', c.bonus_attendu, 'comment_master', c.comment_master, 'bonus_detail', c.bonus_lignes,
          'jours_panne', c.jours_panne, 'absences', c.absences, 'kill', c.kills, 'kill_sans_paie', c.sans_paie_raison,
          'total', c.attendu_total),
        'paye', jsonb_build_object(
          'total', c.paye_total, 'upwork_paiements', c.api_lignes, 'upwork_jalons', c.jalons, 'bonus_payes', c.bonus_paye,
          'ruul_lignes', c.ruul_lignes),
        'ecart', c.paye_total - c.attendu_total)) order by c.nom) from calc c), '[]'::jsonb),
    'totaux', (select jsonb_build_object('posteurs', count(*), 'attendu', sum(attendu_total), 'paye', sum(paye_total),
                                         'ecart', sum(paye_total - attendu_total),
                                         'avec_ecart', count(*) filter (where paye_total <> attendu_total)) from calc),
    'plaintes_7j', coalesce((select jsonb_agg(jsonb_build_object(
        'id', pl.id, 'poster_id', pl.poster_id, 'nom', pl.nom, 'source', pl.source, 'statut', pl.statut, 'niveau', pl.niveau,
        'categorie', pl.categorie, 'le', pl.cree_at, 'texte', pl.texte,
        'paie_semaine', (select jsonb_build_object('attendu', c.attendu_total, 'paye', c.paye_total, 'ecart', c.paye_total - c.attendu_total)
                           from calc c where c.poster_id = pl.poster_id))
        order by pl.cree_at desc) from plaintes pl), '[]'::jsonb),
    'genere_at', now()
  ) into v;
  return v;
end;
$$;

-- ---------------------------------------------------------------------------------------------------------------
-- 3. Le reste : kills non finis, incidents et tickets, support en retard, bots et crons, posts du jour, comptes.
-- ---------------------------------------------------------------------------------------------------------------
create or replace function public.qg_autres()
returns jsonb language plpgsql security definer set search_path = public as $$
declare v jsonb; v_jour date := (now() at time zone 'Europe/Paris')::date;
begin
  perform public.qg_comme_admin();
  select jsonb_build_object(
    'jour', v_jour,
    'kills_non_finis', jsonb_build_object(
      'arrets', coalesce((select jsonb_agg(jsonb_build_object('id', a.id, 'poster_id', a.poster_id, 'source', a.source, 'statut', a.statut,
                                                              'erreur', a.erreur, 'etapes', a.etapes, 'le', a.created_at) order by a.created_at)
                            from public.arrets a where a.annule_at is null and a.statut <> 'fait'), '[]'::jsonb),
      'kills_auto', coalesce((select jsonb_agg(to_jsonb(k) order by k.detecte_at)
                                from public.kills_auto k where k.annule_at is null and k.parti_at is null), '[]'::jsonb),
      'controle', coalesce((select jsonb_agg(to_jsonb(k)) from public.kills_controle() k), '[]'::jsonb)),
    'incidents', coalesce((select jsonb_agg(jsonb_build_object('id', i.id, 'titre', i.titre, 'categorie', i.categorie, 'jour', i.jour,
                                                               'posteurs', coalesce(array_length(i.posteurs, 1), 0), 'ticket_at', i.ticket_at,
                                                               'cree_at', i.cree_at) order by i.cree_at)
                             from public.support_incidents i where i.statut = 'ouvert'), '[]'::jsonb),
    'tickets_ouverts', coalesce((select jsonb_agg(jsonb_build_object('id', d.id, 'poster_id', d.poster_id, 'categorie', d.categorie,
                                                                     'ticket_at', d.ticket_at, 'statut', d.statut, 'texte', left(d.texte, 200))
                                                  order by d.ticket_at)
                                   from public.support_demandes d
                                  where d.ticket_at is not null and d.ticket_regle_at is null and d.statut <> 'resolu'), '[]'::jsonb),
    'support_en_retard', jsonb_build_object(
      'plus_de_24h', (select count(*) from public.support_demandes d where d.statut = 'ouvert' and d.cree_at < now() - interval '24 hours'),
      'plus_de_48h', (select count(*) from public.support_demandes d where d.statut = 'ouvert' and d.cree_at < now() - interval '48 hours'),
      'par_niveau', (select coalesce(jsonb_object_agg(niveau, n), '{}'::jsonb) from (
                       select coalesce(d.niveau, '-') as niveau, count(*) as n from public.support_demandes d
                        where d.statut = 'ouvert' and d.cree_at < now() - interval '24 hours' group by 1) t),
      'plus_anciens', coalesce((select jsonb_agg(x) from (
                         select jsonb_build_object('id', d.id, 'poster_id', d.poster_id, 'source', d.source, 'niveau', d.niveau,
                                                   'categorie', d.categorie, 'le', d.cree_at, 'texte', left(d.texte, 200)) as x
                           from public.support_demandes d where d.statut = 'ouvert' and d.cree_at < now() - interval '24 hours'
                          order by d.cree_at limit 30) t), '[]'::jsonb)),
    'bots', public.auto_sante(),
    -- cron.job_run_details n'a d'index que sur runid (croissant) : seuls les 100 000 derniers passages sont lus.
    'crons', (with recents as materialized (
                select r.jobid, r.status, r.start_time, r.return_message from cron.job_run_details r
                 where r.runid > (select max(runid) from cron.job_run_details) - 100000)
              select jsonb_build_object(
      'actifs', (select count(*) from cron.job where active),
      'en_echec_24h', coalesce((select jsonb_agg(jsonb_build_object('job', j.jobname, 'echecs', t.n, 'dernier', t.dernier, 'message', t.msg) order by j.jobname)
                                  from (select r.jobid, count(*) as n, max(r.start_time) as dernier,
                                               (array_agg(left(r.return_message, 200) order by r.start_time desc))[1] as msg
                                          from recents r
                                         where r.start_time > now() - interval '24 hours' and r.status = 'failed' group by r.jobid) t
                                  join cron.job j on j.jobid = t.jobid), '[]'::jsonb),
      'derniers_passages', coalesce((select jsonb_agg(jsonb_build_object('job', j.jobname, 'planning', j.schedule, 'dernier', d.start_time,
                                                                         'statut', d.status) order by j.jobname)
                                      from cron.job j
                                      left join (select distinct on (r.jobid) r.jobid, r.start_time, r.status
                                                   from recents r order by r.jobid, r.start_time desc) d on d.jobid = j.jobid
                                     where j.active), '[]'::jsonb))),
    'posts_du_jour', jsonb_build_object(
      'passages', (select coalesce(jsonb_object_agg(statut, n), '{}'::jsonb) from (
                     select p.statut::text as statut, count(*) as n from public.passages p
                      where p.date_publication_prevue = v_jour group by 1) t),
      -- Un compte actif qui avait des posts prévus dans les 7 derniers jours et aucun aujourd'hui (création ratée).
      'comptes_actifs_sans_post_prevu', coalesce((select jsonb_agg(jsonb_build_object('compte_id', c.id, 'handle', c.handle_tiktok,
                                                                                      'poster_id', c.poster_id) order by c.handle_tiktok)
                                                    from public.comptes c join public.profiles pr on pr.id = c.poster_id and pr.is_active
                                                   where c.is_active
                                                     and exists (select 1 from public.passages p where p.compte_id = c.id
                                                                    and p.date_publication_prevue between v_jour - 7 and v_jour - 1)
                                                     and not exists (select 1 from public.passages p
                                                                      where p.compte_id = c.id and p.date_publication_prevue = v_jour)), '[]'::jsonb)),
    'comptes_introuvables', coalesce((select jsonb_agg(to_jsonb(h)) from public.handles_introuvables() h), '[]'::jsonb),
    'shadowban_probable', coalesce((select jsonb_agg(jsonb_build_object('compte_id', s.compte_id, 'handle', s.handle, 'poster_id', s.poster_id,
                                                                        'type', s.type, 'depuis', s.depuis, 'pays', s.pays, 'application', s.application)
                                                     order by s.depuis)
                                      from public.ckd_shadowban s where s.recreation_at is null), '[]'::jsonb),
    'genere_at', now()
  ) into v;
  return v;
end;
$$;

revoke execute on function public.qg_comme_admin() from public, anon, authenticated;
revoke execute on function public.qg_recrutement(date) from public, anon, authenticated;
revoke execute on function public.qg_paie(date) from public, anon, authenticated;
revoke execute on function public.qg_autres() from public, anon, authenticated;
grant execute on function public.qg_comme_admin() to service_role;
grant execute on function public.qg_recrutement(date) to service_role;
grant execute on function public.qg_paie(date) to service_role;
grant execute on function public.qg_autres() to service_role;
