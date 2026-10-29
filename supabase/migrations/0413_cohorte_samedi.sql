-- 0413 — Prompt 21, partie A : les corrections de l'audit du 28 oct.
--
-- A1. Qui commence lundi (décision du 29 oct.) :
--   - `cohorte_jour_limite` = 6 (samedi) : une offre acceptée au plus tard le
--     samedi (fin de journée, pays de la recrue) commence le lundi qui suit ;
--     `cohorte_lundi_de_pays` pour l'accueil automatique (heure du pays) ;
--   - les posts d'une recrue ne commencent jamais avant le lundi de sa
--     cohorte, même si elle clique Start warmup le dimanche soir : déclencheur
--     `comptes_warmup_zz_cohorte` (après celui de 0301) ;
--   - pas prête dimanche minuit (heure du pays) : reportée seule au lundi
--     suivant (`cohorte_reporter_auto`, appelé par recrues-check) ; lundi
--     matin, `lundi_texte_warmup` (`semaine_posteurs` la compte encore dans la
--     cohorte du jour) ; les relances d'étape et le Kill 48 h continuent ;
--   - « Postpone » (`cohorte_reporter`) change la cohorte AVANT les comptes,
--     sinon le déclencheur de 0301 remettait l'ancien lundi.
-- A2. Pas de Kill sur quelqu'un qui a répondu :
--   - `posteur_reactions` : un message du posteur dans n'importe quel canal
--     Slack où le bot est (slack-faq) ; `posteur_reaction_at` (DM, Upwork,
--     boutons, Slack) sert à etapes_recrues, lundi_soir_posteurs, Pipeline ;
--   - `reponses_cibles_upwork_v2` : toutes les conversations où l'OS a écrit
--     depuis 14 jours (messages compris), filtrable par posteur ; cron
--     `reponses-upwork` toutes les heures à :05 (recrues-check à :10) ;
--   - Pipeline : l'heure réelle de l'arrêt (48 h + 12 h d'annulation).
-- A3. Check du lundi 20 h : jamais une recrue pas prête dimanche minuit.
-- A4. Plus aucune liaison contrat ↔ posteur « à peu près » :
--   - `contrats_relier()` ne relie plus que l'identifiant exact (lien du
--     contrat collé) ; les noms deviennent des suggestions
--     (`contrats_suggestions`, confirmées à la main : `contrat_lier`) ;
--   - `liaisons_a_verifier` / `liaison_verifier` : les liaisons faites sans
--     accueil ni lien exact, à confirmer ou délier.
-- A5. `accueil_contrat_auto(url)` : avec accueil_auto = on, un contrat déjà
--     accueilli ne se crée pas à la main (manage-users le refuse aussi).
-- A6. `kill_message_auto` : off / test / on (oui → on, non → off).
-- A7. `etapes_delais.kill_h` : 24 h au moins, vérifié en base.
--
-- Additive : réglages, une table, des fonctions, un déclencheur. Données
-- changées : cohorte_jour_limite (4 → 6), lundi_texte_warmup (nouveau texte),
-- kill_message_auto (true → "on"), le planning du cron reponses-upwork.
-- Aucune cohorte existante n'est recalculée.
-- Retour arrière : cohorte_jour_limite = 4 ; drop des fonctions et du
-- déclencheur ajoutés ; recréer les fonctions remplacées depuis 0391, 0392,
-- 0402, 0404, 0407, 0408, 0410 et 0382 ; cron reponses-upwork '45 8,15 * * *'.

-- ---------------------------------------------------------------------------
-- A1. La cohorte : samedi, heure du pays
-- ---------------------------------------------------------------------------
update public.reglages set valeur = to_jsonb(6) where cle = 'cohorte_jour_limite';
insert into public.reglages (cle, valeur) values ('cohorte_jour_limite', to_jsonb(6)) on conflict (cle) do nothing;

create or replace function public.cohorte_lundi_de(p_jour date)
returns date
language sql
stable
set search_path = public
as $$
  with x as (
    select p_jour + (7 - coalesce((select (valeur #>> '{}')::int from public.reglages where cle = 'cohorte_jour_limite'), 6)) as d
  )
  select (d + (8 - extract(isodow from d)::int))::date from x;
$$;

-- L'accueil automatique : la date d'acceptation dans le pays de la recrue.
create or replace function public.cohorte_lundi_de_pays(p_at timestamptz, p_pays text)
returns date
language sql
stable
set search_path = public
as $$
  select public.cohorte_lundi_de(
    (coalesce(p_at, now()) at time zone (case when p_pays is null then 'Europe/Paris' else public.fuseau_pays(p_pays) end))::date);
$$;

grant execute on function public.cohorte_lundi_de_pays(timestamptz, text) to authenticated, service_role;

-- Les posts jamais avant le lundi de la cohorte : le 1er compte perso d'une
-- recrue finit son warm-up au plus tôt ce lundi-là (00:00 Paris, l'heure du
-- moteur de minuit). Après `comptes_warmup_jusqu_au_lundi` (0301) et
-- `comptes_warmup_z_premiers_posts` (0369) : ordre alphabétique.
create or replace function public.warmup_pas_avant_cohorte()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lundi date;
begin
  if new.warmup_ends_at is null
     or new.warmup_ends_at <= now()
     or new.warmup_ends_at is not distinct from old.warmup_ends_at
     or new.type_compte is distinct from 'perso'
     or new.poster_id is null then
    return new;
  end if;
  -- Un 2e compte (Double, recréation) suit ses propres règles.
  if exists (select 1 from public.comptes d where d.poster_id = new.poster_id and d.id <> new.id
               and d.type_compte = 'perso' and d.created_at < new.created_at) then
    return new;
  end if;
  if exists (select 1 from public.hub_posteurs h where h.profile_id = new.poster_id) then
    return new;
  end if;
  select pr.cohorte_lundi into v_lundi from public.profiles pr where pr.id = new.poster_id;
  if v_lundi is not null then
    new.warmup_ends_at := greatest(new.warmup_ends_at, (v_lundi::timestamp at time zone 'Europe/Paris'));
  end if;
  return new;
exception when others then
  return new;
end;
$$;

create or replace trigger comptes_warmup_zz_cohorte
  before update of warmup_ends_at on public.comptes
  for each row execute function public.warmup_pas_avant_cohorte();

-- ---------------------------------------------------------------------------
-- A1. Reporter : à la main (Postpone) ou seul, dimanche minuit
-- ---------------------------------------------------------------------------
create or replace function public.cohorte_reporter_interne(p_poster uuid, p_par uuid)
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

  -- La cohorte d'abord : le déclencheur des comptes (0413) la lit.
  update public.profiles set cohorte_lundi = v_nouveau where id = p_poster;

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

  update public.recrues_rouges
     set decision = 'reporter', decision_at = now(), decision_par = p_par
   where poster_id = p_poster and decision is null;
  -- Ce qui était prévu pour l'ancienne cohorte ne vaut plus.
  delete from public.relances_prevues where poster_id = p_poster and type <> 'mercredi';
  return v_nouveau;
end;
$$;

revoke execute on function public.cohorte_reporter_interne(uuid, uuid) from public, anon, authenticated;
grant execute on function public.cohorte_reporter_interne(uuid, uuid) to service_role;

create or replace function public.cohorte_reporter(p_poster uuid)
returns date
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'cohorte_reporter : réservé à l''admin et au Head of Ops';
  end if;
  return public.cohorte_reporter_interne(p_poster, auth.uid());
end;
$$;

-- recrues-check, dimanche minuit (heure du pays) : pas prête → la semaine
-- d'après. Une seule fois par cohorte : rien si elle a déjà changé.
create or replace function public.cohorte_reporter_auto(p_poster uuid, p_etape text, p_periode date)
returns date
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'cohorte_reporter_auto : réservé à recrues-check';
  end if;
  if (select pr.cohorte_lundi from public.profiles pr where pr.id = p_poster and pr.is_active) is distinct from p_periode then
    return null;
  end if;
  insert into public.recrues_rouges (poster_id, etape, periode)
  values (p_poster, p_etape, p_periode)
  on conflict (poster_id, etape, periode) do nothing;
  perform public.recrue_evenement_noter(p_poster, null, 'reporte', now(), p_etape, 'reporte:' || p_periode::text);
  return public.cohorte_reporter_interne(p_poster, null);
end;
$$;

revoke execute on function public.cohorte_reporter_auto(uuid, text, date) from public, anon, authenticated;
grant execute on function public.cohorte_reporter_auto(uuid, text, date) to service_role;

-- Lundi matin, la recrue reportée.
update public.reglages
   set valeur = to_jsonb('You can''t start yet: {ce_qui_manque}. Finish it before Sunday midnight and you start next Monday.'::text)
 where cle = 'lundi_texte_warmup';

create or replace function public.semaine_posteurs(p_lundi date)
returns table (
  poster_id        uuid,
  prenom           text,
  pays             text,
  fuseau           text,
  slack_user_id    text,
  contrat_id       text,
  cohorte_lundi    date,
  attendus_lun_mer integer,
  faits_lun_mer    integer,
  prevus_semaine   integer,
  envoyes          text[],
  prevus_test      text[]
)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
begin
  if coalesce(auth.role(), '') <> 'service_role' and not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if extract(isodow from p_lundi) <> 1 then
    raise exception 'semaine_posteurs : % n''est pas un lundi', p_lundi;
  end if;
  return query
  with po as (
    select pr.* from public.profiles pr
     where pr.is_active
       and exists (select 1 from public.user_roles r where r.user_id = pr.id and r.role = 'poster')
       and not exists (select 1 from public.hub_posteurs h where h.profile_id = pr.id)
  ),
  s as (
    select c.poster_id,
           min(c.pays) as pays,
           (count(p.id) filter (where p.date_publication_prevue between p_lundi and p_lundi + 2))::int as attendus,
           (count(p.id) filter (where p.date_publication_prevue between p_lundi and p_lundi + 2
                                  and p.publie_url is not null))::int as faits,
           count(p.id)::int as semaine
      from public.comptes c
      join public.passages p on p.compte_id = c.id
     where c.poster_id in (select id from po) and c.type_compte = 'perso' and c.is_active
       and p.date_publication_prevue between p_lundi and p_lundi + 6
       and p.statut::text <> 'brouillon' and not coalesce(p.est_rappel, false)
     group by c.poster_id
  ),
  cpt as (
    select distinct on (c.poster_id) c.poster_id, c.pays
      from public.comptes c
     where c.poster_id in (select id from po) and c.type_compte = 'perso' and c.is_active
     order by c.poster_id, c.created_at
  )
  select po.id, po.prenom, coalesce(s.pays, cpt.pays),
         case when coalesce(s.pays, cpt.pays) is null then 'Europe/Paris' else public.fuseau_pays(coalesce(s.pays, cpt.pays)) end,
         po.slack_user_id, po.upwork_contract_id,
         -- Reportée dimanche minuit : encore de la cohorte du jour pour le message du lundi.
         case when re.poster_id is not null then p_lundi else po.cohorte_lundi end,
         coalesce(s.attendus, 0), coalesce(s.faits, 0), coalesce(s.semaine, 0),
         coalesce((select array_agg(n.type) from public.nudges n
                    where n.poster_id = po.id and n.periode = p_lundi and n.type in ('lundi', 'jeudi')), '{}'),
         coalesce((select array_agg(v.type) from public.relances_prevues v
                    where v.poster_id = po.id and v.periode = p_lundi and v.type in ('lundi', 'jeudi')), '{}')
    from po
    left join s on s.poster_id = po.id
    left join cpt on cpt.poster_id = po.id
    left join lateral (select distinct rr.poster_id from public.recrues_rouges rr
                        where rr.poster_id = po.id and rr.periode = p_lundi and rr.decision = 'reporter') re on true
   where s.poster_id is not null or po.cohorte_lundi = p_lundi or re.poster_id is not null;
end;
$$;

-- ---------------------------------------------------------------------------
-- A2. Une réaction, d'où qu'elle vienne
-- ---------------------------------------------------------------------------
create table if not exists public.posteur_reactions (
  poster_id  uuid primary key references public.profiles (id) on delete cascade,
  slack_at   timestamptz,
  slack_canal text
);

comment on table public.posteur_reactions is
  'Prompt 21, A2 (0413) : le dernier message du posteur dans un canal Slack (hors DM, déjà dans posteur_reponses). Annule un Kill comme une réponse.';

alter table public.posteur_reactions enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'posteur_reactions'
                  and policyname = 'posteur_reactions lecture') then
    create policy "posteur_reactions lecture" on public.posteur_reactions
      for select to authenticated using ((select public.is_admin()));
  end if;
end $$;
revoke all on public.posteur_reactions from public, anon, authenticated;
grant select on public.posteur_reactions to authenticated;
grant all on public.posteur_reactions to service_role;

create or replace function public.posteur_reaction_slack(p_slack_user text, p_canal text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  k integer;
begin
  insert into public.posteur_reactions (poster_id, slack_at, slack_canal)
  select p.id, now(), p_canal from public.profiles p where p.slack_user_id = p_slack_user
  on conflict (poster_id) do update set slack_at = excluded.slack_at, slack_canal = excluded.slack_canal;
  get diagnostics k = row_count;
  return k;
end;
$$;

revoke execute on function public.posteur_reaction_slack(text, text) from public, anon, authenticated;
grant execute on function public.posteur_reaction_slack(text, text) to service_role;

-- La dernière réaction : réponse à un nudge, message reçu (DM, bouton, Upwork), message dans un canal Slack.
create or replace function public.posteur_reaction_at(p_poster uuid)
returns timestamptz
language sql
stable
security definer
set search_path = public
as $$
  select greatest(
    (select max(n.reponse_at) from public.nudges n where n.poster_id = p_poster),
    (select max(x.recu_at) from public.posteur_reponses x where x.poster_id = p_poster),
    (select r.slack_at from public.posteur_reactions r where r.poster_id = p_poster));
$$;

revoke execute on function public.posteur_reaction_at(uuid) from public, anon;
grant execute on function public.posteur_reaction_at(uuid) to authenticated, service_role;

create or replace function public.etapes_recrues()
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
  kill                  jsonb
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
  cpt as (
    select distinct on (c.poster_id) c.poster_id, c.id, c.handle_tiktok, c.pays, c.warmup_started_at
      from public.comptes c
     where c.poster_id in (select id from po) and c.type_compte = 'perso' and c.is_active
     order by c.poster_id, c.created_at
  )
  select po.id, po.prenom, cpt.pays,
         case when cpt.pays is null then 'Europe/Paris' else public.fuseau_pays(cpt.pays) end,
         coalesce((select a.message_at from public.accueils a where a.poster_id = po.id and a.message_at is not null
                    order by a.message_at limit 1),
                  po.offre_acceptee_le, po.created_at),
         po.cohorte_lundi,
         coalesce(po.premiere_connexion_at, u.last_sign_in_at),
         po.slack_user_id, po.upwork_contract_id,
         cpt.id, cpt.handle_tiktok, cpt.warmup_started_at,
         r.existe,
         (select min(w.releve_at) from public.ckd_warmup_releves w where w.compte_id = cpt.id and w.existe),
         r.abonnements, r.videos,
         coalesce((select jsonb_agg(jsonb_build_object('id', n.id, 'type', n.type, 'envoye_at', n.envoye_at,
                                                       'reponse_at', n.reponse_at, 'erreur', n.slack_erreur))
                     from public.nudges n
                    where n.poster_id = po.id and n.periode = po.cohorte_lundi
                      and n.type in ('connexion', 'tiktok', 'warmup_lance', 'warmup_bien_fait')), '[]'::jsonb),
         coalesce((select jsonb_agg(jsonb_build_object('type', v.type, 'premier_at', v.premier_at, 'statut', v.statut,
                                                       'raison', v.raison))
                     from public.relances_prevues v
                    where v.poster_id = po.id and v.periode = po.cohorte_lundi
                      and v.type in ('connexion', 'tiktok', 'warmup_lance', 'warmup_bien_fait')), '[]'::jsonb),
         public.posteur_reaction_at(po.id),
         (select jsonb_agg(jsonb_build_object('id', k.id, 'etape', k.etape, 'statut', k.statut, 'prevu_at', k.prevu_at))
            from public.kills_auto k where k.poster_id = po.id and k.periode = po.cohorte_lundi)
    from po
    left join auth.users u on u.id = po.id
    left join cpt on cpt.poster_id = po.id
    left join lateral (
      select w.existe, w.abonnements, w.videos from public.ckd_warmup_releves w
       where w.compte_id = cpt.id and w.existe is not null
       order by w.releve_at desc limit 1
    ) r on true;
end;
$$;

-- A3. Le check du lundi 20 h : jamais une recrue pas prête.
create or replace function public.lundi_soir_posteurs(p_lundi date)
returns table (
  poster_id       uuid,
  compte_id       uuid,
  deuxieme        boolean,
  prenom          text,
  fuseau          text,
  contrat_id      text,
  publies_lundi   integer,
  dernier_post_at timestamptz,
  message_at      timestamptz,
  message_id      uuid,
  message_erreur  text,
  prevu_at        timestamptz,
  repondu_at      timestamptz,
  kill_id         uuid,
  kill_statut     text
)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
begin
  if coalesce(auth.role(), '') <> 'service_role' and not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if extract(isodow from p_lundi) <> 1 then
    raise exception 'lundi_soir_posteurs : % n''est pas un lundi', p_lundi;
  end if;
  return query
  with cartes as (
    -- La cohorte : son 1er compte.
    select pr.id as poster_id, c1.id as compte_id, false as deuxieme
      from public.profiles pr
      left join lateral (select c.id from public.comptes c where c.poster_id = pr.id and c.type_compte = 'perso'
                          order by c.created_at limit 1) c1 on true
     where pr.is_active and pr.cohorte_lundi = p_lundi
       and exists (select 1 from public.user_roles r where r.user_id = pr.id and r.role = 'poster')
    union all
    -- Les 2es comptes dont le 1er jour de posts tombe cette semaine.
    select c.poster_id, c.id, true
      from public.comptes c
      join public.profiles pr on pr.id = c.poster_id and pr.is_active
      left join public.comptes_premier_jour pj on pj.compte_id = c.id
     where c.type_compte = 'perso' and c.is_active
       and coalesce(pj.premier_jour - (extract(isodow from pj.premier_jour)::int - 1),
                    (c.warmup_ends_at at time zone 'Europe/Paris')::date) = p_lundi
       and exists (select 1 from public.comptes d where d.poster_id = c.poster_id and d.id <> c.id
                     and d.type_compte = 'perso' and d.created_at < c.created_at)
  )
  select ca.poster_id, ca.compte_id, ca.deuxieme, pr.prenom,
         case when cpt.pays is null then 'Europe/Paris' else public.fuseau_pays(cpt.pays) end,
         pr.upwork_contract_id,
         (select count(*) from public.passages p
           where p.compte_id = ca.compte_id and p.publie_url is not null
             and (p.date_publication_prevue = p_lundi
                  or (coalesce(p.publie_at, p.created_at)
                      at time zone (case when cpt.pays is null then 'Europe/Paris' else public.fuseau_pays(cpt.pays) end))::date = p_lundi))::int,
         (select max(coalesce(p.publie_at, p.created_at)) from public.passages p
           where p.compte_id = ca.compte_id and p.publie_url is not null),
         n.envoye_at, n.id, n.slack_erreur,
         v.premier_at,
         public.posteur_reaction_at(ca.poster_id),
         k.id, k.statut
    from cartes ca
    join public.profiles pr on pr.id = ca.poster_id
    left join public.comptes cpt on cpt.id = ca.compte_id
    left join lateral (select n.id, n.envoye_at, n.slack_erreur from public.nudges n
                        where n.poster_id = ca.poster_id and n.type = 'lundi_soir' and n.periode = p_lundi
                        order by n.envoye_at desc limit 1) n on true
    left join lateral (select v.premier_at from public.relances_prevues v
                        where v.poster_id = ca.poster_id and v.type = 'lundi_soir' and v.periode = p_lundi
                          and v.statut = 'prevu') v on true
    left join lateral (select k.id, k.statut from public.kills_auto k
                        where k.poster_id = ca.poster_id and k.etape = 'lundi_soir' and k.periode = p_lundi) k on true
   where not exists (select 1 from public.hub_posteurs h where h.profile_id = ca.poster_id)
     -- Déjà arrêté (Kill parti, « je ne veux plus », Arrêter) : plus rien.
     and not exists (select 1 from public.arrets a where a.poster_id = ca.poster_id and a.created_at >= p_lundi::timestamp - interval '7 days')
     -- A3 (0413) : une recrue pas prête dimanche minuit ne commence pas ce lundi.
     and (ca.deuxieme or not exists (select 1 from public.recrues_rouges rr
                                      where rr.poster_id = ca.poster_id and rr.periode = p_lundi));
end;
$$;

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
    select c.poster_id, c.id, true,
           coalesce(pj.premier_jour - (extract(isodow from pj.premier_jour)::int - 1),
                    (c.warmup_ends_at at time zone 'Europe/Paris')::date)
      from public.comptes c
      join public.profiles pr on pr.id = c.poster_id and pr.is_active
      left join public.comptes_premier_jour pj on pj.compte_id = c.id
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
           (select min(w.releve_at) from public.ckd_warmup_releves w where w.compte_id = ca.compte_id and w.existe) as t3,
           c.warmup_started_at as t4,
           (select min(w.releve_at) from public.ckd_warmup_releves w
             where w.compte_id = ca.compte_id and w.existe and coalesce(w.abonnements, 0) >= 5 and coalesce(w.videos, 0) = 0
               and c.warmup_started_at is not null and w.releve_at >= c.warmup_started_at) as t5,
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

-- A2. Les conversations Upwork à lire : partout où l'OS a écrit depuis 14 jours.
create or replace function public.reponses_cibles_upwork_v2(p_posteurs uuid[] default null)
returns table (poster_id uuid, contrat_id text, organisation_id text, depuis timestamptz)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
begin
  if coalesce(auth.role(), '') <> 'service_role' and not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return query
  with cibles as (
    select n.poster_id, min(n.envoye_at) as premier from public.nudges n
     where n.canal = 'upwork' and n.envoye_at > now() - interval '14 days'
     group by n.poster_id
    union all
    select a.poster_id, a.message_at from public.accueils a
     where a.poster_id is not null and a.message_at > now() - interval '14 days'
    union all
    select k.poster_id, coalesce(k.message_at, k.detecte_at) from public.kills_auto k where k.statut = 'en_attente'
    union all
    -- A2 (0413) : tout message de l'OS dans la conversation du contrat.
    select pr0.id, a.at from public.upwork_appels a
      join public.profiles pr0 on pr0.upwork_contract_id = a.contrat
     where a.action = 'message' and a.erreur is null and a.at > now() - interval '14 days'
  )
  select pr.id, pr.upwork_contract_id, uc.organisation_id,
         greatest(min(c.premier),
                  coalesce((select max(x.recu_at) from public.posteur_reponses x
                             where x.poster_id = pr.id and x.canal = 'upwork'), '-infinity'::timestamptz))
    from cibles c
    join public.profiles pr on pr.id = c.poster_id
    left join public.upwork_contrats uc on uc.contrat_id = pr.upwork_contract_id
   where pr.upwork_contract_id is not null
     and (p_posteurs is null or pr.id = any (p_posteurs))
   group by pr.id, pr.upwork_contract_id, uc.organisation_id;
end;
$$;

revoke execute on function public.reponses_cibles_upwork_v2(uuid[]) from public, anon, authenticated;
grant execute on function public.reponses_cibles_upwork_v2(uuid[]) to service_role;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'reponses-upwork') then
    perform cron.alter_job((select jobid from cron.job where jobname = 'reponses-upwork'), schedule := '5 * * * *');
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- A4. Plus de liaison « à peu près »
-- ---------------------------------------------------------------------------
-- Les règles par le nom (0409, 0410), gardées pour les SUGGESTIONS seulement.
create or replace function public.contrats_relier_noms(p_simuler boolean default true)
returns table (poster_id uuid, poster_nom text, contrat_id text, freelancer_nom text, regle integer)
language plpgsql
security definer
set search_path = public, extensions
as $$
#variable_conflict use_column
begin
  if coalesce(auth.role(), '') <> 'service_role' and not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return query
  with p as (
    select pr.id, pr.created_at, nullif(btrim(concat_ws(' ', pr.prenom, pr.nom)), '') as nom_brut,
           regexp_split_to_array(lower(unaccent(btrim(concat_ws(' ', pr.prenom, pr.nom)))), '[^a-z0-9]+') as toks,
           (select min(x.publie_at) from public.passages x join public.comptes k on k.id = x.compte_id
             where k.poster_id = pr.id and x.publie_url is not null) as premier_post
      from public.profiles pr
     where pr.is_active and pr.upwork_contract_id is null
       and exists (select 1 from public.user_roles r where r.user_id = pr.id and r.role = 'poster')
       and not exists (select 1 from public.hub_posteurs h where h.profile_id = pr.id)
  ),
  p2 as (
    select p.id, p.created_at, p.nom_brut, p.premier_post, array_remove(p.toks, '') as toks,
           exists (select 1 from unnest(p.toks) t where length(t) = 1) as initiale
      from p
  ),
  c as (
    select u.contrat_id, u.debut_at, u.freelancer_nom,
           array_remove(regexp_split_to_array(lower(unaccent(btrim(u.freelancer_nom))), '[^a-z0-9]+'), '') as toks
      from public.upwork_contrats u
     where u.actif and u.contrat_id is not null and u.freelancer_nom is not null
       and not exists (select 1 from public.profiles x where x.upwork_contract_id = u.contrat_id)
  ),
  paires as (
    select p2.id, p2.nom_brut, p2.created_at, p2.initiale, c.contrat_id, c.freelancer_nom,
           case
             when p2.toks = c.toks then 1
             when cardinality(p2.toks) >= 2 and not exists (
                    select 1 from unnest(p2.toks) t
                     where not (t = any (c.toks)
                                or (length(t) = 1 and exists (select 1 from unnest(c.toks[2:]) v where left(v, 1) = t)))) then 2
             when cardinality(p2.toks) >= 2 and cardinality(c.toks) >= 2 and p2.toks[1] = c.toks[1]
                  and length(p2.toks[cardinality(p2.toks)]) >= 5
                  and exists (select 1 from unnest(c.toks[2:]) v
                               where levenshtein(v, p2.toks[cardinality(p2.toks)]) <= 2) then 3
             -- Le nom entier à 2 lettres près (« Dialetchi Anthi » → « Dialechti Anthi »).
             when length(array_to_string(p2.toks, '')) >= 8
                  and levenshtein(array_to_string(p2.toks, ''), array_to_string(c.toks, '')) <= 2 then 3
           end as rang,
           abs(extract(epoch from (coalesce(c.debut_at, p2.created_at) - p2.created_at))) / 86400.0 as ecart_j
      from p2 cross join c
     -- Un contrat qui commence plus de 7 jours après son 1er post n'est pas le sien.
     where p2.premier_post is null or c.debut_at is null or c.debut_at <= p2.premier_post + interval '7 days'
  ),
  candidats as (
    select pa.*,
           row_number() over (partition by pa.id order by pa.rang, pa.ecart_j) as n_p,
           count(*) over (partition by pa.id, pa.rang) as nb_rang,
           min(pa.rang) over (partition by pa.id) as meilleur
      from paires pa
     where pa.rang is not null
  ),
  choix_p as (
    -- Le meilleur contrat du posteur : seul à ce rang, ou le plus proche à 21
    -- jours au plus (jamais pour un nom avec une initiale : « Maria M »).
    select * from candidats
     where n_p = 1 and rang = meilleur and (nb_rang = 1 or (ecart_j <= 21 and not initiale))
  ),
  choix as (
    select distinct on (ch.contrat_id) ch.*
      from choix_p ch
     order by ch.contrat_id, ch.rang, ch.ecart_j
  ),
  faits as (
    update public.profiles pr
       set upwork_contract_id = ch.contrat_id
      from choix ch
     where not p_simuler and pr.id = ch.id and pr.upwork_contract_id is null
    returning pr.id
  )
  select ch.id, ch.nom_brut, ch.contrat_id, ch.freelancer_nom, ch.rang
    from choix ch
   where p_simuler or ch.id in (select id from faits)
   order by ch.rang, ch.nom_brut;

  -- 2e compte : une 2e fiche du même posteur (même nom, ou tous les mots de
  -- l'un dans l'autre, et même pays) prend le contrat de la 1re.
  return query
  with sans as (
    select pr.id, pr.created_at, nullif(btrim(concat_ws(' ', pr.prenom, pr.nom)), '') as nom_brut,
           array_remove(regexp_split_to_array(lower(unaccent(btrim(concat_ws(' ', pr.prenom, pr.nom)))), '[^a-z0-9]+'), '') as toks,
           (select c.pays from public.comptes c where c.poster_id = pr.id and c.type_compte = 'perso' order by c.created_at limit 1) as pays
      from public.profiles pr
     where pr.is_active and pr.upwork_contract_id is null
       and exists (select 1 from public.user_roles r where r.user_id = pr.id and r.role = 'poster')
       and not exists (select 1 from public.hub_posteurs h where h.profile_id = pr.id)
  ),
  avec as (
    select pr.id, pr.created_at, pr.upwork_contract_id,
           array_remove(regexp_split_to_array(lower(unaccent(btrim(concat_ws(' ', pr.prenom, pr.nom)))), '[^a-z0-9]+'), '') as toks,
           (select c.pays from public.comptes c where c.poster_id = pr.id and c.type_compte = 'perso' order by c.created_at limit 1) as pays
      from public.profiles pr
     where pr.is_active and pr.upwork_contract_id is not null
  ),
  freres as (
    select distinct on (s.id) s.id, s.nom_brut, a.upwork_contract_id
      from sans s
      join avec a on a.pays = s.pays and cardinality(s.toks) >= 2 and cardinality(a.toks) >= 2
                 and (s.toks <@ a.toks or a.toks <@ s.toks)
                 and not exists (select 1 from unnest(s.toks || a.toks) t where length(t) = 1)
     -- Un seul contrat possible, sinon rien.
     where (select count(distinct a2.upwork_contract_id) from avec a2
             where a2.pays = s.pays and cardinality(a2.toks) >= 2 and (s.toks <@ a2.toks or a2.toks <@ s.toks)) = 1
     order by s.id, a.created_at
  ),
  partages as (
    update public.profiles pr
       set upwork_contract_id = f.upwork_contract_id
      from freres f
     where not p_simuler and pr.id = f.id and pr.upwork_contract_id is null
    returning pr.id
  )
  select f.id, f.nom_brut, f.upwork_contract_id, '(2e compte)'::text, 4
    from freres f
   where p_simuler or f.id in (select id from partages);
end;
$$;

revoke execute on function public.contrats_relier_noms(boolean) from public, anon, authenticated;
grant execute on function public.contrats_relier_noms(boolean) to service_role;

-- Automatique : seulement l'identifiant exact (le lien du contrat collé à la
-- création). L'accueil automatique relie déjà ses contrats en créant le posteur.
create or replace function public.contrats_relier(p_simuler boolean default false)
returns table (poster_id uuid, poster_nom text, contrat_id text, freelancer_nom text, regle integer)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
begin
  if coalesce(auth.role(), '') <> 'service_role' and not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return query
  with c as (
    select pr.id, nullif(btrim(concat_ws(' ', pr.prenom, pr.nom)), '') as nom_brut,
           substring(btrim(pr.upwork_contrat_url) from '/(?:workroom|contracts?)/([0-9]{6,})') as cid
      from public.profiles pr
     where pr.is_active and pr.upwork_contract_id is null and pr.upwork_contrat_url is not null
       and exists (select 1 from public.user_roles r where r.user_id = pr.id and r.role = 'poster')
       and not exists (select 1 from public.hub_posteurs h where h.profile_id = pr.id)
  ),
  faits as (
    update public.profiles pr
       set upwork_contract_id = c.cid
      from c
     where not p_simuler and c.cid is not null and pr.id = c.id and pr.upwork_contract_id is null
    returning pr.id
  )
  select c.id, c.nom_brut, c.cid, u.freelancer_nom, 0
    from c
    left join public.upwork_contrats u on u.contrat_id = c.cid
   where c.cid is not null and (p_simuler or c.id in (select id from faits));
end;
$$;

revoke execute on function public.contrats_relier(boolean) from public, anon;
grant execute on function public.contrats_relier(boolean) to authenticated, service_role;

-- « Contrats à relier » : les suggestions par le nom, qu'une personne confirme.
create or replace function public.contrats_suggestions()
returns table (poster_id uuid, poster_nom text, contrat_id text, freelancer_nom text, regle integer)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return query select * from public.contrats_relier_noms(true);
end;
$$;

revoke execute on function public.contrats_suggestions() from public, anon;
grant execute on function public.contrats_suggestions() to authenticated;

-- Les liaisons confirmées ou déliées par une personne.
create table if not exists public.contrats_liaisons_verifiees (
  id         bigserial primary key,
  poster_id  uuid not null references public.profiles (id) on delete cascade,
  contrat_id text not null,
  delie      boolean not null default false,
  par        uuid references auth.users (id) on delete set null,
  at         timestamptz not null default now(),
  unique (poster_id, contrat_id)
);

alter table public.contrats_liaisons_verifiees enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'contrats_liaisons_verifiees'
                  and policyname = 'contrats_liaisons_verifiees lecture') then
    create policy "contrats_liaisons_verifiees lecture" on public.contrats_liaisons_verifiees
      for select to authenticated using ((select public.is_admin()));
  end if;
end $$;
revoke all on public.contrats_liaisons_verifiees from public, anon, authenticated;
grant select on public.contrats_liaisons_verifiees to authenticated;
grant all on public.contrats_liaisons_verifiees to service_role;

-- Confirmer une suggestion : le contrat est relié, et la liaison vérifiée.
create or replace function public.contrat_lier(p_poster uuid, p_contrat text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if not exists (select 1 from public.upwork_contrats u where u.contrat_id = p_contrat) then
    raise exception 'Contrat Upwork inconnu : %', p_contrat;
  end if;
  update public.profiles set upwork_contract_id = p_contrat where id = p_poster and upwork_contract_id is null;
  if not found then
    raise exception 'Ce posteur a déjà un contrat';
  end if;
  insert into public.contrats_liaisons_verifiees (poster_id, contrat_id, par)
  values (p_poster, p_contrat, auth.uid())
  on conflict (poster_id, contrat_id) do update set delie = false, par = excluded.par, at = now();
end;
$$;

revoke execute on function public.contrat_lier(uuid, text) from public, anon;
grant execute on function public.contrat_lier(uuid, text) to authenticated;

-- Le nom du posteur et celui du contrat se ressemblent-ils ? 1 identiques, 2 tous les mots, 3 à 2 lettres près.
create or replace function public.contrat_nom_regle(p_nom text, p_freelancer text)
returns integer
language sql
stable
set search_path = public, extensions
as $$
  with t as (
    select array_remove(regexp_split_to_array(lower(unaccent(btrim(coalesce(p_nom, '')))), '[^a-z0-9]+'), '') as a,
           array_remove(regexp_split_to_array(lower(unaccent(btrim(coalesce(p_freelancer, '')))), '[^a-z0-9]+'), '') as b
  )
  select case
           when cardinality(a) = 0 or cardinality(b) = 0 then null
           when a = b then 1
           when cardinality(a) >= 2 and a <@ b then 2
           when length(array_to_string(a, '')) >= 8 and levenshtein(array_to_string(a, ''), array_to_string(b, '')) <= 2 then 3
         end
    from t;
$$;

-- Les liaisons à vérifier : ni accueil automatique, ni lien exact, pas encore vues.
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
  if not public.is_admin() then
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

revoke execute on function public.liaisons_a_verifier() from public, anon;
grant execute on function public.liaisons_a_verifier() to authenticated;

-- OK (la liaison est bonne) ou Délier (le contrat retourne dans « Contrats à relier »).
create or replace function public.liaison_verifier(p_poster uuid, p_delier boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_contrat text;
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select upwork_contract_id into v_contrat from public.profiles where id = p_poster;
  if v_contrat is null then
    raise exception 'Ce posteur n''a pas de contrat relié';
  end if;
  insert into public.contrats_liaisons_verifiees (poster_id, contrat_id, delie, par)
  values (p_poster, v_contrat, p_delier, auth.uid())
  on conflict (poster_id, contrat_id) do update set delie = excluded.delie, par = excluded.par, at = now();
  if p_delier then
    update public.profiles set upwork_contract_id = null where id = p_poster and upwork_contract_id = v_contrat;
  end if;
end;
$$;

revoke execute on function public.liaison_verifier(uuid, boolean) from public, anon;
grant execute on function public.liaison_verifier(uuid, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- A5. Pas de doublon : un contrat déjà accueilli ne se crée pas à la main
-- ---------------------------------------------------------------------------
create or replace function public.accueil_contrat_auto(p_url text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select r.valeur #>> '{}' from public.reglages r where r.cle = 'accueil_auto'), 'test') = 'on'
     and exists (select 1 from public.accueils a
                  where a.contrat_id = substring(btrim(coalesce(p_url, '')) from '/(?:workroom|contracts?)/([0-9]{6,})'));
$$;

revoke execute on function public.accueil_contrat_auto(text) from public, anon;
grant execute on function public.accueil_contrat_auto(text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- A6. Le message de Kill : off / test / on
-- ---------------------------------------------------------------------------
update public.reglages
   set valeur = case when valeur = 'true'::jsonb then to_jsonb('on'::text) else to_jsonb('off'::text) end
 where cle = 'kill_message_auto' and jsonb_typeof(valeur) = 'boolean';

create or replace function public.kill_message_creer(p_id uuid)
returns setof public.posteur_messages
language plpgsql
security definer
set search_path = public
as $$
declare
  p public.ckd_propositions%rowtype;
  v_prenom text;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'kill_message_creer : réservé à la fonction ckd';
  end if;
  -- 0413 : off / test / on ; seul « on » crée le message.
  if coalesce((select case when valeur = 'true'::jsonb then 'on' when valeur = 'false'::jsonb then 'off' else valeur #>> '{}' end
                 from public.reglages where cle = 'kill_message_auto'), 'off') <> 'on' then
    return;
  end if;
  select * into p from public.ckd_propositions where id = p_id;
  if not found or p.decision is distinct from 'ne_pas_renouveler' then
    return;
  end if;
  -- Un compte actif sans arrêt prévu : le posteur continue, pas de message.
  if exists (select 1 from public.comptes c
              where c.poster_id = p.poster_id and c.is_active
                and not exists (select 1 from public.ckd_arrets a
                                 where a.compte_id = c.id and a.annule_at is null and a.fait_at is null)) then
    return;
  end if;
  select prenom into v_prenom from public.profiles where id = p.poster_id;
  return query
  insert into public.posteur_messages (poster_id, compte_id, proposition_id, semaine, type, texte)
  values (p.poster_id, p.compte_id, p.id, p.jour, 'kill', public.posteur_texte('kill_message_texte', v_prenom))
  on conflict (poster_id, type, semaine) do nothing
  returning *;
end;
$$;

-- ---------------------------------------------------------------------------
-- A7. Le Kill jamais avant 24 h (0 refusé), vérifié en base
-- ---------------------------------------------------------------------------
create or replace function public.reglages_valider()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.cle = 'etapes_delais' and coalesce((new.valeur->>'kill_h')::numeric, 48) < 24 then
    raise exception 'Le délai avant un Kill doit faire au moins 24 h' using errcode = '23514';
  end if;
  return new;
end;
$$;

create or replace trigger reglages_valider before insert or update on public.reglages
  for each row execute function public.reglages_valider();

notify pgrst, 'reload schema';
