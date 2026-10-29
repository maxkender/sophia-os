-- 0437 — Prompt 25 v4, partie 1 : les relances sur Slack ET Upwork, l'étape 0
-- (Join Slack), le plafond de relances Upwork par recrue, la bienvenue en
-- mode Approve, le nudge du jeudi sur les deux canaux.
--
-- - relances_prevues.statut : les statuts que la file écrit déjà (écarté,
--   expiré, périmé, doublon, déjà envoyé, 0433) n'étaient pas permis par la
--   contrainte d'origine (prévu, bloqué) : la contrainte les ajoute. Aucune
--   ligne n'est modifiée.
-- - Réglages : relance_texte_slack (« join our Slack: {slack} ») ;
--   relances_upwork_max_par_recrue = 5 (au-delà, Slack seulement), admin seul.
-- - accueil_contrat_auto : « approve » crée aussi le posteur (comme « on ») ;
--   la HM ne le crée donc pas une 2e fois.
-- - upwork_budget_jour : « restant » (hors réserve) et « restant_prioritaire »
--   (réserve comprise), lus par la file d'envoi.
-- - jeudi_valider : le canal noté est « slack+upwork » quand le posteur a les
--   deux (le même texte part sur les deux, dans le budget Upwork).
--
-- Additive : 1 contrainte élargie, 2 réglages, 4 fonctions remplacées.

alter table public.relances_prevues drop constraint if exists relances_prevues_statut_check;
alter table public.relances_prevues add constraint relances_prevues_statut_check
  check (statut in ('prevu', 'bloque', 'ecarte', 'expire', 'perime', 'doublon', 'deja_envoye'));

insert into public.reglages (cle, valeur) values
  ('relance_texte_slack', to_jsonb('join our Slack: {slack}'::text)),
  ('relances_upwork_max_par_recrue', to_jsonb(5))
on conflict (cle) do nothing;

create or replace function public.reglage_admin_seulement(p_cle text)
returns boolean
language sql
immutable
as $$
  select p_cle = any (array['automation_pause', 'accueil_auto', 'relances_auto', 'lundi_message_auto', 'lundi_soir_auto',
                            'kill_auto', 'arret_auto', 'reponses_auto', 'rappels_reprise_le', 'faq_automatique',
                            'kill_message_auto', 'paie_api', 'paie_minimum_posts', 'paie_auto_heure', 'paie_kill6_des',
                            'paie_plafond_ligne', 'paie_plafond_jour', 'upwork_frequences',
                            'upwork_conversations_jour_max', 'upwork_reserve_prioritaire', 'relances_upwork_max_par_recrue'])
      or p_cle like '%texte%';
$$;

create or replace function public.accueil_contrat_auto(p_url text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select r.valeur #>> '{}' from public.reglages r where r.cle = 'accueil_auto'), 'test') in ('on', 'approve')
     and exists (select 1 from public.accueils a
                  where a.contrat_id = substring(btrim(coalesce(p_url, '')) from '/(?:workroom|contracts?)/([0-9]{6,})'));
$$;

create or replace function public.upwork_budget_jour(p_contrat text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_debut timestamptz := ((now() at time zone 'UTC')::date)::timestamp at time zone 'UTC';
  v_max integer := coalesce((select (r.valeur #>> '{}')::int from public.reglages r where r.cle = 'upwork_conversations_jour_max'), 45);
  v_reserve integer := coalesce((select (r.valeur #>> '{}')::int from public.reglages r where r.cle = 'upwork_reserve_prioritaire'), 5);
  v_conv integer;
  v_limite boolean;
  v jsonb;
begin
  if not (public.is_admin() or coalesce(auth.jwt() ->> 'role', '') = 'service_role') then
    raise exception 'upwork_budget_jour : réservé à l''admin' using errcode = '42501';
  end if;
  select count(distinct a.contrat) filter (where a.erreur is null),
         coalesce(bool_or(a.erreur ilike '%maximum number of rooms%'), false)
    into v_conv, v_limite
    from public.upwork_appels a
   where a.action = 'message' and a.at >= v_debut;
  with m as (
    select a.contrat, a.erreur, a.at from public.upwork_appels a
     where a.action = 'message' and a.at >= v_debut
  )
  select jsonb_build_object(
    'jour', (now() at time zone 'UTC')::date,
    'conversations', v_conv,
    'max', v_max,
    'reserve', v_reserve,
    'restant', case when v_limite then 0 else greatest(0, v_max - v_reserve - v_conv) end,
    'restant_prioritaire', case when v_limite then 0 else greatest(0, v_max - v_conv) end,
    'limite_atteinte', v_limite,
    'limite_at', (select min(m.at) from m where m.erreur ilike '%maximum number of rooms%'),
    'deja', p_contrat is not null and exists (select 1 from m where m.erreur is null and m.contrat = p_contrat),
    'dernier_ms', (select floor(extract(epoch from now() - max(m.at)) * 1000)::bigint from m)
  ) into v;
  return v;
end;
$$;
revoke all on function public.upwork_budget_jour(text) from public, anon;
grant execute on function public.upwork_budget_jour(text) to authenticated, service_role;

-- « Send » du jeudi : un nudge par posteur, Slack ET Upwork (dans le budget du jour).
create or replace function public.jeudi_valider(p_lundi date, p_comptes uuid[])
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_aujourdhui date := (now() at time zone 'Europe/Paris')::date;
  v_jusqu date := least(v_aujourdhui, p_lundi + 6);
  v_modele text := coalesce((select r.valeur #>> '{}' from public.reglages r where r.cle = 'jeudi_nudge_texte'), '');
  v_prepares integer := 0;
  v_deja integer := 0;
  v_sans_canal integer := 0;
  v_canal text;
  r record;
begin
  if not public.is_admin_strict() then
    raise exception 'jeudi_valider : réservé à l''admin';
  end if;
  if extract(isodow from p_lundi) <> 1 then
    raise exception 'jeudi_valider : % n''est pas un lundi', p_lundi;
  end if;
  if btrim(v_modele) = '' then
    raise exception 'jeudi_valider : le texte du nudge (jeudi_nudge_texte) est vide';
  end if;
  for r in
    select distinct on (s.poster_id) s.*
      from public.semaine_comptes(p_lundi, v_jusqu) s
     where s.compte_id = any(p_comptes)
     order by s.poster_id, (s.prevus_passes - s.lien_passes) desc, s.lien_total
  loop
    if r.nudge_envoye_at is not null then
      v_deja := v_deja + 1;
      continue;
    end if;
    select nullif(concat_ws('+', case when pr.slack_user_id is not null then 'slack' end,
                                 case when pr.upwork_contract_id is not null then 'upwork' end), '')
      into v_canal
      from public.profiles pr where pr.id = r.poster_id;
    if v_canal is null then
      v_sans_canal := v_sans_canal + 1;
      continue;
    end if;
    insert into public.relances_prevues (poster_id, type, periode, statut, canal, texte, raison, donnees, valide_at, valide_par, maj_at)
    values (r.poster_id, 'jeudi', p_lundi, 'prevu', v_canal,
            replace(replace(replace(v_modele,
              '{prenom}', coalesce(nullif(btrim(r.prenom), ''), 'there')),
              '{faits}', r.lien_total::text),
              '{attendus}', (r.prevus_passes + r.lien_aujourdhui)::text),
            'jeudi',
            jsonb_build_object('handle', r.handle, 'faits', r.lien_total, 'attendus', r.prevus_passes + r.lien_aujourdhui,
                               'jours', r.jours, 'hm', r.hm_nom),
            now(), auth.uid(), now())
    on conflict (poster_id, type, periode) do update
       set statut = 'prevu', canal = excluded.canal, texte = excluded.texte, raison = 'jeudi', donnees = excluded.donnees,
           valide_at = now(), valide_par = auth.uid(), maj_at = now();
    v_prepares := v_prepares + 1;
  end loop;
  return jsonb_build_object('prepares', v_prepares, 'deja', v_deja, 'sans_canal', v_sans_canal);
end;
$$;
revoke all on function public.jeudi_valider(date, uuid[]) from public, anon;
grant execute on function public.jeudi_valider(date, uuid[]) to authenticated;

notify pgrst, 'reload schema';
