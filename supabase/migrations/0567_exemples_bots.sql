-- 0567 : entraînement des bots (partie B du prompt « Entraînement des bots + STOP clair »).
--
-- 1. exemples_bots : situation, message du posteur, bonne décision (étiquette
--    courte), bonne réponse, pourquoi, source.
-- 2. Chaque correction de Max crée un exemple, une seule fois :
--      - Modifier (réponse ou action d'un bot changée)        → « modifier » ;
--      - Ignorer une carte proposée par un bot               → « ignorer » ;
--      - autre choix qu'une option recommandée               → « autre_choix » ;
--      - annulation d'une action faite par un bot            → « annulation » ;
--      - décision Weekly différente de la proposition        → « weekly ».
--    Les corrections déjà faites sont reprises (rattrapage).
-- 3. Les exemples de départ STOP / pas STOP / doute (règles de 0533).
-- 4. « lire » (bot_propositions) renvoie aux bots les 30 exemples les plus
--    proches (même catégorie, même bot, mots en commun) à côté des regles_bots.
-- 5. bots_banc : les passages du banc d'essai (fonction bots-banc), un score
--    sur 30 cas réels ; relancé après chaque changement de consigne
--    (regles_bots), au plus une fois toutes les 10 minutes.
--
-- Additif : 2 tables, des fonctions, 3 déclencheurs ; probleme_bot_lire patchée.

create table if not exists public.exemples_bots (
  id              uuid primary key default gen_random_uuid(),
  cle             text not null unique,
  bot             text check (bot in ('new_cohort_bot', 'control_bot', 'pay_bot')),
  categorie       text,
  situation       text not null,
  message_posteur text,
  bonne_decision  text not null,
  bonne_reponse   text,
  pourquoi        text,
  source          text not null check (source in ('depart', 'modifier', 'ignorer', 'autre_choix', 'annulation', 'weekly', 'manuel')),
  probleme_id     uuid,
  proposition_id  uuid,
  actif           boolean not null default true,
  cree_par        uuid,
  cree_at         timestamptz not null default now()
);
create index if not exists exemples_bots_cat on public.exemples_bots (categorie, cree_at desc);
alter table public.exemples_bots enable row level security;

create table if not exists public.bots_banc (
  id           uuid primary key default gen_random_uuid(),
  lance_at     timestamptz not null default now(),
  declencheur  text not null,
  statut       text not null default 'en_cours' check (statut in ('en_cours', 'fait', 'erreur')),
  n            integer,
  justes       integer,
  score        numeric,
  details      jsonb not null default '[]'::jsonb,
  erreur       text,
  fini_at      timestamptz
);
alter table public.bots_banc enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'exemples_bots' and policyname = 'exemples_bots_admin') then
    create policy exemples_bots_admin on public.exemples_bots for select to authenticated using (public.is_admin());
  end if;
  if not exists (select 1 from pg_policies where tablename = 'bots_banc' and policyname = 'bots_banc_admin') then
    create policy bots_banc_admin on public.bots_banc for select to authenticated using (public.is_admin());
  end if;
end $$;

/** Le dernier message du posteur (celui qui attend une réponse, sinon le résumé de la carte). */
create or replace function public.exemple_message(p_poster uuid, p_defaut text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select left(coalesce(case when p_poster is not null then public.probleme_posteur_attend(p_poster)->>'texte' end, p_defaut), 1000);
$$;

/** Un exemple tiré d'une entrée du journal d'une carte (null si ce n'est pas une correction de Max). */
create or replace function public.exemple_depuis_journal(p public.problemes, e jsonb, p_avant_reponse text, p_avant_action text, p_avant_par text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bots text[] := array['new_cohort_bot', 'control_bot', 'pay_bot'];
  v_source text;
  v_decision text;
  v_reponse text;
  v_pourquoi text;
  v_bot text := case when p_avant_par = any (v_bots) then p_avant_par end;
begin
  if e->>'action' = 'modifier' and v_bot is not null
     and (p.proposition_reponse is distinct from p_avant_reponse or p.proposition_action is distinct from p_avant_action) then
    v_source := 'modifier';
    v_decision := coalesce(p.proposition_action, 'reponse');
    v_reponse := p.proposition_reponse;
    v_pourquoi := 'Max a corrigé la proposition du bot'
                  || case when p_avant_reponse is distinct from '__ancienne__' then coalesce(' (avant : ' || left(p_avant_reponse, 200) || ')', '') else '' end;
  elsif e->>'action' = 'ignorer' and v_bot is not null then
    v_source := 'ignorer';
    v_decision := 'ignorer';
    v_pourquoi := 'Max a ignoré la carte : pas un problème';
  elsif e->>'action' = 'decision' and coalesce((e->>'index')::int, 0) > 0 then
    v_source := 'autre_choix';
    v_bot := coalesce(v_bot, case when p.propose_par = any (v_bots) then p.propose_par end);
    v_decision := coalesce(e->>'libelle', 'autre choix');
    v_reponse := p.proposition_reponse;
    v_pourquoi := 'Max a choisi « ' || coalesce(e->>'libelle', '?') || ' » au lieu de « '
                  || coalesce(e->'options'->0->>'libelle', 'l''option recommandée') || ' »';
  elsif e->>'action' = 'bot_annule' then
    v_source := 'annulation';
    v_bot := coalesce(v_bot, case when p.propose_par = any (v_bots) then p.propose_par end);
    v_decision := 'ne_pas_' || coalesce(e->>'quoi', 'agir');
    v_pourquoi := 'Max a annulé l''action du bot (' || coalesce(e->>'quoi', '?') || ')';
  else
    return;
  end if;
  insert into public.exemples_bots (cle, bot, categorie, situation, message_posteur, bonne_decision, bonne_reponse, pourquoi, source, probleme_id, cree_par)
  values (v_source || ':' || p.id || ':' || coalesce(e->>'at', now()::text), v_bot, p.categorie,
          left(p.categorie || ' · ' || coalesce(p.resume, ''), 400),
          public.exemple_message(p.poster_id, p.resume),
          left(v_decision, 200), left(v_reponse, 2000), left(v_pourquoi, 400), v_source, p.id,
          case when (e->>'par') ~ '^[0-9a-f-]{36}$' then (e->>'par')::uuid end)
  on conflict (cle) do nothing;
end;
$$;

revoke execute on function public.exemple_depuis_journal(public.problemes, jsonb, text, text, text) from public, anon, authenticated;

/** Déclencheur : une nouvelle entrée du journal d'une carte. */
create or replace function public.exemples_bots_carte()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  n_avant int := coalesce(jsonb_array_length(old.journal), 0);
  n_apres int := coalesce(jsonb_array_length(new.journal), 0);
  i int;
begin
  if n_apres <= n_avant then return new; end if;
  for i in n_avant .. n_apres - 1 loop
    perform public.exemple_depuis_journal(new, new.journal->i, old.proposition_reponse, old.proposition_action, old.propose_par);
  end loop;
  return new;
exception when others then
  return new; -- un exemple raté ne bloque jamais la carte
end;
$$;

create or replace trigger exemples_bots_carte
  after update of journal on public.problemes
  for each row execute function public.exemples_bots_carte();

/** Déclencheur : une décision Weekly différente de la proposition. */
create or replace function public.exemples_bots_weekly()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.decision is not null and new.decision is distinct from old.decision
     and new.action is not null and new.decision <> new.action then
    insert into public.exemples_bots (cle, bot, categorie, situation, message_posteur, bonne_decision, pourquoi, source, proposition_id, cree_par)
    values ('weekly:' || new.id || ':' || new.decision, null, 'weekly_' || new.type,
            left(format('Weekly %s du %s : %s proposé', new.type, to_char(new.jour, 'DD/MM'), new.action)
                 || coalesce(' · ' || nullif(new.regle, ''), ''), 400),
            null, new.decision,
            left(coalesce(nullif(btrim(new.note), ''), 'Max a décidé « ' || new.decision || ' » au lieu de « ' || new.action || ' »'), 400),
            'weekly', new.id, new.decision_par)
    on conflict (cle) do nothing;
  end if;
  return new;
exception when others then
  return new;
end;
$$;

create or replace trigger exemples_bots_weekly
  after update of decision on public.ckd_propositions
  for each row execute function public.exemples_bots_weekly();

-- Rattrapage : les corrections déjà faites.
do $$
declare
  p public.problemes;
  i int;
  e jsonb;
  v_avant_par text;
begin
  for p in select * from public.problemes where journal is not null and jsonb_array_length(journal) > 0 loop
    v_avant_par := null;
    for i in 0 .. jsonb_array_length(p.journal) - 1 loop
      e := p.journal->i;
      if e->>'action' = 'proposer' then v_avant_par := e->>'par'; end if;
      if e->>'action' in ('modifier', 'ignorer', 'decision', 'bot_annule') then
        -- Modifier : on ne connaît plus l'ancienne réponse ; l'exemple garde la réponse finale.
        perform public.exemple_depuis_journal(p, e, case when e->>'action' = 'modifier' then '__ancienne__' end, null,
                                              coalesce(v_avant_par, p.propose_par));
      end if;
    end loop;
  end loop;
end $$;

insert into public.exemples_bots (cle, bot, categorie, situation, message_posteur, bonne_decision, pourquoi, source, proposition_id, cree_par)
select 'weekly:' || o.id || ':' || o.decision, null, 'weekly_' || o.type,
       left(format('Weekly %s du %s : %s proposé', o.type, to_char(o.jour, 'DD/MM'), o.action) || coalesce(' · ' || nullif(o.regle, ''), ''), 400),
       null, o.decision,
       left(coalesce(nullif(btrim(o.note), ''), 'Max a décidé « ' || o.decision || ' » au lieu de « ' || o.action || ' »'), 400),
       'weekly', o.id, o.decision_par
  from public.ckd_propositions o
 where o.decision is not null and o.action is not null and o.decision <> o.action
   and o.jour > current_date - 45
on conflict (cle) do nothing;

-- Les exemples de départ : STOP / pas STOP / doute (0533).
insert into public.exemples_bots (cle, bot, categorie, situation, message_posteur, bonne_decision, bonne_reponse, pourquoi, source) values
  ('depart:stop:1', null, 'stop', 'Message d''un seul mot', 'STOP', 'kill_samedi', null,
   'Demande d''arrêt claire. Kill samedi proposé ; aucune réponse quand le message est juste « STOP ».', 'depart'),
  ('depart:stop:2', null, 'stop', 'Le posteur abandonne le projet', 'I''ll pass on this project, thanks for the opportunity.', 'kill_samedi',
   'Thank you for letting us know, and thanks for your time with us. We''ll close the contract on our side. All the best!',
   'Il ne veut plus continuer : stop sûr. Réponse courte et gentille, Kill samedi.', 'depart'),
  ('depart:stop:3', null, 'stop', 'Le posteur demande la fin du contrat', 'Please end the contract.', 'kill_samedi',
   'Sure, thanks for your work with us. We''ll close the contract on our side. Take care!', 'Demande explicite de fin de contrat : stop sûr.', 'depart'),
  ('depart:stop:4', null, 'stop', 'Le posteur arrête', 'I quit.', 'kill_samedi',
   'Understood, thank you for your time with us. We''ll close the contract. All the best!', 'Stop sûr.', 'depart'),
  ('depart:stop:5', null, 'stop', 'Arrêt en français', 'Je préfère arrêter, merci.', 'kill_samedi',
   'Thank you for letting us know and for your time with us. We''ll close the contract on our side. All the best!', 'Stop sûr, toutes langues.', 'depart'),
  ('depart:stop:6', null, 'stop', 'Arrêt en allemand', 'Ich höre auf.', 'kill_samedi',
   'Thank you for letting us know and for your time with us. We''ll close the contract on our side. All the best!', 'Stop sûr, toutes langues.', 'depart'),
  ('depart:stop:7', null, 'stop', 'Arrêt en espagnol', 'No quiero seguir.', 'kill_samedi',
   'Thank you for letting us know and for your time with us. We''ll close the contract on our side. All the best!', 'Stop sûr, toutes langues.', 'depart'),
  ('depart:stop:8', null, 'stop', 'Le posteur a trouvé un autre travail', 'I found another job, I can''t continue.', 'kill_samedi',
   'Congrats on the new job, and thanks for your time with us! We''ll close the contract on our side.', 'Il ne peut plus continuer : stop sûr.', 'depart'),
  ('depart:doute:1', null, 'stop_doute', 'Le posteur hésite', 'Maybe I should stop?', 'decision_doute',
   'Thanks for telling us. Do you want to continue? If something is blocking you, tell us and we''ll help.',
   'Ce n''est pas une demande ferme : carte décision [Lui répondre et garder (recommandé)] [Kill samedi], réponse qui demande s''il veut continuer.', 'depart'),
  ('depart:doute:2', null, 'stop_doute', 'Arrêt mêlé de forte frustration', 'This is too much, nobody answers me, I don''t know if I want to continue.', 'decision_doute',
   'Sorry about that, we''re here now. What is blocking you? Do you want to continue? We''ll help you sort it out.',
   'Frustration forte avec un arrêt possible : doute. On répond et on demande, on ne tue pas.', 'depart'),
  ('depart:passtop:1', null, 'absence', 'Pause avec reprise', 'My baby was sick, I''ll post today.', 'repondre_garder',
   'No worries, I hope your baby feels better! Thanks for letting us know.', 'Une pause avec reprise n''est pas un stop : on garde.', 'depart'),
  ('depart:passtop:2', null, 'question_bloquante', 'Question sur la fin du contrat ou la paie', 'When does the contract end? Will I be paid for last week?', 'repondre_garder',
   null, 'Une question sur la fin ou la paie n''est pas un stop : on répond à la question.', 'depart'),
  ('depart:passtop:3', null, 'plainte', 'Plainte sans demande d''arrêt', 'The app is so slow today, it''s really annoying.', 'repondre_garder',
   'Sorry about that! Thanks for telling us, we''re looking into it.', 'Une plainte sans demande d''arrêt n''est pas un stop.', 'depart')
on conflict (cle) do nothing;

/** Les 30 exemples les plus proches pour un bot (ou pour une carte). */
create or replace function public.exemples_bots_proches(p_bot text, p_probleme uuid default null, p_limite int default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_cats text[];
  v_mots text[];
begin
  select array_agg(distinct o.categorie),
         array_agg(distinct w) filter (where length(w) >= 4)
    into v_cats, v_mots
    from public.problemes o
    left join lateral regexp_split_to_table(
           lower(extensions.unaccent(coalesce(o.resume, '') || ' ' || coalesce(public.probleme_posteur_attend(o.poster_id)->>'texte', ''))),
           '[^a-z0-9]+') w on true
   where o.statut = 'ouvert'
     and (case when p_probleme is not null then o.id = p_probleme else o.proprietaire = p_bot end);
  return coalesce((
    select jsonb_agg(jsonb_build_object('situation', x.situation, 'message_posteur', x.message_posteur,
                                        'bonne_decision', x.bonne_decision, 'bonne_reponse', x.bonne_reponse,
                                        'pourquoi', x.pourquoi, 'source', x.source, 'categorie', x.categorie)
                     order by x.score desc, x.cree_at desc)
      from (
        select e.*,
               (case when e.categorie = any (coalesce(v_cats, '{}')) then 3 else 0 end)
             + (case when e.bot = p_bot then 2 when e.bot is null then 1 else 0 end)
             + (case when e.source <> 'depart' then 1 else 0 end)
             + least(5, (select count(*) from regexp_split_to_table(lower(extensions.unaccent(coalesce(e.message_posteur, '') || ' ' || e.situation)), '[^a-z0-9]+') m
                          where length(m) >= 4 and m = any (coalesce(v_mots, '{}')))) as score
          from public.exemples_bots e
         where e.actif
         order by score desc, e.cree_at desc
         limit p_limite
      ) x), '[]'::jsonb);
end;
$$;

revoke execute on function public.exemples_bots_proches(text, uuid, int) from public, anon, authenticated;

-- « lire » : les exemples les plus proches à côté des règles.
do $$
declare
  d text := pg_get_functiondef('public.probleme_bot_lire(text, uuid)'::regprocedure);
  avant constant text := '''bot'', p_bot,';
  apres constant text := '''bot'', p_bot, ''exemples'', public.exemples_bots_proches(p_bot, p_probleme, 30),';
begin
  if position('exemples_bots_proches' in d) > 0 then return; end if;
  if position(avant in d) = 0 then raise exception '0567 : probleme_bot_lire a changé'; end if;
  execute replace(d, avant, apres);
end $$;

-- Le banc d'essai relancé après chaque changement de consigne (au plus toutes les 10 min).
create or replace function public.bots_banc_relancer()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (select 1 from public.bots_banc where lance_at > now() - interval '10 minutes') then
    return null;
  end if;
  perform net.http_post(
    url := 'https://mbikecieskoobeizixig.supabase.co/functions/v1/bots-banc',
    headers := jsonb_build_object('content-type', 'application/json', 'x-cron-secret', public.cron_secret_lire()),
    body := jsonb_build_object('action', 'lancer', 'declencheur', 'consigne'),
    timeout_milliseconds := 150000);
  return null;
exception when others then
  return null;
end;
$$;

create or replace trigger bots_banc_consigne
  after insert or update or delete on public.regles_bots
  for each statement execute function public.bots_banc_relancer();

/** La page : les derniers passages du banc d'essai et le nombre d'exemples. */
create or replace function public.bots_banc_lire()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'réservé à l''admin et au Head of Ops';
  end if;
  return jsonb_build_object(
    'passages', coalesce((select jsonb_agg(to_jsonb(b) order by b.lance_at desc) from (select * from public.bots_banc order by lance_at desc limit 10) b), '[]'::jsonb),
    'exemples', (select jsonb_object_agg(source, n) from (select source, count(*) n from public.exemples_bots where actif group by 1) x));
end;
$$;

revoke execute on function public.bots_banc_lire() from public, anon;
grant execute on function public.bots_banc_lire() to authenticated;
