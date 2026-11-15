-- 0555 : les 12 règles de cohérence entre Problèmes, Weekly decisions, les
-- relances, les posts, la paie et Upwork, vérifiées toutes les heures.
--
-- coherence_violations() : une ligne par violation (règle, posteur, compte,
--   contrat, détail, correctif, sûr). Lecture seule.
-- coherence_controle() (cron horaire, :41) :
--   * garde le résultat (coherence_controles + coherence_violations_relevees) ;
--   * applique ce qui est sûr : une relance prévue pour un posteur tué, en
--     STOP ou reporté passe « bloque » ; un nudge du jeudi pas encore envoyé à
--     un posteur tué passe « rien » ;
--   * le reste : UNE carte « ⚠️ Incohérence » par règle en défaut (⚡ Urgent),
--     avec les exemples et le correctif ; fermée toute seule quand la règle
--     repasse au vert.
-- coherence_resume() (admin) : le bandeau « Cohérence : ✅ 12/12 » et les
--   compteurs par groupe (Onboarding / Nouveaux actifs / Actifs).
--
-- Additif : 2 tables, 3 fonctions, un cron. Seules des relances prévues et
-- des nudges non envoyés sont modifiés (jamais un posteur, un post, un
-- paiement ni un contrat).

create table if not exists public.coherence_controles (
  id uuid primary key default gen_random_uuid(),
  at timestamptz not null default now(),
  par_regle jsonb not null default '{}'::jsonb,
  corriges integer not null default 0
);
alter table public.coherence_controles enable row level security;
revoke all on public.coherence_controles from anon, authenticated;

create table if not exists public.coherence_violations_relevees (
  id uuid primary key default gen_random_uuid(),
  controle_id uuid not null,
  regle integer not null,
  poster_id uuid,
  compte_id uuid,
  contrat_id text,
  detail text,
  correctif text,
  sur boolean not null default false,
  corrige boolean not null default false
);
create index if not exists coherence_violations_relevees_controle on public.coherence_violations_relevees (controle_id);
alter table public.coherence_violations_relevees enable row level security;
revoke all on public.coherence_violations_relevees from anon, authenticated;

create or replace function public.coherence_violations()
returns table(regle integer, poster_id uuid, compte_id uuid, contrat_id text, detail text, correctif text, sur boolean)
language plpgsql
stable
security definer
set search_path = public
as $fn$
#variable_conflict use_column
begin
  -- Règle 1 : tué ou kill prévu → aucune relance, aucun post après le kill, pas dans le financement du lundi.
  return query
  with auj as (select (now() at time zone 'Europe/Paris')::date d), lun as (select d-(extract(isodow from d)::int-1) l from auj),
  k as (select a.poster_id, min((a.created_at at time zone 'Europe/Paris')::date) jour, 'tué'::text etat from arrets a where a.annule_at is null group by 1
   union select pr.id, null, 'tué' from profiles pr join user_roles ur on ur.user_id=pr.id and ur.role='poster' where not pr.is_active and not exists(select 1 from arrets a where a.poster_id=pr.id and a.annule_at is null)
   union select c.poster_id, min(sb.lundi+5), 'kill_prevu' from samedi_brouillons sb join comptes c on c.id=sb.compte_id, lun where sb.lundi>=lun.l and sb.choix in('kill','kill_np') group by 1
   union select p.poster_id, min(p.kill_samedi_lundi+5), 'kill_prevu' from problemes p where p.statut='ouvert' and p.kill_samedi_lundi is not null and p.poster_id is not null group by 1),
  t as (select k.poster_id, min(k.jour) jour, min(k.etat) etat from k group by 1)
  select 1, t.poster_id, null::uuid, null::text, 'Posteur '||t.etat||' avec une relance prévue ('||rp.type||', '||rp.periode||')', 'Passer la relance en « bloque » (raison : tué)', true
   from t join relances_prevues rp on rp.poster_id=t.poster_id and rp.statut='prevu'
  union all select 1, t.poster_id, null, null, 'Posteur '||t.etat||' avec un nudge validé non envoyé', 'Annuler le nudge (décision = rien)', true
   from t join ckd_propositions cp on cp.poster_id=t.poster_id and cp.action='nudge' and cp.decision='nudge' and cp.envoye_at is null
  union all select 1, t.poster_id, ps.compte_id, null, 'Posteur '||t.etat||' ('||coalesce(t.jour::text,'?')||') : '||count(*)||' post(s) assigné(s) après, jusqu''au '||max(ps.date_publication_prevue), 'Retirer les posts non publiés après le kill', false
   from t join comptes c on c.poster_id=t.poster_id join passages ps on ps.compte_id=c.id
   where ps.publie_url is null and ps.date_publication_prevue>coalesce(t.jour,(select d from auj)) group by t.poster_id, ps.compte_id, t.etat, t.jour
  union all select 1, t.poster_id, null, f.contrat_id, 'Posteur '||t.etat||' dans le financement du lundi '||(f.semaine+7)||' ('||f.montant||' $)', 'Retirer la ligne du financement', false
   from t join paie_a_financer f on f.poster_id=t.poster_id and f.retire_at is null
   where f.semaine+7>coalesce(t.jour,'2000-01-01') and (f.finance_at is null or f.semaine+7>=(select l from lun));

  -- Règle 2 : reporté → aucun message de démarrage avant la nouvelle date.
  return query
  with auj as (select (now() at time zone 'Europe/Paris')::date d),
  rep as (select pr.id poster_id, pr.cohorte_lundi nouveau, greatest((select max(dc.decide_at) from debut_choix dc where dc.poster_id=pr.id and dc.choix='reporter'),(select max(rr.decision_at) from recrues_rouges rr where rr.poster_id=pr.id and rr.decision='reporter')) rat
   from profiles pr, auj where pr.is_active and pr.cohorte_lundi>auj.d
    and (exists(select 1 from debut_choix dc where dc.poster_id=pr.id and dc.choix='reporter') or exists(select 1 from recrues_rouges rr where rr.poster_id=pr.id and rr.decision='reporter')))
  select 2, r.poster_id, n.compte_id, null::text, 'Reporté au '||to_char(r.nouveau,'DD/MM')||' mais « '||n.type||' » reçu le '||to_char(n.envoye_at at time zone 'Europe/Paris','DD/MM HH24:MI'), 'Signaler ; corriger le générateur', false
   from rep r join nudges n on n.poster_id=r.poster_id
   where n.envoye_at>r.rat and n.envoye_at<(r.nouveau::timestamp at time zone 'Europe/Paris')
    and (n.type in('lundi_soir','jeudi_recrue','tiktok') or (n.type='relance' and coalesce(n.texte,'')!~*(trim(to_char(r.nouveau,'FMDay'))||'\s+'||extract(day from r.nouveau)||'\s+'||trim(to_char(r.nouveau,'FMMonth')))))
  union all select 2, r.poster_id, null, null, 'Reporté mais relance « '||rp.type||' » prévue pour l''ancienne période', 'Passer la relance en « bloque » (reporté)', true
   from rep r join relances_prevues rp on rp.poster_id=r.poster_id and rp.statut='prevu' and rp.periode<r.nouveau-7
  union all select 2, r.poster_id, null, null, 'Reporté mais message de début « '||dc.choix||' » envoyé après le report', 'Signaler', false
   from rep r join debut_choix dc on dc.poster_id=r.poster_id and dc.choix in('mardi','keep') and dc.message_statut='envoye' and dc.decide_at>r.rat
  union all select 2, r.poster_id, ps.compte_id, null, 'Reporté au '||to_char(r.nouveau,'DD/MM')||' mais '||count(*)||' post(s) assigné(s) avant', 'Retirer les posts non publiés avant la nouvelle date', false
   from rep r join comptes c on c.poster_id=r.poster_id join passages ps on ps.compte_id=c.id, auj
   where ps.date_publication_prevue>=auj.d and ps.date_publication_prevue<r.nouveau and ps.publie_url is null and not coalesce(ps.est_rappel,false) group by r.poster_id, r.nouveau, ps.compte_id;

  -- Règle 3 : au plus 1 carte ouverte et 1 décision ouverte par sujet et par personne.
  return query
  with c as (select p.id, p.poster_id, p.contrat_id, coalesce(p.poster_id::text,'c:'||p.contrat_id,'hm:'||p.hm_id) qui, x.cat, p.decision_choisie, public.probleme_rituel(p) rituel
   from problemes p cross join lateral (select p.categorie cat union select s->>'categorie' from jsonb_array_elements(coalesce(p.sujets,'[]')) s) x where p.statut='ouvert' and x.cat is not null)
  select 3, max(c.poster_id::text)::uuid, null::uuid, max(c.contrat_id), count(distinct c.id)||' cartes ouvertes sur « '||c.cat||' »', 'Fusionner dans la plus ancienne', false from c where c.qui is not null group by c.qui, c.cat having count(distinct c.id)>1
  union all select 3, max(c.poster_id::text)::uuid, null, max(c.contrat_id), count(distinct c.id)||' décisions ouvertes sur « '||c.cat||' »', 'Garder une seule décision', false from c where c.qui is not null and c.rituel is not null and c.decision_choisie is null group by c.qui, c.cat having count(distinct c.id)>1;

  -- Règle 4 : une carte qui demande une décision est dans Weekly decisions ; une décision prise ne laisse pas de carte ouverte.
  return query
  select 4, p.poster_id, null::uuid, p.contrat_id, 'Carte '||left(p.id::text,8)||' (« '||p.categorie||' ») demande une décision mais '||case when public.probleme_rituel(p) is null then 'sans rituel' else 'est dans l''onglet « '||public.probleme_onglet(p)||' »' end, 'Ranger dans Weekly decisions', false
   from problemes p where p.statut='ouvert' and p.decision_choisie is null and (p.question is not null or jsonb_typeof(p.options)='array' and jsonb_array_length(p.options)>0)
    and (public.probleme_rituel(p) is null or public.probleme_onglet(p)<>'samedi')
    and coalesce(p.cle_groupe,'') not like 'coherence:%'
  union all select 4, o.poster_id, null, o.contrat_id, 'Décision prise le '||to_char(d.decision_at,'DD/MM')||' sur « '||d.categorie||' » mais carte '||left(o.id::text,8)||' ouverte', 'Fermer la carte après vérification', false
   from problemes d join problemes o on o.poster_id=d.poster_id and o.categorie=d.categorie and o.statut='ouvert' and o.id<>d.id and o.created_at<=d.decision_at
   where d.poster_id is not null and (d.decision_choisie is not null or d.rituel_choix is not null) and d.decision_at is not null
  union all select 4, p.poster_id, null, p.contrat_id, 'Carte '||left(p.id::text,8)||' : décision choisie mais carte ouverte', 'Appliquer puis fermer', false from problemes p where p.statut='ouvert' and p.decision_choisie is not null;

  -- Règle 5 : tout message de posteur ou d'HM a une réponse ou une carte sous 24 h.
  return query
  with m as (select um.poster_id, um.at, 'upwork'::text canal, um.texte, um.contrat_id from upwork_messages um where um.role='posteur' and um.poster_id is not null and um.at>now()-interval '7 days'
   union all select r.poster_id, r.recu_at, 'bouton', r.texte, null from posteur_reponses r where r.canal='bouton' and r.recu_at>now()-interval '7 days' and nullif(btrim(coalesce(r.texte,'')),'') is not null),
  der as (select distinct on (m.poster_id) m.* from m order by m.poster_id, m.at desc),
  rep as (select um.poster_id, um.at from upwork_messages um where um.role in('hm','max','nous','os') and not public.texte_attente_equipe(um.texte)
   union all select n.poster_id, n.envoye_at from nudges n where n.envoye_at is not null and not public.texte_attente_equipe(n.texte)
   union all select q.user_id, coalesce(q.envoye_at,q.traite_at) from chatbot_questions q where q.user_id is not null and (q.reponse_humaine is not null or q.envoye_at is not null and not public.texte_attente_equipe(q.reponse)))
  select 5, d.poster_id, null::uuid, coalesce(d.contrat_id,pr.upwork_contract_id), 'Message du posteur ('||d.canal||', '||to_char(d.at at time zone 'Europe/Paris','DD/MM HH24:MI')||') sans réponse ni carte depuis '||round(extract(epoch from now()-d.at)/3600)||' h', 'Ouvrir une carte « sans réponse »', false
   from der d join profiles pr on pr.id=d.poster_id where d.at<now()-interval '24 hours' and pr.is_active
    and (public.texte_est_question(d.texte) or public.probleme_attend_reponse(d.texte))
    and not exists(select 1 from rep where rep.poster_id=d.poster_id and rep.at>d.at)
    and not exists(select 1 from problemes p where p.poster_id=d.poster_id and (p.statut='ouvert' or p.created_at>d.at or p.ferme_at>d.at))
  union all select 5, q.user_id, null, null, 'Question Slack ('||case q.slack_canal when 'C0BL0084Y3F' then 'canal HM' else '#questions' end||', '||to_char(q.created_at at time zone 'Europe/Paris','DD/MM HH24:MI')||', '||q.etat||') sans réponse ni carte', 'Ouvrir une carte / répondre dans le fil', false
   from chatbot_questions q where q.source='slack' and q.created_at between now()-interval '14 days' and now()-interval '24 hours'
    and q.etat in('bug','a_traiter','a_valider','relance') and q.reponse_humaine is null and q.it_statut is null
    and (q.envoye_at is null or public.texte_attente_equipe(q.reponse) or q.etat in('a_traiter','a_valider'))
    and not exists(select 1 from slack_messages sm where sm.fil_ts=q.slack_ts and sm.slack_user is distinct from q.slack_user_id)
    and not exists(select 1 from problemes p where p.poster_id=q.user_id and (p.statut='ouvert' or p.created_at>q.created_at))
    and not exists(select 1 from problemes p where p.created_at>q.created_at-interval '1 day' and p.sources::text like '%'||q.slack_ts||'%');

  -- Règle 6 : chaque compte actif a des posts aujourd'hui ; après 19 h, 0 post avec lien = une carte.
  return query
  with auj as (select (now() at time zone 'Europe/Paris')::date d, (now() at time zone 'Europe/Paris')::time h),
  actifs as (select pr.id poster_id, pr.upwork_contract_id contrat_id from profiles pr join user_roles ur on ur.user_id=pr.id and ur.role='poster', auj
   where pr.is_active and coalesce(pr.cohorte_lundi,auj.d)<=auj.d and not exists(select 1 from arrets a where a.poster_id=pr.id and a.annule_at is null)
    and not exists(select 1 from posteur_pauses pp where pp.poster_id=pr.id and now() between pp.debut and pp.jusqu_au)),
  cpt as (select a.poster_id, a.contrat_id, c.id compte_id from actifs a join comptes c on c.poster_id=a.poster_id
   where c.is_active and c.type_compte='perso' and c.warmup_ends_at<=now() and not exists(select 1 from ckd_arrets k where k.compte_id=c.id and k.annule_at is null and k.fait_at is not null))
  select 6, c.poster_id, c.compte_id, c.contrat_id, 'Compte actif sans post assigné aujourd''hui', 'Lancer la répartition pour ce compte', false
   from cpt c, auj where not exists(select 1 from passages ps where ps.compte_id=c.compte_id and ps.date_publication_prevue=auj.d)
  union all select 6, a.poster_id, null, a.contrat_id, 'Après 18 h : 0 post avec lien ('||count(ps.id)||' assignés) et aucune carte', 'Ouvrir une carte « pas posté aujourd''hui »', false
   from actifs a join cpt c on c.poster_id=a.poster_id join passages ps on ps.compte_id=c.compte_id and ps.date_publication_prevue=(select d from auj), auj
   where auj.h>=time '19:00' group by a.poster_id, a.contrat_id
   having count(*) filter(where ps.publie_url is not null)=0
    and not exists(select 1 from problemes p where p.poster_id=a.poster_id and p.categorie='pas_poste_aujourdhui' and (p.statut='ouvert' or p.created_at>=((select d from auj)::timestamp at time zone 'Europe/Paris')));

  -- Règle 7 : contrat VIk actif = posteur relié, HM, tarif zone × comptes, jalon financé pour la semaine.
  return query
  with t as (select now() at time zone 'Europe/Paris' m), w as (select m::date-(extract(isodow from m)::int-1) l from t),
  cible as (select case when (select m from t)>=(l+time '12:00') then l else l-7 end lundi from w),
  base as (select pr.id poster_id, uc.contrat_id, pr.manager_id, pr.cohorte_lundi, public.paie_tarif_zone(pr.id) tz, public.paie_tarif_contrat(pr.id) tc, ct.montant, ct.comptes ctc,
    (select count(*) from comptes c where c.poster_id=pr.id and c.is_active and c.type_compte='perso')::int n, (select j.jalons from upwork_jalons j where j.contrat_id=uc.contrat_id) jalons
   from upwork_contrats uc left join profiles pr on pr.upwork_contract_id=uc.contrat_id and pr.is_active left join contrats_tarifs ct on ct.contrat_id=uc.contrat_id
   where uc.organisation_id='2074065383597823773' and uc.actif and uc.etat='Active' and uc.type='FixedPrice' and not exists(select 1 from recrutement_hms h where h.upwork_freelancer_id=uc.freelancer_id))
  select 7, null::uuid, null::uuid, b.contrat_id, 'Contrat VIk actif sans fiche posteur active', 'Relier (accueils) ou fermer', false from base b where b.poster_id is null
  union all select 7, b.poster_id, null, b.contrat_id, 'Posteur sans HM', 'Affecter l''HM du pays', false from base b where b.poster_id is not null and b.manager_id is null
  union all select 7, b.poster_id, null, b.contrat_id, 'Tarif : '||coalesce(b.tc::text,'∅')||'×'||coalesce(b.ctc::text,'∅')||'='||coalesce(b.montant::text,'∅')||' $ ; attendu '||coalesce(b.tz::text,'∅')||'×'||b.n||'='||coalesce((b.tz*b.n)::text,'∅')||' $', 'Corriger le tarif', false
   from base b where b.poster_id is not null and (b.montant is null or b.tz is null or b.tc is distinct from b.tz or b.montant<>b.tz*b.n)
  union all select 7, b.poster_id, null, b.contrat_id, case when b.jalons is null then 'Jalons non lus' else 'Aucun jalon financé semaine du '||to_char(c.lundi,'DD/MM') end, 'Créer/financer le jalon', false
   from base b, cible c where b.poster_id is not null and coalesce(b.cohorte_lundi,'2000-01-01')<=c.lundi
    and not exists(select 1 from arrets a where a.poster_id=b.poster_id and a.annule_at is null) and not exists(select 1 from paie_hors h where h.poster_id=b.poster_id and h.annule_at is null)
    and not exists(select 1 from paie_a_financer f where f.poster_id=b.poster_id and f.semaine=c.lundi-7 and (f.finance_at is not null or f.retire_at is not null))
    and not exists(select 1 from jsonb_array_elements(coalesce(b.jalons,'[]')) e where coalesce((e->>'depot')::numeric,0)>0 and (e->>'etat' in('Active','Submitted','Approved')
     or e->>'etat'='Paid' and (e->>'echeance')::date>=c.lundi or (substring(e->>'nom' from '(?i)week\s*(\d+)'))::int=extract(week from c.lundi)::int and e->>'etat'<>'NotFunded'));

  -- Règle 8 : aucun contrat fermé avec une fiche active, et inversement.
  return query
  with p as (select pr.id, pr.is_active, pr.upwork_contract_id, pr.cohorte_lundi from profiles pr join user_roles ur on ur.user_id=pr.id and ur.role='poster' where not exists(select 1 from hub_posteurs h where h.profile_id=pr.id))
  select 8, p.id, null::uuid, p.upwork_contract_id, 'Fiche active mais contrat '||case when uc.etat='Closed' then 'fermé' else 'disparu de l''API' end, 'Vérifier puis arrêter la fiche', false
   from p join upwork_contrats uc on uc.contrat_id=p.upwork_contract_id where p.is_active and (uc.etat='Closed' or not uc.actif)
    and not exists(select 1 from upwork_contrats u2 where u2.contrat_id=p.upwork_contract_id and u2.actif and u2.etat='Active')
  union all select 8, p.id, null, p.upwork_contract_id, 'Fiche active sans contrat Upwork connu', 'Relier ou arrêter', false
   from p where p.is_active and coalesce(p.cohorte_lundi,'2000-01-01')<=current_date+7 and not exists(select 1 from upwork_contrats uc where uc.contrat_id=p.upwork_contract_id)
  union all select 8, p.id, null, uc.contrat_id, 'Contrat VIk actif mais fiche désactivée', 'Fermer le contrat sur Upwork', false
   from upwork_contrats uc join p on p.upwork_contract_id=uc.contrat_id where uc.organisation_id='2074065383597823773' and uc.actif and uc.etat='Active' and uc.type='FixedPrice' and not p.is_active
    and not exists(select 1 from profiles p2 where p2.upwork_contract_id=uc.contrat_id and p2.is_active);

  -- Règle 9 : rien sur Calyra (ni message, ni bonus, ni action) sur 14 jours.
  return query
  with vik as (select '2074065383597823773'::text o), org as (select distinct on (uc.contrat_id) uc.contrat_id, uc.organisation_id from upwork_contrats uc where uc.contrat_id is not null order by uc.contrat_id, uc.actif desc, uc.lu_at desc), dep as (select now()-interval '14 days' t)
  select 9, null::uuid, null::uuid, a.contrat, 'Écriture Upwork « '||a.action||' » hors VIk', 'Bloquer ; vérifier sur Upwork', false
   from upwork_appels a left join org o on o.contrat_id=a.contrat, dep, vik where a.at>dep.t and ltrim(coalesce(a.requete->>'query',''))~*'^mutation' and coalesce(a.requete->>'tenant',o.organisation_id) is distinct from vik.o
  union all select 9, um.poster_id, null, um.contrat_id, 'Message OS/Max dans une salle hors VIk', 'Couper', false from upwork_messages um, dep, vik where um.at>dep.t and um.role in('os','nous') and um.organisation_id is distinct from vik.o
  union all select 9, n.poster_id, n.compte_id, pr.upwork_contract_id, 'Nudge Upwork à un contrat hors VIk', 'Couper', false from nudges n join profiles pr on pr.id=n.poster_id join org o on o.contrat_id=pr.upwork_contract_id, dep, vik where n.envoye_at>dep.t and n.canal='upwork' and o.organisation_id<>vik.o
  union all select 9, null, null, b.contrat_id, 'Bonus test hors VIk', 'Annuler', false from upwork_bonus_tests b join org o on o.contrat_id=b.contrat_id, dep, vik where b.cree_at>dep.t and o.organisation_id<>vik.o
  union all select 9, bo.poster_id, null, pr.upwork_contract_id, 'Bonus '||bo.type||' contrat hors VIk', 'Ne pas payer', false from bonus bo join profiles pr on pr.id=bo.poster_id join org o on o.contrat_id=pr.upwork_contract_id, dep, vik where coalesce(bo.envoi_at,bo.paye_at,bo.calcule_at)>dep.t and o.organisation_id<>vik.o
  union all select 9, p.poster_id, null, p.contrat_id, 'Paiement API hors VIk', 'Bloquer', false from paie_paiements_api p join org o on o.contrat_id=p.contrat_id, dep, vik where p.created_at>dep.t and o.organisation_id<>vik.o;

  -- Règle 10 : un STOP = une décision de kill dans l'heure (immédiat si 0 post, sinon samedi), relances coupées.
  return query
  with s as (select p.id, p.poster_id, p.contrat_id, p.created_at at0, exists(select 1 from passages ps join comptes c on c.id=ps.compte_id where c.poster_id=p.poster_id and ps.publie_url is not null and ps.publie_at<p.created_at) a_poste
   from problemes p where p.poster_id is not null and p.created_at between now()-interval '14 days' and now()-interval '1 hour'
    and (p.categorie='stop' or exists(select 1 from jsonb_array_elements(coalesce(p.sujets,'[]')) x where x->>'categorie'='stop')) and coalesce(p.ferme_raison,'') not like 'fusionn%' and p.statut<>'ignore'),
  e as (select s.*,
    least((select min(a.created_at) from arrets a where a.poster_id=s.poster_id and a.created_at>s.at0-interval '1 day'),(select min(k.cree_at) from kills_immediats k where (k.probleme_id=s.id or k.contrats@>jsonb_build_array(jsonb_build_object('poster_id',s.poster_id))) and k.cree_at>s.at0-interval '1 day')) imm,
    least((select min(least(p2.kill_samedi_at, case when p2.decision_choisie is not null then p2.decision_at end)) from problemes p2 where p2.poster_id=s.poster_id and p2.created_at>s.at0-interval '7 days'),(select min(sb.maj_at) from samedi_brouillons sb join comptes c on c.id=sb.compte_id where c.poster_id=s.poster_id and sb.choix in('kill','kill_np') and sb.maj_at>s.at0-interval '1 day')) sam,
    (select not pr.is_active from profiles pr where pr.id=s.poster_id) desact from s)
  select 10, e.poster_id, null::uuid, e.contrat_id, 'STOP du '||to_char(e.at0 at time zone 'Europe/Paris','DD/MM HH24:MI')||' : '||case when least(e.imm,e.sam) is null then 'aucune décision' else 'décision après '||round(extract(epoch from least(e.imm,e.sam)-e.at0)/3600.0,1)||' h' end||case when e.a_poste then ' (kill samedi attendu)' else ' (kill immédiat attendu)' end, 'Décider le kill', false
   from e where (least(e.imm,e.sam) is null and not coalesce(e.desact,false)) or least(e.imm,e.sam)>e.at0+interval '1 hour'
  union all select 10, e.poster_id, null, e.contrat_id, 'A posté mais kill immédiat au lieu du samedi', 'Vérifier la paie', false from e where e.a_poste and e.imm is not null and (e.sam is null or e.imm<e.sam)
  union all select 10, e.poster_id, null, e.contrat_id, 'Jamais posté mais kill seulement prévu samedi', 'Lancer le kill immédiat', false from e where not e.a_poste and e.imm is null and e.sam is not null and not coalesce(e.desact,false)
  union all select 10, e.poster_id, null, e.contrat_id, 'STOP mais relance « '||rp.type||' » prévue', 'Passer la relance en « bloque » (STOP)', true from e join relances_prevues rp on rp.poster_id=e.poster_id and rp.statut='prevu'
  union all select 10, e.poster_id, n.compte_id, e.contrat_id, 'STOP mais « '||n.type||' » envoyé le '||to_char(n.envoye_at at time zone 'Europe/Paris','DD/MM HH24:MI'), 'Couper les relances', false
   from e join nudges n on n.poster_id=e.poster_id and n.envoye_at>e.at0+interval '1 hour' where n.type in('relance','jeudi','jeudi_recrue','lundi_soir','tiktok','connexion','handle','recreer_upwork');

  -- Règle 11 : doubles comptes, décisions par compte et par personne cohérentes.
  return query
  with auj as (select (now() at time zone 'Europe/Paris')::date d), lun as (select d-(extract(isodow from d)::int-1) l from auj)
  select 11, pr.id, c.id, pr.upwork_contract_id, 'Posteur arrêté/désactivé mais compte actif', 'Désactiver le compte', false
   from profiles pr join user_roles ur on ur.user_id=pr.id and ur.role='poster' join comptes c on c.poster_id=pr.id and c.is_active
   where not pr.is_active or exists(select 1 from arrets a where a.poster_id=pr.id and a.annule_at is null)
  union all select 11, c.poster_id, c.id, null, 'Compte arrêté (samedi fait) mais actif', 'Désactiver le compte', false from ckd_arrets k join comptes c on c.id=k.compte_id where k.fait_at is not null and k.annule_at is null and c.is_active
  union all select 11, p.poster_id, c.id, p.contrat_id, 'Kill samedi de la personne mais ce compte n''est pas dans le kill', 'Ajouter le compte au kill du samedi', false
   from problemes p join comptes c on c.poster_id=p.poster_id and c.is_active and c.type_compte='perso', lun where p.kill_samedi_lundi=lun.l and p.statut<>'ignore'
    and not exists(select 1 from samedi_brouillons sb where sb.compte_id=c.id and sb.lundi=p.kill_samedi_lundi and sb.choix in('kill','kill_np'))
  union all select 11, pr.id, null, pr.upwork_contract_id, 'Posteur actif démarré sans compte perso actif', 'Recréer ou arrêter', false
   from profiles pr join user_roles ur on ur.user_id=pr.id and ur.role='poster', auj where pr.is_active and coalesce(pr.cohorte_lundi,'2000-01-01')<=auj.d
    and not exists(select 1 from arrets a where a.poster_id=pr.id and a.annule_at is null) and not exists(select 1 from hub_posteurs h where h.profile_id=pr.id)
    and not exists(select 1 from comptes c where c.poster_id=pr.id and c.is_active and c.type_compte='perso');

  -- Règle 12 : un message « du posteur » est bien écrit par le posteur.
  return query
  with fl as (select distinct on (uc.contrat_id) uc.contrat_id, uc.freelancer_id from upwork_contrats uc where uc.contrat_id is not null order by uc.contrat_id, uc.actif desc, uc.lu_at desc)
  select 12, um.poster_id, null::uuid, um.contrat_id, 'Message « posteur » écrit par un autre auteur que le freelance', 'Reclasser le rôle', false
   from upwork_messages um join fl on fl.contrat_id=um.contrat_id where um.role='posteur' and um.auteur_upwork_id is not null and fl.freelancer_id is not null and um.auteur_upwork_id<>fl.freelancer_id
  union all select 12, um.poster_id, null, um.contrat_id, 'Message « posteur » = copie d''un message '||o.role, 'Reclasser', false
   from upwork_messages um join lateral (select o.role from upwork_messages o where o.contrat_id=um.contrat_id and o.id<>um.id and o.role<>'posteur' and btrim(o.texte)=btrim(um.texte) and length(btrim(um.texte))>=15 and o.at between um.at-interval '7 days' and um.at+interval '1 day' limit 1) o on true where um.role='posteur';
end;
$fn$;

revoke execute on function public.coherence_violations() from public, anon, authenticated;

create or replace function public.coherence_controle()
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_id uuid;
  v_par jsonb;
  v_corriges integer := 0;
  n integer;
  r record;
  v_titres jsonb := jsonb_build_object(
    '1', 'Posteur tué ou kill prévu encore relancé, avec des posts ou dans le financement',
    '2', 'Posteur reporté qui reçoit déjà des messages ou des posts',
    '3', 'Plusieurs cartes ou décisions sur le même sujet',
    '4', 'Décision rangée ailleurs que dans Weekly decisions',
    '5', 'Message sans réponse ni carte depuis plus de 24 h',
    '6', 'Compte actif sans post aujourd''hui, ou 0 post à 19 h sans carte',
    '7', 'Contrat VIk : posteur, HM, tarif ou jalon manquant',
    '8', 'Contrat fermé avec fiche active (ou l''inverse)',
    '9', 'Action sur Calyra',
    '10', 'STOP sans décision de kill dans l''heure',
    '11', 'Doubles comptes : décisions incohérentes',
    '12', 'Message attribué au mauvais auteur');
begin
  insert into public.coherence_controles default values returning id into v_id;
  insert into public.coherence_violations_relevees (controle_id, regle, poster_id, compte_id, contrat_id, detail, correctif, sur)
  select v_id, v.regle, v.poster_id, v.compte_id, v.contrat_id, v.detail, v.correctif, v.sur from public.coherence_violations() v;

  -- Ce qui est sûr : les relances prévues pour un posteur tué, reporté ou en STOP ; les nudges non envoyés d'un tué.
  update public.relances_prevues rp
     set statut = 'bloque', raison = coalesce(nullif(rp.raison, '') || ' · ', '') || 'cohérence : ' ||
           case x.regle when 1 then 'posteur tué' when 2 then 'posteur reporté' else 'STOP' end, maj_at = now()
    from (select distinct on (v.poster_id) v.poster_id, v.regle from public.coherence_violations_relevees v
           where v.controle_id = v_id and v.sur and v.correctif like 'Passer la relance%' order by v.poster_id, v.regle) x
   where rp.poster_id = x.poster_id and rp.statut = 'prevu';
  get diagnostics n = row_count;
  v_corriges := v_corriges + n;
  update public.ckd_propositions cp set decision = 'rien', note = coalesce(nullif(cp.note, '') || ' · ', '') || 'cohérence : posteur tué'
   where cp.action = 'nudge' and cp.decision = 'nudge' and cp.envoye_at is null
     and cp.poster_id in (select v.poster_id from public.coherence_violations_relevees v where v.controle_id = v_id and v.sur and v.correctif like 'Annuler le nudge%');
  get diagnostics n = row_count;
  v_corriges := v_corriges + n;
  update public.coherence_violations_relevees set corrige = true where controle_id = v_id and sur;

  select coalesce(jsonb_object_agg(g.regle::text, g.n), '{}'::jsonb) into v_par
    from (select v.regle, count(*) filter (where not v.corrige) n from public.coherence_violations_relevees v where v.controle_id = v_id group by 1) g;
  update public.coherence_controles set par_regle = v_par, corriges = v_corriges where id = v_id;

  -- Une carte « ⚠️ Incohérence » par règle en défaut (le reste, à corriger à la main).
  for r in select gs::text as cle from generate_series(1, 12) gs loop
    n := coalesce((v_par ->> r.cle)::int, 0);
    if n = 0 then
      update public.problemes set statut = 'valide', ferme_raison = 'Règle de cohérence repassée au vert', ferme_at = now(), maj_at = now()
       where cle_groupe = 'coherence:' || r.cle and statut = 'ouvert';
    else
      if exists (select 1 from public.problemes where cle_groupe = 'coherence:' || r.cle and statut = 'ouvert') then
        update public.problemes
           set resume = '⚠️ Incohérence · règle ' || r.cle || ' : ' || (v_titres ->> r.cle) || ' (' || n || ')',
               diagnostic = (select string_agg('• ' || v.detail || ' → ' || v.correctif, E'\n' order by v.detail)
                               from (select * from public.coherence_violations_relevees v where v.controle_id = v_id and v.regle = r.cle::int and not v.corrige limit 15) v),
               maj_at = now()
         where cle_groupe = 'coherence:' || r.cle and statut = 'ouvert';
      else
        insert into public.problemes (cle_groupe, categorie, niveau, niveau_force, resume, proprietaire, sujet, destinataire, hm_nom, diagnostic, diagnostic_par, journal)
        values ('coherence:' || r.cle, 'autre', 'urgent', true,
                '⚠️ Incohérence · règle ' || r.cle || ' : ' || (v_titres ->> r.cle) || ' (' || n || ')',
                'control_bot', 'hm', 'hm', '⚠️ Incohérence · règle ' || r.cle,
                (select string_agg('• ' || v.detail || ' → ' || v.correctif, E'\n' order by v.detail)
                   from (select * from public.coherence_violations_relevees v where v.controle_id = v_id and v.regle = r.cle::int and not v.corrige limit 15) v),
                'os', jsonb_build_array(jsonb_build_object('at', now(), 'par', 'os', 'action', 'coherence', 'controle', v_id)));
      end if;
    end if;
  end loop;
  return jsonb_build_object('controle', v_id, 'par_regle', v_par, 'corriges', v_corriges);
end;
$fn$;

revoke execute on function public.coherence_controle() from public, anon, authenticated;

-- Le bandeau (Problèmes et Weekly decisions).
create or replace function public.coherence_resume()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $fn$
declare
  c public.coherence_controles;
begin
  if not public.is_admin() then
    raise exception 'coherence_resume : réservé à l''admin' using errcode = '42501';
  end if;
  select * into c from public.coherence_controles order by at desc limit 1;
  return jsonb_build_object(
    'at', c.at,
    'par_regle', coalesce(c.par_regle, '{}'::jsonb),
    'ok', (select count(*) from generate_series(1, 12) g where coalesce((c.par_regle ->> g::text)::int, 0) = 0),
    'corriges', coalesce(c.corriges, 0),
    'groupes', coalesce((
      select jsonb_object_agg(x.groupe, jsonb_build_object('problemes', x.problemes, 'decisions', x.decisions))
        from (select coalesce(p.groupe, 'autres') groupe,
                     count(*) filter (where public.probleme_rituel(p) is null) problemes,
                     count(*) filter (where public.probleme_rituel(p) is not null) decisions
                from public.problemes p where p.statut = 'ouvert' group by 1) x), '{}'::jsonb));
end;
$fn$;

revoke execute on function public.coherence_resume() from public, anon;
grant execute on function public.coherence_resume() to authenticated;

-- Le cron et le premier passage : 0556 (après le test en transaction annulée).
