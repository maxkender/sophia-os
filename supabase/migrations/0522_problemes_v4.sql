-- 0522 — Page Problèmes v4 (03/11) : trois groupes, fermeture à la lecture,
-- barre d'onboarding, diagnostic des bots.
--
-- A. Chaque problème porte un groupe, recalculé à chaque lecture :
--    onboarding = offre acceptée, aucun post avec lien depuis le début ;
--    nouveaux_actifs = au moins un post avec lien, premier post il y a moins
--    de 14 jours ; actifs = les autres. Le propriétaire suit le groupe :
--    onboarding et nouveaux actifs → new_cohort_bot, actifs → control_bot,
--    paie → pay_bot.
-- B. problemes_recalculer ferme ce qui n'existe plus, avec sa raison :
--    étape faite (connexion, Slack, TikTok + warm-up) depuis le signalement ;
--    post signalé non compté puis compté, bug du dashboard puis posté depuis ;
--    paie (règle de 0520 gardée : semaine passée payée ET milestone du bon
--    montant financé pour la semaine en cours, quel que soit son nom) ;
--    posteur désactivé → tout est fermé (sauf « retirer de Slack », le geste
--    qui reste à faire). Sans posteur : accueil / offre HM → onboarding.
-- C. Les bots (bot_propositions « proposer ») : diagnostic (300 car.),
--    groupe_suggere, actions « close » et « postpone » ; la vue
--    problemes_ouverts gagne groupe, diagnostic, nb_reports, premier_post_at.
-- D. problemes_onboarding() : la barre par cohorte (en cours et suivante) —
--    offre acceptée → accueil envoyé → connexion → Slack → TikTok créé →
--    warm-up démarré → abonnements OK → prêt — avec, par étape, les recrues
--    qui y sont bloquées, et le nombre de reports (1, 2 et plus).
--
-- Rien n'est envoyé ni payé ici. Additif : 3 colonnes, des fonctions, la vue
-- (colonnes ajoutées à la fin). Seule la table problemes est écrite (statut,
-- niveau, groupe, propriétaire des cartes ouvertes).

alter table public.problemes add column if not exists groupe text
  check (groupe is null or groupe in ('onboarding', 'nouveaux_actifs', 'actifs'));
alter table public.problemes add column if not exists diagnostic text;
alter table public.problemes add column if not exists groupe_suggere text
  check (groupe_suggere is null or groupe_suggere in ('onboarding', 'nouveaux_actifs', 'actifs'));

-- ---------------------------------------------------------------------------
-- A. La situation : + premier et dernier post avec lien, reports, groupe
-- ---------------------------------------------------------------------------
create or replace function public.probleme_situation(p_poster uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_auj date := (now() at time zone 'Europe/Paris')::date;
  v_lundi date := v_auj - (extract(isodow from v_auj)::int - 1);
  v_passee date := v_lundi - 7;
  pr record;
  v_comptes uuid[];
  v_nb int;
  v_attendu numeric;
  v_pays text;
  v_paie record;
  v_api text;
  v_paye boolean;
  v_jalons jsonb;
  v_jalons_lu timestamptz;
  v_finances jsonb;
  v_finance_ok boolean;
  v_contrat_actif boolean;
  v_msg_at timestamptz;
  v_msg_canal text;
  v_msg_texte text;
  v_msg_lien text;
  v_msg_ts text;
  v_repondu timestamptz;
  v_a_ecrit boolean;
  v_posts int;
  v_attendus int;
  v_tiktok boolean;
  v_warmup boolean;
  v_devrait boolean;
  v_premier timestamptz;
  v_dernier_post timestamptz;
  v_reports int;
  v_groupe text;
begin
  select p.id, p.is_active, p.cohorte_lundi, p.upwork_contract_id, p.tarif_hebdo, p.premiere_connexion_at, p.slack_user_id
    into pr from public.profiles p where p.id = p_poster;
  if not found then
    return null;
  end if;

  select array_agg(c.id order by c.created_at), (array_agg(c.pays order by c.created_at))[1]
    into v_comptes, v_pays
    from public.comptes c where c.poster_id = p_poster and c.is_active and coalesce(c.type_compte, 'perso') = 'perso';
  v_nb := coalesce(array_length(v_comptes, 1), 0);
  v_attendu := case when pr.tarif_hebdo is not null then pr.tarif_hebdo * greatest(v_nb, 1) end;

  -- La semaine passée : la ligne de paie et le paiement par l'API.
  select s.id, coalesce(s.montant_corrige, s.montant) as montant, s.paye_at, s.statut, s.action, s.exclu
    into v_paie from public.paie_semaines s where s.poster_id = p_poster and s.semaine = v_passee;
  select a.statut into v_api from public.paie_paiements_api a
   where a.poster_id = p_poster and a.semaine = v_passee order by a.updated_at desc limit 1;
  v_paye := v_paie.paye_at is not null or v_api in ('paye', 'deja_payee')
            or (v_paie.id is not null and (coalesce(v_paie.montant, 0) = 0 or coalesce(v_paie.exclu, false)));

  -- La semaine en cours : les milestones financés et non payés, lus chez Upwork.
  select j.jalons, j.lu_at into v_jalons, v_jalons_lu from public.upwork_jalons j where j.contrat_id = pr.upwork_contract_id;
  select coalesce(jsonb_agg(jsonb_build_object('nom', x->>'nom', 'montant', (x->>'depot')::numeric, 'etat', x->>'etat')
                            order by (x->>'sequence')::int), '[]'::jsonb)
    into v_finances
    from jsonb_array_elements(coalesce(v_jalons, '[]'::jsonb)) x
   where x->>'etat' in ('Active', 'Submitted', 'Rejected');
  v_finance_ok := v_attendu is not null
    and exists (select 1 from jsonb_array_elements(v_finances) f where abs((f->>'montant')::numeric - v_attendu) < 0.01);
  select uc.actif into v_contrat_actif from public.upwork_contrats uc where uc.contrat_id = pr.upwork_contract_id;

  -- Son dernier message (Upwork ou Slack), hors bruit, et s'il attend une réponse.
  select t.at, t.canal, t.texte, t.lien, t.ts
    into v_msg_at, v_msg_canal, v_msg_texte, v_msg_lien, v_msg_ts
    from (
      select m.at, 'upwork'::text as canal, m.texte,
             coalesce(m.lien_conversation, case when m.room_id is not null then 'https://www.upwork.com/ab/messages/rooms/' || m.room_id end) as lien,
             null::text as ts
        from public.upwork_messages m
       where m.poster_id = p_poster and m.role = 'posteur' and not public.probleme_bruit(m.texte)
      union all
      select sm.at, 'slack', sm.texte, null, sm.ts
        from public.slack_messages sm
       where pr.slack_user_id is not null and sm.slack_user = pr.slack_user_id and not public.probleme_bruit(sm.texte)
    ) t
   order by t.at desc
   limit 1;
  if v_msg_at is not null then
    select max(m.at) into v_repondu from public.upwork_messages m
     where m.poster_id = p_poster and m.role in ('nous', 'os', 'max', 'hm') and m.at > v_msg_at;
    if v_repondu is null and v_msg_ts is not null then
      select coalesce(q.envoye_at, v_msg_at) into v_repondu from public.chatbot_questions q
       where q.slack_ts = v_msg_ts and (q.envoye_at is not null or q.reponse_humaine is not null) limit 1;
    end if;
  end if;
  v_a_ecrit := v_msg_at is not null and v_msg_at > now() - interval '7 days' and v_repondu is null
              and public.probleme_attend_reponse(v_msg_texte);

  -- Cette semaine : posts avec lien / posts attendus (jusqu'à aujourd'hui).
  select count(*) filter (where pa.publie_url is not null), count(*)
    into v_posts, v_attendus
    from public.passages pa
   where pa.compte_id = any (coalesce(v_comptes, '{}'::uuid[]))
     and pa.date_publication_prevue between v_lundi and v_auj;
  v_tiktok := exists (select 1 from public.ckd_warmup_releves w where w.compte_id = any (coalesce(v_comptes, '{}'::uuid[])) and w.existe);
  v_warmup := exists (select 1 from public.comptes c where c.id = any (coalesce(v_comptes, '{}'::uuid[])) and c.warmup_started_at is not null)
              and exists (select 1 from public.ckd_warmup_releves w where w.compte_id = any (coalesce(v_comptes, '{}'::uuid[])) and coalesce(w.abonnements, 0) >= 5);
  v_devrait := pr.is_active and pr.cohorte_lundi is not null and pr.cohorte_lundi <= v_auj and public.posteur_demarre(p_poster);
  -- 3/11 (v4) : le premier post avec lien (tous comptes), le dernier, les reports, le groupe.
  select min(coalesce(pa.publie_at, pa.date_publication_prevue::timestamptz)), max(coalesce(pa.publie_at, pa.date_publication_prevue::timestamptz))
    into v_premier, v_dernier_post
    from public.passages pa join public.comptes c on c.id = pa.compte_id
   where c.poster_id = p_poster and pa.publie_url is not null;
  select count(distinct x.lundi) into v_reports from (
    select rr.periode as lundi from public.recrues_rouges rr where rr.poster_id = p_poster and rr.decision = 'reporter'
    union
    select d.lundi from public.debut_choix d where d.poster_id = p_poster and d.choix = 'reporter') x;
  v_groupe := case when v_premier is null then 'onboarding'
                   when v_premier > now() - interval '14 days' then 'nouveaux_actifs'
                   else 'actifs' end;

  return jsonb_build_object(
    'actif', pr.is_active,
    'pays', v_pays,
    'comptes', v_nb,
    'lundi', v_lundi,
    'posts', v_posts,
    'attendus', v_attendus,
    'devrait_poster', v_devrait,
    'bloque', v_devrait and v_posts = 0 and v_attendus > 0,
    'etapes', jsonb_build_object('login', pr.premiere_connexion_at is not null, 'slack', pr.slack_user_id is not null,
                                 'tiktok', v_tiktok, 'warmup', v_warmup),
    'paie_passee', jsonb_build_object('semaine', v_passee, 'montant', v_paie.montant, 'paye_at', v_paie.paye_at,
                                      'action', v_paie.action, 'api', v_api, 'ligne', v_paie.id is not null),
    'paye_passee', v_paye,
    'attendu_semaine', v_attendu,
    'finances', v_finances,
    'finance_ok', v_finance_ok,
    'jalons_lus_at', v_jalons_lu,
    'contrat_id', pr.upwork_contract_id,
    'contrat_actif', v_contrat_actif,
    'message', case when v_msg_at is null then null
                    else jsonb_build_object('at', v_msg_at, 'canal', v_msg_canal, 'texte', left(v_msg_texte, 400), 'lien', v_msg_lien,
                                            'repondu_at', v_repondu) end,
    'a_ecrit', v_a_ecrit,
    'premier_post_at', v_premier,
    'dernier_post_at', v_dernier_post,
    'nb_reports', v_reports,
    'groupe', v_groupe
  );
end;
$$;
revoke all on function public.probleme_situation(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- B. Le recalcul : groupe, propriétaire, fermeture de ce qui n'existe plus, niveau
-- ---------------------------------------------------------------------------
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
    if s is not null and not coalesce((s->>'actif')::boolean, true) and r.categorie <> 'retirer_slack' then
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
    v_proprio := case when r.categorie = 'paie' then 'pay_bot'
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

-- ---------------------------------------------------------------------------
-- La page : la liste avec diagnostic, groupe ; le geste « fermer »
-- ---------------------------------------------------------------------------
create or replace function public.problemes_liste(p_vue text default 'ouverts')
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'problemes_liste : réservé à l''admin' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', p.id, 'poster_id', p.poster_id, 'contrat_id', p.contrat_id,
             'nom', nullif(btrim(concat_ws(' ', pr.prenom, pr.nom)), ''), 'hm', p.hm, 'cohorte', pr.cohorte_lundi,
             'actif', pr.is_active, 'categorie', p.categorie, 'niveau', p.niveau, 'resume', p.resume, 'sources', p.sources,
             'proprietaire', p.proprietaire, 'proposition_reponse', p.proposition_reponse, 'canal_reponse', p.canal_reponse,
             'proposition_action', p.proposition_action, 'propose_par', p.propose_par, 'propose_at', p.propose_at,
             'statut', p.statut, 'ferme_raison', p.ferme_raison, 'ferme_at', p.ferme_at, 'created_at', p.created_at, 'maj_at', p.maj_at,
             'slack_relie', pr.slack_user_id is not null,
             'compte_id', (select c.id from public.comptes c where c.poster_id = p.poster_id and c.is_active and coalesce(c.type_compte, 'perso') = 'perso'
                            order by c.created_at limit 1),
             'groupe', p.groupe, 'diagnostic', p.diagnostic, 'groupe_suggere', p.groupe_suggere,
             'situation', case when p_vue = 'ouverts' and p.poster_id is not null then public.probleme_situation(p.poster_id) end)
           order by p.created_at)
      from public.problemes p
      left join public.profiles pr on pr.id = p.poster_id
     where case when p_vue = 'fermes' then p.statut <> 'ouvert' and coalesce(p.ferme_at, p.maj_at) > now() - interval '7 days'
                else p.statut = 'ouvert' end
  ), '[]'::jsonb);
end;
$$;
revoke all on function public.problemes_liste(text) from public, anon;
grant execute on function public.problemes_liste(text) to authenticated;

create or replace function public.probleme_agir(p_id uuid, p_action text, p_valeur jsonb default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  p public.problemes;
  v_mode text := coalesce((select valeur #>> '{}' from public.reglages where cle = 'problemes_mode'), 'test');
  v_entree jsonb := jsonb_build_object('at', now(), 'par', auth.uid(), 'action', p_action, 'valeur', p_valeur, 'mode', v_mode);
begin
  if not public.is_admin() then
    raise exception 'probleme_agir : réservé à l''admin' using errcode = '42501';
  end if;
  select * into p from public.problemes where id = p_id for update;
  if not found then raise exception 'problème introuvable'; end if;
  if p.statut <> 'ouvert' then raise exception 'problème déjà fermé (%)', p.statut; end if;

  if p_action = 'modifier' then
    update public.problemes set
      proposition_reponse = coalesce(p_valeur->>'reponse', proposition_reponse),
      canal_reponse = coalesce(nullif(p_valeur->>'canal', ''), canal_reponse),
      proposition_action = case when p_valeur ? 'action' then nullif(p_valeur->>'action', '') else proposition_action end,
      diagnostic = case when p_valeur ? 'diagnostic' then nullif(left(btrim(p_valeur->>'diagnostic'), 300), '') else diagnostic end,
      propose_par = 'admin', propose_at = now(), journal = journal || v_entree, maj_at = now()
     where id = p_id;
  elsif p_action = 'samedi' then
    update public.problemes set niveau = 'samedi', niveau_force = true, journal = journal || v_entree, maj_at = now() where id = p_id;
  elsif p_action = 'ignorer' then
    update public.problemes set statut = 'ignore', ferme_raison = 'ignoré', ferme_at = now(), ferme_par = auth.uid(),
           journal = journal || v_entree, maj_at = now() where id = p_id;
  elsif p_action = 'fermer' then
    -- ✔️ Fermer : le problème est réglé (proposition « close » d'un bot, ou constat de l'admin). Rien n'est envoyé.
    update public.problemes set statut = 'valide',
           ferme_raison = 'fermé : ' || coalesce(nullif(btrim(p_valeur->>'raison'), ''),
                                                 case when p.proposition_action = 'close' then 'réglé (proposé par ' || coalesce(p.propose_par, '?') || ')' else 'réglé' end),
           ferme_at = now(), ferme_par = auth.uid(), journal = journal || v_entree, maj_at = now() where id = p_id;
  elsif p_action = 'valider' then
    if p.categorie = 'paie' then
      raise exception 'paie : rien n''est validé ici ; ouvre la ligne de Payroll ou de Who to fund';
    end if;
    update public.problemes set statut = 'valide',
           ferme_raison = case when coalesce((p_valeur->>'envoye')::boolean, false) then 'validé, envoyé' else 'validé (mode ' || v_mode || ' : rien envoyé)' end,
           ferme_at = now(), ferme_par = auth.uid(), journal = journal || v_entree, maj_at = now() where id = p_id;
  else
    raise exception 'action inconnue : %', p_action;
  end if;
  return (select to_jsonb(x) from public.problemes x where x.id = p_id);
end;
$$;
revoke all on function public.probleme_agir(uuid, text, jsonb) from public, anon;
grant execute on function public.probleme_agir(uuid, text, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- C1. Les bots : diagnostic, groupe suggéré, actions close / postpone
-- ---------------------------------------------------------------------------
create or replace function public.probleme_bot(p_bot text, p_action text, p_args jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_jour timestamptz := (date_trunc('day', now() at time zone 'Europe/Paris')) at time zone 'Europe/Paris';
  v_id uuid;
  v_poster uuid;
  v_contrat text;
  v_action text := nullif(p_args->>'action', '');
  v_canal text := nullif(p_args->>'canal', '');
  v_diag text := nullif(left(btrim(coalesce(p_args->>'diagnostic', '')), 300), '');
  v_groupe text := nullif(p_args->>'groupe_suggere', '');
  v_erreur text;
  v_ref text;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'probleme_bot : réservé à la fonction bot_propositions' using errcode = '42501';
  end if;
  if p_bot not in ('new_cohort_bot', 'control_bot', 'pay_bot') then
    raise exception 'bot inconnu';
  end if;
  if (select count(*) from public.bot_appels b where b.bot = p_bot and b.at >= v_jour) >= 200 then
    insert into public.bot_appels (bot, action, ok, erreur, args) values (p_bot, p_action, false, 'quota : 200 appels par jour', p_args);
    return jsonb_build_object('ok', false, 'error', 'quota : 200 appels par jour');
  end if;

  begin
    if v_action is not null and v_action not in ('resend_password_link', 'relink_slack', 'reread_tiktok', 'recreate', 'kill', 'mark_read',
                                                   'open_payroll', 'open_who_to_fund', 'close', 'postpone') then
      raise exception 'action « % » refusée', v_action;
    end if;
    if v_canal is not null and v_canal not in ('upwork', 'slack') then
      raise exception 'canal « % » refusé', v_canal;
    end if;
    if v_groupe is not null and v_groupe not in ('onboarding', 'nouveaux_actifs', 'actifs') then
      raise exception 'groupe « % » refusé', v_groupe;
    end if;

    if p_action = 'proposer' then
      v_id := (p_args->>'probleme_id')::uuid;
      if coalesce(btrim(p_args->>'reponse'), '') = '' and v_action is null and v_diag is null then
        raise exception 'reponse, action ou diagnostic obligatoire';
      end if;
      update public.problemes
         set proposition_reponse = coalesce(nullif(btrim(p_args->>'reponse'), ''), proposition_reponse),
             canal_reponse = coalesce(v_canal, canal_reponse),
             proposition_action = coalesce(v_action, proposition_action),
             diagnostic = coalesce(v_diag, diagnostic),
             groupe_suggere = coalesce(v_groupe, groupe_suggere),
             propose_par = p_bot, propose_at = now(), maj_at = now(),
             journal = journal || jsonb_build_object('at', now(), 'par', p_bot, 'action', 'proposer',
                                                     'diagnostic', v_diag, 'proposition_action', v_action)
       where id = v_id and statut = 'ouvert';
      if not found then raise exception 'problème introuvable ou fermé'; end if;
    elsif p_action = 'creer' then
      v_poster := nullif(p_args->>'poster_id', '')::uuid;
      v_contrat := nullif(p_args->>'contrat_id', '');
      if v_poster is null and v_contrat is null then raise exception 'poster_id ou contrat_id obligatoire'; end if;
      if v_poster is null then
        select pr.id into v_poster from public.profiles pr where pr.upwork_contract_id = v_contrat limit 1;
      end if;
      if v_poster is null or not exists (select 1 from public.profiles pr where pr.id = v_poster) then
        raise exception 'posteur introuvable';
      end if;
      if coalesce(p_args->>'categorie', '') not in ('stop', 'paie', 'menace', 'hors_plateforme', 'suspect', 'offre_hm_incorrecte',
          'login', 'slack', 'tiktok_setup', 'compte_bloque', 'question_bloquante', 'bug_dashboard', 'contrat_hm',
          'zero_post', 'demande_2e_compte', 'avis_upwork', 'low_views', 'absence', 'autre') then
        raise exception 'catégorie inconnue';
      end if;
      if coalesce(btrim(p_args->>'resume'), '') = '' then raise exception 'resume obligatoire'; end if;
      v_ref := p_bot || ':' || gen_random_uuid()::text;
      v_id := public.probleme_ajouter('bot', v_ref, v_poster, v_contrat, p_args->>'categorie', p_args->>'resume',
                                      p_args->>'texte', now(), nullif(p_args->>'lien', ''), null, p_bot);
      if v_id is not null and (p_args ? 'reponse' or v_action is not null or v_diag is not null or v_groupe is not null) then
        update public.problemes
           set proposition_reponse = coalesce(nullif(btrim(p_args->>'reponse'), ''), proposition_reponse),
               canal_reponse = coalesce(v_canal, canal_reponse), proposition_action = coalesce(v_action, proposition_action),
               diagnostic = coalesce(v_diag, diagnostic), groupe_suggere = coalesce(v_groupe, groupe_suggere),
               propose_par = p_bot, propose_at = now()
         where id = v_id and statut = 'ouvert';
      end if;
    else
      raise exception 'action « % » refusée (proposer ou creer seulement)', p_action;
    end if;
  exception when others then
    v_erreur := sqlerrm;
  end;

  insert into public.bot_appels (bot, action, probleme_id, ok, erreur, args)
  values (p_bot, p_action, v_id, v_erreur is null, v_erreur, p_args);
  return case when v_erreur is null then jsonb_build_object('ok', true, 'probleme_id', v_id)
              else jsonb_build_object('ok', false, 'error', v_erreur) end;
end;
$$;
revoke all on function public.probleme_bot(text, text, jsonb) from public, anon, authenticated;
grant execute on function public.probleme_bot(text, text, jsonb) to service_role;

-- C2. La vue des bots : + groupe, diagnostic, nb_reports, premier_post_at (ajoutées à la fin).
create or replace view public.problemes_ouverts as
select p.id, p.poster_id, p.contrat_id, p.hm, p.categorie, p.niveau, p.resume, p.sources, p.proprietaire,
       p.proposition_reponse, p.canal_reponse, p.proposition_action, p.propose_par, p.propose_at, p.created_at, p.maj_at,
       nullif(btrim(concat_ws(' ', pr.prenom, pr.nom)), '') as nom, pr.cohorte_lundi, pr.is_active,
       jsonb_build_object(
         'connexion', pr.premiere_connexion_at,
         'slack_relie', pr.slack_user_id is not null,
         'warmup_lance', (select min(c.warmup_started_at) from public.comptes c where c.poster_id = p.poster_id and c.is_active),
         'tiktok_trouve', exists (select 1 from public.ckd_warmup_releves w join public.comptes c on c.id = w.compte_id
                                   where c.poster_id = p.poster_id and c.is_active and w.existe)
       ) as etapes,
       (select count(*) from public.passages pa join public.comptes c on c.id = pa.compte_id
         where c.poster_id = p.poster_id and pa.publie_url is not null
           and pa.date_publication_prevue > (now() at time zone 'Europe/Paris')::date - 7) as posts_7j,
       (select coalesce(jsonb_agg(jsonb_build_object('semaine', s.semaine, 'statut', s.statut, 'montant', coalesce(s.montant_corrige, s.montant),
                                                     'paye_at', s.paye_at) order by s.semaine desc), '[]'::jsonb)
          from (select * from public.paie_semaines s where s.poster_id = p.poster_id order by s.semaine desc limit 2) s) as paie,
       (select coalesce(jsonb_agg(jsonb_build_object('at', m.at, 'role', m.role, 'texte', left(m.texte, 300)) order by m.at desc), '[]'::jsonb)
          from (select * from public.upwork_messages m where m.poster_id = p.poster_id order by m.at desc limit 5) m) as messages,
       p.groupe,
       p.diagnostic,
       (select count(distinct x.lundi) from (
          select rr.periode as lundi from public.recrues_rouges rr where rr.poster_id = p.poster_id and rr.decision = 'reporter'
          union
          select d.lundi from public.debut_choix d where d.poster_id = p.poster_id and d.choix = 'reporter') x) as nb_reports,
       (select min(coalesce(pa.publie_at, pa.date_publication_prevue::timestamptz))
          from public.passages pa join public.comptes c on c.id = pa.compte_id
         where c.poster_id = p.poster_id and pa.publie_url is not null) as premier_post_at
  from public.problemes p
  left join public.profiles pr on pr.id = p.poster_id
 where p.statut = 'ouvert';
revoke all on public.problemes_ouverts from public, anon, authenticated;
grant select on public.problemes_ouverts to bots_lecture;

-- ---------------------------------------------------------------------------
-- D. La barre d'onboarding : cohorte en cours et suivante
-- ---------------------------------------------------------------------------
create or replace function public.problemes_onboarding()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_auj date := (now() at time zone 'Europe/Paris')::date;
  v_lundi date := v_auj - (extract(isodow from v_auj)::int - 1);
  v_etapes text[] := array['offre', 'accueil', 'login', 'slack', 'tiktok', 'warmup', 'abonnements', 'pret'];
  v_res jsonb := '[]'::jsonb;
  v_c date;
  v_recrues jsonb;
begin
  if not public.is_admin() then
    raise exception 'problemes_onboarding : réservé à l''admin' using errcode = '42501';
  end if;
  foreach v_c in array array[v_lundi, v_lundi + 7] loop
    with po as (
      select pr.id, nullif(btrim(concat_ws(' ', pr.prenom, pr.nom)), '') as nom, pr.slack_user_id,
             coalesce(pr.premiere_connexion_at, u.last_sign_in_at) as login_at,
             nullif(btrim(concat_ws(' ', m.prenom, m.nom)), '') as hm,
             (select c.id from public.comptes c where c.poster_id = pr.id and c.is_active and coalesce(c.type_compte, 'perso') = 'perso'
               order by c.created_at limit 1) as compte_id
        from public.profiles pr
        left join auth.users u on u.id = pr.id
        left join public.profiles m on m.id = pr.manager_id
       where pr.is_active and pr.cohorte_lundi = v_c
         and exists (select 1 from public.user_roles r where r.user_id = pr.id and r.role = 'poster')
         and not exists (select 1 from public.hub_posteurs h where h.profile_id = pr.id)
    ),
    f as (
      select po.id, po.nom, po.hm, c.pays,
             true as offre,
             (exists (select 1 from public.accueils a where a.poster_id = po.id and a.message_at is not null)
              or exists (select 1 from public.upwork_messages um where um.poster_id = po.id and um.role <> 'posteur')
              or po.login_at is not null) as accueil,
             po.login_at is not null as login,
             po.slack_user_id is not null as slack,
             coalesce(case when c.id is not null then public.compte_tiktok_cree(c.id) end, false) as tiktok,
             c.warmup_started_at is not null as warmup,
             coalesce((select w.abonnements from public.ckd_warmup_releves w where w.compte_id = c.id and w.existe is not null
                        order by w.releve_at desc limit 1), 0) >= 5 as abonnements,
             coalesce(case when c.id is not null then public.compte_pret(c.id) end, false) as pret,
             exists (select 1 from public.passages pa join public.comptes cc on cc.id = pa.compte_id
                      where cc.poster_id = po.id and pa.publie_url is not null) as a_poste,
             (select count(distinct x.lundi) from (
                select rr.periode as lundi from public.recrues_rouges rr where rr.poster_id = po.id and rr.decision = 'reporter'
                union
                select d.lundi from public.debut_choix d where d.poster_id = po.id and d.choix = 'reporter') x) as reports
        from po left join public.comptes c on c.id = po.compte_id
    ),
    g as (
      -- L'étape où la recrue est bloquée : la première non faite (aucune si elle a posté ou est prête).
      select f.*,
             case when f.a_poste then null
                  else (select e from unnest(v_etapes) with ordinality as t(e, i)
                         where not case e when 'offre' then f.offre when 'accueil' then f.accueil when 'login' then f.login
                                          when 'slack' then f.slack when 'tiktok' then f.tiktok when 'warmup' then f.warmup
                                          when 'abonnements' then f.abonnements else f.pret end
                         order by i limit 1) end as bloque
        from f
    ),
    -- Contrats acceptés sans posteur encore (accueil à relier ou à créer) : bloqués à « offre acceptée ».
    sans as (
      select a.contrat_id, nullif(btrim(concat_ws(' ', a.prenom, a.nom)), '') as nom, a.pays
        from public.accueils a
       where a.cohorte_lundi = v_c and a.poster_id is null and a.statut in ('a_relier', 'a_creer', 'erreur')
    )
    select jsonb_build_object(
      'lundi', v_c,
      'total', (select count(*) from g) + (select count(*) from sans),
      'a_poste', (select count(*) from g where a_poste),
      'reports', jsonb_build_object('un', (select count(*) from g where reports = 1), 'deux_plus', (select count(*) from g where reports >= 2)),
      'etapes', (select jsonb_agg(jsonb_build_object(
                   'cle', e,
                   -- Arrivé(e)s à l'étape : toutes les étapes jusqu'à elle faites (ou a posté).
                   'faits', (select count(*) from g where g.bloque is null or array_position(v_etapes, g.bloque) > i),
                   'bloques', coalesce((select jsonb_agg(jsonb_build_object('poster_id', g.id, 'nom', g.nom, 'pays', g.pays, 'hm', g.hm,
                                                                            'reports', g.reports) order by g.nom)
                                          from g where g.bloque = e), '[]'::jsonb)
                              || case when e = 'offre' then coalesce((select jsonb_agg(jsonb_build_object('contrat_id', sans.contrat_id, 'nom', sans.nom,
                                                                                                          'pays', sans.pays, 'reports', 0)) from sans), '[]'::jsonb)
                                      else '[]'::jsonb end) order by i)
                  from unnest(v_etapes) with ordinality as t(e, i))
    ) into v_recrues;
    v_res := v_res || jsonb_build_array(v_recrues);
  end loop;
  return v_res;
end;
$$;
revoke all on function public.problemes_onboarding() from public, anon;
grant execute on function public.problemes_onboarding() to authenticated;

notify pgrst, 'reload schema';
