-- 0533 — Détecter « demande l'arrêt » : pas seulement le mot STOP (04/11).
--
-- 1. texte_arret_signal(texte) : le signal d'un message, toutes langues
--    (anglais, français, allemand, espagnol, italien, portugais, et quelques
--    tournures turques, néerlandaises, polonaises, tchèques) :
--      stop     : il ou elle arrête / ne veut plus continuer (« I'll pass on this
--                 project », « please end the contract », « I quit », « je
--                 préfère arrêter », « ich höre auf », « no quiero seguir »,
--                 « I found another job », « STOP »…) ;
--      doute    : « maybe I should stop? », ou un arrêt mêlé de forte frustration ;
--      reprise  : une pause ou un retard avec reprise (« my baby was sick, I'll
--                 post today ») : pas un stop ;
--      question_fin : une question sur la fin du contrat ou la paie : pas un stop ;
--      frustration  : une plainte sans demande d'arrêt : pas un stop.
--    probleme_categorie_texte l'utilise (stop, stop_doute, absence, plainte).
-- 2. Stop sûr : Kill samedi proposé (relances et posts coupés au clic) et une
--    réponse courte et gentille (aucune si le message est juste « STOP »).
-- 3. Doute : carte « decision » [Lui répondre et garder (recommandé)] [Kill
--    samedi], avec une réponse qui demande s'il ou elle veut continuer. Un Kill
--    samedi déjà prévu est suspendu (la demande d'arrêt reste ouverte : pas de
--    relance tant que Max n'a pas choisi).
-- 4. problemes_arrets_reclasser : relit les cartes stop ouvertes avec ces règles
--    (et à chaque passage de problemes_actualiser).
-- 5. Bots : « proposer » accepte categorie + raison_categorie (stop ↔ autre…) ;
--    les catégories stop_doute et plainte s'ajoutent.
--
-- Additif : des fonctions et un déclencheur ; probleme_bot, probleme_decider,
-- probleme_kill_samedi, probleme_niveau et problemes_actualiser patchées en place.

create or replace function public.texte_arret_signal(p_texte text)
returns text
language sql
immutable
as $$
  with t as (select lower(coalesce(p_texte, '')) as x, coalesce(p_texte, '') as brut),
  s as (
    select
      x ~ ('(maybe|perhaps|probably) i (should|will|need to|have to|might) (stop|quit|leave|give up)'
         || '|should i (stop|quit|leave|give up)|thinking (about|of) (stopping|quitting|leaving|giving up)'
         || '|not sure (if|whether) i (want|can|should|will)( to)? (continue|keep going|do this)'
         || '|i don.?t know if i (want|can)( to)? (continue|keep going)'
         || '|peut.?[eê]tre (que )?je (devrais|vais) arr[eê]ter|je ne sais pas si je (veux|peux) continuer'
         || '|vielleicht (sollte ich )?aufh[oö]ren|quiz[aá]s (deber[ií]a )?(dejarlo|parar)') as d,
      (brut ~ '^\s*(STOP|Stop|stop)\M' or x ~ '^\W*(stop|cancel|i quit)\W*$'
       or x ~ ('i.?ll pass( on)?|i (will|am going to|.?m going to) pass( on)?'
            || '|i (would like|want|wish|need|have|.?d like|am going|.?m going|decided|have decided|.?ve decided) to (stop|quit|end|leave|cancel|terminate|withdraw|resign)'
            || '|i don.?t want to (continue|work on|work for|do (this|it)|keep)|i do not want to (continue|work|keep)'
            || '|(please|kindly|could you|can you) (end|close|cancel|terminate) (the|my|this|our) (contract|collaboration|job|project)'
            || '|this (is not|isn.?t|job is not|job isn.?t|project is not|project isn.?t) for me|\mnot for me\M'
            || '|\mi quit\M|i.?m quitting|found (another|a new|a full.?time|a better|a different) (job|work|position)'
            || '|can.?t do (it|this) anymore|cannot do (it|this) anymore|no longer (want|wish|able|interested|available)'
            || '|not (going to|gonna) continue|won.?t (continue|be continuing)|end (the|our|this) collaboration'
            || '|bring (our|the|this) collaboration to an end|stop (the|our) collaboration')
       or x ~ ('je (pr[eé]f[eè]re|veux|vais|souhaite|dois) arr[eê]ter|j.?arr[eê]te\M|ne (veux|souhaite|peux) plus continuer'
            || '|mettre fin|fin (au|du|de notre) contrat|ce n.?est pas pour moi|j.?ai trouv[eé] un (autre )?(travail|job|emploi)'
            || '|je d[eé]missionne|j.?abandonne')
       or x ~ 'ich h[oö]re auf|aufh[oö]ren m[oö]chte|ich k[uü]ndige|vertrag (beenden|k[uü]ndigen)|nicht mehr weiter(machen)?|nichts f[uü]r mich'
       or x ~ 'no quiero (seguir|continuar)|quiero (dejarlo|parar|terminar)|lo dejo|renuncio|cancelar el contrato|terminar el contrato|no es para m[ií]|ya no puedo'
       or x ~ 'non voglio (pi[uù] )?continuare|voglio smettere|preferisco smettere|\msmetto\M|rinuncio|chiudere il contratto|non fa per me'
       or x ~ 'n[aã]o quero (mais )?continuar|quero parar|desisto|encerrar o contrato|n[aã]o [eé] para mim'
       or x ~ 'devam etmek istemiyorum|b[ıi]rakmak istiyorum|ik (wil )?stoppen|ik stop ermee|nie chc[eę] kontynuowa|rezygnuj|kon[cč][ií]m|nechci pokra[cč]ovat'
      ) as s_fort,
      -- Faible : seulement un message court, sans question (« cancel », « close the contract »).
      (length(x) < 140 and x !~ '\?' and x ~ '(end|close|cancel|terminate) (the|my|this) contract|\mcancel\M') as s_faible,
      x ~ ('\m(sick|ill|baby|child|kid|son|daughter|hospital|family|emergency|exams?|busy|hectic|travel|travell?ing|late|forgot'
         || '|delay|malade|krank|enferm[oa])\M') as pause,
      x ~ ('i.?ll (post|do it|continue|start|catch up|be back|get to it|send)|i will (post|continue|start|catch up|be back|do it)'
         || '|post (it |them )?(today|tonight|tomorrow)|from tomorrow|back (tomorrow|on|next)'
         || '|je (poste|posterai|vais poster|reprends)|ich poste|publicar[eé] (hoy|ma[nñ]ana)') as reprise,
      (x ~ '\?' and x ~ '(when|how long|until when|what date|quand|jusqu|wann|cu[aá]ndo|quando)'
               and x ~ '(contract|contrat|vertrag|contrato|\mend\M|finish|over|pay|paid|payment|paie|pago)') as q,
      x ~ ('don.?t understand what you want|what (do|did) you want from me|this is (ridiculous|crazy|unfair|a joke|so confusing|confusing)'
         || '|i.?m (so |very |really )?(tired of|fed up|frustrated|annoyed|upset|angry)|(very|so|really|becoming) frustrat|frustrating'
         || '|waste of (my )?time|(nobody|no one) (answers|replies|helps|responds)|lack of communication'
         || '|j.?en ai marre|ras le bol|n.?importe quoi|je ne comprends (plus|pas ce que vous)') as f
    from t
  )
  select case
    when d then 'doute'
    when (s_fort or s_faible) and reprise then 'reprise'
    when (s_fort or s_faible) and f then 'doute'
    when s_fort or s_faible then 'stop'
    when pause and reprise then 'reprise'
    when q then 'question_fin'
    when f then 'frustration'
  end
  from s;
$$;

create or replace function public.texte_pause(p_texte text)
returns boolean
language sql
immutable
as $$
  select lower(coalesce(p_texte, '')) ~ ('\m(sick|ill|baby|child|kid|son|daughter|hospital|family|emergency|exams?|busy|hectic|travel|travell?ing'
                                        || '|late|forgot|delay|malade|krank|enferm[oa]|holidays?|vacation|pause)\M');
$$;

-- La catégorie d'un message à l'arrivée : le stop vient du nouveau signal.
create or replace function public.probleme_categorie_texte(p_texte text)
returns text
language sql
immutable
as $$
  with t as (select lower(coalesce(p_texte, '')) as x, public.texte_arret_signal(p_texte) as sig)
  select case
    when sig = 'stop' then 'stop'
    when sig = 'doute' then 'stop_doute'
    when x ~ '(scam|fraud|lawyer|legal action|report (you|this)|open a dispute|dispute|complain to upwork|upwork support)' then 'menace'
    when x ~ '(whatsapp|telegram|paypal|wise\.com|outside (of )?upwork|off upwork|bank transfer|my (e-?mail|phone|number) is|gmail\.com|instagram dm)' then 'hors_plateforme'
    when x ~ '\m(pay|paid|payment|payments|milestones?|money|salary|refund|invoice|funded|funding|bonus)\M' or x ~ '\$' then 'paie'
    when sig = 'reprise' then 'absence'
    when x ~ '\m(banned|suspended|restricted|blocked|ban)\M' then 'compte_bloque'
    when x ~ '(log ?in|password|sign ?in|can.?t access|cannot access)' then 'login'
    when x ~ '\mslack\M' then 'slack'
    when x ~ '(bug|error|not working|doesn.?t work|does not work|broken|crash|nothing (shows|appears))' then 'bug_dashboard'
    when x ~ '(second account|2nd account|another account|more accounts|extra account)' then 'demande_2e_compte'
    when x ~ '\m(sick|ill|holidays?|vacation|travel(l)?ing|hospital|exams?|away|pause|busy this week)\M' then 'absence'
    when x ~ '\m(review|feedback|rating)\M' then 'avis_upwork'
    when x ~ '(no views|0 views|low views|shadow ?ban|\mviews\M)' then 'low_views'
    when x ~ '(tiktok|tik tok|warm ?up|handle|username|\maccount\M|follow)' then 'tiktok_setup'
    when sig = 'frustration' then 'plainte'
    when x ~ '\?' or x ~ '(help|how do i|how to|what should|which one|explain|don.?t understand|confused)' then 'question_bloquante'
    else 'autre'
  end
  from t;
$$;

-- Les textes proposés (en anglais, modifiables sur la carte).
create or replace function public.reponse_arret(p_prenom text, p_doute boolean)
returns text
language sql
immutable
as $$
  select case when p_doute then
    'Hi ' || coalesce(nullif(btrim(p_prenom), ''), 'there') || ', I''m sorry things were unclear. Would you like to keep working with us? '
      || 'If yes, just reply here and I''ll tell you exactly what to do next. If you''d rather stop, tell me and we''ll end the contract, no problem.'
  else
    'Hi ' || coalesce(nullif(btrim(p_prenom), ''), 'there') || ', thanks for letting us know. No problem: we''ll end the contract on our side, '
      || 'you don''t need to do anything. Thank you for your time, and good luck!'
  end;
$$;

-- Les options d'une carte « doute » : la recommandée d'abord.
create or replace function public.options_arret_doute(p_prenom text)
returns jsonb
language sql
immutable
as $$
  select public.probleme_options_valider(jsonb_build_array(
    jsonb_build_object('libelle', 'Lui répondre et garder', 'reponse', public.reponse_arret(p_prenom, true), 'action', 'garder'),
    jsonb_build_object('libelle', 'Kill samedi', 'action', 'kill')), array['garder', 'kill']);
$$;

-- À l'arrivée d'une carte : un stop reçoit sa réponse ; un doute devient une décision.
create or replace function public.problemes_arret_insertion()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_prenom text;
  v_txt text := coalesce(new.sources->0->>'texte', new.resume, '');
begin
  begin
    if new.poster_id is null or new.categorie not in ('stop', 'stop_doute') then return new; end if;
    select pr.prenom into v_prenom from public.profiles pr where pr.id = new.poster_id;
    if new.categorie = 'stop' then
      if new.proposition_reponse is null and v_txt !~* '^\W*stop\W*$' and coalesce(new.sources->0->>'type', '') in ('reponse', 'slack') then
        new.proposition_reponse := public.reponse_arret(v_prenom, false);
        new.canal_reponse := coalesce(new.canal_reponse, case when new.sources->0->>'type' = 'slack' then 'slack' else 'upwork' end);
      end if;
    elsif new.question is null then
      new.question := coalesce(v_prenom, 'Ce posteur') || ' semble vouloir arrêter, mais avec de la frustration ou un doute (« '
                      || left(v_txt, 140) || ' »). Garder ou arrêter ?';
      new.options := public.options_arret_doute(v_prenom);
      new.proposition_action := 'decision';
      new.niveau := 'urgent';
      new.niveau_force := true;
    end if;
  exception when others then
    raise warning 'problemes_arret_insertion : %', sqlerrm;
  end;
  return new;
end;
$$;
create or replace trigger problemes_arret_insertion before insert on public.problemes
  for each row execute function public.problemes_arret_insertion();

-- Changer la catégorie d'une carte ; si une carte ouverte du même posteur a déjà cette catégorie, fusion.
create or replace function public.probleme_changer_categorie(p_id uuid, p_categorie text, p_par text, p_raison text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  p public.problemes;
  v_autre uuid;
begin
  select * into p from public.problemes where id = p_id;
  if not found or p.categorie = p_categorie then return p_id; end if;
  select x.id into v_autre from public.problemes x
   where x.cle_groupe = p.cle_groupe and x.categorie = p_categorie and x.statut = 'ouvert' and x.id <> p.id limit 1;
  if v_autre is not null then
    update public.problemes k set sources = k.sources || p.sources, maj_at = now(),
           journal = k.journal || jsonb_build_object('at', now(), 'par', p_par, 'action', 'fusion', 'depuis', p.id, 'raison', p_raison)
     where k.id = v_autre;
    update public.problemes_sources s set probleme_id = v_autre where s.probleme_id = p.id;
    update public.problemes set statut = 'ferme_auto', ferme_at = now(), maj_at = now(),
           ferme_raison = 'recatégorisé ' || p_categorie || ' et fusionné dans la carte ' || left(v_autre::text, 8) || ' : ' || coalesce(p_raison, ''),
           journal = journal || jsonb_build_object('at', now(), 'par', p_par, 'action', 'categorie', 'de', p.categorie, 'vers', p_categorie,
                                                   'raison', p_raison, 'fusionne_dans', v_autre)
     where id = p.id;
    return v_autre;
  end if;
  update public.problemes
     set categorie = p_categorie, niveau = case when niveau_force then niveau else public.probleme_niveau(p_categorie) end, maj_at = now(),
         journal = journal || jsonb_build_object('at', now(), 'par', p_par, 'action', 'categorie', 'de', p.categorie, 'vers', p_categorie, 'raison', p_raison)
   where id = p.id;
  return p.id;
end;
$$;
revoke all on function public.probleme_changer_categorie(uuid, text, text, text) from public, anon, authenticated;

-- Le verdict d'une carte : le dernier message (10 jours) qui dit stop, doute ou reprise l'emporte.
create or replace function public.probleme_arret_carte(p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  p public.problemes;
  m record;
  v_sig text;
  v_txt text;
  v_at timestamptz;
  v_pause boolean := false;
  v_frus boolean := false;
  v_question boolean := false;
begin
  select * into p from public.problemes where id = p_id;
  if not found or p.poster_id is null then return null; end if;
  for m in
    select x.at, x.texte, public.texte_arret_signal(x.texte) as sig
      from (select (e->>'at')::timestamptz as at, e->>'texte' as texte
              from jsonb_array_elements(public.probleme_messages(p.poster_id, 40)) e where e->>'auteur' = 'posteur'
            union
            select (s->>'at')::timestamptz, s->>'texte' from jsonb_array_elements(p.sources) s
             where s->>'type' in ('reponse', 'slack') and s->>'texte' is not null) x
     where x.at > now() - interval '10 days'
     order by x.at
  loop
    if m.sig in ('stop', 'doute', 'reprise') then v_sig := m.sig; v_txt := m.texte; v_at := m.at; end if;
    v_pause := v_pause or public.texte_pause(m.texte);
    v_frus := v_frus or m.sig = 'frustration';
    v_question := v_question or m.sig = 'question_fin';
  end loop;
  if v_sig = 'stop' then
    return jsonb_build_object('verdict', 'stop', 'texte', left(v_txt, 300), 'at', v_at,
                              'stop_seul', v_txt ~* '^\W*stop\W*$');
  elsif v_sig = 'doute' then
    return jsonb_build_object('verdict', 'doute', 'texte', left(v_txt, 300), 'at', v_at);
  elsif v_sig is null
        and exists (select 1 from jsonb_array_elements(p.sources) s
                     where s->>'type' = 'demande_arret' and coalesce(s->>'texte', '') !~ '^Kill samedi \(Problèmes\)') then
    -- Le bouton « I want to stop » (ou STOP noté à la main) : un stop.
    return jsonb_build_object('verdict', 'stop', 'texte', null, 'stop_seul', true);
  end if;
  return jsonb_build_object('verdict', 'non',
    'categorie', case when v_pause or v_sig = 'reprise' then 'absence' when v_frus then 'plainte' else 'question_bloquante' end,
    'raison', case when v_sig = 'reprise' then 'pause ou retard avec reprise'
                   when v_pause then 'absence (pause, maladie, retard) sans demande d''arrêt'
                   when v_frus then 'plainte sans demande d''arrêt'
                   when v_question then 'question sur la fin du contrat ou la paie'
                   else 'aucun message ne demande l''arrêt' end);
end;
$$;
revoke all on function public.probleme_arret_carte(uuid) from public, anon, authenticated;

-- Relire les cartes stop ouvertes avec ces règles.
create or replace function public.problemes_arrets_reclasser(p_ids uuid[] default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v jsonb;
  v_prenom text;
  v_id uuid;
  v_res jsonb := '[]'::jsonb;
begin
  if coalesce(auth.role(), '') not in ('', 'service_role') and not public.is_admin() then
    raise exception 'problemes_arrets_reclasser : réservé à l''admin' using errcode = '42501';
  end if;
  for r in select p.* from public.problemes p
            where p.statut = 'ouvert' and p.question is null and p.poster_id is not null
              and p.categorie in ('stop', 'stop_doute') and (p_ids is null or p.id = any (p_ids))
              -- Une catégorie changée par un bot (avec sa raison) n'est pas reprise.
              and not exists (select 1 from jsonb_array_elements(case when jsonb_typeof(p.journal) = 'array' then p.journal else '[]'::jsonb end) j
                               where j->>'action' = 'categorie' and j->>'par' in ('new_cohort_bot', 'control_bot', 'pay_bot')) loop
    v := public.probleme_arret_carte(r.id);
    select pr.prenom into v_prenom from public.profiles pr where pr.id = r.poster_id;
    if v->>'verdict' = 'stop' then
      v_id := public.probleme_changer_categorie(r.id, 'stop', 'os', 'demande l''arrêt');
      update public.problemes
         set proposition_action = case when kill_samedi_lundi is null then coalesce(proposition_action, 'kill') else proposition_action end,
             proposition_reponse = case when proposition_reponse is null and not coalesce((v->>'stop_seul')::boolean, false)
                                        then public.reponse_arret(v_prenom, false) else proposition_reponse end,
             canal_reponse = coalesce(canal_reponse, 'upwork'), maj_at = now()
       where id = v_id and statut = 'ouvert';
      if r.categorie <> 'stop' then
        v_res := v_res || jsonb_build_object('probleme_id', r.id, 'prenom', v_prenom, 'avant', r.categorie, 'apres', 'stop');
      end if;
    elsif v->>'verdict' = 'doute' then
      v_id := public.probleme_changer_categorie(r.id, 'stop_doute', 'os', 'arrêt avec frustration ou doute');
      -- Un Kill samedi déjà prévu est suspendu (la demande d'arrêt reste ouverte : pas de relance).
      if r.kill_samedi_lundi is not null then
        update public.samedi_brouillons b
           set choix = 'keep', maj_at = now(),
               raison = coalesce(b.raison, '{}'::jsonb) || jsonb_build_object('annule_le', (now() at time zone 'Europe/Paris')::date, 'suspendu', 'doute')
         where b.lundi = r.kill_samedi_lundi and b.raison->>'probleme_id' = r.id::text;
      end if;
      update public.problemes
         set question = coalesce(v_prenom, 'Ce posteur') || ' semble vouloir arrêter, mais avec de la frustration (« '
                        || left(coalesce(v->>'texte', ''), 140) || ' »). Garder ou arrêter ?',
             options = public.options_arret_doute(v_prenom),
             proposition_action = 'decision', propose_par = 'os', propose_at = now(),
             niveau = 'urgent', niveau_force = true,
             kill_samedi_lundi = null, kill_samedi_at = null, kill_samedi_par = null, maj_at = now(),
             journal = journal || jsonb_build_object('at', now(), 'par', 'os', 'action', 'arret_doute',
                                                     'kill_suspendu', r.kill_samedi_lundi is not null)
       where id = v_id and statut = 'ouvert';
      v_res := v_res || jsonb_build_object('probleme_id', r.id, 'prenom', v_prenom, 'avant', r.categorie, 'apres', 'decision (doute)',
                                           'kill_suspendu', r.kill_samedi_lundi is not null);
    elsif v->>'verdict' = 'non' then
      v_id := public.probleme_changer_categorie(r.id, v->>'categorie', 'os', v->>'raison');
      update public.problemes
         set proposition_action = case when proposition_action = 'kill' and kill_samedi_lundi is null then null else proposition_action end,
             niveau_force = false,
             diagnostic = 'Pas une demande d''arrêt : ' || (v->>'raison') || '.', diagnostic_par = 'os', maj_at = now()
       where id = v_id and statut = 'ouvert';
      v_res := v_res || jsonb_build_object('probleme_id', r.id, 'prenom', v_prenom, 'avant', r.categorie, 'apres', v->>'categorie', 'raison', v->>'raison');
    end if;
  end loop;
  return v_res;
end;
$$;
revoke all on function public.problemes_arrets_reclasser(uuid[]) from public, anon;
grant execute on function public.problemes_arrets_reclasser(uuid[]) to authenticated;

-- Niveau : stop_doute est urgent.
do $p$
declare
  v_def text := pg_get_functiondef('public.probleme_niveau(text)'::regprocedure);
  v_a text := $q$when p_categorie in ('stop', 'paie',$q$;
begin
  if position(v_a in v_def) = 0 then raise exception '0533 : probleme_niveau ne correspond pas'; end if;
  execute replace(v_def, v_a, $q$when p_categorie in ('stop', 'stop_doute', 'paie',$q$);
end;
$p$;

-- Kill samedi d'une carte « doute » : comme un stop (relances et posts coupés).
do $p$
declare
  v_def text := pg_get_functiondef('public.probleme_kill_samedi(uuid,boolean)'::regprocedure);
  v_a text := $q$v_stop := p.categorie = 'stop' or$q$;
begin
  if position(v_a in v_def) = 0 then raise exception '0533 : probleme_kill_samedi ne correspond pas'; end if;
  execute replace(v_def, v_a, $q$v_stop := p.categorie in ('stop', 'stop_doute') or$q$);
end;
$p$;

-- Décider une carte doute : « Kill samedi » prépare le kill ; « garder » classe la demande d'arrêt.
do $p$
declare
  v_def text := pg_get_functiondef('public.probleme_decider(uuid,integer,boolean)'::regprocedure);
  v_a text := $q$  v_samedi := (v_opt->>'action') = 'saturday';$q$;
begin
  if position(v_a in v_def) = 0 then raise exception '0533 : probleme_decider ne correspond pas'; end if;
  execute replace(v_def, v_a, $q$  -- 0533 : arrêt — Kill samedi, ou garder (la demande d'arrêt est classée, un Kill prévu est annulé).
  if v_opt->>'action' = 'kill' and p.poster_id is not null and p.kill_samedi_lundi is null then
    perform public.probleme_kill_samedi(p_id);
  elsif v_opt->>'action' = 'garder' and p.poster_id is not null then
    if p.kill_samedi_lundi is not null then perform public.probleme_kill_samedi(p_id, true); end if;
    update public.demandes_arret set decision = 'garder', decide_at = now(), decide_par = auth.uid()
     where poster_id = p.poster_id and decision is null;
  end if;
$q$ || v_a);
end;
$p$;

-- Bots : changer la catégorie (avec une raison) ; stop_doute et plainte acceptées.
do $p$
declare
  v_def text := pg_get_functiondef('public.probleme_bot(text,text,jsonb)'::regprocedure);
  v_a1 text := $q$'pas_poste_aujourdhui', 'bloque_etape', 'hm', 'offre'];$q$;
  v_a2 text := $q$      perform public.probleme_mark_read_verifier((select x.poster_id from public.problemes x where x.id = v_id), v_action);$q$;
  v_a3 text := $q$if coalesce(btrim(p_args->>'reponse'), '') = '' and v_action is null and v_diag is null and v_question is null then$q$;
begin
  if position(v_a1 in v_def) = 0 or position(v_a2 in v_def) = 0 or position(v_a3 in v_def) = 0 then
    raise exception '0533 : probleme_bot ne correspond pas';
  end if;
  v_def := replace(v_def, v_a3, $q$if coalesce(btrim(p_args->>'reponse'), '') = '' and v_action is null and v_diag is null and v_question is null
         and nullif(p_args->>'categorie', '') is null then$q$);
  v_def := replace(v_def, v_a1, $q$'pas_poste_aujourdhui', 'bloque_etape', 'hm', 'offre', 'stop_doute', 'plainte'];$q$);
  v_def := replace(v_def, v_a2, v_a2 || $q$
      -- 0533 : le bot peut changer la catégorie (stop ↔ autre…), avec une raison.
      if nullif(p_args->>'categorie', '') is not null then
        if not ((p_args->>'categorie') = any (v_categories)) then
          raise exception 'catégorie inconnue ; valeurs acceptées : %', array_to_string(v_categories, ', ');
        end if;
        if coalesce(btrim(p_args->>'raison_categorie'), '') = '' then
          raise exception 'changer la catégorie : « raison_categorie » obligatoire';
        end if;
        v_id := public.probleme_changer_categorie(v_id, p_args->>'categorie', p_bot, left(p_args->>'raison_categorie', 300));
      end if;$q$);
  execute v_def;
end;
$p$;

-- À chaque passage : les cartes stop relues.
do $p$
declare
  v_def text := pg_get_functiondef('public.problemes_actualiser()'::regprocedure);
  v_a text := $q$'diagnostics', public.problemes_diagnostiquer());$q$;
begin
  if position(v_a in v_def) = 0 then raise exception '0533 : problemes_actualiser ne correspond pas'; end if;
  execute replace(v_def, v_a, $q$'diagnostics', public.problemes_diagnostiquer(), 'arrets', public.problemes_arrets_reclasser());$q$);
end;
$p$;

notify pgrst, 'reload schema';
