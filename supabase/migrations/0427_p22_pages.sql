-- 0427 — Prompt 22, parties 5 à 9 : les pages Weekly decisions, Messages
-- sent, Messages received, Payroll et FAQ bot.
--
-- 1. `messages_envoyes(p_depuis)` : le journal de TOUS les messages que l'OS
--    envoie (partie 6.1), en une seule lecture, pour l'admin et le Head of Ops :
--    relances et messages de la semaine (nudges), bienvenue (accueils), pop-ups
--    du tableau de bord et leur envoi Slack / Upwork (posteur_messages),
--    réponses automatiques (posteur_reponses), Kill sous les 6 posts
--    (recrue_evenements « kill_message »), message de fin de l'arrêt complet
--    (étape « message » de arrets), notes du tableau de bord (compte_nudges :
--    lien 1 000, nudges, réponses FAQ) et messages bloqués par la pause
--    (actions_bloquees). Pour chacun : la date, le posteur, le type, le canal,
--    l'état (envoye, simule, pause, bloque, erreur) et la réaction du posteur.
--    Cohorte RUUL (hub_posteurs) exclue.
-- 2. Les textes et les heures d'envoi encore modifiables par le Head of Ops
--    deviennent admin seulement, vérifiés en base (partie 1.6, partie 12) :
--    ckd_nudges, nudge_messages, nudges (textes sans « texte » dans leur nom),
--    semaine_heures et double_popup_expire (onglet Timing). Les autres textes
--    (« %texte% »), etapes_delais, lundi_soir_heure et lien_1000 le sont déjà
--    (0411, 0412). Politiques RESTRICTIVE à part : reglage_admin_seulement()
--    n'est pas redéfinie (d'autres migrations la complètent).
--
-- Additive : 1 fonction, 3 politiques. Aucun réglage ajouté, aucune donnée
-- changée, aucun interrupteur touché (paie_api reste tel quel).
-- Retour arrière : retirer la fonction et les 3 politiques reglages_textes_p22_*.

-- ---------------------------------------------------------------------------
-- 1. Le journal des messages envoyés
-- ---------------------------------------------------------------------------

create or replace function public.messages_envoyes(p_depuis timestamptz)
returns table (
  at          timestamptz,
  poster_id   uuid,
  poster_nom  text,
  type        text,
  canal       text,
  etat        text,
  texte       text,
  detail      text,
  reaction    text,
  reaction_at timestamptz,
  source      text,
  ref         text
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
  with m as (
    -- Relances d'étape, lundi, lundi 20 h, jeudi, nudges envoyés à la main.
    select n.envoye_at as at, n.poster_id, null::text as nom, n.type, n.canal,
           case when n.slack_erreur is not null then 'erreur' else 'envoye' end as etat,
           n.texte, n.slack_erreur as detail,
           case when n.resolu_at is not null then 'resolu' when n.reponse_at is not null then 'repondu' end as reaction,
           coalesce(n.resolu_at, n.reponse_at) as reaction_at,
           'nudges'::text as source, n.id::text as ref
      from public.nudges n
     where n.envoye_at >= p_depuis
    union all
    -- Bienvenue (accueil automatique) : parti, simulé en test ou en erreur.
    select coalesce(a.message_at, a.updated_at), a.poster_id, nullif(btrim(concat_ws(' ', a.prenom, a.nom)), ''),
           'bienvenue', 'upwork',
           case when a.message_at is not null then 'envoye' when a.statut = 'simule' then 'simule' else 'erreur' end,
           a.message_texte, a.raison, null, null, 'accueils', a.contrat_id
      from public.accueils a
     where a.message_texte is not null
       and (a.message_at is not null or a.statut in ('simule', 'erreur'))
       and coalesce(a.message_at, a.updated_at) >= p_depuis
    union all
    -- Pop-ups du tableau de bord : Kill, Double, Recréer, régularité.
    select pm.created_at, pm.poster_id, null, pm.type, 'os',
           case when pm.erreur is not null then 'erreur' else 'envoye' end,
           pm.texte, pm.erreur,
           case when pm.reponse is not null then 'reponse_' || pm.reponse when pm.lu_at is not null then 'lu' end,
           coalesce(pm.repondu_at, pm.lu_at), 'posteur_messages', pm.id::text
      from public.posteur_messages pm
     where pm.created_at >= p_depuis
    union all
    -- Le même message sur Slack.
    select coalesce(pm.slack_at, pm.created_at), pm.poster_id, null, pm.type, 'slack',
           case pm.slack_statut when 'envoye' then 'envoye' when 'simule' then 'simule' when 'paused' then 'pause' else 'erreur' end,
           pm.texte, coalesce(pm.slack_erreur, case when pm.slack_statut not in ('envoye', 'simule') then pm.slack_statut end),
           null, null, 'posteur_messages', pm.id::text
      from public.posteur_messages pm
     where pm.slack_statut is not null and coalesce(pm.slack_at, pm.created_at) >= p_depuis
    union all
    -- Le message de Kill sur Upwork (prompt 21, F).
    select coalesce(pm.upwork_at, pm.created_at), pm.poster_id, null, pm.type, 'upwork',
           case pm.upwork_statut when 'envoye' then 'envoye' when 'simule' then 'simule' when 'paused' then 'pause' else 'erreur' end,
           pm.texte, coalesce(pm.upwork_erreur, case when pm.upwork_statut not in ('envoye', 'simule') then pm.upwork_statut end),
           null, null, 'posteur_messages', pm.id::text
      from public.posteur_messages pm
     where pm.upwork_statut is not null and coalesce(pm.upwork_at, pm.created_at) >= p_depuis
    union all
    -- Réponses automatiques aux messages reçus.
    select coalesce(r.reponse_at, r.traite_at, r.recu_at), r.poster_id, null, 'reponse_auto',
           case r.canal when 'upwork' then 'upwork' else 'slack' end,
           case r.reponse_statut when 'envoye' then 'envoye' when 'simule' then 'simule' when 'paused' then 'pause'
                                 when 'limite' then 'bloque' else 'erreur' end,
           r.reponse_texte, r.erreur, null, null, 'posteur_reponses', r.id::text
      from public.posteur_reponses r
     where r.reponse_texte is not null
       and r.reponse_statut in ('envoye', 'simule', 'paused', 'limite', 'erreur')
       and coalesce(r.reponse_at, r.traite_at, r.recu_at) >= p_depuis
    union all
    -- Kill sous les 6 posts (prompt 21, B1) : le message sur Upwork.
    select e.at, e.poster_id, null, 'kill_moins6', 'upwork',
           case when e.detail like 'Message envoyé%' then 'envoye' else 'erreur' end,
           case when e.detail like 'Message envoyé sur Upwork : %' then regexp_replace(e.detail, '^Message envoyé sur Upwork : ', '') end,
           case when e.detail not like 'Message envoyé%' then e.detail end,
           null, null, 'recrue_evenements', e.id::text
      from public.recrue_evenements e
     where e.type = 'kill_message' and e.at >= p_depuis
    union all
    -- Arrêt complet : le dernier message sur Upwork (« Your contract has ended »).
    select coalesce((x->>'at')::timestamptz, a.maj_at), a.poster_id, null, 'arret', 'upwork',
           case x->>'statut' when 'fait' then 'envoye' when 'simule' then 'simule' else 'erreur' end,
           null, x->>'detail', null, null, 'arrets', a.id::text
      from public.arrets a
     cross join lateral jsonb_array_elements(case when jsonb_typeof(a.etapes) = 'array' then a.etapes else '[]'::jsonb end) x
     where x->>'action' = 'message' and x->>'statut' in ('fait', 'simule', 'erreur')
       and coalesce((x->>'at')::timestamptz, a.maj_at) >= p_depuis
    union all
    -- Notes du tableau de bord : lien 1 000 abonnés, nudges du jeudi, régularité, réponses FAQ.
    select cn.created_at, c.poster_id, null, 'note:' || coalesce(cn.modele_id, 'manuel'), 'os', 'envoye',
           nullif(concat_ws(E'\n', cn.titre, cn.corps), ''), null,
           case when cn.lu_at is not null then 'lu' end, cn.lu_at, 'compte_nudges', cn.id::text
      from public.compte_nudges cn
      join public.comptes c on c.id = cn.compte_id
     where cn.created_at >= p_depuis
    union all
    -- Bloqués par le grand interrupteur (prompt 22, partie 2) : les messages seulement.
    select b.at, b.poster_id, null, 'pause:' || b.action, b.fonction, 'pause',
           null, coalesce(b.cible, case when b.detail is not null then b.detail::text end),
           null, null, 'actions_bloquees', b.id::text
      from public.actions_bloquees b
     where b.at >= p_depuis
       and (b.action in ('accueil', 'lundi_soir', 'semaine', 'relance', 'nudge')
            or b.action like '%message%' or b.action like 'reponse%')
  )
  select m.at, m.poster_id, coalesce(nullif(btrim(concat_ws(' ', pr.prenom, pr.nom)), ''), m.nom),
         m.type, m.canal, m.etat, m.texte, m.detail, m.reaction, m.reaction_at, m.source, m.ref
    from m
    left join public.profiles pr on pr.id = m.poster_id
   where m.at is not null
     and (m.poster_id is null or not exists (select 1 from public.hub_posteurs h where h.profile_id = m.poster_id))
   order by m.at desc
   limit 2000;
end;
$$;

comment on function public.messages_envoyes(timestamptz) is
  'Prompt 22, partie 6 (0427) : le journal de tous les messages envoyés par l''OS depuis p_depuis (admin et Head of Ops).';

revoke execute on function public.messages_envoyes(timestamptz) from public, anon;
grant execute on function public.messages_envoyes(timestamptz) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Les textes et les heures d'envoi : admin seulement, en base
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'reglages'
                  and policyname = 'reglages_textes_p22_ins') then
    create policy reglages_textes_p22_ins on public.reglages as restrictive for insert to authenticated
      with check (cle not in ('ckd_nudges', 'nudge_messages', 'nudges', 'semaine_heures', 'double_popup_expire')
                  or public.is_admin_strict());
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'reglages'
                  and policyname = 'reglages_textes_p22_upd') then
    create policy reglages_textes_p22_upd on public.reglages as restrictive for update to authenticated
      using (cle not in ('ckd_nudges', 'nudge_messages', 'nudges', 'semaine_heures', 'double_popup_expire')
             or public.is_admin_strict())
      with check (cle not in ('ckd_nudges', 'nudge_messages', 'nudges', 'semaine_heures', 'double_popup_expire')
                  or public.is_admin_strict());
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'reglages'
                  and policyname = 'reglages_textes_p22_del') then
    create policy reglages_textes_p22_del on public.reglages as restrictive for delete to authenticated
      using (cle not in ('ckd_nudges', 'nudge_messages', 'nudges', 'semaine_heures', 'double_popup_expire')
             or public.is_admin_strict());
  end if;
end;
$$;
