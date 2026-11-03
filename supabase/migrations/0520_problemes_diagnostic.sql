-- 0520 — Page Problèmes : une carte = un diagnostic (03/11).
--
-- 1. probleme_situation(poster) : ce que l'OS sait du posteur, calculé à chaque
--    lecture : pays, posts avec lien cette semaine / attendus, étapes (login,
--    Slack, TikTok, warm-up), paie de la semaine passée (payée ? combien ?
--    quand ?), semaine en cours (milestones financés, nom et montant, lus chez
--    Upwork), son dernier message (hors bruit) et s'il attend une réponse.
-- 2. problemes_recalculer() :
--    - une carte paie se ferme quand la semaine passée est payée (à la main ou
--      par l'API, ou rien à payer) ET qu'un milestone non payé du bon montant
--      est financé pour la semaine en cours, QUEL QUE SOIT SON NOM ;
--    - une carte paie d'un posteur désactivé au contrat fermé se ferme ;
--    - « autre » sans message en attente : pas de problème précis, fermée ;
--    - le niveau est recalculé (sauf « Samedi » posé à la main) : Urgent = STOP,
--      menace, hors plateforme, offre HM incorrecte, paie avec plainte (ou le
--      lundi), bloqué(e) qui l'a écrit ; un écart de paie sans plainte =
--      Samedi ; Today = un posteur qui attend une réponse ou un geste ; le
--      reste = Samedi.
-- 3. problemes_actualiser() = collecte (0517) puis recalcul ; le cron de 0517
--    l'appelle désormais, et la page aussi à chaque ouverture.
-- 4. problemes_liste : chaque carte porte sa situation.
--
-- Additif : des fonctions, un cron modifié (commande). Aucune donnée existante
-- touchée hors de la table problemes (statut et niveau des cartes ouvertes).

-- Un message qui attend une réponse : une question ou un blocage, pas un accusé de réception.
create or replace function public.probleme_attend_reponse(p_texte text)
returns boolean
language sql
immutable
as $$
  select coalesce(p_texte, '') ~ '\?'
      or lower(coalesce(p_texte, '')) ~ ('(help|can.?t|cannot|unable|problem|issue|error|not working|doesn.?t work|does not work|'
         || 'how (do|can|should|to)|when (will|do|should|can)|why |please (check|help|confirm|tell|let me know|advise)|waiting for|'
         || 'still (not|no|haven|waiting)|didn.?t (receive|get)|haven.?t (received|got|been)|not (received|paid)|'
         || '\mpay|\mpaid|payment|milestone|\mstop\M|quit|cancel|end (the|my) contract|wrong|missing|blocked|banned|suspended)');
$$;

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
    'a_ecrit', v_a_ecrit
  );
end;
$$;
revoke all on function public.probleme_situation(uuid) from public, anon, authenticated;

create or replace function public.probleme_niveau_calc(p_categorie text, p_a_ecrit boolean, p_devrait boolean, p_actif boolean, p_lundi boolean, p_os boolean)
returns text
language sql
immutable
as $$
  select case
    when p_categorie in ('stop', 'menace', 'hors_plateforme', 'suspect', 'offre_hm_incorrecte') then 'urgent'
    when p_categorie = 'paie' and (p_a_ecrit or p_lundi) then 'urgent'
    when p_categorie in ('login', 'compte_bloque', 'bug_dashboard', 'tiktok_setup', 'slack') and p_a_ecrit and p_devrait then 'urgent'
    when p_categorie = 'paie' then 'samedi'
    -- Un posteur désactivé n'attend plus rien de nous (retirer de Slack, relances) : samedi.
    when not p_actif then 'samedi'
    when p_a_ecrit then 'aujourdhui'
    -- Un geste à faire de notre côté (signalé par l'OS : Needs you, accueil) sur un posteur actif.
    when p_actif and p_os and p_categorie in ('accueil', 'login', 'slack', 'tiktok_setup', 'question_bloquante', 'compte_bloque', 'bug_dashboard') then 'aujourdhui'
    else 'samedi'
  end;
$$;

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
  n_fermes int := 0;
  n_niveaux int := 0;
  v_fin jsonb;
  v_os boolean;
begin
  if coalesce(auth.role(), '') not in ('', 'service_role') and not public.is_admin() then
    raise exception 'problemes_recalculer : réservé à l''admin' using errcode = '42501';
  end if;
  for r in select p.id, p.poster_id, p.categorie, p.niveau, p.niveau_force, p.sources from public.problemes p where p.statut = 'ouvert' loop
    s := case when r.poster_id is not null then public.probleme_situation(r.poster_id) end;
    v_os := exists (select 1 from jsonb_array_elements(r.sources) x where x->>'type' not in ('reponse', 'slack', 'bot'));
    v_raison := null;
    if r.categorie = 'paie' and s is not null and coalesce((s->>'paye_passee')::boolean, false) and coalesce((s->>'finance_ok')::boolean, false) then
      select f into v_fin from jsonb_array_elements(s->'finances') f
       where abs((f->>'montant')::numeric - (s->>'attendu_semaine')::numeric) < 0.01 limit 1;
      v_raison := 'paie : semaine du ' || to_char((s->'paie_passee'->>'semaine')::date, 'DD/MM') || ' payée, « '
                  || coalesce(v_fin->>'nom', '?') || ' » financé à ' || (v_fin->>'montant') || ' $ pour la semaine en cours';
    elsif r.categorie = 'paie' and s is not null and not coalesce((s->>'actif')::boolean, true) and not coalesce((s->>'contrat_actif')::boolean, false) then
      v_raison := 'paie : posteur désactivé, contrat fermé';
    elsif not v_os and not coalesce((s->>'a_ecrit')::boolean, false)
          and r.categorie not in ('paie', 'stop', 'menace', 'hors_plateforme', 'suspect', 'offre_hm_incorrecte') then
      -- Seulement des messages, dont le dernier ne demande rien (merci, c'est fait, j'ai compris) : pas de carte.
      v_raison := 'pas de demande en attente (dernier message sans question ni blocage)';
    end if;
    if v_raison is not null then
      update public.problemes set statut = 'ferme_auto', ferme_raison = v_raison, ferme_at = now(), maj_at = now() where id = r.id;
      n_fermes := n_fermes + 1;
      continue;
    end if;
    if not r.niveau_force then
      v_niveau := public.probleme_niveau_calc(r.categorie, coalesce((s->>'a_ecrit')::boolean, false),
                    coalesce((s->>'devrait_poster')::boolean, false), coalesce((s->>'actif')::boolean, true), v_lundi, v_os);
      if v_niveau <> r.niveau then
        update public.problemes set niveau = v_niveau, maj_at = now() where id = r.id;
        n_niveaux := n_niveaux + 1;
      end if;
    end if;
  end loop;
  return jsonb_build_object('fermes', n_fermes, 'niveaux_changes', n_niveaux,
    'ouverts', (select jsonb_object_agg(niveau, n) from (select niveau, count(*) n from public.problemes where statut = 'ouvert' group by 1) x));
end;
$$;
revoke all on function public.problemes_recalculer() from public, anon;
grant execute on function public.problemes_recalculer() to authenticated;

create or replace function public.problemes_actualiser()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_passage jsonb;
begin
  if coalesce(auth.role(), '') not in ('', 'service_role') and not public.is_admin() then
    raise exception 'problemes_actualiser : réservé à l''admin' using errcode = '42501';
  end if;
  v_passage := public.problemes_passage();
  return jsonb_build_object('passage', v_passage, 'recalcul', public.problemes_recalculer());
end;
$$;
revoke all on function public.problemes_actualiser() from public, anon;
grant execute on function public.problemes_actualiser() to authenticated;

-- La liste : chaque carte avec sa situation.
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

-- Le cron de 0517 : collecte puis recalcul.
do $c$
declare
  v_id bigint;
begin
  select jobid into v_id from cron.job where jobname = 'problemes-passage';
  if v_id is not null then
    perform cron.alter_job(v_id, command := 'select public.problemes_actualiser()');
  end if;
end
$c$;

notify pgrst, 'reload schema';
