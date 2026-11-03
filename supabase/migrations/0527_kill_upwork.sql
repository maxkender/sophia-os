-- 0527 — Kill depuis la page Problèmes, branché sur Upwork (03/11).
--
-- La fonction upwork (action kill_probleme / kill_lot) fait le travail chez
-- Upwork ; ici, ce que la base fait autour :
-- 1. probleme_kill(probleme, par) : le posteur désactivé (profil et comptes),
--    le kill noté dans arrets (source manuel, sans message : le trigger
--    arrets_immediat fait l'OS et « Retirer de Slack »), journal de la carte.
-- 2. probleme_kill_terminer(probleme, texte) : la carte fermée avec ce qui
--    s'est passé (« Compte désactivé · Contrat N fermé · X $ en retour »).
-- 3. probleme_kill_a_la_main(poster, contrat, montant, raison) : une carte
--    « kill_contrat » pour le Pay Bot : « Fermer + récupérer X $ sur le
--    contrat N à la main » (Aujourd'hui, filtre Paie).
-- 4. problemes_recalculer : une carte kill_contrat n'est pas fermée parce que
--    le posteur est désactivé ; son propriétaire est le Pay Bot.
-- 5. probleme_diagnostic_os garde le résumé de ces cartes (kill_contrat,
--    upwork_mauvais_compte).
--
-- Rien n'est envoyé au posteur (kill_message_auto reste off). Additif.

create or replace function public.probleme_kill(p_probleme uuid, p_par uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  p public.problemes;
  v_arret uuid;
  v_contrat text;
begin
  if coalesce(auth.role(), '') not in ('', 'service_role') then
    raise exception 'probleme_kill : réservé à la fonction upwork' using errcode = '42501';
  end if;
  select * into p from public.problemes where id = p_probleme for update;
  if not found then raise exception 'problème introuvable'; end if;
  if p.poster_id is null then raise exception 'pas de posteur sur cette carte'; end if;
  select pr.upwork_contract_id into v_contrat from public.profiles pr where pr.id = p.poster_id;
  update public.profiles set is_active = false where id = p.poster_id and is_active;
  update public.comptes set is_active = false where poster_id = p.poster_id and is_active;
  select a.id into v_arret from public.arrets a where a.poster_id = p.poster_id and a.statut in ('a_faire', 'en_cours') and a.annule_at is null limit 1;
  if v_arret is null then
    insert into public.arrets (poster_id, source, demande_par, motif, sans_message)
    values (p.poster_id, 'manuel', p_par, 'Kill depuis la page Problèmes', true)
    returning id into v_arret;
  end if;
  update public.problemes set journal = journal || jsonb_build_object('at', now(), 'par', p_par, 'action', 'kill', 'arret', v_arret), maj_at = now()
   where id = p_probleme;
  return jsonb_build_object('poster_id', p.poster_id, 'contrat_id', coalesce(v_contrat, p.contrat_id), 'arret_id', v_arret);
end;
$$;
revoke all on function public.probleme_kill(uuid, uuid) from public, anon, authenticated;
grant execute on function public.probleme_kill(uuid, uuid) to service_role;

create or replace function public.probleme_kill_terminer(p_probleme uuid, p_texte text, p_par uuid default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(auth.role(), '') not in ('', 'service_role') then
    raise exception 'probleme_kill_terminer : réservé à la fonction upwork' using errcode = '42501';
  end if;
  update public.problemes
     set statut = 'valide', ferme_raison = left(p_texte, 500), ferme_at = now(), ferme_par = p_par, maj_at = now(),
         journal = journal || jsonb_build_object('at', now(), 'par', p_par, 'action', 'kill_termine', 'texte', p_texte)
   where id = p_probleme and statut = 'ouvert';
end;
$$;
revoke all on function public.probleme_kill_terminer(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.probleme_kill_terminer(uuid, text, uuid) to service_role;

create or replace function public.probleme_kill_a_la_main(p_poster uuid, p_contrat text, p_montant numeric, p_raison text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_resume text := 'Fermer + récupérer ' || coalesce(trim(to_char(p_montant, 'FM999990.00')), '?') || ' $ sur le contrat '
                   || coalesce(p_contrat, '?') || ' à la main';
begin
  if coalesce(auth.role(), '') not in ('', 'service_role') then
    raise exception 'probleme_kill_a_la_main : réservé à la fonction upwork' using errcode = '42501';
  end if;
  v_id := public.probleme_ajouter('kill_upwork', 'kill_upwork:' || coalesce(p_contrat, p_poster::text) || ':' || to_char(now(), 'YYYYMMDDHH24MI'),
                                  p_poster, p_contrat, 'kill_contrat', v_resume, left(p_raison, 500), now(),
                                  case when p_contrat is not null then 'https://www.upwork.com/nx/wm/workroom/' || p_contrat || '/overview' end,
                                  null, 'os');
  if v_id is not null then
    update public.problemes
       set niveau = 'aujourdhui', niveau_force = true, proprietaire = 'pay_bot',
           diagnostic = v_resume, diagnostic_par = 'os'
     where id = v_id and statut = 'ouvert';
  end if;
  return v_id;
end;
$$;
revoke all on function public.probleme_kill_a_la_main(uuid, text, numeric, text) from public, anon, authenticated;
grant execute on function public.probleme_kill_a_la_main(uuid, text, numeric, text) to service_role;

create or replace function public.problemes_recalculer()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  s jsonb;
  v_lundi boolean := extract(isodow from now() at time zone 'Europe/Paris') = 1;
  v_raison text;
  v_niveau text;
  v_groupe text;
  v_proprio text;
  n_fermes int := 0;
  n_niveaux int := 0;
  v_fin jsonb;
  v_os boolean;
  v_a_ecrit boolean;
  v_signale timestamptz;
  v_login_at timestamptz;
  v_slack_at timestamptz;
  v_tiktok_at timestamptz;
  v_post_at timestamptz;
  v_textes text;
begin
  if coalesce(auth.role(), '') not in ('', 'service_role') and not public.is_admin() then
    raise exception 'problemes_recalculer : réservé à l''admin' using errcode = '42501';
  end if;
  for r in select p.id, p.poster_id, p.categorie, p.niveau, p.niveau_force, p.sources, p.proprietaire, p.groupe, p.created_at
             from public.problemes p where p.statut = 'ouvert' loop
    s := case when r.poster_id is not null then public.probleme_situation(r.poster_id) end;
    v_os := exists (select 1 from jsonb_array_elements(r.sources) x where x->>'type' not in ('reponse', 'slack', 'bot'));
    v_a_ecrit := coalesce((s->>'a_ecrit')::boolean, false);
    -- Le dernier signalement (la source la plus récente).
    select coalesce(max((x->>'at')::timestamptz), r.created_at), string_agg(lower(coalesce(x->>'texte', '')), ' ')
      into v_signale, v_textes
      from jsonb_array_elements(r.sources) x;
    v_raison := null;

    -- Posteur désactivé : tout est fermé, sauf « retirer de Slack » (le geste qui reste à faire pour lui).
    -- 0527 : « kill_contrat » (contrat à fermer à la main) reste ouverte même posteur désactivé.
    if s is not null and not coalesce((s->>'actif')::boolean, true) and r.categorie not in ('retirer_slack', 'kill_contrat') then
      v_raison := 'posteur désactivé : tout est fermé';
    elsif r.categorie = 'paie' and s is not null and coalesce((s->>'paye_passee')::boolean, false) and coalesce((s->>'finance_ok')::boolean, false) then
      select f into v_fin from jsonb_array_elements(s->'finances') f
       where abs((f->>'montant')::numeric - (s->>'attendu_semaine')::numeric) < 0.01 limit 1;
      v_raison := 'paie : semaine du ' || to_char((s->'paie_passee'->>'semaine')::date, 'DD/MM') || ' payée, « '
                  || coalesce(v_fin->>'nom', '?') || ' » financé à ' || (v_fin->>'montant') || ' $ pour la semaine en cours';
    elsif r.categorie = 'login' and s is not null then
      select greatest(pr.premiere_connexion_at, u.last_sign_in_at) into v_login_at
        from public.profiles pr left join auth.users u on u.id = pr.id where pr.id = r.poster_id;
      if v_login_at > v_signale then
        v_raison := 'étape faite : connecté(e) le ' || to_char(v_login_at at time zone 'Europe/Paris', 'DD/MM HH24:MI');
      end if;
    elsif r.categorie = 'slack' and s is not null and coalesce((s->'etapes'->>'slack')::boolean, false) then
      select max(sm.at) into v_slack_at from public.slack_messages sm
        join public.profiles pr on pr.slack_user_id = sm.slack_user where pr.id = r.poster_id;
      if not v_a_ecrit or v_slack_at > v_signale then
        v_raison := 'étape faite : Slack relié' || coalesce(', écrit sur Slack le ' || to_char(v_slack_at at time zone 'Europe/Paris', 'DD/MM'), '');
      end if;
    elsif r.categorie = 'tiktok_setup' and s is not null and coalesce((s->'etapes'->>'tiktok')::boolean, false)
          and coalesce((s->'etapes'->>'warmup')::boolean, false) then
      select max(w.releve_at) into v_tiktok_at from public.ckd_warmup_releves w
        join public.comptes c on c.id = w.compte_id where c.poster_id = r.poster_id and w.existe;
      if not v_a_ecrit or v_tiktok_at > v_signale then
        v_raison := 'étape faite : compte TikTok trouvé et warm-up fait';
      end if;
    end if;

    -- Bug du dashboard ou 0 post, puis un post avec lien depuis ; post signalé « pas compté », puis compté
    -- (le post peut dater de peu avant le signalement : son lien a été compté après).
    if v_raison is null and s is not null and coalesce((s->>'posts')::int, 0) > 0
       and r.categorie not in ('paie', 'stop', 'menace', 'hors_plateforme', 'suspect', 'offre_hm_incorrecte') then
      v_post_at := (s->>'dernier_post_at')::timestamptz;
      if r.categorie in ('bug_dashboard', 'zero_post') and v_post_at > v_signale then
        v_raison := 'posté depuis : post avec lien compté le ' || to_char(v_post_at at time zone 'Europe/Paris', 'DD/MM');
      elsif v_textes ~ '\mposts?\M'
            and v_textes ~ '(not|n.?t|never) (been |yet |be )?(counted|count|showing|shown|show up|appear(ing|ed)?|visible|validated|registered|recorded|taken into account)'
            and v_post_at >= v_signale - interval '3 days' then
        v_raison := 'post signalé non compté, compté depuis (dernier post avec lien le ' || to_char(v_post_at at time zone 'Europe/Paris', 'DD/MM') || ')';
      end if;
    end if;

    if v_raison is null and not v_os and not v_a_ecrit
       and r.categorie not in ('paie', 'stop', 'menace', 'hors_plateforme', 'suspect', 'offre_hm_incorrecte') then
      -- Seulement des messages, dont le dernier ne demande rien (merci, c'est fait, j'ai compris) : pas de carte.
      v_raison := 'pas de demande en attente (dernier message sans question ni blocage)';
    end if;

    if v_raison is not null then
      update public.problemes set statut = 'ferme_auto', ferme_raison = v_raison, ferme_at = now(), maj_at = now(),
             journal = journal || jsonb_build_object('at', now(), 'par', 'os', 'action', 'fermer_auto', 'raison', v_raison)
       where id = r.id;
      n_fermes := n_fermes + 1;
      continue;
    end if;

    -- A1/A4 : le groupe et le propriétaire suivent le posteur.
    -- Sans posteur (accueil à relier, offre HM) : onboarding ; le reste sans situation : actifs.
    v_groupe := coalesce(s->>'groupe', case when r.categorie in ('accueil', 'offre_hm_incorrecte') then 'onboarding' else 'actifs' end);
    v_proprio := case when r.categorie in ('paie', 'kill_contrat') then 'pay_bot'
                      when v_groupe in ('onboarding', 'nouveaux_actifs') then 'new_cohort_bot'
                      when v_groupe = 'actifs' then 'control_bot'
                      else r.proprietaire end;
    v_niveau := r.niveau;
    if not r.niveau_force then
      v_niveau := public.probleme_niveau_calc(r.categorie, v_a_ecrit,
                    coalesce((s->>'devrait_poster')::boolean, false), coalesce((s->>'actif')::boolean, true), v_lundi, v_os);
      -- B4 : une recrue bloquée (devrait poster, 0 post) qui signale connexion / compte / dashboard = urgent.
      if r.categorie in ('login', 'compte_bloque', 'bug_dashboard', 'tiktok_setup') and coalesce((s->>'bloque')::boolean, false) then
        v_niveau := 'urgent';
      end if;
    end if;
    if v_niveau is distinct from r.niveau or v_groupe is distinct from r.groupe or v_proprio is distinct from r.proprietaire then
      update public.problemes set niveau = v_niveau, groupe = v_groupe, proprietaire = v_proprio,
             maj_at = case when v_niveau is distinct from r.niveau then now() else maj_at end
       where id = r.id;
      if v_niveau is distinct from r.niveau then n_niveaux := n_niveaux + 1; end if;
    end if;
  end loop;
  return jsonb_build_object('fermes', n_fermes, 'niveaux_changes', n_niveaux,
    'ouverts', (select jsonb_object_agg(niveau, n) from (select niveau, count(*) n from public.problemes where statut = 'ouvert' group by 1) x),
    'groupes', (select jsonb_object_agg(coalesce(groupe, 'sans'), n) from (select groupe, count(*) n from public.problemes where statut = 'ouvert' group by 1) x));
end;
$$;
revoke all on function public.problemes_recalculer() from public, anon;
grant execute on function public.problemes_recalculer() to authenticated;

-- 5. Le diagnostic de l'OS ne réécrit pas ces cartes-là.
create or replace function public.probleme_diagnostic_os(p_categorie text, p_resume text, s jsonb)
returns text
language plpgsql
immutable
as $$
declare
  pp jsonb := s->'paie_passee';
  v_f jsonb := s->'finances'->0;
  v_jour text;
begin
  -- 0527 : les cartes déjà rédigées par l'OS (contrat à fermer à la main, mauvais compte Upwork) gardent leur résumé.
  if s is null or p_categorie in ('kill_contrat', 'upwork_mauvais_compte') then
    return left(p_resume, 300);
  end if;
  v_jour := to_char((s->'message'->>'at')::timestamptz at time zone 'Europe/Paris', 'DD/MM');
  if p_categorie = 'paie' then
    if not coalesce((s->>'paye_passee')::boolean, false) then
      return 'Semaine du ' || to_char((pp->>'semaine')::date, 'DD/MM') || ' pas encore payée (' || coalesce(pp->>'montant', '?') || ' $ dus).';
    elsif jsonb_array_length(coalesce(s->'finances', '[]'::jsonb)) = 0 then
      return 'Semaine du ' || to_char((pp->>'semaine')::date, 'DD/MM') || ' payée, mais aucun milestone financé pour la semaine du '
             || to_char((s->>'lundi')::date, 'DD/MM') || ' (attendu ' || coalesce(s->>'attendu_semaine', '?') || ' $).';
    elsif not coalesce((s->>'finance_ok')::boolean, false) then
      return 'Semaine du ' || to_char((pp->>'semaine')::date, 'DD/MM') || ' payée, mais « ' || coalesce(v_f->>'nom', '?') || ' » est financé à '
             || coalesce(v_f->>'montant', '?') || ' $ au lieu de ' || coalesce(s->>'attendu_semaine', '?') || ' $ (' || coalesce(s->>'comptes', '?') || ' compte(s)).';
    end if;
    return 'Semaine du ' || to_char((pp->>'semaine')::date, 'DD/MM') || ' payée et semaine en cours financée : plus rien à faire.';
  elsif p_categorie = 'stop' then
    return 'A demandé l''arrêt' || coalesce(' le ' || v_jour, '') || ' : kill à faire.';
  elsif p_categorie = 'login' and not coalesce((s->'etapes'->>'login')::boolean, false) then
    return 'Ne s''est jamais connecté·e au dashboard.';
  elsif p_categorie = 'slack' and not coalesce((s->'etapes'->>'slack')::boolean, false) then
    return 'Slack pas relié : nos messages Slack ne lui arrivent pas.';
  elsif p_categorie = 'tiktok_setup' and not coalesce((s->'etapes'->>'tiktok')::boolean, false) then
    return 'Compte TikTok introuvable : impossible de commencer.';
  elsif p_categorie = 'tiktok_setup' and not coalesce((s->'etapes'->>'warmup')::boolean, false) then
    return 'Warm-up pas fini (Start warmup ou 5 abonnements manquants).';
  elsif coalesce((s->>'bloque')::boolean, false) then
    return 'Devrait poster mais 0 post avec lien sur ' || coalesce(s->>'attendus', '?') || ' attendus cette semaine'
           || case when coalesce((s->>'a_ecrit')::boolean, false) then ' ; attend une réponse depuis le ' || v_jour else '' end || '.';
  elsif coalesce((s->>'a_ecrit')::boolean, false) then
    return 'Attend une réponse depuis le ' || v_jour || ' : « ' || left(regexp_replace(coalesce(s->'message'->>'texte', ''), '\s+', ' ', 'g'), 140) || ' »';
  end if;
  return left(p_resume, 300);
end;
$$;

notify pgrst, 'reload schema';
