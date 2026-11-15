-- 0710 : Support (Max, 13/11) : la vraie source, les accusés « vu », la conversation complète, les passages des bots.
-- 1. support_demandes.source accepte « upwork » et « slack » ; les demandes reprises d'un message Upwork ou
--    Slack (carte Problèmes d'origine) reçoivent leur vraie source (correction des anciennes, demandée par Max).
-- 2. support_vus : les simples accusés (« thank you », « ok », « I'll do it tonight ») ne créent plus de
--    demande ; ils sont gardés ici et s'affichent « vu » dans la conversation.
-- 3. support_conversation(poster) : tout le fil avec un posteur, tous canaux, dans l'ordre (ce qu'on lui a
--    envoyé, ses réponses, le bot, les actions, l'équipe), et sa fiche.
-- 4. problemes_passages() : pour chaque problème ouvert, les passages de son bot (lectures, au plus 1 par heure).
-- Additif, sauf la source des anciennes demandes (accord de Max).

alter table public.support_demandes drop constraint if exists support_demandes_source_check;
alter table public.support_demandes add constraint support_demandes_source_check
  check (source = any (array['help'::text, 'slack_salon'::text, 'slack_aide'::text, 'email'::text, 'upwork'::text, 'slack'::text]));

update public.support_demandes d
   set source = x.canal
  from (
    select d2.id, case when bool_or(s->>'canal' = 'upwork') then 'upwork' else 'slack' end as canal
      from public.support_demandes d2
      join public.problemes p on p.id = d2.probleme_id
      cross join lateral jsonb_array_elements(coalesce(p.sources, '[]'::jsonb)) s
     where d2.source = 'help' and coalesce(s->>'canal', '') in ('upwork', 'slack', 'bouton')
     group by d2.id
  ) x
 where d.id = x.id;

create table if not exists public.support_vus (
  id uuid primary key default gen_random_uuid(),
  poster_id uuid references public.profiles(id),
  canal text not null,
  texte text not null,
  ref text unique,
  recu_at timestamptz not null default now()
);
alter table public.support_vus enable row level security;
drop policy if exists support_vus_admin on public.support_vus;
create policy support_vus_admin on public.support_vus for select to authenticated using (public.is_admin());
create index if not exists support_vus_poster_idx on public.support_vus (poster_id, recu_at desc);

-- La conversation : une liste { at, sens (in | out | action), canal, qui, texte, type, vu } + la fiche.
create or replace function public.support_conversation(p_poster uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  pr public.profiles%rowtype;
  v_emails text[];
  v_depuis timestamptz := now() - interval '60 days';
begin
  if coalesce(auth.role(), '') <> 'service_role' and not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select * into pr from public.profiles where id = p_poster;
  if not found then return null; end if;
  v_emails := array_remove(array[lower(pr.email), lower(pr.ruul_email),
    (select lower(h.email_perso) from public.hub_posteurs h where h.profile_id = p_poster limit 1)], null);
  return jsonb_build_object(
    'fiche', public.support_fiche(p_poster),
    'canaux', jsonb_build_object('slack', pr.slack_user_id is not null, 'upwork', pr.upwork_contract_id is not null,
                                 'email', coalesce(array_length(v_emails, 1), 0) > 0, 'plateforme', pr.canal_paie),
    'fil', coalesce((select jsonb_agg(f order by f->>'at') from (
      -- Upwork, dans les deux sens.
      select jsonb_build_object('at', m.at, 'sens', case when m.role = 'posteur' then 'in' else 'out' end, 'canal', 'upwork',
               'qui', case m.role when 'posteur' then 'posteur' when 'max' then 'Max' when 'hm' then 'HM' else 'OS' end,
               'texte', left(m.texte, 2000), 'type', 'message') f
        from public.upwork_messages m where m.poster_id = p_poster and m.at > v_depuis
      union all
      -- Slack (ses messages).
      select jsonb_build_object('at', s.at, 'sens', 'in', 'canal', 'slack', 'qui', 'posteur', 'texte', left(s.texte, 2000), 'type', 'message')
        from public.slack_messages s where pr.slack_user_id is not null and s.slack_user = pr.slack_user_id and s.at > v_depuis
      union all
      -- Ses réponses par boutons et ce que l'OS lui a répondu.
      select jsonb_build_object('at', r.recu_at, 'sens', 'in', 'canal', r.canal, 'qui', 'posteur', 'texte', left(r.texte, 2000), 'type', 'message')
        from public.posteur_reponses r where r.poster_id = p_poster and r.canal <> 'upwork' and r.recu_at > v_depuis
      union all
      -- Ce que l'OS lui a envoyé : relances, nudges (Slack, dashboard), messages du dashboard.
      select jsonb_build_object('at', n.envoye_at, 'sens', 'out', 'canal', n.canal, 'qui', 'OS', 'texte', left(n.texte, 2000), 'type', coalesce(n.type, 'relance'))
        from public.nudges n where n.poster_id = p_poster and n.canal <> 'upwork' and n.envoye_at is not null and n.envoye_at > v_depuis
      union all
      select jsonb_build_object('at', pm.created_at, 'sens', 'out', 'canal', 'dashboard', 'qui', 'OS', 'texte', left(pm.texte, 2000), 'type', pm.type)
        from public.posteur_messages pm where pm.poster_id = p_poster and pm.created_at > v_depuis
      union all
      -- Les emails (bienvenue, relances Ruul, rattrapages, réponses).
      select jsonb_build_object('at', coalesce(e.accepte_at, e.cree_at), 'sens', 'out', 'canal', 'email', 'qui', 'OS',
               'texte', e.objet || coalesce(E'\n' || left(e.texte, 1500), ''), 'type', coalesce(e.tags[array_length(e.tags, 1)], 'email'),
               'statut', e.statut)
        from public.emails_envois e where lower(e.destinataire) = any(v_emails) and e.cree_at > v_depuis
      union all
      -- Ses demandes (Help, email, Slack, Upwork) et leurs fils.
      select jsonb_build_object('at', d.cree_at, 'sens', 'in', 'canal', d.source, 'qui', 'posteur', 'texte', left(d.texte, 2000), 'type', 'demande', 'demande_id', d.id)
        from public.support_demandes d where d.poster_id = p_poster and d.cree_at > v_depuis
      union all
      select jsonb_build_object('at', sm.cree_at, 'sens', case when sm.auteur = 'posteur' then 'in' else 'out' end,
               'canal', d.source, 'qui', case sm.auteur when 'posteur' then 'posteur' when 'bot' then 'bot' else 'équipe' end,
               'texte', left(sm.texte, 2000), 'type', 'fil', 'demande_id', d.id)
        from public.support_messages sm join public.support_demandes d on d.id = sm.demande_id
       where d.poster_id = p_poster and sm.cree_at > v_depuis
         -- Le 1er message du bot est déjà la réponse de la demande : il n'est montré qu'une fois.
         and not (sm.auteur = 'posteur' and sm.texte = d.texte)
      union all
      select jsonb_build_object('at', coalesce(d.maj_at, d.cree_at), 'sens', 'action', 'canal', 'os', 'qui', coalesce(d.regle_par_bot, 'bot'),
               'texte', d.action_faite, 'type', 'action')
        from public.support_demandes d where d.poster_id = p_poster and d.cree_at > v_depuis and nullif(d.action_faite, '') is not null
      union all
      select jsonb_build_object('at', b.at, 'sens', 'action', 'canal', coalesce(b.canal, 'os'), 'qui', b.bot,
               'texte', b.action || coalesce(' : ' || left(b.message, 500), '') || ' (' || b.statut || ')', 'type', 'action')
        from public.bot_actions b where b.poster_id = p_poster and b.at > v_depuis
      union all
      -- Les accusés « vu » (pas de demande).
      select jsonb_build_object('at', v.recu_at, 'sens', 'in', 'canal', v.canal, 'qui', 'posteur', 'texte', left(v.texte, 2000), 'type', 'message', 'vu', true)
        from public.support_vus v where v.poster_id = p_poster and v.recu_at > v_depuis
    ) t), '[]'::jsonb));
end;
$$;
revoke execute on function public.support_conversation(uuid) from public, anon;
grant execute on function public.support_conversation(uuid) to authenticated, service_role;

-- Les passages du bot propriétaire de chaque problème ouvert (ses lectures depuis la création, au plus 1 par heure).
create or replace function public.problemes_passages()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_object_agg(p.id, (
           select count(distinct date_trunc('hour', a.at)) from public.bot_appels a
            where a.bot = p.proprietaire and a.action = 'lire' and a.at > p.created_at)), '{}'::jsonb)
    from public.problemes p
   where p.statut = 'ouvert' and public.is_admin();
$$;
revoke execute on function public.problemes_passages() from public, anon;
grant execute on function public.problemes_passages() to authenticated;
