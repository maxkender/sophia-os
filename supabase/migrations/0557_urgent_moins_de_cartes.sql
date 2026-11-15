-- 0557 : moins de cartes en Urgent (7/11).
--   1. Toute carte qui demande une décision (question ou options) va dans Weekly decisions, jamais en Urgent.
--   2. 2e compte : seule la décision « Doubler » du samedi l'accorde. Réponse officielle + règle des bots ;
--      un 2e contrat VIk ouvert par une HM sans Doubler → carte samedi [Doubler] [Fermer le 2e contrat].
--   3. Cohérence règle 7 : rien du samedi au lundi midi (la paie du lundi crée les jalons).
-- Additif : fonctions remplacées, une réponse officielle, une règle de bot, un cron.

-- 1. L'onglet : une décision en attente → Weekly decisions (« samedi »), avant les autres règles.
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
    -- 0557 : une décision en attente (question ou options) : Weekly decisions, jamais Urgent.
    when p.decision_choisie is null
     and (p.question is not null or (jsonb_typeof(p.options) = 'array' and jsonb_array_length(p.options) > 0))
      then 'samedi'
    -- Le quotidien à risque, ou une HM : ⚡ pour Max.
    when coalesce(p.sujet, 'posteur') = 'hm'
      or exists (select 1 from cats where c in ('menace', 'hors_plateforme', 'suspect', 'upwork_mauvais_compte', 'contrat_hm'))
      then 'urgent'
    -- 0542 : « urgent » forcé (Max, un bot, le bot FAQ) : ⚡, même avec un sujet de décision.
    when p.niveau_force and p.niveau = 'urgent' then 'urgent'
    -- Une décision : Weekly decisions (« samedi » = l'onglet des décisions).
    when public.probleme_rituel(p) is not null then 'samedi'
    -- Un bot pas sûr : ⚡.
    when coalesce(p.confiance, 1) < 0.8 then 'urgent'
    else 'bots'
  end;
$$;

-- 1 bis. Le rituel : une carte 2e contrat se décide le samedi ; une décision sans rituel reconnu : « maintenant ».
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
    -- 0557 : 2e contrat ouvert par une HM : le samedi (Doubler ou fermer).
    when p.categorie = 'deuxieme_contrat' then 'samedi'
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
    -- 0557 : des options sans rituel reconnu : à décider maintenant.
    when p.decision_choisie is null and jsonb_typeof(p.options) = 'array' and jsonb_array_length(p.options) > 0 then 'maintenant'
  end;
$$;

-- 2. La réponse officielle et la règle des bots (une seule fois).
insert into public.reponses_officielles (question, reponse, ordre, actif, valide_at)
select 'Can I get a second / extra account?', 'Extra accounts are reviewed every week based on consistency and results.', 20, true, now()
 where not exists (select 1 from public.reponses_officielles where reponse = 'Extra accounts are reviewed every week based on consistency and results.');

insert into public.regles_bots (bot, regle, exemple, active)
select 'tous',
       'Un 2e compte (ou un 2e contrat) n''est accordé QUE par la décision « Doubler » du samedi. Ne le promets jamais, ne dis jamais oui ni non : '
       || 'réponds mot pour mot « Extra accounts are reviewed every week based on consistency and results. » et range la demande dans le samedi (demande_2e_compte).',
       'Can I manage a second account? → Extra accounts are reviewed every week based on consistency and results.', true
 where not exists (select 1 from public.regles_bots where regle like 'Un 2e compte (ou un 2e contrat) n''est accordé QUE%');

-- 2 bis. Les 2e contrats VIk ouverts sans Doubler : une carte samedi par contrat.
create or replace function public.deuxieme_contrat_detecter()
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
    with vik as (
      select uc.* from public.upwork_contrats uc
       where uc.organisation_id = '2074065383597823773' and uc.actif and uc.etat = 'Active' and uc.freelancer_id is not null
         and not exists (select 1 from public.recrutement_hms h where h.upwork_freelancer_id = uc.freelancer_id)),
    rangs as (
      select v.*, row_number() over (partition by v.freelancer_id order by v.debut_at nulls last, v.contrat_id) as rang,
             first_value(v.contrat_id) over (partition by v.freelancer_id order by v.debut_at nulls last, v.contrat_id) as premier
        from vik v)
    select r2.contrat_id, r2.premier, r2.titre, r2.debut_at, r2.freelancer_nom,
           (select pr.id from public.profiles pr where pr.upwork_contract_id = r2.premier and pr.is_active limit 1) as poster_id,
           (select concat_ws(' ', pr.prenom, pr.nom) from public.profiles pr where pr.upwork_contract_id = r2.premier and pr.is_active limit 1) as nom
      from rangs r2
     where r2.rang >= 2
       and r2.debut_at > now() - interval '30 days'
  loop
    if r.poster_id is null then continue; end if;
    -- Une décision Doubler (samedi) prise depuis 14 jours avant le contrat : rien à demander.
    if exists (select 1 from public.samedi_brouillons sb join public.comptes c on c.id = sb.compte_id
                where c.poster_id = r.poster_id and sb.choix = 'double' and sb.maj_at > coalesce(r.debut_at, now()) - interval '14 days') then
      continue;
    end if;
    if exists (select 1 from public.problemes p where p.cle_groupe = 'deuxieme_contrat:' || r.contrat_id) then continue; end if;
    insert into public.problemes (cle_groupe, categorie, niveau, niveau_force, resume, proprietaire, sujet, destinataire,
                                  poster_id, contrat_id, question, options, diagnostic, diagnostic_par, journal)
    values ('deuxieme_contrat:' || r.contrat_id, 'deuxieme_contrat', 'samedi', true,
            '2e contrat sans Doubler · ' || coalesce(r.nom, r.freelancer_nom, '?') || ' · contrat ' || r.contrat_id,
            'control_bot', 'posteur', 'posteur', r.poster_id, r.contrat_id,
            '2e contrat ouvert par une HM sans décision Doubler : Doubler ou fermer le 2e contrat ?',
            jsonb_build_array(
              jsonb_build_object('libelle', 'Doubler', 'action', 'double'),
              jsonb_build_object('libelle', 'Fermer le 2e contrat', 'action', 'fermer_2e_contrat', 'contrat_id', r.contrat_id)),
            coalesce(r.nom, r.freelancer_nom, '?') || ' a déjà le contrat ' || r.premier || '. Une HM a ouvert le contrat ' || r.contrat_id
              || ' (« ' || coalesce(r.titre, '?') || ' », ' || coalesce(to_char(r.debut_at at time zone 'Europe/Paris', 'DD/MM'), '?')
              || ') sans décision Doubler. Un 2e compte n''est accordé que par Doubler le samedi.',
            'os',
            jsonb_build_array(jsonb_build_object('at', now(), 'action', 'deuxieme_contrat_detecte', 'premier', r.premier)));
    n := n + 1;
  end loop;
  return n;
end;
$$;
revoke execute on function public.deuxieme_contrat_detecter() from public, anon, authenticated;

-- 2 ter. Le clic : Doubler → la ligne Doubler du samedi ; Fermer → la fonction upwork ferme ce contrat (rien d'autre).
create or replace function public.deuxieme_contrat_decision()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_compte uuid;
  v_lundi date;
begin
  if new.categorie <> 'deuxieme_contrat' or new.decision_choisie is null
     or old.decision_choisie is not distinct from new.decision_choisie then
    return new;
  end if;
  if new.decision_choisie = 0 then
    select c.id into v_compte from public.comptes c
     where c.poster_id = new.poster_id and c.is_active and coalesce(c.type_compte, 'perso') = 'perso'
     order by c.created_at limit 1;
    if v_compte is not null then
      v_lundi := public.lundi_du_prochain_samedi((now() at time zone 'Europe/Paris')::date);
      insert into public.samedi_brouillons (lundi, compte_id, choix, raison, par, maj_at)
      values (v_lundi, v_compte, 'double',
              jsonb_build_object('source', 'problemes', 'probleme_id', new.id, 'deuxieme_contrat', new.contrat_id,
                                 'note', 'Doubler : 2e contrat ' || new.contrat_id || ' gardé'),
              auth.uid(), now())
      on conflict (lundi, compte_id) do update
        set choix = 'double', par = excluded.par, maj_at = now(),
            raison = (coalesce(samedi_brouillons.raison, '{}'::jsonb) || excluded.raison) - 'annule_le';
    end if;
  elsif new.decision_choisie = 1 and new.contrat_id is not null then
    perform net.http_post(
      url := 'https://mbikecieskoobeizixig.supabase.co/functions/v1/upwork',
      headers := jsonb_build_object('content-type', 'application/json', 'x-cron-secret', public.cron_secret_lire()),
      body := jsonb_build_object('action', 'deuxieme_contrat_fermer', 'id', new.id),
      timeout_milliseconds := 120000);
  end if;
  return new;
end;
$$;

create or replace trigger problemes_deuxieme_contrat
  after update of decision_choisie on public.problemes
  for each row execute function public.deuxieme_contrat_decision();

-- Toutes les heures (:52), et une fois tout de suite.
do $c$
begin
  if not exists (select 1 from cron.job where jobname = 'deuxieme-contrat') then
    perform cron.schedule('deuxieme-contrat', '52 * * * *', 'select public.deuxieme_contrat_detecter()');
  end if;
end
$c$;
select public.deuxieme_contrat_detecter();

-- 4. Offres HM incomplètes corrigées par l'OS (fonction upwork, action offres_completer) : un passage par contrat.
create table if not exists public.offres_completions (
  contrat_id text primary key,
  at         timestamptz not null default now(),
  statut     text not null check (statut in ('fait', 'erreur', 'refus')),
  actions    jsonb not null default '[]'::jsonb,
  erreur     text
);
alter table public.offres_completions enable row level security;
revoke all on public.offres_completions from anon, authenticated;
do $p$
begin
  if not exists (select 1 from pg_policies where tablename = 'offres_completions' and policyname = 'offres_completions_admin') then
    create policy offres_completions_admin on public.offres_completions for select to authenticated using (public.is_admin());
  end if;
  if not exists (select 1 from cron.job where jobname = 'offres-completer') then
    perform cron.schedule('offres-completer', '17 * * * *', $c$
      select net.http_post(
        url := 'https://mbikecieskoobeizixig.supabase.co/functions/v1/upwork',
        headers := jsonb_build_object('content-type', 'application/json', 'x-cron-secret', public.cron_secret_lire()),
        body := jsonb_build_object('action', 'offres_completer'),
        timeout_milliseconds := 280000);
    $c$);
  end if;
end
$p$;

-- 3. Cohérence : la règle 7 attend la paie (samedi → lundi midi). La fonction de 0555 est reprise telle quelle,
--    avec la règle 7 entourée d'une garde (même méthode que 0531).
do $m$
declare
  v_def text := pg_get_functiondef('public.coherence_violations()'::regprocedure);
  -- Repères dans le code (les commentaires ne sont pas gardés en base) : le début et la fin de la règle 7.
  v_avant text := E'  return query\n  with t as (select now() at time zone ''Europe/Paris'' m)';
  v_apres text := '<>''NotFunded''));';
begin
  if position('0557 : la règle 7' in v_def) > 0 or position('time ''12:00'')) then' in v_def) > 0 then return; end if;
  if position(v_avant in v_def) = 0 or position(v_apres in v_def) = 0 then
    raise exception '0557 : règle 7 introuvable dans coherence_violations';
  end if;
  v_def := replace(v_def, v_avant,
    E'  -- 0557 : la règle 7 attend la paie : rien du samedi au lundi midi (Paris).\n'
    || E'  if not (extract(isodow from now() at time zone ''Europe/Paris'') in (6, 7)\n'
    || E'          or (extract(isodow from now() at time zone ''Europe/Paris'') = 1 and (now() at time zone ''Europe/Paris'')::time < time ''12:00'')) then\n'
    || v_avant);
  v_def := replace(v_def, v_apres, v_apres || E'\n  end if;');
  execute v_def;
end
$m$;
