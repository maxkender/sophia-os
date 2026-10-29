-- 0423 — Prompt 21, partie C : sécurité et cohérence (C2 à C10).
--
-- C2  « Deactivate » (Posters, Create a poster, accueil HM) passe par l'arrêt
--     complet : manage-users appelle `desactivation_arret` après avoir
--     désactivé le posteur → une ligne `arrets` (source manuel, motif
--     « desactivation »), traitée par le cron arrets comme un Kill (arret_auto
--     décide : test = simulé). Réactiver annule un arrêt pas encore commencé.
-- C3  Une seule définition de « Ready » et de « TikTok créé » :
--     `compte_tiktok_cree(compte)` (dernier relevé lisible) et
--     `compte_pret(compte)` (TikTok vu au dernier relevé, Start warmup cliqué,
--     ≥ 5 follows au dernier relevé, aucun post — une vidéo relevée après le
--     début du compte est un post de la cohorte, pas un warm-up raté). Utilisées
--     par pipeline_recrues, cohorte_prets (Cohorts), etapes_recrues_v2
--     (recrues-check) et le déclencheur des relevés.
-- C4  `etapes_recrues_v2` rend aussi le 2e compte d'un Double (étapes 3 et 4,
--     période = son lundi, `compte_lundi`) ; son Kill n'arrête que ce compte.
-- C7  Nouveau texte jeudi_texte_recrue ; jeudi_texte suit la règle des 6.
-- C8  lundi_texte_tous (règle des 6) ; les 4 modèles de nudge en anglais ;
--     slack_lien_invitation rempli s'il est vide (le lien écrit en dur jusqu'ici).
--     Un texte déjà modifié dans l'OS n'est jamais écrasé (mise à jour
--     seulement s'il vaut encore le texte d'origine).
-- C10 `upwork_purger_bruts()` : upwork_appels.reponse et upwork_contrats.brut
--     remis à null au-delà de 24 h (aucune ligne supprimée), cron horaire.
--
-- Additive : fonctions nouvelles, pipeline_recrues et pipeline_tg_releves
-- réécrites à signature identique, réglages. Données existantes changées :
-- jeudi_texte, lundi_texte_tous, nudges (seulement s'ils valent encore leur
-- texte d'origine), slack_lien_invitation (seulement s'il est vide).
-- Aucun interrupteur touché.
-- Retour arrière : cron.unschedule('upwork-purge-brut') ; réappliquer
-- pipeline_recrues de 0413 et pipeline_tg_releves de 0407 ; les nouvelles
-- fonctions peuvent rester (personne d'autre ne les lit).

-- ---------------------------------------------------------------------------
-- C3. « TikTok créé » et « Ready » : une seule définition
-- ---------------------------------------------------------------------------

/**
 * Le lundi où un compte commence à poster : la cohorte pour le 1er compte
 * perso du posteur ; pour un 2e compte (Double, recréation), le lundi de son
 * 1er jour de posts, sinon la fin de son warm-up (lundi qui suit le clic,
 * 0301), sinon le lundi qui suit sa création.
 */
create or replace function public.compte_lundi(p_compte uuid)
returns date
language sql
stable
security definer
set search_path = public
as $$
  select case
           when c.id = (select d.id from public.comptes d
                         where d.poster_id = c.poster_id and d.type_compte = 'perso'
                         order by d.created_at limit 1)
                and pr.cohorte_lundi is not null
             then pr.cohorte_lundi
           else coalesce(
             (select pj.premier_jour - (extract(isodow from pj.premier_jour)::int - 1)
                from public.comptes_premier_jour pj where pj.compte_id = c.id),
             (c.warmup_ends_at at time zone 'Europe/Paris')::date,
             (c.created_at at time zone 'Europe/Paris')::date
               + (8 - extract(isodow from (c.created_at at time zone 'Europe/Paris')::date))::int)
         end
    from public.comptes c
    left join public.profiles pr on pr.id = c.poster_id
   where c.id = p_compte;
$$;

/** Ce lundi à 0 h, heure du pays du compte : à partir de là, ses vidéos sont ses posts. */
create or replace function public.compte_debut(p_compte uuid)
returns timestamptz
language sql
stable
security definer
set search_path = public
as $$
  select public.compte_lundi(c.id)::timestamp
           at time zone (case when c.pays is null then 'Europe/Paris' else public.fuseau_pays(c.pays) end)
    from public.comptes c
   where c.id = p_compte;
$$;

/**
 * « TikTok créé » : le dernier relevé lisible du profil (avant `p_avant` si
 * donné) dit qu'il existe. null : aucun relevé lisible.
 */
create or replace function public.compte_tiktok_cree(p_compte uuid, p_avant timestamptz default null)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select w.existe
    from public.ckd_warmup_releves w
   where w.compte_id = p_compte and w.existe is not null
     and (p_avant is null or w.releve_at < p_avant)
   order by w.releve_at desc
   limit 1;
$$;

/**
 * « Ready » (prompt 21, C3), la seule définition : au dernier relevé lisible
 * (avant `p_avant` si donné, pour la photo de dimanche minuit), le compte
 * TikTok existe, « Start warmup » est cliqué, au moins 5 follows, et aucun
 * post (une vidéo relevée à partir du lundi du compte est un post de sa
 * semaine, elle ne compte pas contre le warm-up).
 */
create or replace function public.compte_pret(p_compte uuid, p_avant timestamptz default null)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select w.existe
       and c.warmup_started_at is not null
       and (p_avant is null or c.warmup_started_at < p_avant)
       and coalesce(w.abonnements, 0) >= 5
       and (coalesce(w.videos, 0) = 0 or w.releve_at >= public.compte_debut(c.id))
      from public.comptes c
      join lateral (
        select x.existe, x.abonnements, x.videos, x.releve_at
          from public.ckd_warmup_releves x
         where x.compte_id = c.id and x.existe is not null
           and (p_avant is null or x.releve_at < p_avant)
         order by x.releve_at desc
         limit 1
      ) w on true
     where c.id = p_compte), false);
$$;

revoke execute on function public.compte_lundi(uuid) from public, anon;
revoke execute on function public.compte_debut(uuid) from public, anon;
revoke execute on function public.compte_tiktok_cree(uuid, timestamptz) from public, anon;
revoke execute on function public.compte_pret(uuid, timestamptz) from public, anon;
grant execute on function public.compte_lundi(uuid) to authenticated, service_role;
grant execute on function public.compte_debut(uuid) to authenticated, service_role;
grant execute on function public.compte_tiktok_cree(uuid, timestamptz) to authenticated, service_role;
grant execute on function public.compte_pret(uuid, timestamptz) to authenticated, service_role;

-- Le déclencheur des relevés (Pipeline) : « warm-up bien fait » selon compte_pret.
create or replace function public.pipeline_tg_releves()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  c record;
begin
  if new.existe is not true then
    return null;
  end if;
  select id, poster_id, warmup_started_at into c from public.comptes where id = new.compte_id;
  if c.poster_id is null then
    return null;
  end if;
  perform public.recrue_evenement_noter(c.poster_id, c.id, 'tiktok_cree', new.releve_at, '@' || new.handle, c.id::text);
  -- Prompt 21, C3 : la même définition partout (le relevé vient d'être écrit).
  if public.compte_pret(c.id) then
    perform public.recrue_evenement_noter(c.poster_id, c.id, 'warmup_bien_fait', new.releve_at,
                                          coalesce(new.abonnements, 0) || ' follows', c.id::text);
  end if;
  return null;
exception when others then
  return null;
end;
$$;

-- Cohorts : « Ready Monday », figé à dimanche minuit (Paris), recrue par recrue.
create or replace function public.cohorte_prets(p_lundis date[])
returns table (poster_id uuid, compte_id uuid, pret boolean)
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
      raise exception 'cohorte_prets : réservé à l''admin et aux HMs';
    end if;
    v_hm := auth.uid();
  end if;
  return query
  select po.id, cpt.id,
         case when cpt.id is null then false
              else public.compte_pret(cpt.id, (po.cohorte_lundi::timestamp at time zone 'Europe/Paris')) end
    from public.profiles po
    left join lateral (select c.id from public.comptes c where c.poster_id = po.id and c.type_compte = 'perso'
                        order by c.created_at limit 1) cpt on true
   where po.cohorte_lundi = any(p_lundis)
     and exists (select 1 from public.user_roles r where r.user_id = po.id and r.role = 'poster')
     and not exists (select 1 from public.hub_posteurs h where h.profile_id = po.id)
     and (v_hm is null or po.manager_id = v_hm);
end;
$$;

revoke execute on function public.cohorte_prets(date[]) from public, anon;
grant execute on function public.cohorte_prets(date[]) to authenticated;

-- ---------------------------------------------------------------------------
-- C3 + C4. recrues-check : les recrues (1er compte) et les 2es comptes d'un
-- Double, avec « Ready » calculé ici. Nouvelle fonction (etapes_recrues reste
-- telle quelle pour un retour arrière du code).
-- ---------------------------------------------------------------------------
create or replace function public.etapes_recrues_v2()
returns table (
  poster_id             uuid,
  prenom                text,
  pays                  text,
  fuseau                text,
  bienvenue_at          timestamptz,
  cohorte_lundi         date,
  premiere_connexion_at timestamptz,
  slack_user_id         text,
  contrat_id            text,
  compte_id             uuid,
  handle                text,
  warmup_started_at     timestamptz,
  tiktok_existe         boolean,
  tiktok_vu_at          timestamptz,
  abonnements           integer,
  videos                integer,
  messages              jsonb,
  prevues               jsonb,
  repondu_at            timestamptz,
  kill                  jsonb,
  deuxieme              boolean,
  pret                  boolean,
  compte_cree_at        timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_auj date := (now() at time zone 'Europe/Paris')::date;
begin
  if coalesce(auth.role(), '') <> 'service_role' and not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return query
  with po as (
    select pr.* from public.profiles pr
     where pr.is_active and pr.cohorte_lundi >= v_auj - 2
       and exists (select 1 from public.user_roles r where r.user_id = pr.id and r.role = 'poster')
       and not exists (select 1 from public.hub_posteurs h where h.profile_id = pr.id)
  ),
  lignes as (
    -- La recrue : son 1er compte perso actif, période = sa cohorte (comme etapes_recrues).
    select po.id as poster_id,
           (select c.id from public.comptes c where c.poster_id = po.id and c.type_compte = 'perso' and c.is_active
             order by c.created_at limit 1) as compte_id,
           false as deuxieme, po.cohorte_lundi as lundi
      from po
    union all
    -- C4 : le 2e compte d'un Double (un compte perso plus ancien est encore actif).
    select d.poster_id, d.compte_id, true, d.lundi
      from (
        select c.poster_id, c.id as compte_id, public.compte_lundi(c.id) as lundi
          from public.comptes c
          join public.profiles pr on pr.id = c.poster_id and pr.is_active
         where c.type_compte = 'perso' and c.is_active and c.created_at > now() - interval '28 days'
           and exists (select 1 from public.user_roles r where r.user_id = c.poster_id and r.role = 'poster')
           and not exists (select 1 from public.hub_posteurs h where h.profile_id = c.poster_id)
           and exists (select 1 from public.comptes o where o.poster_id = c.poster_id and o.id <> c.id
                         and o.type_compte = 'perso' and o.is_active and o.created_at < c.created_at)
      ) d
     where d.lundi >= v_auj - 2
  )
  select l.poster_id, pr.prenom, c.pays,
         case when c.pays is null then 'Europe/Paris' else public.fuseau_pays(c.pays) end,
         coalesce((select a.message_at from public.accueils a where a.poster_id = l.poster_id and a.message_at is not null
                    order by a.message_at limit 1),
                  pr.offre_acceptee_le, pr.created_at),
         l.lundi,
         coalesce(pr.premiere_connexion_at, u.last_sign_in_at),
         pr.slack_user_id, pr.upwork_contract_id,
         c.id, c.handle_tiktok, c.warmup_started_at,
         public.compte_tiktok_cree(c.id),
         (select min(w.releve_at) from public.ckd_warmup_releves w where w.compte_id = c.id and w.existe),
         r.abonnements, r.videos,
         coalesce((select jsonb_agg(jsonb_build_object('id', n.id, 'type', n.type, 'envoye_at', n.envoye_at,
                                                       'reponse_at', n.reponse_at, 'erreur', n.slack_erreur))
                     from public.nudges n
                    where n.poster_id = l.poster_id and n.periode = l.lundi
                      and n.type in ('connexion', 'tiktok', 'warmup_lance', 'warmup_bien_fait')
                      and (not l.deuxieme or n.compte_id = l.compte_id)), '[]'::jsonb),
         coalesce((select jsonb_agg(jsonb_build_object('type', v.type, 'premier_at', v.premier_at, 'statut', v.statut,
                                                       'raison', v.raison))
                     from public.relances_prevues v
                    where v.poster_id = l.poster_id and v.periode = l.lundi
                      and v.type in ('connexion', 'tiktok', 'warmup_lance', 'warmup_bien_fait')), '[]'::jsonb),
         public.posteur_reaction_at(l.poster_id),
         (select jsonb_agg(jsonb_build_object('id', k.id, 'etape', k.etape, 'statut', k.statut, 'prevu_at', k.prevu_at))
            from public.kills_auto k
           where k.poster_id = l.poster_id and k.periode = l.lundi
             and (not l.deuxieme or k.compte_id = l.compte_id)),
         l.deuxieme,
         case when c.id is null then false else public.compte_pret(c.id) end,
         c.created_at
    from lignes l
    join public.profiles pr on pr.id = l.poster_id
    left join auth.users u on u.id = l.poster_id
    left join public.comptes c on c.id = l.compte_id
    left join lateral (
      select w.abonnements, w.videos from public.ckd_warmup_releves w
       where w.compte_id = c.id and w.existe is not null
       order by w.releve_at desc limit 1
    ) r on true;
end;
$$;

revoke execute on function public.etapes_recrues_v2() from public, anon;
grant execute on function public.etapes_recrues_v2() to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- C3. Pipeline : « TikTok créé » et « Ready » par les deux fonctions ; le 2e
-- compte d'un Double daté par compte_lundi (comme recrues-check, C4).
-- Même signature que 0413.
-- ---------------------------------------------------------------------------
create or replace function public.pipeline_recrues()
returns table (
  carte_id          text,
  poster_id         uuid,
  compte_id         uuid,
  nom               text,
  pays              text,
  hm_id             uuid,
  hm_prenom         text,
  cohorte_lundi     date,
  deuxieme          boolean,
  handle            text,
  colonne           integer,
  colonne_depuis    timestamptz,
  etape_attendue    text,
  etat              text,
  message_at        timestamptz,
  message_canal     text,
  message_test      boolean,
  limite_at         timestamptz,
  reponse_at        timestamptz,
  reponse_extrait   text,
  kill_id           uuid,
  kill_prevu_at     timestamptz,
  pause_jusqu_au    timestamptz,
  upwork_contrat_url text,
  slack_user_id     text,
  dernier_type      text,
  dernier_at        timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_auj date := (now() at time zone 'Europe/Paris')::date;
  v_kill_h numeric := coalesce((select (valeur->>'kill_h')::numeric from public.reglages where cle = 'etapes_delais'), 48);
  -- A2 (0413) : l'arrêt part après le délai d'annulation.
  v_annul_h numeric := coalesce((select (valeur->>'kill_annulation_h')::numeric from public.reglages where cle = 'etapes_delais'), 12);
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return query
  with po as (
    select pr.* from public.profiles pr
     where pr.is_active and pr.cohorte_lundi >= v_auj - 7
       and exists (select 1 from public.user_roles r where r.user_id = pr.id and r.role = 'poster')
       and not exists (select 1 from public.hub_posteurs h where h.profile_id = pr.id)
  ),
  -- Une carte par recrue (son 1er compte) et une par 2e compte récent.
  cartes as (
    select po.id as poster_id, c1.id as compte_id, false as deuxieme, po.cohorte_lundi as debut
      from po
      left join lateral (select c.id from public.comptes c where c.poster_id = po.id and c.type_compte = 'perso'
                          order by c.created_at limit 1) c1 on true
    union all
    select c.poster_id, c.id, true, public.compte_lundi(c.id)
      from public.comptes c
      join public.profiles pr on pr.id = c.poster_id and pr.is_active
     where c.type_compte = 'perso' and c.is_active and c.created_at > now() - interval '28 days'
       and exists (select 1 from public.comptes d where d.poster_id = c.poster_id and d.id <> c.id
                     and d.type_compte = 'perso' and d.created_at < c.created_at)
       and not exists (select 1 from public.hub_posteurs h where h.profile_id = c.poster_id)
  ),
  faits as (
    select ca.*, pr.prenom, pr.nom, pr.manager_id, pr.upwork_contrat_url, pr.slack_user_id,
           c.handle_tiktok, c.pays, c.warmup_started_at,
           coalesce((select a.message_at from public.accueils a where a.poster_id = ca.poster_id and a.message_at is not null
                      order by a.message_at limit 1), pr.offre_acceptee_le, pr.created_at) as t1,
           coalesce(pr.premiere_connexion_at, u.last_sign_in_at) as t2,
           -- C3 : « TikTok créé » au dernier relevé ; depuis son 1er relevé.
           case when public.compte_tiktok_cree(ca.compte_id) then
             (select min(w.releve_at) from public.ckd_warmup_releves w where w.compte_id = ca.compte_id and w.existe)
           end as t3,
           c.warmup_started_at as t4,
           -- C3 : « Ready » (compte_pret) ; depuis le 1er relevé où il l'était.
           case when public.compte_pret(ca.compte_id) then
             coalesce((select min(w.releve_at) from public.ckd_warmup_releves w
                        where w.compte_id = ca.compte_id and w.existe and coalesce(w.abonnements, 0) >= 5
                          and c.warmup_started_at is not null and w.releve_at >= c.warmup_started_at),
                      c.warmup_started_at)
           end as t5,
           (select min(coalesce(p.publie_at, p.created_at)) from public.passages p
             where p.compte_id = ca.compte_id and p.publie_url is not null) as t6
      from cartes ca
      join public.profiles pr on pr.id = ca.poster_id
      left join auth.users u on u.id = ca.poster_id
      left join public.comptes c on c.id = ca.compte_id
  ),
  colonnes as (
    select f.*,
           case
             when f.t6 is not null then 6
             when f.deuxieme then case when f.t4 is null then 3 when f.t5 is null then 4 else 5 end
             when f.t2 is null then 1
             when f.t3 is null then 2
             when f.t4 is null then 3
             when f.t5 is null then 4
             else 5
           end as col
      from faits f
  ),
  etapes as (
    select co.*,
           case co.col when 1 then 'connexion' when 2 then 'tiktok' when 3 then 'warmup_lance'
                       when 4 then 'warmup_bien_fait' when 5 then 'lundi_soir' end as attendue,
           case co.col when 1 then co.t1 when 2 then co.t2 when 3 then coalesce(co.t3, co.t2, co.t1)
                       when 4 then co.t4 when 5 then co.t5 else co.t6 end as depuis
      from colonnes co
  ),
  suivi as (
    select e.*,
           n.envoye_at as n_at, n.canal as n_canal,
           v.premier_at as v_at, v.canal as v_canal,
           k.id as k_id, k.statut as k_statut, k.prevu_at as k_prevu,
           greatest((select max(x.recu_at) from public.posteur_reponses x where x.poster_id = e.poster_id),
                    (select r.slack_at from public.posteur_reactions r where r.poster_id = e.poster_id)) as rep_at,
           (select left(x.texte, 120) from public.posteur_reponses x where x.poster_id = e.poster_id
             order by x.recu_at desc limit 1) as rep_texte,
           (select max(p.jusqu_au) from public.posteur_pauses p where p.poster_id = e.poster_id and p.jusqu_au > now()) as pause
      from etapes e
      left join lateral (select n.envoye_at, n.canal from public.nudges n
                          where n.poster_id = e.poster_id and n.type = e.attendue and n.periode = e.debut
                          order by n.envoye_at desc limit 1) n on true
      left join lateral (select v.premier_at, v.canal from public.relances_prevues v
                          where v.poster_id = e.poster_id and v.type = e.attendue and v.periode = e.debut and v.statut = 'prevu'
                          limit 1) v on true
      left join lateral (select k.id, k.statut, k.prevu_at from public.kills_auto k
                          where k.poster_id = e.poster_id and k.etape = e.attendue and k.periode = e.debut
                          limit 1) k on true
  )
  select case when s.deuxieme then s.compte_id::text else s.poster_id::text end,
         s.poster_id, s.compte_id,
         nullif(btrim(concat_ws(' ', s.prenom, s.nom)), ''),
         s.pays, s.manager_id, hm.prenom, s.debut, s.deuxieme, s.handle_tiktok,
         s.col, s.depuis, s.attendue,
         case
           when s.col = 6 then 'fait'
           when s.k_statut = 'en_attente' then 'kill'
           when coalesce(s.n_at, s.v_at) is not null and s.rep_at >= coalesce(s.n_at, s.v_at) then 'repondu'
           when coalesce(s.n_at, s.v_at) is not null then 'relance'
           else 'attente'
         end,
         coalesce(s.n_at, s.v_at), coalesce(s.n_canal, s.v_canal), s.n_at is null and s.v_at is not null,
         case when coalesce(s.n_at, s.v_at) is not null then coalesce(s.n_at, s.v_at) + make_interval(secs => (v_kill_h + v_annul_h) * 3600) end,
         case when coalesce(s.n_at, s.v_at) is not null and s.rep_at >= coalesce(s.n_at, s.v_at) then s.rep_at end,
         case when coalesce(s.n_at, s.v_at) is not null and s.rep_at >= coalesce(s.n_at, s.v_at) then s.rep_texte end,
         case when s.k_statut = 'en_attente' then s.k_id end,
         case when s.k_statut = 'en_attente' then s.k_prevu end,
         s.pause, s.upwork_contrat_url, s.slack_user_id,
         d.type, d.at
    from suivi s
    left join public.profiles hm on hm.id = s.manager_id
    left join lateral (select ev.type, ev.at from public.recrue_evenements ev where ev.poster_id = s.poster_id
                        order by ev.at desc limit 1) d on true
   -- Le 1er jour posté sort le mardi ; les autres restent 7 jours après leur lundi.
   where (s.col = 6 and s.debut >= v_auj) or (s.col < 6 and s.debut >= v_auj - 7);
end;
$$;

-- ---------------------------------------------------------------------------
-- C2. « Deactivate » = l'arrêt complet (file `arrets`), partout
-- ---------------------------------------------------------------------------
/**
 * Appelée par manage-users (action « activer ») après la mise à jour du
 * profil. Désactivé : une ligne `arrets` (source manuel, motif
 * « desactivation »), un seul arrêt ouvert par posteur ; le cron arrets fait
 * le reste selon arret_auto (test : simulé). Réactivé : un arrêt encore « à
 * faire » sans aucune action réelle est fermé (« annulé : réactivé »).
 * Seulement les posteurs (pas les recruteurs), jamais la cohorte RUUL.
 * Rend : arret | deja | annule | sans_objet.
 */
create or replace function public.desactivation_arret(p_poster uuid, p_actif boolean, p_par uuid default null)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_n integer;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'desactivation_arret : réservé à manage-users';
  end if;
  if not exists (select 1 from public.user_roles r where r.user_id = p_poster and r.role = 'poster')
     or exists (select 1 from public.hub_posteurs h where h.profile_id = p_poster) then
    return 'sans_objet';
  end if;
  if not p_actif then
    if exists (select 1 from public.arrets where poster_id = p_poster and statut in ('a_faire', 'en_cours')) then
      return 'deja';
    end if;
    insert into public.arrets (poster_id, source, motif, demande_par)
    values (p_poster, 'manuel', 'desactivation',
            case when exists (select 1 from auth.users u where u.id = p_par) then p_par end);
    return 'arret';
  end if;
  -- Réactivé : un arrêt pas encore commencé (rien de fait pour de vrai) est annulé.
  update public.arrets a
     set statut = 'fait',
         etapes = a.etapes || jsonb_build_array(jsonb_build_object(
                    'action', 'os', 'statut', 'sans_objet', 'detail', 'annulé : posteur réactivé', 'at', now())),
         erreur = null,
         maj_at = now()
   where a.poster_id = p_poster and a.statut = 'a_faire'
     and not exists (select 1 from jsonb_array_elements(a.etapes) e where e->>'statut' = 'fait');
  get diagnostics v_n = row_count;
  return case when v_n > 0 then 'annule' else 'sans_objet' end;
end;
$$;

revoke execute on function public.desactivation_arret(uuid, boolean, uuid) from public, anon, authenticated;
grant execute on function public.desactivation_arret(uuid, boolean, uuid) to service_role;

comment on column public.arrets.motif is
  'Prompt 21 : « moins6 » (B1, 0416) ou « desactivation » (C2, 0423 : bouton Deactivate), source « manuel ».';

-- ---------------------------------------------------------------------------
-- C7, C8. Textes aux posteurs (anglais)
-- ---------------------------------------------------------------------------
insert into public.reglages (cle, valeur) values
  ('jeudi_texte_recrue', to_jsonb(
    'Hi {prenom}, you start on Monday {date} only if your warm-up is done by Sunday midnight. Still missing: {ce_qui_manque}.'::text)),
  -- C4 : le 2e compte d'un Double (étapes 3 et 4) ; son Kill n'arrête que ce compte.
  ('etape_texte_warmup_lance_deuxieme', to_jsonb(
    'Hi {prenom}, your 2nd account @{handle} is waiting: please click Start warmup for it on your dashboard today, then follow 5 accounts with it. If nothing happens within 48 hours, we''ll stop this 2nd account (your 1st account keeps going).'::text)),
  ('etape_texte_warmup_bien_fait_deuxieme', to_jsonb(
    'Hi {prenom}, the warm-up of your 2nd account @{handle} isn''t right yet: {ce_qui_manque}. Please fix it before Sunday midnight, or it won''t start on Monday {date}.'::text))
on conflict (cle) do nothing;

-- jeudi_texte et lundi_texte_tous : la règle des 6 (B1), seulement s'ils valent
-- encore leur texte d'origine (0404) ; un texte modifié dans l'OS reste.
update public.reglages
   set valeur = to_jsonb('Hi {prenom}, you have {faits} posts with link this week. Below 6 by Sunday midnight, we''ll have to stop our collaboration. Please post twice a day and paste each link the same day.'::text),
       updated_at = now()
 where cle = 'jeudi_texte'
   and valeur = to_jsonb('Hi {prenom}, you''ve been missing posts or links this week ({faits} of {attendus}). Please post twice a day and paste each link on your dashboard the same day.'::text);

update public.reglages
   set valeur = to_jsonb('Reminder: a post only counts when you mark it published with its link on your dashboard, the same day, before midnight. Below 6 posts with link in a week, we stop the collaboration.'::text),
       updated_at = now()
 where cle = 'lundi_texte_tous'
   and valeur = to_jsonb('Reminder: a post only counts when you mark it published with its link on your dashboard, the same day, before midnight. No link = not paid.'::text);

-- Les 4 modèles de nudge, en anglais (s'ils valent encore ceux de 0238).
update public.reglages
   set valeur = jsonb_build_object('modeles', jsonb_build_array(
         jsonb_build_object('id', 'regularite', 'titre', 'You''re losing your rhythm',
           'corps', 'You missed several planned posts over the last few days. Your calendar is ready: post what''s waiting for you, even late, it counts.'),
         jsonb_build_object('id', 'vues_basses', 'titre', 'Your views aren''t taking off',
           'corps', 'Your latest posts get few views. Check the posting time, the first slide and the sound you use, and tell us if something is blocking you.'),
         jsonb_build_object('id', 'fin_essai', 'titre', 'Your trial period ends soon',
           'corps', 'Your trial period ends soon. Now is the time to publish everything that''s planned: that''s what we look at for what comes next.'),
         jsonb_build_object('id', 'bravo', 'titre', 'Keep it up',
           'corps', 'Good rhythm and good views on your latest posts. Keep this consistency.'))),
       updated_at = now()
 where cle = 'nudges'
   and valeur = jsonb_build_object('modeles', jsonb_build_array(
         jsonb_build_object('id', 'regularite', 'titre', 'On perd le rythme',
           'corps', 'Tu as raté plusieurs posts prévus ces derniers jours. Le calendrier est déjà prêt : '
                    || 'poste ce qui t''attend, même en retard, ça compte.'),
         jsonb_build_object('id', 'vues_basses', 'titre', 'Les vues ne décollent pas',
           'corps', 'Tes derniers posts font peu de vues. Vérifie l''heure de publication, la première slide '
                    || 'et le son utilisé — et dis-nous si quelque chose te bloque.'),
         jsonb_build_object('id', 'fin_essai', 'titre', 'Fin de période d''essai',
           'corps', 'Ta période d''essai se termine bientôt. C''est le moment de publier tout ce qui est prévu : '
                    || 'c''est ce qu''on regarde pour la suite.'),
         jsonb_build_object('id', 'bravo', 'titre', 'Continue comme ça',
           'corps', 'Bon rythme et bonnes vues sur tes derniers posts — garde cette régularité.')));

-- C8 : un seul lien Slack, ce réglage. Vide aujourd'hui : il prend le lien
-- qu'utilisaient jusqu'ici les fonctions (écrit en dur, retiré du code).
insert into public.reglages (cle, valeur) values
  ('slack_lien_invitation', to_jsonb('https://join.slack.com/t/sophia-system/shared_invite/zt-4ef0h51pi-utjxbNZ7ArY_6iwy3DWazA'::text))
on conflict (cle) do nothing;
update public.reglages
   set valeur = to_jsonb('https://join.slack.com/t/sophia-system/shared_invite/zt-4ef0h51pi-utjxbNZ7ArY_6iwy3DWazA'::text),
       updated_at = now()
 where cle = 'slack_lien_invitation'
   and coalesce(btrim(valeur #>> '{}'), '') = '';

-- ---------------------------------------------------------------------------
-- C10. Les réponses brutes de l'API Upwork, pas plus de 24 h (conditions de
-- l'API). Seules les colonnes brutes passent à null ; les lignes et les champs
-- utiles restent.
-- ---------------------------------------------------------------------------
create or replace function public.upwork_purger_bruts()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_appels integer;
  v_contrats integer;
begin
  update public.upwork_appels set reponse = null
   where reponse is not null and at < now() - interval '24 hours';
  get diagnostics v_appels = row_count;
  update public.upwork_contrats set brut = null
   where brut is not null and lu_at < now() - interval '24 hours';
  get diagnostics v_contrats = row_count;
  return jsonb_build_object('appels', v_appels, 'contrats', v_contrats);
end;
$$;

revoke execute on function public.upwork_purger_bruts() from public, anon, authenticated;
grant execute on function public.upwork_purger_bruts() to service_role;

select cron.schedule('upwork-purge-brut', '17 * * * *', 'select public.upwork_purger_bruts()');

notify pgrst, 'reload schema';
