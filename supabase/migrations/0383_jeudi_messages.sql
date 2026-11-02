-- 0383 — v3 point 5 : le jeudi, Recréer et Nudge arrivent chez le posteur.
--
-- 1. Recréer : pop-up bloquante dans son espace (bouton « Got it », qui pose
--    `lu_at`) et le même texte sur Slack. Texte : réglage
--    `recreer_popup_texte` ({prenom}, {nouveau} = le nouveau @, {date} = le
--    lundi de reprise). Écrit par la fonction `ckd` à chaque recréation
--    (jeudi, et « Nouveau compte » de la page Shadowban).
-- 2. Nudge du jeudi : en plus de la pop-up de l'OS (compte_nudges, inchangée),
--    un message Slack, réglage `nudge_regularite_texte`.
-- 3. Les messages vont dans `posteur_messages` (0382), types `recreer` et
--    `nudge`.
--
-- Additive : deux réglages créés s'ils manquent, des fonctions nouvelles,
-- `mes_messages_posteur` (0382) réécrite à signature identique (Recréer en
-- plus). Aucune ligne existante modifiée.

insert into public.reglages (cle, valeur) values
  ('recreer_popup_texte', to_jsonb('There was a problem with your account. Here is the new account to create: @{nouveau}. Create it on TikTok, start the warm-up, and you''ll start posting again on Monday {date}.'::text)),
  ('nudge_regularite_texte', to_jsonb('Hi {prenom}, please post consistently: 2 posts every day, at about the same times.'::text))
on conflict (cle) do nothing;

-- Un réglage texte, chaque {cle} de p_vars remplacée ; {prenom} : le prénom.
create or replace function public.posteur_texte_vars(p_cle text, p_prenom text, p_vars jsonb)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_texte text := public.posteur_texte(p_cle, p_prenom);
  k text;
  v text;
begin
  for k, v in select key, value from jsonb_each_text(coalesce(p_vars, '{}'::jsonb)) loop
    v_texte := replace(v_texte, '{' || k || '}', coalesce(v, ''));
  end loop;
  return v_texte;
end;
$$;

revoke execute on function public.posteur_texte_vars(text, text, jsonb) from public, anon;
grant execute on function public.posteur_texte_vars(text, text, jsonb) to authenticated, service_role;

-- Recréer : le message d'une recréation (`ckd_recreations`). Rend le message.
create or replace function public.recreer_message_creer(p_recreation uuid, p_nouveau text, p_date text)
returns public.posteur_messages
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.ckd_recreations%rowtype;
  v_prenom text;
  m public.posteur_messages;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'recreer_message_creer : réservé à la fonction ckd';
  end if;
  select * into r from public.ckd_recreations where id = p_recreation;
  if not found then
    raise exception 'recreer_message_creer : recréation introuvable';
  end if;
  select prenom into v_prenom from public.profiles where id = r.poster_id;
  insert into public.posteur_messages (poster_id, compte_id, proposition_id, semaine, type, texte)
  values (r.poster_id, r.nouveau_compte_id, r.proposition_id, (r.created_at at time zone 'Europe/Paris')::date, 'recreer',
          public.posteur_texte_vars('recreer_popup_texte', v_prenom,
                                    jsonb_build_object('nouveau', ltrim(coalesce(p_nouveau, ''), '@'), 'date', p_date)))
  -- Deux recréations le même jour : la pop-up montre la dernière.
  on conflict (poster_id, type, semaine) do update
    set compte_id = excluded.compte_id, proposition_id = excluded.proposition_id, texte = excluded.texte,
        lu_at = null, created_at = now(), slack_statut = null, slack_at = null, slack_erreur = null
  returning * into m;
  return m;
end;
$$;

revoke execute on function public.recreer_message_creer(uuid, text, text) from public, anon, authenticated;
grant execute on function public.recreer_message_creer(uuid, text, text) to service_role;

-- Nudge du jeudi : le message Slack d'une proposition décidée en Nudge. Rend
-- le message s'il vient d'être créé.
create or replace function public.nudge_message_creer(p_id uuid)
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
    raise exception 'nudge_message_creer : réservé à la fonction ckd';
  end if;
  select * into p from public.ckd_propositions where id = p_id;
  if not found or p.type <> 'jeudi' or p.decision is distinct from 'nudge' then
    return;
  end if;
  select prenom into v_prenom from public.profiles where id = p.poster_id;
  return query
  insert into public.posteur_messages (poster_id, compte_id, proposition_id, semaine, type, texte, lu_at)
  values (p.poster_id, p.compte_id, p.id, p.jour, 'nudge', public.posteur_texte('nudge_regularite_texte', v_prenom), now())
  on conflict (poster_id, type, semaine) do nothing
  returning *;
end;
$$;

revoke execute on function public.nudge_message_creer(uuid) from public, anon, authenticated;
grant execute on function public.nudge_message_creer(uuid) to service_role;

-- « Got it » : le posteur a lu (Recréer).
create or replace function public.posteur_message_lu(p_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.posteur_messages set lu_at = now()
   where id = p_id and poster_id = auth.uid() and lu_at is null;
$$;

revoke execute on function public.posteur_message_lu(uuid) from public, anon;
grant execute on function public.posteur_message_lu(uuid) to authenticated;

-- L'espace du posteur (0382) + la pop-up Recréer tant qu'elle n'est pas lue.
create or replace function public.mes_messages_posteur()
returns table (id uuid, type text, texte text, expire_at timestamptz, created_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select m.id, m.type, m.texte, m.expire_at, m.created_at
    from public.posteur_messages m
    left join public.ckd_propositions p on p.id = m.proposition_id
   where m.poster_id = auth.uid()
     and m.visible_de <= now()
     and (
       (m.type = 'double' and m.reponse is null and (m.expire_at is null or m.expire_at > now())
          and p.decision = 'doubler')
       or (m.type = 'kill' and m.created_at > now() - interval '7 days'
          and (p.id is null or p.decision = 'ne_pas_renouveler'))
       or (m.type = 'recreer' and m.lu_at is null and m.created_at > now() - interval '10 days')
     )
   order by m.created_at desc;
$$;

notify pgrst, 'reload schema';
