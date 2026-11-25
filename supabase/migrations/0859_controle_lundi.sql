-- 0859 : le contrôle du dimanche 20 h (Max, 25/11) : « tout posteur avec un start_monday le lendemain doit avoir ses
-- posts du lundi prévus (comptes Atala compris). Sinon alerte à Max. » Et, pour Join : « le reste va dans
-- Control > Recrutement pour Max ». Additif : deux tables à nous, des fonctions neuves, deux crons, et un bloc inséré
-- dans la version LIVE de aujourdhui_lire() (jamais remplacée par une copie du dépôt).
--
-- QUAND LES POSTS DU LUNDI SONT CRÉÉS (vérifié avant d'écrire la règle). Les posts d'un jour naissent CE jour-là, à
-- minuit (heure de Paris) : le cron « minuit-vnext » ne part que si l'heure de Paris est 0 (le drain finit vers 1 h 30),
-- et « minuit-vnext-rattrapage » repasse à 4 h UTC. Le plan BLEO du lundi est tiré le dimanche à 14 h, mais il ne
-- couvre pas tout le monde (cohorte du 16/11 : 50 comptes servis lundi sans créneau au plan). Preuve : le dimanche
-- 15/11 et le dimanche 22/11 à 20 h, AUCUN compte des cohortes du 16/11 (135 comptes actifs) et du 23/11 (62) n'avait
-- un post du lundi ; le lundi soir, 130/135 et 35/62 en avaient. Un contrôle « posts existants » à 20 h crierait donc
-- au loup chaque dimanche.
--
-- LA RÈGLE.
--   Qui : chaque compte actif d'un posteur actif (rôle poster) dont la cohorte (profiles.cohorte_lundi, le start
--   Monday qui suit les reports, pas ruul_candidatures.start_monday ni hub_posteurs.debut_le restés à la date d'origine)
--   est le lundi L, plus les comptes dont le lundi de départ (compte_lundi) est L (deuxième compte, doublement).
--   Posteurs de test exclus (prénom ou nom « TEST », contrat de test, candidature Join de test) ; posts est_test
--   jamais comptés.
--   Attendu : le quota du compte, comme minuit : posts_par_jour borné à 1..3 (défaut : réglage « frequence », puis 1).
--   1 post sur 2 le lundi = un manque (« 1/2 »).
--   Pas des manques (comptés à part, sans alerte) : warm-up pas lancé ou fini après L (pas prêt : page Cohortes),
--   recrue en rouge pas décidée ou demande d'arrêt ouverte (le moteur ne les sert pas, 0392), compte hors moteur
--   (CM, UGCV, vidéos), compte d'une application GELÉE (gel ouvert dans applications_gels, 0793 : warm-up prolongé
--   et payé, c'est la décision de Max ; Atala aujourd'hui). Un compte Atala est contrôlé comme les autres : dès que
--   le gel est fermé (« go »), il doit avoir ses posts. Une application coupée SANS gel (Artura) est un manque.
--   Dimanche 20 h (prévision, avant minuit) : manque = compte prêt que minuit ne servira pas : aucun label, ou
--   aucune de ses applications allumée et pas de gel. Sinon il est « prévu » (minuit le complète jusqu'au quota).
--   Lundi 7 h (vérification, après minuit et son rattrapage) : manque = compte prêt avec moins de posts que son
--   quota ; la raison vient du journal de minuit (assignation_journal). C'est le seul moyen de voir un pool vide
--   (le 23/11, un compte servi par aucun contenu dans sa langue n'a rien eu, ce que le dimanche ne peut pas prévoir).
--
-- 1. controle_lundi_resultats : une ligne par passage (cron ou manuel), le détail en jsonb.
-- 2. controle_lundi_compte() : l'état d'un compte pour le lundi L ; controle_lundi_calculer() : le contrôle complet.
-- 3. controle_lundi_verifier(p_lundi, p_passage) : sans argument (cron) il ne travaille que le dimanche à 20 h et
--    le lundi à 7 h (heure de Paris, été comme hiver : deux créneaux UTC chacun) ; avec un lundi ou appelé par un
--    admin, c'est un passage MANUEL : gardé, mais jamais lu par Control ni par l'alerte Slack.
-- 4. Control (aujourdhui_lire) : « Posts du lundi manquants · n posteur(s) » en rouge dans « Contenu et posts »,
--    relu à chaque lecture (un manque réparé disparaît tout de suite) ; rouge → DM Slack urgent à Max par le mécanisme
--    existant (clé lundi_posts:<lundi>:<passage>, une fois par passage). « Candidatures Join à décider · n » dans
--    « À valider » (catégorie recrutement), orange, rouge si l'une attend depuis plus de 48 h.

-- ✅ Appliquée le 2026-11-25 (MCP execute_sql), en trois temps (fonctions, crons, bloc dans aujourdhui_lire live).
-- Vérifié : aujourdhui_lire répond (claims admin) avec ses 28 lignes d'avant, le bloc 0848 (Pont Hub) est intact.
-- Rejoué à blanc sur l'historique : lundi 16/11 (vérification) 143 comptes, 0 manque ; lundi 23/11 (vérification)
-- 73 comptes, 1 manque (un compte « Dorian × HU » que minuit n'a pas servi), 23 Atala gelés ; aucune fausse alerte.
-- Test du 30/11 (passage manuel, aucune alerte) : 322 comptes, 18 servis à minuit, 7 manques (Artura coupée sans
-- gel), 30 Atala gelés, 267 warm-up pas lancé.
--
-- 1.
create table if not exists public.controle_lundi_resultats (
  id        bigserial primary key,
  lundi     date not null,
  passage   text not null check (passage in ('dimanche', 'lundi')),
  source    text not null check (source in ('cron', 'manuel')),
  lance_at  timestamptz not null default now(),
  lance_par uuid,
  posteurs  integer not null default 0,
  comptes   integer not null default 0,
  manques_posteurs integer not null default 0,
  manques_comptes  integer not null default 0,
  resultat  jsonb not null
);
alter table public.controle_lundi_resultats enable row level security;
create index if not exists controle_lundi_resultats_lundi on public.controle_lundi_resultats (source, lundi, lance_at desc);

-- 2. L'état d'un compte pour le lundi L (p_reel : après minuit, on compte les posts ; avant, on prévoit).
create or replace function public.controle_lundi_compte(p_compte uuid, p_lundi date, p_reel boolean)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_c public.comptes;
  v_minuit timestamptz := p_lundi::timestamp at time zone 'Europe/Paris';
  v_attendu integer;
  v_prevus integer;
  v_apps uuid[];
  v_prevue text;
  v_journal text;
  v_gelees text;
  v_coupees text;
begin
  select * into v_c from public.comptes where id = p_compte;
  if not found then
    return jsonb_build_object('statut', 'inactif', 'raison', 'compte supprimé');
  end if;
  v_attendu := least(3, greatest(1, round(coalesce(v_c.posts_par_jour::numeric,
                 (select (r.valeur->>'posts_par_jour')::numeric from public.reglages r where r.cle = 'frequence'), 1))))::int;
  select count(*) into v_prevus from public.posts p
   where p.compte_id = p_compte and p.date_publication_prevue = p_lundi and not coalesce(p.est_test, false);

  if not v_c.is_active or not exists (select 1 from public.profiles pr where pr.id = v_c.poster_id and pr.is_active) then
    return jsonb_build_object('statut', 'inactif', 'attendu', v_attendu, 'prevus', v_prevus);
  end if;
  if coalesce(v_c.type_compte, 'perso') = 'cm' or coalesce(v_c.ugcv, false) or coalesce(v_c.videos_uniquement, false) then
    return jsonb_build_object('statut', 'hors_moteur', 'attendu', v_attendu, 'prevus', v_prevus);
  end if;
  if v_prevus >= v_attendu then
    return jsonb_build_object('statut', 'ok', 'attendu', v_attendu, 'prevus', v_prevus);
  end if;
  -- Le moteur ne sert pas une recrue en rouge pas décidée ni un posteur qui a dit stop (0392, recrues_bloquees.ts).
  if exists (select 1 from public.recrues_rouges rr where rr.poster_id = v_c.poster_id and rr.decision is null
                and rr.etape in ('acces', 'tiktok', 'warmup')) then
    return jsonb_build_object('statut', 'bloque', 'raison', 'recrue en rouge, à décider (Cohortes)', 'attendu', v_attendu, 'prevus', v_prevus);
  end if;
  if exists (select 1 from public.demandes_arret d where d.poster_id = v_c.poster_id and d.decision is null) then
    return jsonb_build_object('statut', 'bloque', 'raison', 'demande d''arrêt ouverte', 'attendu', v_attendu, 'prevus', v_prevus);
  end if;
  -- Minuit ne sert que les comptes dont le warm-up est fini à son passage (warmup_ends_at <= minuit du lundi).
  if v_c.warmup_ends_at is null then
    return jsonb_build_object('statut', 'pas_pret', 'raison', 'warm-up pas lancé', 'attendu', v_attendu, 'prevus', v_prevus);
  end if;
  if v_c.warmup_ends_at > v_minuit then
    return jsonb_build_object('statut', 'pas_pret', 'attendu', v_attendu, 'prevus', v_prevus,
      'raison', 'warm-up jusqu''au ' || to_char(v_c.warmup_ends_at at time zone 'Europe/Paris', 'DD/MM'));
  end if;
  -- Applications du compte (répartition, Sophia par défaut) : gelée = règle de Max (0793), coupée sans gel = manque.
  v_apps := public.compte_applications(v_c);
  if not exists (select 1 from public.applications a where a.actif and a.id = any (v_apps)) then
    select string_agg(distinct a.nom, ', ') into v_gelees
      from public.applications_gels g join public.applications a on a.id = g.application_id
     where g.application_id = any (v_apps) and g.debut < v_minuit + interval '1 day'
       and (g.fin is null or g.fin > v_minuit);
    if v_gelees is not null then
      return jsonb_build_object('statut', 'gele', 'raison', v_gelees || ' gelée', 'application', v_gelees,
        'attendu', v_attendu, 'prevus', v_prevus);
    end if;
    select string_agg(a.nom, ', ' order by a.nom) into v_coupees from public.applications a where a.id = any (v_apps);
    v_prevue := coalesce(v_coupees, 'application') || ' coupée, sans gel';
  elsif not exists (select 1 from public.compte_labels cl where cl.compte_id = p_compte) then
    v_prevue := 'aucun label';
  end if;

  if p_reel then
    select coalesce(nullif(j.erreur, ''), nullif(j.raison, '')) into v_journal
      from public.assignation_journal j where j.compte_id = p_compte and j.jour = p_lundi;
    return jsonb_build_object('statut', 'manque', 'attendu', v_attendu, 'prevus', v_prevus,
      'raison', left(coalesce(v_journal, v_prevue, 'aucun post assigné à minuit'), 200));
  end if;
  if v_prevue is not null then
    return jsonb_build_object('statut', 'manque', 'raison', v_prevue, 'attendu', v_attendu, 'prevus', v_prevus);
  end if;
  return jsonb_build_object('statut', 'ok', 'raison', 'servi à minuit', 'attendu', v_attendu, 'prevus', v_prevus);
end;
$$;
revoke execute on function public.controle_lundi_compte(uuid, date, boolean) from public, anon, authenticated;
grant execute on function public.controle_lundi_compte(uuid, date, boolean) to service_role;

-- Le contrôle complet du lundi L (lecture seule).
create or replace function public.controle_lundi_calculer(p_lundi date, p_reel boolean)
returns jsonb language sql stable security definer set search_path = public as $$
  with pop as (
    select c.id as compte_id, c.handle_tiktok, pr.id as poster_id
      from public.comptes c
      join public.profiles pr on pr.id = c.poster_id
     where c.is_active and pr.is_active
       and exists (select 1 from public.user_roles ur where ur.user_id = pr.id and ur.role = 'poster')
       and (pr.cohorte_lundi = p_lundi or public.compte_lundi(c.id) = p_lundi)
       -- Posteurs de test : « TEST », contrat de test, candidature Join de test.
       and upper(btrim(coalesce(pr.prenom, ''))) <> 'TEST' and upper(btrim(coalesce(pr.nom, ''))) <> 'TEST'
       and not exists (select 1 from public.contrats_test t where t.retire_at is null
                        and (t.poster_id = pr.id or t.contrat_id = pr.upwork_contract_id))
       and not exists (select 1 from public.join_candidatures j where j.profile_id = pr.id and j.test)
  ), e as (
    select pop.*, public.controle_lundi_compte(pop.compte_id, p_lundi, p_reel) as etat from pop
  )
  select jsonb_build_object(
    'lundi', p_lundi,
    'passage', case when p_reel then 'lundi' else 'dimanche' end,
    'posteurs', (select count(distinct poster_id) from e),
    'comptes', (select count(*) from e),
    'ok', (select count(*) from e where etat->>'statut' = 'ok'),
    'manques_comptes', (select count(*) from e where etat->>'statut' = 'manque'),
    'manques_posteurs', (select count(distinct poster_id) from e where etat->>'statut' = 'manque'),
    'ecartes', jsonb_build_object(
      'pas_prets', (select count(*) from e where etat->>'statut' = 'pas_pret'),
      'geles', (select count(*) from e where etat->>'statut' = 'gele'),
      'bloques', (select count(*) from e where etat->>'statut' = 'bloque'),
      'hors_moteur', (select count(*) from e where etat->>'statut' = 'hors_moteur')),
    'geles_par_application', coalesce((select jsonb_object_agg(app, n) from (
        select etat->>'application' as app, count(*) as n from e where etat->>'statut' = 'gele' group by 1) g), '{}'::jsonb),
    'manques', coalesce((select jsonb_agg(jsonb_build_object(
        'poster_id', poster_id, 'compte_id', compte_id, 'handle', coalesce(handle_tiktok, left(compte_id::text, 8)),
        'attendu', (etat->>'attendu')::int, 'prevus', (etat->>'prevus')::int, 'raison', etat->>'raison')
        order by etat->>'raison', handle_tiktok) from e where etat->>'statut' = 'manque'), '[]'::jsonb));
$$;
revoke execute on function public.controle_lundi_calculer(date, boolean) from public, anon, authenticated;
grant execute on function public.controle_lundi_calculer(date, boolean) to service_role;

-- 3. Le passage : cron (sans argument) ou manuel (un lundi donné, ou un admin connecté).
create or replace function public.controle_lundi_verifier(p_lundi date default null, p_passage text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_paris timestamp := now() at time zone 'Europe/Paris';
  v_lundi date;
  v_reel boolean;
  v_source text;
  v_res jsonb;
  v_id bigint;
begin
  if auth.uid() is not null and not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_lundi is null and auth.uid() is null then
    -- Cron : dimanche 20 h (prévision) et lundi 7 h (vérification), heure de Paris.
    if extract(isodow from v_paris) = 7 and extract(hour from v_paris) = 20 then
      v_lundi := v_paris::date + 1;
      v_reel := false;
    elsif extract(isodow from v_paris) = 1 and extract(hour from v_paris) = 7 then
      v_lundi := v_paris::date;
      v_reel := true;
    else
      return jsonb_build_object('ignore', 'hors heure');
    end if;
    v_source := 'cron';
    if exists (select 1 from public.controle_lundi_resultats r where r.source = 'cron' and r.lundi = v_lundi
                  and r.passage = case when v_reel then 'lundi' else 'dimanche' end) then
      return jsonb_build_object('lundi', v_lundi, 'deja', true);
    end if;
  else
    -- Manuel (test) : jamais lu par Control ni par l'alerte Slack.
    v_source := 'manuel';
    v_lundi := coalesce(p_lundi, v_paris::date + ((8 - extract(isodow from v_paris)::int) % 7));
    v_reel := case p_passage when 'lundi' then true when 'dimanche' then false
                else now() >= (v_lundi::timestamp at time zone 'Europe/Paris') end;
  end if;

  v_res := public.controle_lundi_calculer(v_lundi, v_reel);
  insert into public.controle_lundi_resultats (lundi, passage, source, lance_par, posteurs, comptes,
                                               manques_posteurs, manques_comptes, resultat)
  values (v_lundi, v_res->>'passage', v_source, auth.uid(), (v_res->>'posteurs')::int, (v_res->>'comptes')::int,
          (v_res->>'manques_posteurs')::int, (v_res->>'manques_comptes')::int, v_res)
  returning id into v_id;

  -- Un manque au passage du cron : le DM Slack urgent à Max part tout de suite (aujourdhui_alertes, comme 0848).
  if v_source = 'cron' and (v_res->>'manques_comptes')::int > 0 then
    begin
      perform net.http_post(url := 'https://mbikecieskoobeizixig.supabase.co/functions/v1/support',
        headers := jsonb_build_object('content-type', 'application/json', 'x-cron-secret', public.cron_secret_lire()),
        body := '{"action":"aujourdhui_alertes"}'::jsonb, timeout_milliseconds := 60000);
    exception when others then
      raise warning 'controle_lundi_verifier : DM Slack non lancé (%)', sqlerrm;
    end;
  end if;
  return v_res || jsonb_build_object('id', v_id, 'source', v_source);
end;
$$;
revoke execute on function public.controle_lundi_verifier(date, text) from public, anon;
grant execute on function public.controle_lundi_verifier(date, text) to authenticated, service_role;

do $$
begin
  -- 18 h et 19 h UTC le dimanche, 5 h et 6 h UTC le lundi : un seul des deux tombe à l'heure de Paris voulue.
  if not exists (select 1 from cron.job where jobname = 'controle-lundi-dimanche') then
    perform cron.schedule('controle-lundi-dimanche', '3 18,19 * * 0', $c$select public.controle_lundi_verifier()$c$);
  end if;
  if not exists (select 1 from cron.job where jobname = 'controle-lundi-verif') then
    perform cron.schedule('controle-lundi-verif', '3 5,6 * * 1', $c$select public.controle_lundi_verifier()$c$);
  end if;
end $$;

-- 4. Les lignes de Control.
-- « Posts du lundi manquants » : le dernier passage du cron pour ce lundi (de dimanche 20 h à lundi soir), chaque
-- manque relu maintenant (avant minuit on prévoit, après on compte les posts) : un manque réparé disparaît.
create or replace function public.controle_lundi_lignes()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  r record;
  v_reel boolean;
  v_restants jsonb;
  v_posteurs uuid[];
  v_n integer;
  v_groupes text;
  v_ecartes text;
begin
  select * into r from public.controle_lundi_resultats
   where source = 'cron' and lundi >= (now() at time zone 'Europe/Paris')::date
   order by lance_at desc, id desc limit 1;
  if not found or r.manques_comptes = 0 then
    return '[]'::jsonb;
  end if;
  v_reel := now() >= (r.lundi::timestamp at time zone 'Europe/Paris');
  select coalesce(jsonb_agg(m || jsonb_build_object('raison', x.e->>'raison', 'prevus', (x.e->>'prevus')::int)), '[]'::jsonb),
         array_agg(distinct (m->>'poster_id')::uuid)
    into v_restants, v_posteurs
    from jsonb_array_elements(r.resultat->'manques') m
    cross join lateral (select public.controle_lundi_compte((m->>'compte_id')::uuid, r.lundi, v_reel) as e) x
   where x.e->>'statut' = 'manque';
  v_n := coalesce(cardinality(v_posteurs), 0);
  if v_n = 0 then
    return '[]'::jsonb;
  end if;
  -- Les handles, par raison (8 par raison au plus).
  select string_agg(g.raison || ' : ' || g.handles, ' · ' order by g.n desc, g.raison) into v_groupes
    from (select y.raison, count(*) as n,
                 string_agg(y.libelle, ', ' order by y.handle) filter (where y.rang <= 8) ||
                   case when count(*) > 8 then ' +' || (count(*) - 8) else '' end as handles
            from (select x->>'raison' as raison, x->>'handle' as handle,
                         (x->>'handle') || case when (x->>'prevus')::int > 0
                                                then ' ' || (x->>'prevus') || '/' || (x->>'attendu') else '' end as libelle,
                         row_number() over (partition by x->>'raison' order by x->>'handle') as rang
                    from jsonb_array_elements(v_restants) x) y
           group by y.raison) g;
  v_ecartes := nullif(concat_ws(', ',
    case when (r.resultat->'ecartes'->>'geles')::int > 0 then (r.resultat->'ecartes'->>'geles') || ' gelés ('
      || (select string_agg(k, ', ') from jsonb_object_keys(r.resultat->'geles_par_application') k) || ', normal)' end,
    case when (r.resultat->'ecartes'->>'pas_prets')::int > 0 then (r.resultat->'ecartes'->>'pas_prets') || ' pas prêts (warm-up)' end,
    case when (r.resultat->'ecartes'->>'bloques')::int > 0 then (r.resultat->'ecartes'->>'bloques') || ' en rouge ou en arrêt' end), '');
  return jsonb_build_array(public.aujourdhui_ligne('lundi_posts:' || to_char(r.lundi, 'YYYY-MM-DD') || ':' || r.passage,
    'Posts du lundi manquants · ' || v_n || ' posteur(s)',
    'Lundi ' || to_char(r.lundi, 'DD/MM') ||
      case when r.passage = 'dimanche' then ' (contrôle du dimanche 20 h, minuit ne les servira pas)' else ' (vérifié lundi 7 h)' end ||
      ' · ' || jsonb_array_length(v_restants) || ' compte(s) · ' || left(v_groupes, 700) ||
      coalesce(' · hors contrôle : ' || v_ecartes, ''),
    'rouge', r.lance_at, v_n, null, v_posteurs, null, '/admin/minuit', 'Voir l''assignation', 'contenu', null));
end;
$$;
revoke execute on function public.controle_lundi_lignes() from public, anon, authenticated;
grant execute on function public.controle_lundi_lignes() to service_role;

-- « Candidatures Join à décider » (Control > Recrutement) : à traiter, pas de test, pas expirées, pas signées.
-- Le candidat lit « We'll get back to you within 48h » : rouge dès que la plus ancienne attend depuis plus de 48 h.
create or replace function public.join_a_decider_lignes()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_n integer;
  v_depuis timestamptz;
  v_plus_ancienne uuid;
  v_manques text;
  v_rouge boolean;
begin
  select count(*), min(coalesce(c.decision_at, c.cree_at)),
         (array_agg(c.id order by coalesce(c.decision_at, c.cree_at), c.id))[1]
    into v_n, v_depuis, v_plus_ancienne
    from public.join_candidatures c
   where c.decision = 'a_traiter' and not coalesce(c.test, false)
     and (c.expire_at is null or c.expire_at > now())
     and not exists (select 1 from public.join_signatures s where s.candidature_id = c.id);
  if v_n = 0 then
    return '[]'::jsonb;
  end if;
  select string_agg(m || ' ×' || n, ' · ' order by n desc, m) into v_manques
    from (select m, count(*) as n
            from public.join_candidatures c
            cross join lateral unnest(case when coalesce(cardinality(c.manques), 0) = 0
                                           then array['rien ne manque (acceptation auto coupée)'] else c.manques end) m
           where c.decision = 'a_traiter' and not coalesce(c.test, false)
             and (c.expire_at is null or c.expire_at > now())
             and not exists (select 1 from public.join_signatures s where s.candidature_id = c.id)
           group by 1 order by 2 desc, 1 limit 4) t;
  v_rouge := v_depuis < now() - interval '48 hours';
  -- La clé suit la plus ancienne : signalée une fois passé 24 h (orange), une fois passé 48 h (rouge).
  return jsonb_build_array(public.aujourdhui_ligne(
    'join_a_decider:' || case when v_rouge then 'retard:' else '' end || v_plus_ancienne,
    'Candidatures Join à décider · ' || v_n,
    'Manques : ' || coalesce(v_manques, '?') || ' · la plus ancienne attend depuis le ' ||
      to_char(v_depuis at time zone 'Europe/Paris', 'DD/MM "à" HH24:MI') || ' (réponse promise sous 48 h)',
    case when v_rouge then 'rouge' else 'orange' end, v_depuis, v_n, null, null, null,
    'https://join.vikstudios.com/admin', 'Décider sur Join', 'recrutement', null));
end;
$$;
revoke execute on function public.join_a_decider_lignes() from public, anon, authenticated;
grant execute on function public.join_a_decider_lignes() to service_role;

-- aujourdhui_lire : on insère le bloc dans la version LIVE (modifiée en base par d'autres), avant « Ce que l'OS a
-- réglé seul aujourd'hui », une seule fois.
do $m$
declare
  v_def text := pg_get_functiondef('public.aujourdhui_lire()'::regprocedure);
  v_repere text := '-- Ce que l''OS a réglé seul aujourd''hui.';
  v_bloc text := $b$-- 0859 : posts du lundi des posteurs qui démarrent (dimanche 20 h, vérifié lundi 7 h) ; Join à décider.
  v_contenu := v_contenu || public.controle_lundi_lignes();
  v_valider := v_valider || public.join_a_decider_lignes();

  $b$;
begin
  if position('controle_lundi_lignes' in v_def) > 0 then
    raise notice '0859 : aujourdhui_lire contient déjà le bloc, rien à faire';
  elsif (length(v_def) - length(replace(v_def, v_repere, ''))) / length(v_repere) <> 1 then
    raise exception '0859 : repère « % » absent ou en double dans aujourdhui_lire (live)', v_repere;
  else
    execute replace(v_def, v_repere, v_bloc || v_repere);
  end if;
end $m$;
