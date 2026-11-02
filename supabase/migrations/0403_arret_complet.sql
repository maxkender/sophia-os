-- 0403 — Système du 2 nov., partie C : l'arrêt complet.
--
-- La file `arrets` (0402) est traitée toutes les heures (cron « arrets »,
-- minute 40) par la fonction `upwork` (action « arrets ») :
--   - l'OS : posteur et comptes désactivés (arret_os) ;
--   - jamais posté : dernier message sur Upwork, milestones non financées
--     supprimées, milestone financée à rembourser (« Ask for a refund » dans
--     la liste de paie, comme 0395), contrat fermé par l'API s'il ne reste
--     rien de financé, sinon après le remboursement ;
--   - déjà posté : lundi, la liste de paie paie la semaine en cours, ne
--     finance rien et ferme le contrat (« kill ») ;
--   - Slack : liste « À retirer de Slack » sur Cohorts (pas d'API pour ça).
-- Chaque action est journalisée (arrets.etapes) ; un échec ne bloque pas les
-- autres et la ligne passe en rouge sur Cohorts.
--
-- Interrupteur `arret_auto` : off | test | on, défaut test (l'OS est mis à
-- jour, rien ne part sur Upwork : les actions sont notées « simulé »).
-- « Arrêter » (Cohorts) passe aussi par la file (source « manuel »).
-- paie_liste_v2 (même signature) lit aussi la file.
--
-- Additive : réglages, fonctions, un cron cloné. Aucune donnée existante
-- modifiée.
-- Retour arrière : cron.unschedule('arrets') ; drop des fonctions arret_os,
-- arrets_liste, arret_action_faite ; recréer cohorte_arreter de 0392 et
-- paie_liste_v2 de 0395 ; delete des réglages arret_*.

insert into public.reglages (cle, valeur) values
  ('arret_auto', to_jsonb('test'::text)),
  ('arret_message_texte', to_jsonb('Your contract has ended. Thank you for your time.'::text)),
  -- « Job canceled for other reasons » (reasons(reasonType: CONTRACT_END_FIXED), lu le 28/10).
  ('arret_raison_upwork', to_jsonb('107'::text))
on conflict (cle) do nothing;

-- ---------------------------------------------------------------------------
-- L'OS : le posteur et ses comptes désactivés (comme cohorte_arreter).
-- ---------------------------------------------------------------------------
create or replace function public.arret_os(p_id uuid)
returns table (poster_id uuid, a_poste boolean, contrat_id text, slack_user_id text)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_poster uuid;
  v_a_poste boolean;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'arret_os : réservé à la fonction upwork';
  end if;
  select a.poster_id into v_poster from public.arrets a where a.id = p_id;
  if v_poster is null then
    return;
  end if;
  v_a_poste := exists (select 1 from public.passages p
                         join public.comptes c on c.id = p.compte_id
                        where c.poster_id = v_poster
                          and (p.publie_at is not null or p.publie_url is not null));
  update public.profiles set is_active = false where id = v_poster;
  update public.comptes set is_active = false where poster_id = v_poster;
  delete from public.relances_prevues where poster_id = v_poster;
  update public.arrets set a_poste = v_a_poste, maj_at = now() where id = p_id;
  return query
  select pr.id, v_a_poste, pr.upwork_contract_id, pr.slack_user_id
    from public.profiles pr where pr.id = v_poster;
end;
$$;

revoke execute on function public.arret_os(uuid) from public, anon, authenticated;
grant execute on function public.arret_os(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- Cohorts : les arrêts des 14 derniers jours et « Retiré de Slack ».
-- ---------------------------------------------------------------------------
create or replace function public.arrets_liste()
returns table (
  id          uuid,
  poster_id   uuid,
  poster_nom  text,
  hm_prenom   text,
  source      text,
  a_poste     boolean,
  statut      text,
  etapes      jsonb,
  erreur      text,
  created_at  timestamptz,
  maj_at      timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return query
  select a.id, a.poster_id, nullif(btrim(concat_ws(' ', pr.prenom, pr.nom)), ''), hm.prenom,
         a.source, a.a_poste, a.statut, a.etapes, a.erreur, a.created_at, a.maj_at
    from public.arrets a
    join public.profiles pr on pr.id = a.poster_id
    left join public.profiles hm on hm.id = pr.manager_id
   where a.created_at >= now() - interval '14 days'
      or exists (select 1 from jsonb_array_elements(a.etapes) e where e->>'statut' in ('a_faire', 'erreur'))
   order by (a.statut = 'erreur') desc, a.created_at desc;
end;
$$;

revoke execute on function public.arrets_liste() from public, anon;
grant execute on function public.arrets_liste() to authenticated;

-- Une action faite à la main (Slack retiré, remboursement demandé, contrat fermé).
create or replace function public.arret_action_faite(p_id uuid, p_action text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'arret_action_faite : réservé à l''admin et au Head of Ops';
  end if;
  if p_action not in ('slack', 'remboursement', 'fermeture', 'message') then
    raise exception 'arret_action_faite : action %', p_action;
  end if;
  update public.arrets
     set etapes = (select coalesce(jsonb_agg(case when e->>'action' = p_action and e->>'statut' in ('a_faire', 'erreur')
                                                 then e || jsonb_build_object('statut', 'fait', 'detail', 'fait à la main',
                                                                              'at', now(), 'par', auth.uid())
                                                 else e end), '[]'::jsonb)
                     from jsonb_array_elements(etapes) e),
         maj_at = now()
   where id = p_id;
  if not found then
    raise exception 'arret_action_faite : arrêt introuvable';
  end if;
  -- Plus aucune erreur : la ligne repasse « fait ».
  update public.arrets
     set statut = 'fait', erreur = null
   where id = p_id and statut = 'erreur'
     and not exists (select 1 from jsonb_array_elements(etapes) e where e->>'statut' = 'erreur');
end;
$$;

revoke execute on function public.arret_action_faite(uuid, text) from public, anon;
grant execute on function public.arret_action_faite(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- « Arrêter » (Cohorts) : comme 0392, puis la file des arrêts (source manuel).
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
  -- Partie C : Upwork et Slack, par la file (un seul arrêt ouvert par posteur).
  if not exists (select 1 from public.arrets where poster_id = p_poster and statut in ('a_faire', 'en_cours')) then
    insert into public.arrets (poster_id, source, demande_par) values (p_poster, 'manuel', auth.uid());
  end if;
end;
$$;

revoke execute on function public.cohorte_arreter(uuid) from public, anon;
grant execute on function public.cohorte_arreter(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- La liste de paie : les arrêtés de la file aussi (même signature que 0395).
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
  upwork_compte             text,
  remboursement_semaine     date,
  remboursement_montant     numeric
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
  -- Arrêtés (page Cohortes, 0392, et file des arrêts, 0403) entre le lundi payé et le lundi suivant 10 h.
  arretes as (
    select x.poster_id,
           -- Jamais posté (aucun post publié, tous comptes) : la milestone de sa
           -- 1re semaine, financée à l'embauche, est à rembourser (28 oct., F2).
           not exists (select 1 from public.passages p
                         join public.comptes c on c.id = p.compte_id
                        where c.poster_id = x.poster_id
                          and (p.publie_at is not null or p.publie_url is not null)) as jamais_poste
      from (
        select x.poster_id, x.decision_at as le
          from public.recrues_rouges x
         where x.decision = 'arreter'
        union all
        -- Système du 2 nov. (0403) : la file des arrêts complets (Kill à 48 h,
        -- « je ne veux plus », Kill du samedi), sauf un contrat déjà fermé par l'API.
        select ar.poster_id, ar.created_at
          from public.arrets ar
         where not exists (select 1 from jsonb_array_elements(ar.etapes) e
                            where e->>'action' = 'fermeture' and e->>'statut' = 'fait')
      ) x
     where x.le >= (p_lundi::timestamp at time zone 'Europe/Paris')
       and x.le < (((p_lundi + 7)::timestamp + interval '10 hours') at time zone 'Europe/Paris')
     group by x.poster_id
  ),
  base as (
    select c.id, c.poster_id, c.nb_comptes, c.comptes_payes, c.prevus, c.faits, c.tarif, c.retenue,
           c.montant, c.montant_corrige, c.raison_correction, c.statut, c.raison,
           case when c.poster_id in (select a.poster_id from arretes a where a.jamais_poste) then 'annuler'
                when c.poster_id in (select a.poster_id from arretes a) then 'kill'
                else c.action end as action,
           c.detail_comptes, c.exclu, c.exclu_raison, c.paye_at, c.semaine_suivante_faite_at
      from calcule c
    union all
    select null::uuid, a.poster_id, 0, 0, 0, 0, pr.tarif_hebdo, 0::numeric,
           0::numeric, null::numeric, null::text, 'ok'::text, null::text,
           case when a.jamais_poste then 'annuler' else 'kill' end, '[]'::jsonb,
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
  ),
  remb as (
    -- La milestone à rembourser : celle de sa cohorte, au tarif + bonus de la 1re semaine (0388).
    select a.poster_id, pr.cohorte_lundi as semaine,
           coalesce(pr.tarif_hebdo, public.paie_tarif_zone(pr.id)) + v_bonus as montant
      from arretes a
      join public.profiles pr on pr.id = a.poster_id
     where a.jamais_poste
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
         null::text,
         rb.semaine, rb.montant
    from lignes l
    join public.profiles pr on pr.id = l.poster_id
    left join public.profiles hm on hm.id = pr.manager_id
    left join suiv s on s.poster_id = l.poster_id
    left join remb rb on rb.poster_id = l.poster_id;
end;
$$;

revoke execute on function public.paie_liste_v2(date, boolean) from public, anon;
grant execute on function public.paie_liste_v2(date, boolean) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Le cron : toutes les heures à la minute 40, cloné de « upwork-verifier »
-- (même adresse, même secret, déjà en base) : seule l'action change.
-- ---------------------------------------------------------------------------
do $cron$
declare
  v_cmd text;
begin
  select command into v_cmd from cron.job where jobname = 'upwork-verifier';
  if v_cmd is null then
    raise notice 'arrets : cron upwork-verifier introuvable, cron non créé';
    return;
  end if;
  v_cmd := regexp_replace(v_cmd, '"action"\s*:\s*"verifier"', '"action":"arrets"');
  if exists (select 1 from cron.job where jobname = 'arrets') then
    perform cron.unschedule('arrets');
  end if;
  perform cron.schedule('arrets', '40 * * * *', v_cmd);
end
$cron$;

notify pgrst, 'reload schema';
