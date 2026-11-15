-- 0541 : « I've passed your question to the team » n'est pas une réponse.
--
-- 1. texte_attente_equipe(t) : reconnaît les messages d'attente (« passed /
--    forwarded your question to the team », « the team will get back to you »…).
-- 2. Un tel message ne compte pas comme réponse : probleme_sans_reponse le
--    saute (la personne attend toujours) ; problemes_passage garde la question
--    de #questions (elle devient une carte au lieu d'être tenue pour répondue).
-- 3. problemes_faq_attente() (à chaque passage) : la carte d'une question à
--    laquelle le bot FAQ a répondu « I've passed your question to the team »
--    passe en ⚡ Urgent, avec la réponse proposée par le guide quand il en a une
--    (sinon les bots doivent en proposer une : la réponse est obligatoire).
-- 4. Les bots ne peuvent plus proposer ni envoyer ce genre de réponse.
-- Les textes et le comportement du bot FAQ dans Slack ne changent pas.

create or replace function public.texte_attente_equipe(p_texte text)
returns boolean
language sql
immutable
as $$
  select coalesce(p_texte, '') ~* ('(passed|forwarded|sent|transferred|escalated|handed|relayed|shared)\s+(it\s+|this\s+)?(on\s+)?'
           || '((your|this|the)\s+)?((question|message|request|issue|query)\s+)?(on\s+|over\s+)?(to|with)\s+(the|our)\s+(team|admins?|managers?)')
      or coalesce(p_texte, '') ~* '(the|our)\s+team\s+will\s+(get\s+back|answer|reply|respond|look\s+into)'
      or coalesce(p_texte, '') ~* 'someone\s+(from|on)\s+(the|our)\s+team\s+will';
$$;

-- 2a. Le dernier message qui n'est pas un message d'attente.
create or replace function public.probleme_sans_reponse(p_poster uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select case when d->>'auteur' = 'posteur' then jsonb_build_object(
           'texte', left(d->>'texte', 500), 'canal', d->>'canal', 'at', d->>'at',
           'depuis_heures', round(extract(epoch from (now() - (d->>'at')::timestamptz)) / 3600.0, 1),
           'question', public.texte_est_question(d->>'texte'),
           'attend', public.texte_est_question(d->>'texte') or public.probleme_attend_reponse(d->>'texte')) end
    from (select e.v as d
            from jsonb_array_elements(public.probleme_messages(p_poster, 6)) with ordinality as e(v, i)
           where not (e.v->>'auteur' <> 'posteur' and public.texte_attente_equipe(e.v->>'texte'))
           order by e.i
           limit 1) x;
$$;

-- 2b. #questions : une question n'est tenue pour répondue que par une vraie réponse.
do $p$
declare
  d text := pg_get_functiondef('public.problemes_passage()'::regprocedure);
  avant text := $a$where q.slack_ts = sm.ts and (q.envoye_at is not null or q.reponse_humaine is not null));$a$;
begin
  if position(avant in d) = 0 then raise exception '0541 : problemes_passage, morceau introuvable'; end if;
  execute replace(d, avant, $a$where q.slack_ts = sm.ts
                        and (q.reponse_humaine is not null
                             or (q.envoye_at is not null and not public.texte_attente_equipe(q.reponse))));$a$);
end
$p$;

-- 3. La carte d'une question « passée à l'équipe » : ⚡ Urgent, avec la réponse du guide.
create or replace function public.problemes_faq_attente()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  n integer := 0;
begin
  for r in
    select distinct on (x.probleme_id) q.id as qid, q.reponse_faq, x.probleme_id
      from public.chatbot_questions q
      join public.problemes_sources x on x.type = 'slack' and x.ref = q.slack_canal || ':' || q.slack_ts and x.probleme_id is not null
      join public.problemes p on p.id = x.probleme_id and p.statut = 'ouvert'
     where q.envoye_at is not null and public.texte_attente_equipe(q.reponse) and q.reponse_humaine is null
       and q.created_at > now() - interval '14 days'
       and not (p.journal @> jsonb_build_array(jsonb_build_object('action', 'faq_attente', 'question', q.id)))
     order by x.probleme_id, q.created_at desc
  loop
    update public.problemes
       set niveau = 'urgent', niveau_force = true,
           canal_reponse = coalesce(canal_reponse, 'slack'),
           proposition_reponse = case
             when nullif(btrim(coalesce(proposition_reponse, '')), '') is null
              and nullif(btrim(coalesce(r.reponse_faq, '')), '') is not null
              and not public.texte_attente_equipe(r.reponse_faq)
             then r.reponse_faq else proposition_reponse end,
           propose_at = case
             when nullif(btrim(coalesce(proposition_reponse, '')), '') is null
              and nullif(btrim(coalesce(r.reponse_faq, '')), '') is not null
              and not public.texte_attente_equipe(r.reponse_faq)
             then now() else propose_at end,
           diagnostic = coalesce(diagnostic, 'Le bot FAQ n''a pas su répondre : la personne attend une vraie réponse.'),
           journal = journal || jsonb_build_object('at', now(), 'par', 'os', 'action', 'faq_attente', 'question', r.qid),
           maj_at = now()
     where id = r.probleme_id;
    n := n + 1;
  end loop;
  return n;
end;
$$;

revoke execute on function public.problemes_faq_attente() from public, anon, authenticated;

do $p$
declare
  d text := pg_get_functiondef('public.problemes_actualiser()'::regprocedure);
  avant text := $a$'arrets', public.problemes_arrets_reclasser());$a$;
begin
  if position(avant in d) = 0 then raise exception '0541 : problemes_actualiser, morceau introuvable'; end if;
  execute replace(d, avant, $a$'arrets', public.problemes_arrets_reclasser(),
                            'faq_attente', public.problemes_faq_attente());$a$);
end
$p$;

-- 4. Bots : jamais « we've forwarded your question ».
create or replace function public.probleme_bot_garde(p_poster uuid, p_id uuid, p_action text, p_args jsonb)
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  s jsonb;
  v_options jsonb := case when jsonb_typeof(p_args->'options') = 'array' then p_args->'options' else '[]'::jsonb end;
  v_rep boolean := nullif(btrim(coalesce(p_args->>'reponse', '')), '') is not null;
begin
  -- 0541 : « we've forwarded your question to the team » n'est pas une réponse.
  if public.texte_attente_equipe(p_args->>'reponse')
     or exists (select 1 from jsonb_array_elements(v_options) o where public.texte_attente_equipe(o->>'reponse')) then
    raise exception 'réponse interdite : pas de « we''ve forwarded your question to the team ». Donne la vraie réponse ; si tu n''es pas sûr, propose-la avec niveau « urgent » et Max la corrigera';
  end if;
  -- Une action qui envoie un message : le message entier est obligatoire.
  if p_action in ('reponse', 'relance', 'message_hm') and not v_rep
     and not exists (select 1 from public.problemes x where x.id = p_id and nullif(btrim(coalesce(x.proposition_reponse, '')), '') is not null) then
    raise exception '« % » : le message entier est obligatoire dans « reponse »', p_action;
  end if;
  if p_poster is null then return; end if;
  s := public.probleme_sans_reponse(p_poster);
  if s is null then return; end if;
  -- Jamais « lu » sur une question, même en option d'une décision.
  if coalesce((s->>'question')::boolean, false)
     and exists (select 1 from jsonb_array_elements(v_options) o where o->>'action' = 'mark_read') then
    raise exception 'question sans réponse : pas de « mark_read », propose une réponse (dernier message %, il y a % h : « % »)',
      s->>'canal', s->>'depuis_heures', left(s->>'texte', 120);
  end if;
  -- Le posteur attend une réponse : pas de proposition sans le message à lui envoyer.
  if not (coalesce((s->>'question')::boolean, false) or public.probleme_attend_reponse(s->>'texte')) then return; end if;
  if v_rep then return; end if;
  if nullif(btrim(coalesce(v_options->0->>'reponse', '')), '') is not null then return; end if;
  if exists (select 1 from public.problemes x
              where x.id = p_id and nullif(btrim(coalesce(x.proposition_reponse, '')), '') is not null
                and x.propose_at >= (s->>'at')::timestamptz) then
    return;
  end if;
  raise exception 'le posteur attend une réponse (dernier message %, il y a % h : « % ») : mets le message entier dans « reponse »',
    s->>'canal', s->>'depuis_heures', left(s->>'texte', 120);
end;
$$;

revoke execute on function public.probleme_bot_garde(uuid, uuid, text, jsonb) from public, anon, authenticated;

do $p$
declare
  d text := pg_get_functiondef('public.probleme_bot_faire(text,jsonb)'::regprocedure);
  avant text := $a$    when v_msg is null and v_action not in ('message_hm', 'stop')$a$;
begin
  if position(avant in d) = 0 then raise exception '0541 : probleme_bot_faire, morceau introuvable'; end if;
  execute replace(d, avant, $a$    when v_msg is not null and public.texte_attente_equipe(v_msg)
      then 'réponse interdite : pas de « we''ve forwarded your question to the team », donne la vraie réponse'
$a$ || avant);
end
$p$;

insert into public.regles_bots (bot, regle, exemple)
select 'tous',
       'Ne réponds jamais « I''ve passed / we''ve forwarded your question to the team » : c''est refusé. Donne toujours la vraie réponse. '
       || 'Si tu n''es pas sûr, propose ta meilleure réponse avec niveau « urgent » : Max la corrigera avant envoi.',
       null
 where not exists (select 1 from public.regles_bots where regle like 'Ne réponds jamais « I''ve passed%');

-- Les questions déjà « passées à l'équipe » : cartes créées et mises en Urgent au prochain passage ;
-- celles qui ont déjà une carte passent en Urgent tout de suite.
select public.problemes_faq_attente();
