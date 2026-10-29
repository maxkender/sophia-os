-- Prompt 21, partie U : une seule page « Needs you ».
--
-- Tout ce que l'OS n'a pas pu faire, ou dont il n'est pas sûr, au même endroit
-- (/admin/auto/needs-you) : pas pu répondre, bloqué, pas sûr, à la main.
--
-- 1. passages.lien_confirme_at : un lien TikTok « introuvable » ne compte plus
--    pour la règle des 6 (semaines à partir de paie_kill6_des) tant qu'il n'est
--    pas confirmé (« Count this post ») ; paie_calculer_v3 le compte dans
--    detail_comptes.douteux, et la paie automatique ne fait pas de Kill sur
--    des données incomplètes.
-- 2. needs_you_ignores : « Ignore ».
-- 3. needs_you() et needs_you_compte() : la page, le badge, Overview, 18 h.
-- 4. needs_you_agir() : régler un cas sur place.
-- 5. Cron needs-you-alerte : DM Slack à Max à 18 h (Paris) s'il reste de l'urgent.

-- ---------------------------------------------------------------------------
-- 1. Un lien introuvable ne compte qu'une fois confirmé
-- ---------------------------------------------------------------------------
alter table public.passages
  add column if not exists lien_confirme_at timestamptz,
  add column if not exists lien_confirme_par uuid;

comment on column public.passages.lien_confirme_at is
  'Prompt 21, U (0419) : lien « introuvable » confirmé à la main dans Needs you : il compte comme un post.';

create or replace function public.paie_calculer_v3(p_lundi date)
returns table (
  poster_id      uuid,
  nb_comptes     integer,
  comptes_payes  integer,
  prevus         integer,
  faits          integer,
  manques        integer,
  tarif          numeric,
  retenue        numeric,
  montant        numeric,
  statut         text,
  raison         text,
  action         text,
  detail_comptes jsonb
)
language sql
stable
security definer
set search_path = public
as $$
  with reg as (
    select (r->>'minimum_posts')::int as minimum,
           -- La règle des 6 posts (Kill) vaut à partir de cette semaine-là.
           p_lundi >= (r->>'kill6_des')::date as kill6
      from (select public.paie_reglages() as r) x
  ),
  bornes as (
    select (p_lundi::timestamp at time zone 'Europe/Paris') as debut,
           ((p_lundi + 7)::timestamp at time zone 'Europe/Paris') as fin,
           (((p_lundi + 7)::timestamp + interval '10 hours') at time zone 'Europe/Paris') as coupure
  ),
  posteurs as (
    select pr.id, pr.is_active, pr.tarif_hebdo
      from public.profiles pr
     where exists (select 1 from public.user_roles r where r.user_id = pr.id and r.role = 'poster')
       and not exists (select 1 from public.hub_posteurs h where h.profile_id = pr.id)
  ),
  comptes_semaine as (
    select c.id, c.poster_id, c.handle_tiktok,
           count(p.id)::int as attendus,
           -- Un post compte s'il a son lien (« No link = not paid »). Prompt 21, U4 : sous la
           -- règle des 6, un lien « introuvable » ne compte qu'une fois confirmé (Needs you).
           (count(p.id) filter (where p.publie_url is not null
                                  and (not rg.kill6 or p.resolution_statut is distinct from 'introuvable'
                                       or p.lien_confirme_at is not null)))::int as faits,
           (count(p.id) filter (where rg.kill6 and p.publie_url is not null and p.resolution_statut = 'introuvable'
                                  and p.lien_confirme_at is null))::int as douteux,
           (c.is_active
             and ((c.warmup_ends_at > b.debut and c.warmup_ends_at <= b.fin + interval '1 day')
                  or (c.warmup_ends_at is null and c.created_at < b.debut
                      and c.created_at >= b.debut - interval '21 days'))) as en_warmup
      from public.comptes c
      join posteurs po on po.id = c.poster_id
      cross join bornes b
      cross join reg rg
      left join public.passages p
        on p.compte_id = c.id
       and p.date_publication_prevue between p_lundi and p_lundi + 6
       and p.statut::text <> 'brouillon'
       and not coalesce(p.est_rappel, false)
     where c.type_compte = 'perso'
     group by c.id, c.poster_id, c.handle_tiktok, c.is_active, c.created_at, c.warmup_ends_at, b.fin, b.debut
  ),
  tarifs as (
    select po.id as poster_id,
           -- Le tarif du contrat gagne (prompt 21, S) ; la zone ne sert qu'aux nouvelles offres.
           coalesce(public.paie_tarif_contrat(po.id), po.tarif_hebdo, public.paie_tarif_zone(po.id)) as tarif,
           public.paie_rythme_contrat(po.id) as rythme,
           exists (select 1 from public.posteur_pauses pp cross join bornes b
                    where pp.poster_id = po.id and pp.debut < b.fin and pp.jusqu_au > b.debut) as pause
      from posteurs po
     where po.id in (select cs.poster_id from comptes_semaine cs)
  ),
  par_compte as (
    select cs.*, t.tarif, t.rythme, t.pause,
           greatest(cs.attendus - cs.faits, 0) as rates,
           (rg.kill6 and cs.attendus > 0 and cs.faits < rg.minimum and not t.pause) as moins6
      from comptes_semaine cs
      join tarifs t on t.poster_id = cs.poster_id
      cross join reg rg
  ),
  agreg as (
    select pc.poster_id,
           max(pc.tarif) as tarif,
           max(pc.rythme) as rythme,
           bool_or(pc.pause) as pause,
           (count(*) filter (where pc.attendus > 0))::int as nb_comptes,
           -- Payé : chaque compte qui a posté (tarif plein, plus de retenue) ; en pause, chaque compte prévu.
           (count(*) filter (where pc.attendus > 0 and (pc.faits > 0 or pc.pause)))::int as comptes_payes,
           coalesce(sum(pc.attendus), 0)::int as prevus,
           coalesce(sum(pc.faits), 0)::int as faits,
           coalesce(sum(pc.rates), 0)::int as manques,
           (count(*) filter (where pc.attendus > 0 and pc.moins6))::int as comptes_moins6,
           coalesce(sum(pc.tarif) filter (where pc.attendus > 0 and (pc.faits > 0 or pc.pause)), 0)::numeric as montant,
           bool_or(pc.en_warmup and pc.attendus = 0) as warmup,
           coalesce(jsonb_agg(jsonb_build_object(
             'compte_id', pc.id, 'handle', pc.handle_tiktok, 'attendus', pc.attendus, 'faits', pc.faits,
             'rates', pc.rates, 'retenue', 0, 'moins6', pc.moins6, 'douteux', pc.douteux,
             'montant', case when (pc.faits > 0 or pc.pause) and pc.tarif is not null then pc.tarif else 0 end,
             'warmup', pc.en_warmup and pc.attendus = 0)
             order by pc.handle_tiktok) filter (where pc.attendus > 0 or (pc.en_warmup and pc.attendus = 0)), '[]'::jsonb)
             as detail
      from par_compte pc
     group by pc.poster_id
    having (count(*) filter (where pc.attendus > 0)) > 0 or bool_or(pc.en_warmup)
  ),
  etat as (
    select a.*, po.is_active,
           exists (select 1 from public.ckd_arrets ar
                     join public.comptes c on c.id = ar.compte_id
                    cross join bornes b
                   where c.poster_id = a.poster_id and ar.raison = 'ne_pas_renouveler'
                     and ar.annule_at is null
                     and coalesce(ar.fait_at, ar.prevu_at) >= b.debut
                     and coalesce(ar.fait_at, ar.prevu_at) <= b.coupure) as kill,
           exists (select 1 from public.paie_semaines ps
                    where ps.poster_id = a.poster_id and ps.semaine = p_lundi - 7
                      and ps.semaine_suivante_faite_at is not null) as deja_financee,
           (select count(*) from public.comptes c
             where c.poster_id = a.poster_id and c.type_compte = 'perso' and c.is_active
               and coalesce((select pj.premier_jour - (extract(isodow from pj.premier_jour)::int - 1)
                               from public.comptes_premier_jour pj where pj.compte_id = c.id),
                            (c.warmup_ends_at at time zone 'Europe/Paris')::date) <= p_lundi + 7)::int as n_suiv
      from agreg a
      join posteurs po on po.id = a.poster_id
  ),
  decision as (
    select e.*,
           case
             when (e.kill or not e.is_active) and e.faits = 0 and not e.pause and e.deja_financee then 'annuler'
             when (e.kill or not e.is_active) and e.faits = 0 and not e.pause then 'rien'
             when (e.kill or not e.is_active) then 'kill'
             -- Tous les comptes sous les 6 posts avec lien : Kill, la semaine payée.
             when e.nb_comptes > 0 and e.comptes_moins6 >= e.nb_comptes then 'kill'
             when e.nb_comptes = 0 or (e.faits = 0 and not e.pause) then 'rien'
             when e.rythme = 'legacy' then 'legacy'
             when e.rythme = 'a_verifier' then 'a_verifier'
             when e.n_suiv >= 2 and e.n_suiv > e.comptes_payes then 'modifier'
             else 'payer'
           end as action,
           array_remove(array[
             case when e.nb_comptes = 0 then 'Semaine de warm-up : rien à payer (la 1re semaine de posts le paie)' end,
             case when e.nb_comptes > 0 and e.faits = 0 and not e.pause then '0 post avec lien dans la semaine : rien à payer' end,
             case when e.faits > 0 and e.tarif is null then 'Tarif à renseigner (pays hors zone de paie)' end,
             case when e.nb_comptes > 0 and e.comptes_moins6 >= e.nb_comptes and e.is_active and not e.kill
                  then 'Moins de 6 posts avec lien : Kill, semaine payée' end,
             case when e.comptes_moins6 > 0 and e.comptes_moins6 < e.nb_comptes
                  then 'Un compte sous les 6 posts : ce compte s''arrête, semaine suivante au tarif simple' end,
             case when e.pause then 'Pause (malade, absent) cette semaine : pas de Kill, semaine payée' end,
             case when e.rythme = 'legacy' then 'Contrat Legacy : payé à la fin de sa période' end,
             case when e.rythme = 'a_verifier' then 'Tarif du contrat à vérifier : hors paie automatique' end
           ], null) as liste
      from etat e
  )
  select d.poster_id, d.nb_comptes, d.comptes_payes, d.prevus, d.faits, d.manques, d.tarif,
         0::numeric,
         case when d.tarif is null then 0 else d.montant end,
         case when (d.faits > 0 and d.tarif is null) or d.rythme = 'a_verifier' then 'a_voir' else 'ok' end,
         nullif(array_to_string(d.liste, ' · '), ''),
         d.action,
         d.detail
    from decision d;
$$;

-- ---------------------------------------------------------------------------
-- 2. Ce que l'admin a écarté (« Ignore ») : la ligne ne revient plus.
-- ---------------------------------------------------------------------------
create table if not exists public.needs_you_ignores (
  cle        text primary key,
  par        uuid,
  at         timestamptz not null default now()
);

alter table public.needs_you_ignores enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'needs_you_ignores' and policyname = 'needs_you_ignores lecture admin') then
    create policy "needs_you_ignores lecture admin" on public.needs_you_ignores for select to authenticated using ((select public.is_admin()));
  end if;
end $$;

-- Les liaisons à vérifier : lisibles aussi par le service (alerte de 18 h).
create or replace function public.liaisons_a_verifier()
returns table (poster_id uuid, poster_nom text, pays text, contrat_id text, freelancer_nom text,
               regle integer, partage boolean, cree_at timestamptz)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
begin
  -- 0419 : aussi le service (Needs you, alerte de 18 h).
  if not (public.is_admin() or coalesce(auth.jwt() ->> 'role', '') = 'service_role') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return query
  select pr.id, nullif(btrim(concat_ws(' ', pr.prenom, pr.nom)), ''),
         (select c.pays from public.comptes c where c.poster_id = pr.id and c.type_compte = 'perso' order by c.created_at limit 1),
         pr.upwork_contract_id, u.freelancer_nom,
         public.contrat_nom_regle(concat_ws(' ', pr.prenom, pr.nom), u.freelancer_nom),
         exists (select 1 from public.profiles o where o.id <> pr.id and o.is_active and o.upwork_contract_id = pr.upwork_contract_id),
         pr.created_at
    from public.profiles pr
    left join public.upwork_contrats u on u.contrat_id = pr.upwork_contract_id
   where pr.is_active and pr.upwork_contract_id is not null
     and exists (select 1 from public.user_roles r where r.user_id = pr.id and r.role = 'poster')
     and not exists (select 1 from public.hub_posteurs h where h.profile_id = pr.id)
     and not exists (select 1 from public.accueils a where a.contrat_id = pr.upwork_contract_id and a.poster_id = pr.id)
     and coalesce(substring(btrim(pr.upwork_contrat_url) from '/(?:workroom|contracts?)/([0-9]{6,})'), '') <> pr.upwork_contract_id
     and not exists (select 1 from public.contrats_liaisons_verifiees v
                      where v.poster_id = pr.id and v.contrat_id = pr.upwork_contract_id)
   order by 6 desc nulls first, 2;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. needs_you() : tout ce que l'OS n'a pas pu faire, ou dont il n'est pas sûr
-- ---------------------------------------------------------------------------
/**
 * Une ligne par cas, avec qui (nom, cohorte, HM, pays), ce que l'OS a vu, ce
 * qu'il en pense (et sa confiance), l'urgence (lundi : bloque le départ du
 * lundi ; paie ; kill ; rien) et les actions possibles. Catégories :
 * pas_pu_repondre, bloque, pas_sur, a_la_main. Admin et Head of Ops.
 */
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
           case when a.type = 'slack' then 'retirer_slack' when a.gravite = 'issue' then 'paiement_urgent' else 'paiement' end,
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
           null, 'paie', coalesce(pa.publie_at, pa.created_at),
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
     where cp.type = 'samedi' and cp.decision is null and cp.jour >= (now() at time zone 'Europe/Paris')::date - 7
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

revoke all on function public.needs_you() from public, anon;
grant execute on function public.needs_you() to authenticated;

/** Le badge du menu, le haut d'Overview et l'alerte de 18 h. */
create or replace function public.needs_you_compte()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'total', count(*),
    'urgents', count(*) filter (where n.urgence <> 'rien'),
    'pas_pu_repondre', count(*) filter (where n.categorie = 'pas_pu_repondre'),
    'bloque', count(*) filter (where n.categorie = 'bloque'),
    'pas_sur', count(*) filter (where n.categorie = 'pas_sur'),
    'a_la_main', count(*) filter (where n.categorie = 'a_la_main'))
    from public.needs_you() n;
$$;

revoke all on function public.needs_you_compte() from public, anon;
grant execute on function public.needs_you_compte() to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Régler un cas sur place (chaque correction apprend à l'OS)
-- ---------------------------------------------------------------------------
/**
 * p_cle : la clé de la ligne ; p_action : ignorer, compter, corriger_lien,
 * corriger_handle, valider, classer, juste, faux, confirmer, delier, fait.
 * La FAQ (« repondre ») passe par la fonction faq-admin ; le relevé du handle
 * corrigé, par ckd (releve_compte).
 */
create or replace function public.needs_you_agir(p_cle text, p_action text, p_valeur text default null)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_type text := split_part(p_cle, ':', 1);
  v_ref  text := substr(p_cle, length(split_part(p_cle, ':', 1)) + 2);
  v_jour date;
  v_cas  text;
begin
  if not public.is_admin() then
    raise exception 'needs_you_agir : réservé à l''admin et au Head of Ops';
  end if;

  if p_action = 'ignorer' then
    insert into public.needs_you_ignores (cle, par) values (p_cle, auth.uid()) on conflict (cle) do nothing;
    return 'ignoré';
  end if;

  if v_type = 'lien' and p_action = 'compter' then
    -- Le lien compte comme un post ; la règle des 6 est recalculée si la paie de sa semaine attend.
    update public.passages set lien_confirme_at = now(), lien_confirme_par = auth.uid()
     where id = v_ref::uuid returning date_publication_prevue into v_jour;
    if v_jour is null then raise exception 'post introuvable'; end if;
    v_jour := date_trunc('week', v_jour)::date;
    if exists (select 1 from public.paie_semaines ps where ps.semaine = v_jour and ps.paye_at is null) then
      perform public.paie_generer(v_jour);
    end if;
    return 'compté';
  end if;

  if v_type = 'lien' and p_action = 'corriger_lien' then
    if coalesce(p_valeur, '') !~ '^https?://([a-z]+\.)?tiktok\.com/' then raise exception 'lien TikTok attendu'; end if;
    update public.passages
       set publie_url = btrim(p_valeur), resolution_statut = 'a_resoudre', resolution_tentatives = 0,
           resolution_prochaine_at = now(), resolution_detail = 'lien corrigé à la main', lien_confirme_at = null
     where id = v_ref::uuid;
    return 'lien corrigé : relu au prochain passage';
  end if;

  if v_type = 'compte' and p_action = 'corriger_handle' then
    if coalesce(btrim(p_valeur), '') = '' then raise exception 'handle vide'; end if;
    update public.comptes set handle_tiktok = regexp_replace(lower(btrim(p_valeur)), '^@', '') where id = v_ref::uuid;
    return 'handle corrigé';
  end if;

  if v_type = 'reponse' and p_action in ('valider', 'classer') then
    select coalesce(nullif(p_valeur, ''), r.cas_ia) into v_cas from public.posteur_reponses r where r.id = v_ref::uuid;
    if v_cas is null then raise exception 'catégorie attendue'; end if;
    perform public.reponse_corriger(v_ref::uuid, v_cas, true);
    return 'classé';
  end if;

  if v_type = 'relecture' and p_action in ('juste', 'faux') then
    -- Le jugement nourrit l'agent de relecture (banc d'essai, 0293).
    insert into public.relecture_avis (relecture_id, cle, code, verdict, detail)
    select v_ref::uuid, (d->>'code') || '|' || coalesce(d->>'slides', ''), d->>'code', p_action, d->>'detail'
      from public.relectures_auto ra, jsonb_array_elements(ra.defauts) d
     where ra.id = v_ref::uuid and d->>'niveau' = 'remarque'
    on conflict (relecture_id, cle) do update set verdict = excluded.verdict, maj_at = now();
    if p_action = 'faux' then
      update public.relectures_auto set envoi = 'rejeté à la main', envoi_at = now() where id = v_ref::uuid and envoi is null;
    end if;
    return 'jugé';
  end if;

  if v_type = 'liaison' and p_action in ('confirmer', 'delier') then
    perform public.liaison_verifier(v_ref::uuid, p_action = 'delier');
    return case when p_action = 'delier' then 'contrat délié' else 'liaison confirmée' end;
  end if;

  if v_type = 'afaire' and p_action = 'fait' then
    perform public.a_faire_fait(v_ref::uuid, true);
    return 'fait';
  end if;

  if v_type = 'remboursement' and p_action = 'fait' then
    perform public.arret_action_faite(v_ref::uuid, 'remboursement');
    return 'fait';
  end if;

  raise exception 'action « % » impossible sur « % »', p_action, v_type;
end;
$$;

revoke all on function public.needs_you_agir(text, text, text) from public, anon;
grant execute on function public.needs_you_agir(text, text, text) to authenticated;


-- ---------------------------------------------------------------------------
-- 5. L'alerte de 18 h (Paris) : 16 h et 17 h UTC, la fonction ne part qu'à
--    18 h Paris (été comme hiver) ; cloné du cron ckd (jamais de secret écrit ici).
-- ---------------------------------------------------------------------------
do $$
declare
  v_base text := (select command from cron.job where jobname = 'ckd-envoi-dimanche');
begin
  if v_base is null then
    raise exception 'cron ckd-envoi-dimanche introuvable';
  end if;
  perform cron.schedule('needs-you-alerte', '0 16,17 * * *',
    regexp_replace(v_base, '"action"\s*:\s*"envoi_auto"', '"action":"needs_you_alerte"'));
end $$;
