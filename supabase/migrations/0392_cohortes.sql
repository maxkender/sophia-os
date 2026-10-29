-- 0392 — Prompt 17, partie B : la page Cohortes (dès l'offre acceptée).
--
-- Une cohorte = les recrues dont `profiles.cohorte_lundi` (0391) est ce lundi.
-- La recrue y entre dès l'offre acceptée, même sans compte TikTok. Un Double
-- ou un compte recréé n'est pas une recrue : c'est un compte de plus du même
-- posteur, qui garde sa cohorte.
--
-- Ce que la migration ajoute :
--   1. `cohortes_liste()` : les cohortes (lundi, recrues, rouges à décider) ;
--   2. `cohorte_recrues(p_lundis date[])` : une ligne par recrue, avec les
--      faits de chaque étape (accès, TikTok, warm-up, semaine 1, samedi), ses
--      relances, ce qui est prévu et ses rouges. Admin et Head of Ops : tout ;
--      une HM : ses recrues seulement ;
--   3. `cohorte_reporter(p_poster)` : cohorte + 1 semaine (jamais dans le
--      passé), ses comptes en warm-up reportés comme « Postpone » (0367), les
--      rouges ouverts décidés « reporter ». Les étapes déjà relancées ne le
--      sont pas une 2e fois (recrues-check ne regarde pas la période pour les
--      étapes 1 à 3) ;
--   4. `cohorte_arreter(p_poster)` : posteur et comptes désactivés (comme
--      manage-users « activer »), les rouges ouverts décidés « arreter » ;
--   5. `paie_liste_v2` (même signature) : un posteur arrêté entre le lundi de
--      la semaine payée et le lundi suivant 10 h a sa ligne « kill » (End the
--      contract), ajoutée s'il n'était pas dans la liste.
-- Admin et Head of Ops seulement pour 3 et 4 (is_admin).
--
-- Additive : 4 fonctions nouvelles, une réécrite à signature identique.
-- Aucune donnée existante modifiée par la migration.
-- Retour arrière : drop function public.cohortes_liste(),
-- public.cohorte_recrues(date[]), public.cohorte_reporter(uuid),
-- public.cohorte_arreter(uuid) ; réappliquer paie_liste_v2 de 0388.

-- ---------------------------------------------------------------------------
-- 1. Les cohortes
-- ---------------------------------------------------------------------------
create or replace function public.cohortes_liste()
returns table (lundi date, recrues integer, rouges integer)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_hm uuid;
begin
  if coalesce(auth.role(), '') in ('anon', 'authenticated') and not public.is_admin() then
    if not public.is_hiring_manager() then
      raise exception 'cohortes_liste : réservé à l''admin et aux HMs';
    end if;
    v_hm := auth.uid();
  end if;
  return query
  select pr.cohorte_lundi, count(*)::int,
         count(*) filter (where exists (select 1 from public.recrues_rouges x
                                         where x.poster_id = pr.id and x.decision is null))::int
    from public.profiles pr
   where pr.cohorte_lundi is not null
     and exists (select 1 from public.user_roles r where r.user_id = pr.id and r.role = 'poster')
     and not exists (select 1 from public.hub_posteurs h where h.profile_id = pr.id)
     and (v_hm is null or pr.manager_id = v_hm)
   group by pr.cohorte_lundi
   order by pr.cohorte_lundi desc;
end;
$$;

revoke execute on function public.cohortes_liste() from public, anon;
grant execute on function public.cohortes_liste() to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Les recrues d'une ou plusieurs cohortes
-- ---------------------------------------------------------------------------
create or replace function public.cohorte_recrues(p_lundis date[])
returns table (
  poster_id             uuid,
  nom                   text,
  pays                  text,
  hm_id                 uuid,
  hm_prenom             text,
  contrat               boolean,
  is_active             boolean,
  offre_at              timestamptz,
  cohorte_lundi         date,
  premiere_connexion_at timestamptz,
  slack_lie             boolean,
  slack_lie_at          timestamptz,
  compte_id             uuid,
  handle                text,
  tiktok_existe         boolean,
  tiktok_vu_at          timestamptz,
  abonnements           integer,
  warmup_started_at     timestamptz,
  warmup_reposts_at     timestamptz,
  semaine1              jsonb,
  samedi                jsonb,
  nudges                jsonb,
  prevues               jsonb,
  rouges                jsonb
)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_hm uuid;
begin
  if coalesce(auth.role(), '') in ('anon', 'authenticated') and not public.is_admin() then
    if not public.is_hiring_manager() then
      raise exception 'cohorte_recrues : réservé à l''admin et aux HMs';
    end if;
    v_hm := auth.uid();
  end if;

  return query
  with po as (
    select pr.* from public.profiles pr
     where pr.cohorte_lundi = any(p_lundis)
       and exists (select 1 from public.user_roles r where r.user_id = pr.id and r.role = 'poster')
       and not exists (select 1 from public.hub_posteurs h where h.profile_id = pr.id)
       and (v_hm is null or pr.manager_id = v_hm)
  ),
  -- Le 1er compte perso (le Double et le recréé viennent après).
  cpt as (
    select distinct on (c.poster_id) c.poster_id, c.id, c.handle_tiktok, c.pays, c.warmup_started_at, c.warmup_reposts_at
      from public.comptes c
     where c.poster_id in (select id from po) and c.type_compte = 'perso'
     order by c.poster_id, c.created_at
  )
  select po.id,
         coalesce(nullif(btrim(concat_ws(' ', po.prenom, po.nom)), ''), po.email),
         coalesce(cpt.pays, po.nationalite),
         po.manager_id, hm.prenom,
         (po.upwork_contract_id is not null or nullif(btrim(po.upwork_contrat_url), '') is not null),
         po.is_active,
         coalesce(po.offre_acceptee_le, po.created_at), po.cohorte_lundi,
         coalesce(po.premiere_connexion_at, u.last_sign_in_at),
         po.slack_user_id is not null, po.slack_lie_at,
         cpt.id, cpt.handle_tiktok, r.existe, r.releve_at, r.abonnements,
         cpt.warmup_started_at, cpt.warmup_reposts_at,
         -- Semaine 1 : posts publiés / prévus, compte par compte (lundi → dimanche).
         coalesce((
           select jsonb_agg(jsonb_build_object(
                    'compte_id', c.id, 'handle', c.handle_tiktok, 'is_active', c.is_active,
                    'prevus', s.prevus, 'publies', s.publies, 'publies_lun_mar', s.publies_lun_mar)
                  order by c.created_at)
             from public.comptes c
             cross join lateral (
               select count(*)::int as prevus,
                      count(*) filter (where x.publie_url is not null or x.publie_at is not null
                                          or x.statut::text = 'publie')::int as publies,
                      count(*) filter (where (x.publie_url is not null or x.publie_at is not null
                                              or x.statut::text = 'publie')
                                         and x.date_publication_prevue <= po.cohorte_lundi + 1)::int as publies_lun_mar
                 from public.passages x
                where x.compte_id = c.id
                  and not coalesce(x.est_rappel, false)
                  and x.statut::text <> 'brouillon'
                  and x.date_publication_prevue between po.cohorte_lundi and po.cohorte_lundi + 6
             ) s
            where c.poster_id = po.id and c.type_compte = 'perso'), '[]'::jsonb),
         -- Samedi de la semaine 1 : les propositions de Check, Kill or Double et leur décision.
         coalesce((
           select jsonb_agg(jsonb_build_object('regle', p.regle, 'action', p.action, 'decision', p.decision,
                                               'compte_id', p.compte_id))
             from public.ckd_propositions p
            where p.poster_id = po.id and p.type = 'samedi' and p.jour = po.cohorte_lundi + 5), '[]'::jsonb),
         coalesce((select jsonb_agg(jsonb_build_object('type', n.type, 'periode', n.periode, 'envoye_at', n.envoye_at,
                                                       'canal', n.canal, 'resolu_at', n.resolu_at, 'erreur', n.slack_erreur)
                                    order by n.envoye_at)
                     from public.nudges n where n.poster_id = po.id and n.periode is not null), '[]'::jsonb),
         coalesce((select jsonb_agg(jsonb_build_object('type', v.type, 'periode', v.periode, 'statut', v.statut,
                                                       'canal', v.canal, 'raison', v.raison))
                     from public.relances_prevues v where v.poster_id = po.id), '[]'::jsonb),
         coalesce((select jsonb_agg(jsonb_build_object('etape', x.etape, 'periode', x.periode, 'rouge_at', x.rouge_at,
                                                       'decision', x.decision, 'decision_at', x.decision_at)
                                    order by x.rouge_at)
                     from public.recrues_rouges x where x.poster_id = po.id), '[]'::jsonb)
    from po
    left join public.profiles hm on hm.id = po.manager_id
    left join auth.users u on u.id = po.id
    left join cpt on cpt.poster_id = po.id
    -- Le dernier relevé lisible du profil TikTok avant le lundi de la cohorte.
    left join lateral (
      select w.existe, w.abonnements, w.releve_at from public.ckd_warmup_releves w
       where w.compte_id = cpt.id and w.existe is not null
         and w.releve_at < (po.cohorte_lundi::timestamp at time zone 'Europe/Paris')
       order by w.releve_at desc limit 1
    ) r on true;
end;
$$;

revoke execute on function public.cohorte_recrues(date[]) from public, anon;
grant execute on function public.cohorte_recrues(date[]) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Reporter : cohorte + 1 semaine
-- ---------------------------------------------------------------------------
create or replace function public.cohorte_reporter(p_poster uuid)
returns date
language plpgsql
security definer
set search_path = public
as $$
declare
  pr public.profiles%rowtype;
  v_auj date := (now() at time zone 'Europe/Paris')::date;
  v_nouveau date;
  c record;
begin
  if not public.is_admin() then
    raise exception 'cohorte_reporter : réservé à l''admin et au Head of Ops';
  end if;
  select * into pr from public.profiles where id = p_poster for update;
  if not found then
    raise exception 'cohorte_reporter : posteur introuvable';
  end if;
  if not pr.is_active then
    raise exception 'cohorte_reporter : posteur arrêté';
  end if;
  v_nouveau := coalesce(pr.cohorte_lundi, v_auj) + 7;
  if v_nouveau <= v_auj then
    v_nouveau := v_auj + (8 - extract(isodow from v_auj)::int);
  end if;

  -- Ses comptes en warm-up qui n'ont rien publié : « Postpone » (0367), puis la
  -- fin du warm-up alignée sur la nouvelle cohorte.
  for c in
    select co.id from public.comptes co
     where co.poster_id = p_poster and co.type_compte = 'perso' and co.is_active
       and co.warmup_ends_at is not null
       and not exists (select 1 from public.passages p
                        where p.compte_id = co.id
                          and (p.publie_url is not null or p.publie_at is not null or p.statut::text = 'publie'))
  loop
    perform public.cohorte_reporter_compte(c.id);
    update public.comptes
       set warmup_ends_at = (v_nouveau::timestamp at time zone 'Europe/Paris')
     where id = c.id;
  end loop;

  update public.profiles set cohorte_lundi = v_nouveau where id = p_poster;
  update public.recrues_rouges
     set decision = 'reporter', decision_at = now(), decision_par = auth.uid()
   where poster_id = p_poster and decision is null;
  -- Ce qui était prévu pour l'ancienne cohorte ne vaut plus.
  delete from public.relances_prevues where poster_id = p_poster and type <> 'mercredi';
  return v_nouveau;
end;
$$;

revoke execute on function public.cohorte_reporter(uuid) from public, anon;
grant execute on function public.cohorte_reporter(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Arrêter : posteur désactivé, « End the contract » dans la paie du lundi
-- ---------------------------------------------------------------------------
create or replace function public.cohorte_arreter(p_poster uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'cohorte_arreter : réservé à l''admin et au Head of Ops';
  end if;
  if not exists (select 1 from public.recrues_rouges where poster_id = p_poster and decision is null) then
    raise exception 'cohorte_arreter : pas de rouge à décider pour ce posteur';
  end if;
  update public.recrues_rouges
     set decision = 'arreter', decision_at = now(), decision_par = auth.uid()
   where poster_id = p_poster and decision is null;
  -- Comme manage-users « activer » (actif = false) : le profil et ses comptes.
  update public.profiles set is_active = false where id = p_poster;
  update public.comptes set is_active = false where poster_id = p_poster;
  delete from public.relances_prevues where poster_id = p_poster;
end;
$$;

revoke execute on function public.cohorte_arreter(uuid) from public, anon;
grant execute on function public.cohorte_arreter(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. La liste de paie : les arrêtés de la semaine → « End the contract »
-- ---------------------------------------------------------------------------
create or replace function public.paie_liste_v2(p_lundi date, p_simulation boolean default false)
returns table (
  id                        uuid,
  poster_id                 uuid,
  poster_nom                text,
  hm_id                     uuid,
  hm_prenom                 text,
  equipe                    text,
  contrat_url               text,
  nb_comptes                integer,
  comptes_payes             integer,
  prevus                    integer,
  faits                     integer,
  tarif                     numeric,
  retenue                   numeric,
  montant_calcule           numeric,
  montant                   numeric,
  montant_corrige           numeric,
  raison_correction         text,
  statut                    text,
  raison                    text,
  action                    text,
  detail_comptes            jsonb,
  exclu                     boolean,
  exclu_raison              text,
  paye_at                   timestamptz,
  semaine_suivante_faite_at timestamptz,
  premiere_semaine          boolean,
  bonus                     numeric,
  suivante_action           text,
  suivante_comptes          integer,
  suivante_montant          numeric,
  suivante_raison           text,
  upwork_compte             text
)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_bonus numeric;
begin
  if coalesce(auth.role(), '') in ('anon', 'authenticated') and not public.is_admin() then
    raise exception 'paie_liste_v2 : réservé à l''admin et au Head of Ops';
  end if;
  if extract(isodow from p_lundi) <> 1 then
    raise exception 'paie_liste_v2 : % n''est pas un lundi', p_lundi;
  end if;
  select case when jsonb_typeof(r.valeur) = 'number' then (r.valeur #>> '{}')::numeric end
    into v_bonus
    from public.reglages r where r.cle = 'paie_bonus_premiere_semaine';
  v_bonus := coalesce(v_bonus, 1);

  return query
  with calcule as (
    select ps.id, ps.poster_id, ps.nb_comptes, ps.comptes_payes, ps.prevus, ps.faits, ps.tarif, ps.retenue,
           ps.montant, ps.montant_corrige, ps.raison_correction, ps.statut, ps.raison,
           coalesce(ps.action, case when ps.faits = 0 then 'rien' when ps.retenue > 0 then 'payer_moins' else 'payer' end)
             as action,
           coalesce(ps.detail_comptes, '[]'::jsonb) as detail_comptes, ps.exclu, ps.exclu_raison, ps.paye_at,
           ps.semaine_suivante_faite_at
      from public.paie_semaines ps
     where ps.semaine = p_lundi and not p_simulation
    union all
    select null::uuid, c.poster_id, c.nb_comptes, c.comptes_payes, c.prevus, c.faits, c.tarif, c.retenue,
           c.montant, null::numeric, null::text, c.statut, c.raison, c.action, c.detail_comptes,
           false, null::text, null::timestamptz, null::timestamptz
      from public.paie_calculer_v3(p_lundi) c
     where p_simulation
  ),
  -- Arrêtés depuis la page Cohortes (0392) entre le lundi payé et le lundi suivant 10 h.
  arretes as (
    select distinct x.poster_id
      from public.recrues_rouges x
     where x.decision = 'arreter'
       and x.decision_at >= (p_lundi::timestamp at time zone 'Europe/Paris')
       and x.decision_at < (((p_lundi + 7)::timestamp + interval '10 hours') at time zone 'Europe/Paris')
  ),
  base as (
    select c.id, c.poster_id, c.nb_comptes, c.comptes_payes, c.prevus, c.faits, c.tarif, c.retenue,
           c.montant, c.montant_corrige, c.raison_correction, c.statut, c.raison,
           case when c.poster_id in (select a.poster_id from arretes a) then 'kill' else c.action end as action,
           c.detail_comptes, c.exclu, c.exclu_raison, c.paye_at, c.semaine_suivante_faite_at
      from calcule c
    union all
    select null::uuid, a.poster_id, 0, 0, 0, 0, pr.tarif_hebdo, 0::numeric,
           0::numeric, null::numeric, null::text, 'ok'::text, null::text, 'kill'::text, '[]'::jsonb,
           false, null::text, null::timestamptz, null::timestamptz
      from arretes a
      join public.profiles pr on pr.id = a.poster_id
     where a.poster_id not in (select c.poster_id from calcule c)
  ),
  suiv as (
    select s.*
      from public.paie_suivante_calc(p_lundi, (
             select coalesce(jsonb_agg(jsonb_build_object(
                      'poster_id', b.poster_id, 'prevus', b.prevus, 'faits', b.faits, 'tarif', b.tarif,
                      'semaine_suivante_faite_at', b.semaine_suivante_faite_at)), '[]'::jsonb)
               from base b)) s
  ),
  premier as (
    select co.poster_id, min(pj.premier_jour) as jour
      from public.comptes co
      join public.comptes_premier_jour pj on pj.compte_id = co.id
     where co.type_compte = 'perso'
       and co.poster_id in (select b.poster_id from base b)
     group by co.poster_id
  ),
  lignes as (
    select b.*,
           coalesce(pm.jour between p_lundi and p_lundi + 6, false) as premiere,
           case when pm.jour between p_lundi and p_lundi + 6 and b.faits > 0 and b.tarif is not null
                     and b.action in ('payer', 'payer_moins', 'modifier', 'kill')
                then v_bonus else 0 end as bonus
      from base b
      left join premier pm on pm.poster_id = b.poster_id
  )
  select l.id, l.poster_id,
         coalesce(nullif(btrim(concat_ws(' ', pr.prenom, pr.nom)), ''), pr.email),
         pr.manager_id, hm.prenom,
         -- Groupée par HM (28/10) : son nom, plus l'équipe Upwork.
         nullif(btrim(concat_ws(' ', hm.prenom, hm.nom)), ''),
         pr.upwork_contrat_url,
         l.nb_comptes, l.comptes_payes, l.prevus, l.faits, l.tarif, l.retenue,
         l.montant + l.bonus, coalesce(l.montant_corrige, l.montant + l.bonus), l.montant_corrige, l.raison_correction,
         l.statut, l.raison, l.action, l.detail_comptes, l.exclu, l.exclu_raison, l.paye_at, l.semaine_suivante_faite_at,
         l.premiere, l.bonus,
         s.action, s.comptes, s.montant, s.raison,
         null::text
    from lignes l
    join public.profiles pr on pr.id = l.poster_id
    left join public.profiles hm on hm.id = pr.manager_id
    left join suiv s on s.poster_id = l.poster_id;
end;
$$;

revoke execute on function public.paie_liste_v2(date, boolean) from public, anon;
grant execute on function public.paie_liste_v2(date, boolean) to authenticated, service_role;

notify pgrst, 'reload schema';
