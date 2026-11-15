-- 0537 : finitions avant d'allumer autonomie_bots.
-- 1. bot_propositions accepte les actions « relance », « reponse », « message_hm », « faire » (= envoyer le
--    message proposé) et « urgent » (comme action ou comme champ « niveau » : urgent, samedi ou bots).
-- 2. Plus de niveau « aujourdhui » : le niveau d'une carte EST son onglet (🤖 bots, ⚡ urgent, 📅 samedi),
--    recalculé à chaque écriture (trigger) ; les cartes ouvertes sont reclassées.
-- 3. Garde-fou bloquant : une proposition sans réponse est refusée quand le posteur attend une réponse ;
--    mark_read est refusé sur une question (action ou option d'une décision).

-- ---------------------------------------------------------------------------
-- 2. Les trois niveaux = les trois onglets.
-- ---------------------------------------------------------------------------
create or replace function public.probleme_onglet(p public.problemes)
returns text
language sql
stable
as $$
  with cats as (
    select p.categorie as c, p.proposition_action as a, p.question as q
    union all
    select s->>'categorie', s->>'proposition_action', s->>'question' from jsonb_array_elements(coalesce(p.sujets, '[]'::jsonb)) s
  )
  select case
    -- 0537 : 📅 Samedi choisi par Max (bouton ou décision) l'emporte.
    when p.niveau_force and p.niveau = 'samedi' then 'samedi'
    when exists (select 1 from cats where c in ('paie', 'kill_contrat', 'offre_hm_incorrecte', 'upwork_mauvais_compte', 'menace',
                                                'hors_plateforme', 'suspect', 'stop_doute', 'contrat_hm'))
      or coalesce(p.sujet, 'posteur') in ('hm', 'offre')
      or p.question is not null
      or coalesce(p.confiance, 1) < 0.8
      -- 0537 : « urgent » demandé par un bot (ou forcé par Max).
      or (p.niveau_force and p.niveau = 'urgent')
      then 'urgent'
    when p.kill_samedi_lundi is not null or p.rituel_choix is not null
      or exists (select 1 from cats where a in ('kill', 'double', 'recreate', 'postpone', 'saturday')
                                       or c in ('stop', 'zero_post', 'low_views', 'demande_2e_compte', 'absence', 'retirer_slack', 'avis_upwork'))
      or (p.niveau = 'samedi' and p.categorie not in ('pas_poste_aujourdhui', 'question_bloquante', 'login', 'slack', 'tiktok_setup',
                                                       'bloque_etape', 'relance_echec', 'bug_dashboard', 'plainte', 'accueil', 'autre'))
      then 'samedi'
    else 'bots'
  end;
$$;

create or replace function public.problemes_niveau_onglet()
returns trigger
language plpgsql
as $$
begin
  new.niveau := public.probleme_onglet(new);
  return new;
end;
$$;

alter table public.problemes drop constraint if exists problemes_niveau_check;
alter table public.problemes add constraint problemes_niveau_check
  check (niveau = any (array['urgent', 'bots', 'samedi'])) not valid;

-- Après problemes_arret_insertion (ordre alphabétique), qui peut changer la catégorie.
create or replace trigger problemes_niveau_onglet
  before insert or update on public.problemes
  for each row execute function public.problemes_niveau_onglet();

-- Les fonctions qui écrivaient ou triaient « aujourdhui ».
do $p$
declare
  f record;
  d text;
begin
  for f in
    select * from (values
      ('public.probleme_ajouter(text,text,uuid,text,text,text,text,timestamptz,text,text,text)', 'bots'),
      ('public.probleme_bot_lire(text,uuid)', 'bots'),
      ('public.probleme_niveau(text)', 'bots'),
      ('public.probleme_niveau_calc(text,boolean,boolean,boolean,boolean,boolean)', 'bots'),
      ('public.probleme_rang_garde(public.problemes)', 'bots'),
      ('public.problemes_compte()', 'bots'),
      ('public.problemes_fusionner_doublons()', 'bots'),
      ('public.problemes_fusionner_par_posteur()', 'bots'),
      ('public.problemes_resume_posteurs()', 'bots'),
      ('public.probleme_decision_creer(jsonb)', 'urgent'),
      ('public.probleme_kill_a_la_main(uuid,text,numeric,text)', 'urgent')
    ) as t(fn, vers)
  loop
    d := pg_get_functiondef(f.fn::regprocedure);
    if position('''aujourdhui''' in d) = 0 then raise exception '0537 : « aujourdhui » introuvable dans %', f.fn; end if;
    execute replace(d, '''aujourdhui''', quote_literal(f.vers));
  end loop;
end
$p$;

-- ---------------------------------------------------------------------------
-- 3. Garde-fous.
-- ---------------------------------------------------------------------------
-- Le dernier message du posteur s'il attend une réponse (question ou demande), sinon null.
create or replace function public.probleme_posteur_attend(p_poster uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  s jsonb;
begin
  if p_poster is null then return null; end if;
  s := public.probleme_sans_reponse(p_poster);
  if s is null then return null; end if;
  if coalesce((s->>'question')::boolean, false) or public.probleme_attend_reponse(s->>'texte') then return s; end if;
  return null;
end;
$$;

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

revoke execute on function public.probleme_posteur_attend(uuid) from public, anon, authenticated;
revoke execute on function public.probleme_bot_garde(uuid, uuid, text, jsonb) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 1 et 3. probleme_bot : nouvelles actions, niveau, garde-fous.
-- ---------------------------------------------------------------------------
do $p$
declare
  d text := pg_get_functiondef('public.probleme_bot(text,text,jsonb)'::regprocedure);
  r text[][] := array[
    [$a$'saturday', 'close', 'none', 'decision', 'double'];$a$,
     $a$'saturday', 'close', 'none', 'decision', 'double',
                            'relance', 'reponse', 'message_hm'];$a$],
    [$a$  v_proprio text;
begin$a$,
     $a$  v_proprio text;
  v_niveau text := nullif(p_args->>'niveau', '');
begin$a$],
    [$a$  begin
    if v_action is not null and not (v_action = any (v_actions)) then$a$,
     $a$  begin
    -- 0537 : « urgent » (action ou niveau) met la carte en ⚡ Urgent ; « faire » = envoyer le message proposé.
    if v_action = 'urgent' then v_niveau := 'urgent'; v_action := null; end if;
    if v_action = 'faire' then v_action := 'reponse'; end if;
    if v_niveau is not null and v_niveau not in ('urgent', 'samedi', 'bots') then
      raise exception 'niveau « % » refusé ; valeurs acceptées : urgent, samedi, bots', v_niveau;
    end if;
    if v_action is not null and not (v_action = any (v_actions)) then$a$],
    [$a$         and nullif(p_args->>'categorie', '') is null then$a$,
     $a$         and nullif(p_args->>'categorie', '') is null and v_niveau is null then$a$],
    [$a$      perform public.probleme_mark_read_verifier((select x.poster_id from public.problemes x where x.id = v_id), v_action);$a$,
     $a$      perform public.probleme_mark_read_verifier((select x.poster_id from public.problemes x where x.id = v_id), v_action);
      -- 0537 : le posteur attend une réponse → le message est obligatoire ; jamais « lu » sur une question.
      perform public.probleme_bot_garde((select x.poster_id from public.problemes x where x.id = v_id), v_id, v_action, p_args);$a$],
    [$a$             propose_par = p_bot, propose_at = now(), maj_at = now(),$a$,
     $a$             propose_par = p_bot, propose_at = now(), maj_at = now(),
             -- 0537 : le niveau demandé par le bot (« urgent » s'impose ; samedi/bots si rien n'est forcé).
             niveau = case when v_niveau = 'urgent' then 'urgent' when v_niveau is not null and not niveau_force then v_niveau else niveau end,
             niveau_force = niveau_force or coalesce(v_niveau = 'urgent', false),
             destinataire = case when v_action = 'message_hm' then 'hm' else destinataire end,
             hm_id = case when v_action = 'message_hm'
                          then coalesce(hm_id, (select m.manager_id from public.profiles m where m.id = problemes.poster_id)) else hm_id end,$a$],
    [$a$      perform public.probleme_mark_read_verifier(v_poster, v_action);$a$,
     $a$      perform public.probleme_mark_read_verifier(v_poster, v_action);
      perform public.probleme_bot_garde(v_poster, null, v_action, p_args);$a$],
    [$a$               hm_id = coalesce(nullif(p_args->>'hm_id', '')::uuid, hm_id),$a$,
     $a$               hm_id = coalesce(nullif(p_args->>'hm_id', '')::uuid, hm_id,
                                case when v_action = 'message_hm' then (select m.manager_id from public.profiles m where m.id = problemes.poster_id) end),$a$],
    [$a$               destinataire = case when v_sujet in ('hm', 'offre') then 'hm' else 'posteur' end,$a$,
     $a$               destinataire = case when v_sujet in ('hm', 'offre') or v_action = 'message_hm' then 'hm' else 'posteur' end,
               niveau = case when v_niveau = 'urgent' then 'urgent' when v_niveau is not null and not niveau_force then v_niveau else niveau end,
               niveau_force = niveau_force or coalesce(v_niveau = 'urgent', false),$a$]
  ];
  i int;
begin
  for i in 1 .. array_length(r, 1) loop
    if (length(d) - length(replace(d, r[i][1], ''))) / length(r[i][1]) <> 1 then
      raise exception '0537 : probleme_bot, morceau % introuvable ou en double', i;
    end if;
    d := replace(d, r[i][1], r[i][2]);
  end loop;
  execute d;
end
$p$;

-- probleme_bot_faire : pas d'action muette quand le posteur attend une réponse.
do $p$
declare
  d text := pg_get_functiondef('public.probleme_bot_faire(text,jsonb)'::regprocedure);
  avant text := $a$    when v_action in ('reponse', 'relance', 'relink_slack', 'message_hm') and v_msg is null$a$;
begin
  if position(avant in d) = 0 then raise exception '0537 : probleme_bot_faire, garde introuvable'; end if;
  d := replace(d, avant, $a$    when v_msg is null and v_action not in ('message_hm', 'stop') and public.probleme_posteur_attend(p.poster_id) is not null
      then 'le posteur attend une réponse : mets le message entier dans « reponse »'
$a$ || avant);
  execute d;
end
$p$;

-- La règle, lue par les bots (« lire » → regles).
insert into public.regles_bots (bot, regle, exemple)
select 'tous',
       'Actions acceptées en plus : relance, reponse, message_hm (message entier obligatoire dans « reponse »), faire (= envoyer le message proposé) et urgent. '
       || 'Le champ « niveau » (urgent, samedi ou bots) range la carte : urgent = ⚡ pour Max ; bots = 🤖 vous la traitez. '
       || 'Si le posteur attend une réponse (question ou demande dans son dernier message), toute proposition sans le message entier est refusée, et mark_read est refusé sur une question.',
       '{"action":"proposer","probleme_id":"…","action_proposee":"relance","reponse":"Hi! …","niveau":"bots"}'
 where not exists (select 1 from public.regles_bots where regle like 'Actions acceptées en plus : relance%');

-- ---------------------------------------------------------------------------
-- Reclassement des cartes ouvertes (le trigger recalcule le niveau) et retrait
-- des « lu » proposés sur une question.
-- ---------------------------------------------------------------------------
update public.problemes p
   set proposition_action = null,
       journal = journal || jsonb_build_object('at', now(), 'par', '0537', 'action', 'mark_read_retire', 'raison', 'question sans réponse')
 where p.statut = 'ouvert' and p.proposition_action = 'mark_read'
   and coalesce((public.probleme_sans_reponse(p.poster_id)->>'question')::boolean, false);

update public.problemes set niveau = niveau where statut = 'ouvert';
