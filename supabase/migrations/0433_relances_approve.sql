-- 0433 — Prompt 25, parties 1, 2 et 5 : rien ne part sans validation, sauf les relances.
--
-- 1. « Step reminders (new recruits) » (relances_auto) et « Monday evening check »
--    (lundi_soir_auto) ont une position « approve » : l'OS prépare les messages
--    (relances_prevues, raison a_approuver, avec les données utilisées) ; ils
--    partent après « Send selected » (Messages sent → To approve). Les autres
--    sont écartés. Aucun interrupteur n'est changé ici.
-- 2. La relance du jour : une par recrue et par jour (relances_prevues.type
--    « relance », période = jour du pays), avec seulement ce qui lui manque ;
--    5 textes modifiables (relance_texte_*).
-- 3. Upwork : au plus 45 conversations par jour (upwork_conversations_jour_max),
--    relances et nudges s'arrêtent 5 avant (upwork_reserve_prioritaire) pour la
--    bienvenue, le Kill et l'arrêt ; après l'erreur de limite d'Upwork, plus rien
--    jusqu'au lendemain (upwork_budget_jour, aussi dans Overview → Health).
-- 4. Needs you : une ligne par posteur pour les liens TikTok introuvables (« Count »
--    les compte tous) ; un doublon d'accueil dont le contrat est relié à un seul
--    posteur actif est résolu ; deux profils sur le même contrat ou le même Slack :
--    une ligne (un seul message leur part).
--
-- Additive : 1 colonne, 7 réglages, 3 fonctions, 3 fonctions modifiées. Aucune
-- donnée existante modifiée.

alter table public.relances_prevues add column if not exists donnees jsonb;

comment on column public.relances_prevues.donnees is
  'Prompt 25 (0433) : les données utilisées par le message (To approve, Aperçu).';

insert into public.reglages (cle, valeur) values
  ('relance_texte_cadre', to_jsonb(
    'Hi {prenom}, to start posting on Monday {date}, you still need to {ce_qui_manque}. If something is blocking you, just reply here.'::text)),
  ('relance_texte_connexion', to_jsonb(
    'log in to your dashboard: {url} (login: {email}, password: {mot_de_passe}; you can change it once logged in)'::text)),
  -- relance_texte_tiktok et relance_texte_warmup existaient déjà (anciennes relances du
  -- prompt 17) : ces deux lignes ne changent rien ; la relance du jour lit les clés de 0434.
  ('relance_texte_tiktok', to_jsonb(
    'create your TikTok account @{handle} (how-to: {lien_etapes}), then click Start warmup on your dashboard and follow 5 accounts'::text)),
  ('relance_texte_warmup', to_jsonb(
    'click Start warmup on your dashboard ({url}), then follow 5 accounts with @{handle}'::text)),
  ('relance_texte_follows', to_jsonb(
    'follow {follows} with @{handle} (Start warmup is done)'::text)),
  ('upwork_conversations_jour_max', to_jsonb(45)),
  ('upwork_reserve_prioritaire', to_jsonb(5))
on conflict (cle) do nothing;

-- Les réglages que seul l'admin change (0421) : le budget Upwork en plus.
create or replace function public.reglage_admin_seulement(p_cle text)
returns boolean
language sql
immutable
as $$
  select p_cle = any (array['automation_pause', 'accueil_auto', 'relances_auto', 'lundi_message_auto', 'lundi_soir_auto',
                            'kill_auto', 'arret_auto', 'reponses_auto', 'rappels_reprise_le', 'faq_automatique',
                            'kill_message_auto', 'paie_api', 'paie_minimum_posts', 'paie_auto_heure', 'paie_kill6_des',
                            'paie_plafond_ligne', 'paie_plafond_jour', 'upwork_frequences',
                            'upwork_conversations_jour_max', 'upwork_reserve_prioritaire'])
      or p_cle like '%texte%';
$$;

-- Le budget Upwork du jour (UTC) : conversations distinctes écrites, le plafond,
-- la réserve, la limite d'Upwork atteinte, ce contrat déjà écrit aujourd'hui
-- (ne compte pas une 2e fois), le dernier message (1 par seconde au plus).
create or replace function public.upwork_budget_jour(p_contrat text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_debut timestamptz := ((now() at time zone 'UTC')::date)::timestamp at time zone 'UTC';
  v jsonb;
begin
  if not (public.is_admin() or coalesce(auth.jwt() ->> 'role', '') = 'service_role') then
    raise exception 'upwork_budget_jour : réservé à l''admin' using errcode = '42501';
  end if;
  with m as (
    select a.contrat, a.erreur, a.at from public.upwork_appels a
     where a.action = 'message' and a.at >= v_debut
  )
  select jsonb_build_object(
    'jour', (now() at time zone 'UTC')::date,
    'conversations', (select count(distinct m.contrat) from m where m.erreur is null),
    'max', coalesce((select (r.valeur #>> '{}')::int from public.reglages r where r.cle = 'upwork_conversations_jour_max'), 45),
    'reserve', coalesce((select (r.valeur #>> '{}')::int from public.reglages r where r.cle = 'upwork_reserve_prioritaire'), 5),
    'limite_atteinte', exists (select 1 from m where m.erreur ilike '%maximum number of rooms%'),
    'limite_at', (select min(m.at) from m where m.erreur ilike '%maximum number of rooms%'),
    'deja', p_contrat is not null and exists (select 1 from m where m.erreur is null and m.contrat = p_contrat),
    'dernier_ms', (select floor(extract(epoch from now() - max(m.at)) * 1000)::bigint from m)
  ) into v;
  return v;
end;
$$;
revoke all on function public.upwork_budget_jour(text) from public, anon;
grant execute on function public.upwork_budget_jour(text) to authenticated, service_role;

-- « Send selected » : les messages gardés (texte modifié s'il y en a un) partent,
-- peu à peu ; les autres sont écartés. Admin seulement.
create or replace function public.messages_approuver(p_garder jsonb, p_ecarter jsonb default '[]'::jsonb)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_n integer;
begin
  if not public.is_admin_strict() then
    raise exception 'messages_approuver : réservé à l''admin';
  end if;
  update public.relances_prevues r
     set texte = coalesce(nullif(btrim(x ->> 'texte'), ''), r.texte), valide_at = now(), valide_par = auth.uid(), maj_at = now()
    from jsonb_array_elements(coalesce(p_garder, '[]'::jsonb)) x
   where r.poster_id = (x ->> 'poster_id')::uuid and r.type = x ->> 'type' and r.periode = (x ->> 'periode')::date
     and r.statut = 'prevu' and r.valide_at is null;
  get diagnostics v_n = row_count;
  update public.relances_prevues r
     set statut = 'ecarte', valide_par = auth.uid(), maj_at = now()
    from jsonb_array_elements(coalesce(p_ecarter, '[]'::jsonb)) x
   where r.poster_id = (x ->> 'poster_id')::uuid and r.type = x ->> 'type' and r.periode = (x ->> 'periode')::date
     and r.statut = 'prevu' and r.valide_at is null;
  return v_n;
end;
$$;
revoke all on function public.messages_approuver(jsonb, jsonb) from public, anon;
grant execute on function public.messages_approuver(jsonb, jsonb) to authenticated;

-- Needs you (0431) : trois changements, appliqués sur la définition en place.
do $ny$
declare
  v_def text := pg_get_functiondef('public.needs_you()'::regprocedure);
  v_lien_avant text := $q$    select 'lien:' || pa.id, 'pas_sur', case when pa.resolution_statut = 'introuvable' then 'lien_introuvable' else 'lien_pas_resolu' end,
           c.poster_id, null,
           pa.publie_url || coalesce(' · ' || pa.resolution_detail, ''),
           case when pa.resolution_statut = 'introuvable' then 'Introuvable sur TikTok : faux lien, ou post supprimé ?'
                else 'Pas encore résolu après 24 h' end,
           null, case when pa.date_publication_prevue >= v_kill6 then 'paie' else 'rien' end, coalesce(pa.publie_at, pa.created_at),
           array['compter', 'corriger_lien', 'ignorer'], pa.id::text, pa.publie_url, pa.publie_url, 1
      from public.passages pa
      join public.comptes c on c.id = pa.compte_id
     where pa.publie_url is not null and pa.lien_confirme_at is null
       and pa.date_publication_prevue >= (now() at time zone 'Europe/Paris')::date - 7
       and (pa.resolution_statut = 'introuvable'
            or (pa.resolution_statut = 'a_resoudre' and coalesce(pa.publie_at, pa.created_at) < now() - interval '24 hours'))
$q$;
  v_lien_apres text := $q$    select 'liens:' || c.poster_id, 'pas_sur',
           case when bool_or(pa.resolution_statut = 'introuvable') then 'lien_introuvable' else 'lien_pas_resolu' end,
           c.poster_id, null,
           format('%s lien(s) : %s', count(*), string_agg(pa.publie_url, ' · ' order by pa.date_publication_prevue, pa.id)),
           case when bool_and(pa.resolution_statut = 'introuvable') then 'Introuvables sur TikTok : faux liens, ou posts supprimés ?'
                when bool_or(pa.resolution_statut = 'introuvable') then 'Introuvables sur TikTok, ou pas encore résolus après 24 h'
                else 'Pas encore résolus après 24 h' end,
           null, case when bool_or(pa.date_publication_prevue >= v_kill6) then 'paie' else 'rien' end, min(coalesce(pa.publie_at, pa.created_at)),
           array['compter', 'ignorer'], c.poster_id::text,
           (array_agg(pa.publie_url order by pa.date_publication_prevue, pa.id))[1],
           string_agg(pa.id::text, ',' order by pa.date_publication_prevue, pa.id), count(*)::int
      from public.passages pa
      join public.comptes c on c.id = pa.compte_id
     where pa.publie_url is not null and pa.lien_confirme_at is null
       and pa.date_publication_prevue >= (now() at time zone 'Europe/Paris')::date - 7
       and (pa.resolution_statut = 'introuvable'
            or (pa.resolution_statut = 'a_resoudre' and coalesce(pa.publie_at, pa.created_at) < now() - interval '24 hours'))
     group by c.poster_id
$q$;
  v_accueil_avant text := $q$     where a.statut in ('a_relier', 'doublon')
$q$;
  v_accueil_apres text := $q$     where a.statut in ('a_relier', 'doublon')
       and not (a.statut = 'doublon'
                and (select count(*) from public.profiles pz where pz.upwork_contract_id = a.contrat_id and pz.is_active) = 1)
$q$;
  v_paire_avant text := $q$    select 'shadowban:' || s.compte_id$q$;
  v_paire_apres text := $q$    select 'paire:contrat:' || po.upwork_contract_id, 'pas_sur', 'profils_doublons', (array_agg(po.id order by po.created_at))[1], null,
           string_agg(coalesce(nullif(btrim(concat_ws(' ', po.prenom, po.nom)), ''), po.email, '?')
                      || coalesce(' (' || po.cohorte_lundi::text || ')', ''), ' / ' order by po.created_at),
           format('%s profils sur le même contrat Upwork %s : un seul message leur part. Garder un seul profil ?', count(*), po.upwork_contract_id),
           null, 'rien', max(po.created_at), array['ouvrir', 'ignorer'], po.upwork_contract_id, '/admin/auto/recruits', null, count(*)::int
      from public.profiles po
     where po.is_active and po.upwork_contract_id is not null
       and exists (select 1 from public.user_roles ur where ur.user_id = po.id and ur.role = 'poster')
       and not exists (select 1 from public.hub_posteurs h where h.profile_id = po.id)
     group by po.upwork_contract_id
    having count(*) > 1
    union all
    select 'paire:slack:' || po.slack_user_id, 'pas_sur', 'profils_doublons', (array_agg(po.id order by po.created_at))[1], null,
           string_agg(coalesce(nullif(btrim(concat_ws(' ', po.prenom, po.nom)), ''), po.email, '?')
                      || coalesce(' (' || po.cohorte_lundi::text || ')', ''), ' / ' order by po.created_at),
           format('%s profils sur le même compte Slack : un seul message leur part. Garder un seul profil ?', count(*)),
           null, 'rien', max(po.created_at), array['ouvrir', 'ignorer'], po.slack_user_id, '/admin/auto/recruits', null, count(*)::int
      from public.profiles po
     where po.is_active and po.slack_user_id is not null
       and exists (select 1 from public.user_roles ur where ur.user_id = po.id and ur.role = 'poster')
       and not exists (select 1 from public.hub_posteurs h where h.profile_id = po.id)
     group by po.slack_user_id
    having count(*) > 1
    union all
    select 'shadowban:' || s.compte_id$q$;
begin
  if position(v_lien_avant in v_def) = 0 then raise exception '0433 : bloc « lien » introuvable dans needs_you()'; end if;
  if position(v_accueil_avant in v_def) = 0 then raise exception '0433 : bloc « accueil » introuvable dans needs_you()'; end if;
  if position(v_paire_avant in v_def) = 0 then raise exception '0433 : bloc « shadowban » introuvable dans needs_you()'; end if;
  v_def := replace(v_def, v_lien_avant, v_lien_apres);
  v_def := replace(v_def, v_accueil_avant, v_accueil_apres);
  v_def := replace(v_def, v_paire_avant, v_paire_apres);
  execute v_def;
end;
$ny$;

-- « Count » sur une ligne de liens : tous les liens de la ligne comptent.
do $agir$
declare
  v_def text := pg_get_functiondef('public.needs_you_agir(text,text,text)'::regprocedure);
  v_avant text := $q$  raise exception 'action « % » impossible sur « % »', p_action, v_type;$q$;
  v_apres text := $q$  if v_type = 'liens' and p_action = 'compter' then
    perform public.needs_you_agir('lien:' || pa.id, 'compter')
       from public.passages pa
       join public.comptes c on c.id = pa.compte_id
      where c.poster_id = v_ref::uuid
        and pa.publie_url is not null and pa.lien_confirme_at is null
        and pa.date_publication_prevue >= (now() at time zone 'Europe/Paris')::date - 7
        and (pa.resolution_statut = 'introuvable'
             or (pa.resolution_statut = 'a_resoudre' and coalesce(pa.publie_at, pa.created_at) < now() - interval '24 hours'));
    return 'liens comptés';
  end if;

  raise exception 'action « % » impossible sur « % »', p_action, v_type;$q$;
begin
  if position(v_avant in v_def) = 0 then raise exception '0433 : fin de needs_you_agir introuvable'; end if;
  execute replace(v_def, v_avant, v_apres);
end;
$agir$;

notify pgrst, 'reload schema';
