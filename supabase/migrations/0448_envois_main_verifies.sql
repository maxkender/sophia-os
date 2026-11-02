-- 0448 — Prompt 25, mises à jour, point 8 : vérifier que la HM a vraiment
-- envoyé le message.
--
-- Une tâche « à envoyer à la main » (relances_prevues, statut main, 0442) a
-- maintenant un suivi :
-- - main_lu_at : la dernière lecture de la conversation Upwork (toutes les
--   30 min ; lire ne compte pas dans la limite) ;
-- - main_verif : « verifie » (un nouveau message de la HM est vu après l'heure
--   de la tâche, même sans « Sent ») ou « sent_introuvable » (« Sent » cliqué,
--   aucun message 1 h après : Needs you) ;
-- - main_rappel_at : le rappel Slack à la HM au bout de 3 h (6 h : Needs you,
--   déjà en place).
-- Le message noté parti par la HM (nudges) porte « hm » comme expéditeur et le
-- statut de la vérification ; la carte de la recrue montre le nom de la HM.
-- Fonctions : envois_main_v2 (la liste avec le statut), envois_main_a_verifier
-- (ce qui est à relire), envoi_main_verifie (vu sur Upwork), envois_main_compteurs
-- (par HM, aujourd'hui et sur 7 jours). needs_you : « Sent cliqué, message introuvable ».
--
-- Additive : 5 colonnes, 4 fonctions, 3 fonctions complétées. Aucune donnée
-- existante modifiée.

alter table public.relances_prevues add column if not exists main_lu_at timestamptz;
alter table public.relances_prevues add column if not exists main_verif text;
alter table public.relances_prevues add column if not exists main_verif_at timestamptz;
alter table public.relances_prevues add column if not exists main_rappel_at timestamptz;
alter table public.nudges add column if not exists verif text;
comment on column public.relances_prevues.main_verif is
  'Prompt 25 MAJ (0448) : verifie (message de la HM vu sur Upwork) ou sent_introuvable (Sent cliqué, rien 1 h après).';

-- « Sent » : le message noté parti porte l'expéditeur « hm ».
do $ef$
declare
  v_def text := pg_get_functiondef('public.envoi_main_fait(uuid,text,date,uuid)'::regprocedure);
  v_avant text := $q$  insert into public.nudges (poster_id, type, periode, compte_id, cible, canal, canaux, texte, envoye_par)
  values (p_poster, p_type, case when p_type = 'reponse' then null else p_periode end, null, 'hm', 'upwork',
          array['upwork'], v.texte, v_par)$q$;
  v_apres text := $q$  insert into public.nudges (poster_id, type, periode, compte_id, cible, canal, canaux, texte, envoye_par, expediteur)
  values (p_poster, p_type, case when p_type = 'reponse' then null else p_periode end, null, 'hm', 'upwork',
          array['upwork'], v.texte, v_par, 'hm')$q$;
begin
  if position(v_avant in v_def) = 0 then raise exception '0448 : envoi_main_fait ne correspond pas'; end if;
  execute replace(v_def, v_avant, v_apres);
end;
$ef$;

-- Vu sur Upwork : la tâche est faite et vérifiée (Sent cliqué ou pas).
create or replace function public.envoi_main_verifie(p_poster uuid, p_type text, p_periode date)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v record;
begin
  if not (coalesce(auth.jwt() ->> 'role', '') = 'service_role' or current_user = 'postgres') then
    raise exception 'envoi_main_verifie : réservé à la fonction upwork' using errcode = '42501';
  end if;
  select rp.statut, rp.main_hm_id, pr.manager_id into v
    from public.relances_prevues rp join public.profiles pr on pr.id = rp.poster_id
   where rp.poster_id = p_poster and rp.type = p_type and rp.periode = p_periode;
  if not found then
    return false;
  end if;
  if v.statut = 'main' then
    perform public.envoi_main_fait(p_poster, p_type, p_periode, coalesce(v.manager_id, v.main_hm_id));
  end if;
  update public.relances_prevues
     set main_verif = 'verifie', main_verif_at = now(), main_lu_at = now()
   where poster_id = p_poster and type = p_type and periode = p_periode;
  update public.nudges
     set verif = 'verifie'
   where poster_id = p_poster and type = p_type and cible = 'hm'
     and (periode = p_periode or (p_type = 'reponse' and periode is null));
  return true;
end;
$$;
revoke all on function public.envoi_main_verifie(uuid, text, date) from public, anon, authenticated;
grant execute on function public.envoi_main_verifie(uuid, text, date) to service_role;

-- Ce qui est à relire (une conversation toutes les 30 minutes au plus) : pas
-- encore envoyé, ou « Sent » pas encore vérifié, depuis 3 jours au plus.
create or replace function public.envois_main_a_verifier()
returns table (poster_id uuid, type text, periode date, statut text, texte text, main_at timestamptz,
               main_envoye_at timestamptz, contrat_id text, organisation_id text)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
begin
  if not (coalesce(auth.jwt() ->> 'role', '') = 'service_role' or current_user = 'postgres') then
    raise exception 'envois_main_a_verifier : réservé à la fonction upwork' using errcode = '42501';
  end if;
  return query
  select rp.poster_id, rp.type, rp.periode, rp.statut, rp.texte, rp.main_at, rp.main_envoye_at,
         pr.upwork_contract_id, (select u.organisation_id from public.upwork_contrats u where u.contrat_id = pr.upwork_contract_id limit 1)
    from public.relances_prevues rp
    join public.profiles pr on pr.id = rp.poster_id
   where rp.main_at is not null and rp.main_at > now() - interval '3 days'
     and pr.upwork_contract_id is not null
     and (rp.statut = 'main' or (rp.statut = 'deja_envoye' and rp.main_envoye_at is not null and rp.main_verif is null))
     and (rp.main_lu_at is null or rp.main_lu_at < now() - interval '30 minutes')
   order by rp.main_at
   limit 60;
end;
$$;
revoke all on function public.envois_main_a_verifier() from public, anon, authenticated;
grant execute on function public.envois_main_a_verifier() to service_role;

-- La liste « To send by hand » avec le statut de chaque tâche (la HM : les siennes).
create or replace function public.envois_main_v2()
returns table (
  poster_id      uuid,
  type           text,
  periode        date,
  nom            text,
  hm_id          uuid,
  hm_nom         text,
  contrat_id     text,
  salon_url      text,
  texte          text,
  priorite       integer,
  main_at        timestamptz,
  statut_tache   text,
  main_envoye_at timestamptz,
  main_verif_at  timestamptz,
  main_rappel_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_tous boolean := public.is_admin();
begin
  if auth.uid() is null then
    raise exception 'envois_main_v2 : connexion requise' using errcode = '42501';
  end if;
  return query
  select v.poster_id, v.type, v.periode,
         nullif(btrim(concat_ws(' ', pr.prenom, pr.nom)), ''),
         coalesce(pr.manager_id, v.main_hm_id),
         nullif(btrim(concat_ws(' ', hm.prenom, hm.nom)), ''),
         pr.upwork_contract_id,
         case when pr.upwork_contract_id is not null
              then 'https://www.upwork.com/nx/wm/workroom/' || pr.upwork_contract_id || '/overview' end,
         v.texte,
         case v.type when 'accueil' then 0 when 'relance' then 1 when 'lundi' then 2 when 'lundi_soir' then 2
                     when 'jeudi' then 3 else 4 end,
         v.main_at,
         case when v.main_verif = 'verifie' then 'verifie'
              when v.main_verif = 'sent_introuvable' then 'sent_introuvable'
              when v.statut = 'deja_envoye' then 'sent'
              when v.main_at < now() - interval '6 hours' then 'en_retard'
              else 'a_envoyer' end,
         v.main_envoye_at, v.main_verif_at, v.main_rappel_at
    from public.relances_prevues v
    join public.profiles pr on pr.id = v.poster_id
    left join public.profiles hm on hm.id = coalesce(pr.manager_id, v.main_hm_id)
   where v.main_at is not null
     and (v.statut = 'main'
          or (v.statut = 'deja_envoye' and v.main_envoye_at > now() - interval '24 hours'))
     and (v_tous or coalesce(pr.manager_id, v.main_hm_id) = auth.uid())
   order by (v.statut = 'main') desc, 10, v.main_at;
end;
$$;
revoke all on function public.envois_main_v2() from public, anon;
grant execute on function public.envois_main_v2() to authenticated;

-- Par HM : à envoyer maintenant ; créés, envoyés, vérifiés et en retard, aujourd'hui (Paris) et sur 7 jours.
create or replace function public.envois_main_compteurs()
returns table (hm_id uuid, hm_nom text, a_envoyer integer,
               crees_jour integer, envoyes_jour integer, verifies_jour integer, retard_jour integer,
               crees_7j integer, envoyes_7j integer, verifies_7j integer, retard_7j integer)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_tous boolean := public.is_admin();
  v_jour timestamptz := ((now() at time zone 'Europe/Paris')::date)::timestamp at time zone 'Europe/Paris';
begin
  if auth.uid() is null then
    raise exception 'envois_main_compteurs : connexion requise' using errcode = '42501';
  end if;
  return query
  with t as (
    select coalesce(pr.manager_id, v.main_hm_id) as hm, v.main_at, v.statut, v.main_envoye_at, v.main_verif,
           (v.main_verif = 'sent_introuvable' or (v.statut = 'main' and v.main_at < now() - interval '6 hours')) as retard
      from public.relances_prevues v
      join public.profiles pr on pr.id = v.poster_id
     where v.main_at > now() - interval '7 days'
  )
  select t.hm, nullif(btrim(concat_ws(' ', hm.prenom, hm.nom)), ''),
         (count(*) filter (where t.statut = 'main'))::int,
         (count(*) filter (where t.main_at >= v_jour))::int,
         (count(*) filter (where t.main_at >= v_jour and (t.main_envoye_at is not null or t.main_verif = 'verifie')))::int,
         (count(*) filter (where t.main_at >= v_jour and t.main_verif = 'verifie'))::int,
         (count(*) filter (where t.main_at >= v_jour and t.retard))::int,
         count(*)::int,
         (count(*) filter (where t.main_envoye_at is not null or t.main_verif = 'verifie'))::int,
         (count(*) filter (where t.main_verif = 'verifie'))::int,
         (count(*) filter (where t.retard))::int
    from t
    left join public.profiles hm on hm.id = t.hm
   where v_tous or t.hm = auth.uid()
   group by t.hm, hm.prenom, hm.nom
   order by 2;
end;
$$;
revoke all on function public.envois_main_compteurs() from public, anon;
grant execute on function public.envois_main_compteurs() to authenticated;

-- La carte de la recrue : le nom de la HM qui a envoyé, et le statut de la vérification.
do $op$
declare
  v_def text := pg_get_functiondef('public.onboarding_posteurs()'::regprocedure);
  v_avant text := $q$'raison', n.raison, 'expediteur', n.expediteur,$q$;
  v_apres text := $q$'raison', n.raison, 'expediteur', n.expediteur, 'verif', n.verif,
                     'hm_nom', (select nullif(btrim(concat_ws(' ', hp.prenom, hp.nom)), '') from public.profiles hp where hp.id = n.envoye_par),$q$;
begin
  if position(v_avant in v_def) = 0 then raise exception '0448 : onboarding_posteurs ne correspond pas'; end if;
  execute replace(v_def, v_avant, v_apres);
end;
$op$;

-- Needs you : « Sent » cliqué mais aucun message sur Upwork 1 h après.
do $ny$
declare
  v_def text := pg_get_functiondef('public.needs_you()'::regprocedure);
  v_avant text := $q$    union all
    select 'samedi:' || cp.id$q$;
  v_apres text := $q$    union all
    select 'main_introuvable:' || rp.poster_id || ':' || rp.type || ':' || rp.periode, 'bloque', 'envoi_main_introuvable', rp.poster_id, null,
           left(coalesce(rp.texte, ''), 400),
           'Sent cliqué par la HM, mais aucun message de sa part dans la conversation Upwork 1 h après',
           null, case when rp.type in ('lundi', 'lundi_soir', 'accueil') then 'lundi' else 'rien' end, rp.main_verif_at,
           array['ouvrir'], rp.poster_id::text, '/admin/auto/sent?onglet=main', rp.type, 1
      from public.relances_prevues rp
     where rp.main_verif = 'sent_introuvable'
    union all
    select 'samedi:' || cp.id$q$;
begin
  if position(v_avant in v_def) = 0 then raise exception '0448 : bloc « samedi » introuvable dans needs_you()'; end if;
  execute replace(v_def, v_avant, v_apres);
end;
$ny$;

notify pgrst, 'reload schema';
