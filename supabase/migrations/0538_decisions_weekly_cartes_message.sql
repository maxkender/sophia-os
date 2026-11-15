-- 0538 : Weekly decisions = toutes les décisions ; Problèmes = le quotidien.
--
-- • probleme_rituel(p) : où se décide une carte (jeudi, samedi, dimanche ou
--   « maintenant ») ; null = rien à décider (le quotidien, géré dans Problèmes).
-- • probleme_onglet(p) : 🤖 bots, ⚡ urgent (risque, HM, bot pas sûr) ou
--   « samedi » = à décider dans Weekly decisions.
-- • Une carte dont la personne attend une réponse ne traite que ce message :
--   une décision prise (Weekly decisions, rituel, décision d'une carte) ne la
--   ferme pas, elle garde le message (probleme_garder_message) ; « Faire ça »
--   ne la ferme jamais sans la réponse (probleme_agir).
-- • Bots : jamais « double » (le samedi décide), 🧠 en une phrase simple sans
--   lien ni id de contrat ; une proposition de décision écrasée par une réponse
--   passe dans les sujets.
-- • Données : le Kill samedi de Beyza (décidé le 3/11, suspendu par l'OS le
--   4/11) est rétabli ; les cartes dont le 👉 ne répond pas au ❓ sont
--   renvoyées aux bots ; reclassement.

-- ---------------------------------------------------------------------------
-- Le message sans réponse : « attend » = question ou demande.
-- ---------------------------------------------------------------------------
do $p$
declare
  d text := pg_get_functiondef('public.probleme_sans_reponse(uuid)'::regprocedure);
  avant text := $a$'question', public.texte_est_question(d->>'texte'))$a$;
begin
  if position(avant in d) = 0 then raise exception '0538 : probleme_sans_reponse, morceau introuvable'; end if;
  execute replace(d, avant, $a$'question', public.texte_est_question(d->>'texte'),
           'attend', public.texte_est_question(d->>'texte') or public.probleme_attend_reponse(d->>'texte'))$a$);
end
$p$;

-- ---------------------------------------------------------------------------
-- Où se décide une carte.
-- ---------------------------------------------------------------------------
create or replace function public.probleme_rituel(p public.problemes)
returns text
language sql
stable
as $$
  with cats as (
    select p.categorie as c, p.proposition_action as a
    union all
    select s->>'categorie', s->>'proposition_action' from jsonb_array_elements(coalesce(p.sujets, '[]'::jsonb)) s
  )
  select case
    -- Ne peut pas attendre : l'argent, une offre HM à refaire, une question posée à Max.
    when p.question is not null or coalesce(p.sujet, 'posteur') = 'offre'
      or exists (select 1 from cats where c in ('paie', 'kill_contrat', 'offre_hm_incorrecte')
                                       or a in ('pay_check', 'open_payroll', 'open_who_to_fund', 'decision'))
      then 'maintenant'
    -- Kill / Doubler / Garder : le samedi.
    when p.kill_samedi_lundi is not null or p.rituel_choix = 'double' or (p.niveau_force and p.niveau = 'samedi')
      or exists (select 1 from cats where a in ('kill', 'double', 'saturday')
                                       or c in ('stop', 'stop_doute', 'zero_post', 'low_views', 'demande_2e_compte', 'absence',
                                                'avis_upwork', 'retirer_slack'))
      then 'samedi'
    -- Recréer / nudge : le jeudi.
    when p.rituel_choix = 'recreate' or exists (select 1 from cats where a in ('recreate', 'nudge')) then 'jeudi'
    -- Reporter (postpone) : le dimanche.
    when exists (select 1 from cats where a = 'postpone') then 'dimanche'
  end;
$$;

create or replace function public.probleme_onglet(p public.problemes)
returns text
language sql
stable
as $$
  with cats as (
    select p.categorie as c
    union all
    select s->>'categorie' from jsonb_array_elements(coalesce(p.sujets, '[]'::jsonb)) s
  )
  select case
    -- 📅 choisi par Max : Weekly decisions.
    when p.niveau_force and p.niveau = 'samedi' then 'samedi'
    -- Le quotidien à risque, ou une HM : ⚡ pour Max.
    when coalesce(p.sujet, 'posteur') = 'hm'
      or exists (select 1 from cats where c in ('menace', 'hors_plateforme', 'suspect', 'upwork_mauvais_compte', 'contrat_hm'))
      then 'urgent'
    -- Une décision : Weekly decisions (« samedi » = l'onglet des décisions).
    when public.probleme_rituel(p) is not null then 'samedi'
    -- Un bot pas sûr, ou « urgent » demandé : ⚡.
    when (p.niveau_force and p.niveau = 'urgent') or coalesce(p.confiance, 1) < 0.8 then 'urgent'
    else 'bots'
  end;
$$;

-- La liste : + le rituel de chaque carte.
do $p$
declare
  d text := pg_get_functiondef('public.problemes_liste(text)'::regprocedure);
  avant text := $a$'onglet', public.probleme_onglet(p),$a$;
begin
  if position(avant in d) = 0 then raise exception '0538 : problemes_liste, morceau introuvable'; end if;
  execute replace(d, avant, $a$'onglet', public.probleme_onglet(p), 'rituel', public.probleme_rituel(p),$a$);
end
$p$;

-- Une ligne par posteur pour Weekly decisions : ses sujets, le rituel, la proposition, un message en attente.
create or replace function public.problemes_resume_decisions()
returns table(poster_id uuid, n integer, probleme_id uuid, diagnostic text, kill_samedi_lundi date, rituel_choix text,
              rituel_lundi date, rituel text, proposition text, categories text[], attend boolean)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
begin
  if not public.is_admin() then
    raise exception 'problemes_resume_decisions : réservé à l''admin' using errcode = '42501';
  end if;
  return query
  with c as (
    select p.*, public.probleme_rituel(p) as rit,
           case public.probleme_rituel(p) when 'maintenant' then 0 when 'samedi' then 1 when 'jeudi' then 2 when 'dimanche' then 3 else 4 end as r,
           coalesce(
             case when p.proposition_action in ('kill', 'double', 'recreate', 'postpone', 'nudge') then p.proposition_action end,
             (select s->>'proposition_action' from jsonb_array_elements(coalesce(p.sujets, '[]'::jsonb)) s
               where s->>'proposition_action' in ('kill', 'double', 'recreate', 'postpone', 'nudge') limit 1),
             case when p.kill_samedi_lundi is not null then 'kill' end,
             p.rituel_choix) as prop
      from public.problemes p
     where p.statut = 'ouvert' and p.poster_id is not null
  ), g as (
    select c.poster_id, count(*)::int as n,
           (array_agg(c.id order by c.r, c.created_at))[1] as id,
           left((array_agg(coalesce(nullif(btrim(c.diagnostic), ''), c.question, c.resume) order by c.r, c.created_at))[1], 160) as diag,
           max(c.kill_samedi_lundi) as kill, max(c.rituel_choix) as rc, max(c.rituel_lundi) as rl,
           (array_agg(c.rit order by c.r, c.created_at))[1] as rit,
           (array_agg(c.prop order by c.r, c.created_at) filter (where c.prop is not null))[1] as prop,
           array_agg(distinct c.categorie) as cats
      from c group by c.poster_id
  )
  select g.poster_id, g.n, g.id, g.diag, g.kill, g.rc, g.rl, g.rit, g.prop, g.cats,
         public.probleme_posteur_attend(g.poster_id) is not null
    from g;
end;
$$;

revoke execute on function public.problemes_resume_decisions() from public, anon;
grant execute on function public.problemes_resume_decisions() to authenticated;

-- ---------------------------------------------------------------------------
-- La carte garde le message en attente quand une décision est prise.
-- ---------------------------------------------------------------------------
create or replace function public.probleme_garder_message(p_id uuid, p_raison text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  p public.problemes;
  s jsonb;
  v_cats text[] := array['paie', 'kill_contrat', 'offre_hm_incorrecte', 'stop', 'stop_doute', 'zero_post', 'low_views',
                         'demande_2e_compte', 'absence', 'avis_upwork', 'retirer_slack'];
  v_actions text[] := array['kill', 'double', 'recreate', 'postpone', 'saturday', 'pay_check', 'open_payroll',
                            'open_who_to_fund', 'decision', 'nudge'];
begin
  select * into p from public.problemes where id = p_id;
  if not found or p.poster_id is null then return false; end if;
  s := public.probleme_posteur_attend(p.poster_id);
  if s is null then return false; end if;
  update public.problemes
     set categorie = case when categorie = any (v_cats) then 'question_bloquante' else categorie end,
         question = null, options = null,
         proposition_action = case when proposition_action = any (v_actions) then null else proposition_action end,
         sujets = coalesce((select jsonb_agg(x) from jsonb_array_elements(coalesce(sujets, '[]'::jsonb)) x
                             where not (coalesce(x->>'categorie', '') = any (v_cats) or coalesce(x->>'proposition_action', '') = any (v_actions))),
                           '[]'::jsonb),
         niveau_force = false, maj_at = now(),
         journal = journal || jsonb_build_object('at', now(), 'par', 'os', 'action', 'reste_message', 'raison', p_raison,
                                                 'message', left(s->>'texte', 200))
   where id = p_id;
  return true;
end;
$$;

revoke execute on function public.probleme_garder_message(uuid, text) from public, anon, authenticated;

-- Les rituels (jeudi, samedi, dimanche, recréations) : la décision prise, la carte garde un message en attente.
do $p$
declare
  d text := pg_get_functiondef('public.problemes_fermer_par_rituel(uuid,text,text,text[],text[])'::regprocedure);
  avant text := $a$    update public.problemes
       set statut = 'valide', ferme_raison = 'Décidé ' || p_rituel || ' : ' || p_decision, ferme_at = now(), maj_at = now(),
           journal = journal || jsonb_build_object('at', now(), 'par', p_rituel, 'action', 'decide_' || p_rituel, 'decision', p_decision)
     where id = r.id;$a$;
begin
  if position(avant in d) = 0 then raise exception '0538 : problemes_fermer_par_rituel, morceau introuvable'; end if;
  execute replace(d, avant, $a$    if not public.probleme_garder_message(r.id, 'Décidé ' || p_rituel || ' : ' || p_decision) then
$a$ || avant || $a$
    end if;$a$);
end
$p$;

-- La décision d'une carte (Weekly decisions → À décider maintenant) : même règle.
do $p$
declare
  d text := pg_get_functiondef('public.probleme_decider(uuid,integer,boolean)'::regprocedure);
  avant text := $a$  -- Pour que les bots apprennent : le choix de Max contre la recommandation.$a$;
begin
  if position(avant in d) = 0 then raise exception '0538 : probleme_decider, morceau introuvable'; end if;
  execute replace(d, avant, $a$  -- 0538 : la personne attend une réponse et aucune n'est partie avec la décision : la carte reste pour son message.
  if not v_samedi and nullif(btrim(coalesce(v_opt->>'reponse', '')), '') is null
     and public.probleme_posteur_attend(p.poster_id) is not null then
    update public.problemes set statut = 'ouvert', ferme_raison = null, ferme_at = null, ferme_par = null where id = p_id;
    perform public.probleme_garder_message(p_id, 'décision : « ' || (v_opt->>'libelle') || ' »');
  end if;
$a$ || avant);
end
$p$;

-- « Faire ça » / « Fermer » : jamais sans la réponse au message en attente.
do $p$
declare
  d text := pg_get_functiondef('public.probleme_agir(uuid,text,jsonb)'::regprocedure);
  avant text := $a$  if p_action = 'modifier' then$a$;
begin
  if position(avant in d) = 0 then raise exception '0538 : probleme_agir, morceau introuvable'; end if;
  execute replace(d, avant, $a$  -- 0538 : une carte dont la personne attend une réponse ne se ferme pas sans la réponse.
  if p_action in ('valider', 'fermer') and public.probleme_posteur_attend(p.poster_id) is not null
     and nullif(btrim(coalesce(p_valeur->>'reponse', '')), '') is null then
    raise exception 'Cette personne attend une réponse : envoie d''abord la réponse à son message (« % »)',
      left(public.probleme_posteur_attend(p.poster_id)->>'texte', 80);
  end if;
$a$ || avant);
end
$p$;

-- ---------------------------------------------------------------------------
-- Bots : pas de « double » hors samedi ; 🧠 simple ; la décision écrasée passe dans les sujets.
-- ---------------------------------------------------------------------------
do $p$
declare
  d text := pg_get_functiondef('public.probleme_bot(text,text,jsonb)'::regprocedure);
  a1 text := $a$    if v_action = 'faire' then v_action := 'reponse'; end if;$a$;
  a2 text := $a$             propose_par = p_bot, propose_at = now(), maj_at = now(),$a$;
begin
  if (length(d) - length(replace(d, a1, ''))) / length(a1) <> 1 then raise exception '0538 : probleme_bot, morceau 1'; end if;
  if (length(d) - length(replace(d, a2, ''))) / length(a2) <> 1 then raise exception '0538 : probleme_bot, morceau 2'; end if;
  d := replace(d, a1, a1 || $a$
    -- 0538 : Doubler (2e compte) ne se propose jamais hors samedi : la revue du samedi décide.
    if v_action = 'double' or (jsonb_typeof(p_args->'options') = 'array'
                               and exists (select 1 from jsonb_array_elements(p_args->'options') o where o->>'action' = 'double')) then
      raise exception 'double : jamais proposé hors samedi (Weekly decisions → samedi décide de Doubler)';
    end if;
    -- 0538 : 🧠 = une phrase en français simple, sans lien ni id de contrat (ils vont dans les détails).
    if v_diag is not null and (v_diag ~* '(https?://|www\.|\d{7,})' or length(v_diag) > 220) then
      raise exception 'diagnostic : une phrase en français simple (220 caractères au plus), sans lien ni id de contrat';
    end if;$a$);
  d := replace(d, a2, a2 || $a$
             -- 0538 : une proposition de décision écrasée par une réponse reste un sujet (Weekly decisions la décide).
             sujets = case when v_action in ('reponse', 'relance', 'message_hm', 'resend_password_link', 'relink_slack', 'reread_tiktok', 'close', 'mark_read')
                                and proposition_action in ('kill', 'recreate', 'postpone', 'saturday', 'pay_check', 'open_payroll', 'open_who_to_fund')
                           then coalesce(sujets, '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
                                  'categorie', categorie, 'resume', 'Proposé avant : ' || proposition_action, 'proposition_action', proposition_action))
                           else sujets end,$a$);
  execute d;
end
$p$;

insert into public.regles_bots (bot, regle, exemple)
select 'tous',
       'Une personne a un message sans réponse : la carte ne traite QUE ce message. diagnostic = ce qu''elle demande, en UNE phrase de français '
       || 'simple, sans id de contrat ni lien ; reponse = la réponse entière à SON message (+ l''action qui la débloque). Les autres sujets (paie, '
       || 'kill, doubler, recréer, samedi) n''y vont pas : Max les décide dans Weekly decisions.',
       '{"diagnostic":"Elle ne trouve pas où mettre son lien et ne peut pas poster aujourd''hui.","action_proposee":"reponse","reponse":"Hi! …"}'
 where not exists (select 1 from public.regles_bots where regle like 'Une personne a un message sans réponse : la carte ne traite QUE%');

insert into public.regles_bots (bot, regle, exemple)
select 'tous',
       'Ne propose jamais « double » : Doubler se décide seulement le samedi. Une invitation d''HM envoyée à quelqu''un qui est déjà posteur est '
       || 'une erreur de l''HM : réponds-lui de ne pas l''accepter, et crée une carte sujet « hm » avec le message à l''HM.',
       null
 where not exists (select 1 from public.regles_bots where regle like 'Ne propose jamais « double »%');

-- ---------------------------------------------------------------------------
-- Données.
-- ---------------------------------------------------------------------------
-- Beyza : le Kill samedi décidé par Max le 3/11 (suspendu par l'OS le 4/11, « doute ») est rétabli.
update public.samedi_brouillons b
   set choix = 'kill',
       raison = (b.raison - 'suspendu' - 'annule_le')
                || jsonb_build_object('note', 'Kill samedi décidé le 03/11 (rétabli le 05/11)', 'retabli_le', '2026-11-05'),
       maj_at = now()
 where b.lundi = '2026-11-02' and b.choix = 'keep' and b.raison->>'source' = 'problemes' and b.raison->>'suspendu' = 'doute'
   and b.raison->>'decide_le' = '2026-11-03';

-- Les cartes dont le 👉 ne répond pas au ❓ (la personne attend, et pas de réponse proposée depuis son message) : renvoyées aux bots.
with a as (
  select x.*, (x.s->>'texte') ~* '(invit|applied)' and (x.s->>'texte') ~* '(vik|job|offer|upwork)' as invitation
    from (select p.id, public.probleme_posteur_attend(p.poster_id) as s
            from public.problemes p
           where p.statut = 'ouvert' and p.poster_id is not null) x
)
update public.problemes p
   set journal = p.journal || jsonb_build_object('at', now(), 'par', '0538', 'action', 'renvoye_aux_bots',
                                                 'raison', 'le 👉 ne répondait pas au message en attente',
                                                 'ancien', jsonb_build_object('reponse', p.proposition_reponse, 'action', p.proposition_action,
                                                                              'diagnostic', p.diagnostic, 'propose_par', p.propose_par)),
       sujets = case when p.proposition_action in ('kill', 'recreate', 'postpone', 'saturday')
                     then coalesce(p.sujets, '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
                            'categorie', p.categorie, 'resume', 'Proposé avant : ' || p.proposition_action, 'proposition_action', p.proposition_action))
                     else p.sujets end,
       proposition_reponse = null,
       proposition_action = case when p.proposition_action in ('kill', 'double', 'recreate', 'postpone', 'saturday') then null
                                 when p.proposition_action in ('pay_check', 'open_payroll', 'open_who_to_fund') then p.proposition_action
                                 else null end,
       diagnostic = case when p.diagnostic_par in ('new_cohort_bot', 'control_bot', 'pay_bot') then null else p.diagnostic end,
       diagnostic_par = case when p.diagnostic_par in ('new_cohort_bot', 'control_bot', 'pay_bot') then null else p.diagnostic_par end,
       -- Invitation d'HM : pas une décision (la question à Max et ses options partent aussi).
       question = case when a.invitation then null else p.question end,
       options = case when a.invitation then null else p.options end,
       propose_par = null, propose_at = null, confiance = null, maj_at = now()
  from a
 where a.id = p.id and a.s is not null
   and (not (nullif(btrim(coalesce(p.proposition_reponse, '')), '') is not null and p.propose_at >= (a.s->>'at')::timestamptz)
        -- Une invitation d'HM à quelqu'un qui est déjà posteur : la réponse doit être « ne l'accepte pas » (+ message à l'HM).
        or a.invitation);

-- Reclassement (le trigger recalcule le niveau).
update public.problemes set niveau = niveau where statut = 'ouvert';
