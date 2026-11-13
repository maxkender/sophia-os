-- 0575 : les posteurs du site (cohorte RUUL, hub_posteurs) sont suivis
-- exactement comme les posteurs Upwork, sauf pour ce qui est propre à Upwork.
--
-- Avant : ~70 fonctions excluaient tout profil présent dans hub_posteurs
-- (« not exists (select 1 from public.hub_posteurs h where h.profile_id = …) »).
-- Maintenant, dans 51 fonctions, la clause n'exclut plus que les comptes de
-- test de l'équipe (hub_posteurs.exclu_suivi, ajoutée et remplie par 0574) :
-- « … where h.profile_id = … and h.exclu_suivi /* 0575 */) ». Les 12 vrais
-- posteurs du site entrent dans l'onboarding et les étapes, le warm-up, les
-- posts, les bots et relances Slack, Problems, les décisions et kills du
-- samedi, le contrôle du lundi soir, les cohortes, le pipeline, la cohérence,
-- les inactifs, les tableaux HM, les pays et la liaison Slack automatique.
--
-- Restent hors RUUL (propre à Upwork, non touché ici) : contexte_cibles_upwork,
-- contrat_termine_arreter, contrats_relier, contrats_relier_noms,
-- contrats_termines_desactiver, liaisons_a_verifier, la règle 8 de
-- coherence_violations (contrat Upwork), les doublons de contrat de needs_you,
-- les compteurs de paie Upwork d'auto_aujourdhui et d'auto_semaine.
-- paie_calculer et paie_calculer_v3 sont traitées par 0574 (lot Ruul à part).
-- Usages légitimes des données du site, non touchés : bonus_donner,
-- bonus_personnes_proches, faq_faits_posteur, hub_enregistrer_identite,
-- hub_ma_cohorte, hub_warmup_jusqu_au_lundi, simulation_*, slack_retrait_ajouter.
--
-- ⚠️ Attention à l'effet : ces posteurs n'ont ni cohorte_lundi ni
-- slack_user_id sur leur profil (l'id Slack est dans hub_posteurs). Les
-- fonctions filtrées sur la cohorte ne les montrent pas tant que
-- profiles.cohorte_lundi n'est pas rempli ; les bots Slack ne leur écrivent
-- pas tant que profiles.slack_user_id n'est pas posé (slack_posteurs et
-- slack_relier_regles, levées ici, peuvent le poser d'elles-mêmes).
--
-- Additif : chaque fonction est patchée en place (pg_get_functiondef +
-- replace), avec contrôle du texte attendu et garde d'idempotence. Aucune
-- donnée modifiée. Dépend de 0574 (colonne hub_posteurs.exclu_suivi).
--
-- Chaque ligne ci-dessous : la fonction, sa signature, et le texte exact de
-- la clause à lever ; on y ajoute « and h.exclu_suivi /* 0575 */ » juste
-- avant la parenthèse fermante (seuls les comptes de test restent exclus).

do $p$
declare
  p text[] := array[
  -- messages du jour, kills en attente, réponses à lire, arrêts à la main (la paie Upwork « a_voir » reste hors RUUL)
  ['auto_aujourdhui', '',
   'not exists (select 1 from public.hub_posteurs h where h.profile_id = y.poster_id)'],
  ['auto_aujourdhui', '',
   'not exists (select 1 from public.hub_posteurs h where h.profile_id = k.poster_id)'],
  ['auto_aujourdhui', '',
   'not exists (select 1 from public.hub_posteurs h where h.profile_id = r.poster_id)'],
  ['auto_aujourdhui', '',
   'not exists (select 1 from public.hub_posteurs h where h.profile_id = ar.poster_id)'],
  -- journal de l'automatisation
  ['auto_journal', 'date, date, text, uuid, integer',
   'not exists (select 1 from public.hub_posteurs h where h.profile_id = u.poster_id)'],
  -- propositions du jeudi et du samedi
  ['ckd_calculer', 'text, date',
   'exists (select 1 from public.hub_posteurs h where h.profile_id = c.poster_id) as ruul'],
  -- comptes de la cohorte (CKD)
  ['ckd_cohorte_comptes', 'date',
   'not exists (select 1 from public.hub_posteurs h where h.profile_id = c.poster_id)'],
  -- HM du CKD
  ['ckd_hms', '',
   'not exists (select 1 from public.hub_posteurs h where h.profile_id = c.poster_id)'],
  -- posts manqués de la semaine
  ['ckd_manques_semaine', 'date',
   'not exists (select 1 from public.hub_posteurs h where h.profile_id = c.poster_id)'],
  -- shadowban
  ['ckd_shadowban_calculer', 'date',
   'not exists (select 1 from public.hub_posteurs h where h.profile_id = c.poster_id)'],
  -- règle 11 « posteur démarré sans compte perso » (la règle 8, contrat Upwork, reste hors RUUL)
  ['coherence_violations', '',
   'and not exists(select 1 from arrets a where a.poster_id=pr.id and a.annule_at is null) and not exists(select 1 from hub_posteurs h where h.profile_id=pr.id)'],
  -- cohortes : prêts
  ['cohorte_prets', 'date[]',
   'not exists (select 1 from public.hub_posteurs h where h.profile_id = po.id)'],
  -- cohortes : recrues
  ['cohorte_recrues', 'date[]',
   'not exists (select 1 from public.hub_posteurs h where h.profile_id = pr.id)'],
  -- liste des cohortes
  ['cohortes_liste', '',
   'not exists (select 1 from public.hub_posteurs h where h.profile_id = pr.id)'],
  -- tableau des cohortes : posts
  ['cohortes_postes', 'date',
   'not exists (select 1 from public.hub_posteurs h where h.profile_id = pr.id)'],
  -- tableau des cohortes : vues
  ['cohortes_vues', 'date',
   'not exists (select 1 from public.hub_posteurs h where h.profile_id = pr.id)'],
  -- demandes d'arrêt (relances coupées, Kill pré-coché)
  ['demande_arret_noter', 'uuid, text, text, uuid',
   'exists (select 1 from public.hub_posteurs h where h.profile_id = p_poster)'],
  -- arrêt à la désactivation (manage-users)
  ['desactivation_arret', 'uuid, boolean, uuid',
   'exists (select 1 from public.hub_posteurs h where h.profile_id = p_poster)'],
  -- étapes des recrues (v1)
  ['etapes_recrues', '',
   'not exists (select 1 from public.hub_posteurs h where h.profile_id = pr.id)'],
  -- étapes des recrues et 2es comptes
  ['etapes_recrues_v2', '',
   'not exists (select 1 from public.hub_posteurs h where h.profile_id = c.poster_id)'],
  ['etapes_recrues_v2', '',
   'not exists (select 1 from public.hub_posteurs h where h.profile_id = pr.id)'],
  -- @ TikTok introuvables
  ['handles_introuvables', '',
   'not exists (select 1 from public.hub_posteurs h where h.profile_id = c.poster_id)'],
  -- tableau HM : anciens
  ['hm_anciens', 'uuid',
   'not exists (select 1 from public.hub_posteurs h where h.profile_id = c.poster_id)'],
  -- tableau HM : comptes de la semaine
  ['hm_comptes_semaine', 'date',
   'not exists (select 1 from public.hub_posteurs h where h.profile_id = c.poster_id)'],
  -- export HM
  ['hm_export_donnees', 'date, date, uuid',
   'not exists (select 1 from public.hub_posteurs h where h.profile_id = c.poster_id)'],
  -- inactifs après le nudge du jeudi
  ['inactifs_calculer', '',
   'not exists (select 1 from public.hub_posteurs h where h.profile_id = m.poster_id)'],
  -- liens de posts introuvables
  ['liens_introuvables_a_prevenir', '',
   'not exists (select 1 from public.hub_posteurs h where h.profile_id = c.poster_id)'],
  -- contrôle du lundi soir (message et kill auto)
  ['lundi_soir_posteurs', 'date',
   'not exists (select 1 from public.hub_posteurs h where h.profile_id = ca.poster_id)'],
  -- profils en double (Slack ; un contrat RUUL est vide)
  ['messages_doublons', '',
   'not exists (select 1 from public.hub_posteurs h where h.profile_id = p.id)'],
  -- journal des messages envoyés
  ['messages_envoyes', 'timestamp with time zone',
   'not exists (select 1 from public.hub_posteurs h where h.profile_id = m.poster_id)'],
  -- profils en double sur le même Slack (les doublons de contrat Upwork restent hors RUUL)
  ['needs_you', '',
   'not exists (select 1 from public.hub_posteurs h where h.profile_id = po.id)' || E'\n' || '     group by po.slack_user_id'],
  -- cibles des nudges
  ['nudge_cibles', 'text, uuid',
   'not exists (select 1 from public.hub_posteurs h where h.profile_id = c.poster_id)'],
  -- pays de l'onboarding
  ['onboarding_pays', '',
   'not exists (select 1 from hub_posteurs h where h.profile_id = pr.id)'],
  -- tableau des pays
  ['pays_tableau', '',
   'not exists (select 1 from public.hub_posteurs h where h.profile_id = pr.id)'],
  -- pipeline des recrues
  ['pipeline_recrues', '',
   'not exists (select 1 from public.hub_posteurs h where h.profile_id = pr.id)'],
  ['pipeline_recrues', '',
   'not exists (select 1 from public.hub_posteurs h where h.profile_id = c.poster_id)'],
  -- prêt pour lundi
  ['pret_lundi', '',
   'not exists (select 1 from public.hub_posteurs h where h.profile_id = p.id)'],
  -- cartes Problems (plus d'archivage « RUUL (exclu) »)
  ['probleme_ajouter', 'text, text, uuid, text, text, text, text, timestamp with time zone, text, text, text',
   'exists (select 1 from public.hub_posteurs h where h.profile_id = p_poster)'],
  -- lecture des bots Problems
  ['probleme_bot_lire', 'text, uuid',
   'not exists (select 1 from public.hub_posteurs h where h.profile_id = pr.id)'],
  -- Problems de l'onboarding
  ['problemes_onboarding', '',
   'not exists (select 1 from public.hub_posteurs h where h.profile_id = pr.id)'],
  -- cibles de recrutement par pays
  ['recrutement_cibles', 'date',
   'not exists (select 1 from public.hub_posteurs h where h.profile_id = pr.id)'],
  -- relances du mercredi
  ['relances_mercredi', 'date',
   'not exists (select 1 from public.hub_posteurs h where h.profile_id = pr.id)'],
  -- relances des recrues
  ['relances_recrues', '',
   'not exists (select 1 from public.hub_posteurs h where h.profile_id = pr.id)'],
  -- couverture du samedi (plus de catégorie « ruul »)
  ['samedi_couverture', 'date',
   'exists (select 1 from public.hub_posteurs h where h.profile_id = pr.id)'],
  -- forçages du samedi
  ['samedi_forces', 'date',
   'not exists (select 1 from public.hub_posteurs h where h.profile_id = f.poster_id)'],
  -- reports du samedi
  ['samedi_reports', 'date',
   'not exists (select 1 from public.hub_posteurs h where h.profile_id = pr.id)'],
  -- décisions du samedi : comptes
  ['semaine_comptes', 'date, date',
   'not exists (select 1 from public.hub_posteurs h where h.profile_id = c.poster_id)'],
  -- décisions du samedi : extras
  ['semaine_extras', 'date',
   'not exists (select 1 from public.hub_posteurs h where h.profile_id = pr.id)'],
  -- messages de la semaine (recrues-check)
  ['semaine_posteurs', 'date',
   'not exists (select 1 from public.hub_posteurs h where h.profile_id = pr.id)'],
  -- posts de la semaine par compte
  ['semaine_posts_comptes', 'date, date',
   'not exists (select 1 from public.hub_posteurs h where h.profile_id = c.poster_id)'],
  -- message dans #poster-pause → demande d'arrêt
  ['slack_message_pause', '',
   'not exists (select 1 from public.hub_posteurs h where h.profile_id = p.id)'],
  -- liaison Slack automatique (slack-relier)
  ['slack_posteurs', '',
   'not exists (select 1 from public.hub_posteurs h where h.profile_id = pr.id)'],
  -- liaison Slack par le nom
  ['slack_relier_regles', 'uuid',
   'not exists (select 1 from public.hub_posteurs h where h.profile_id = pr.id)'],
  -- contexte du check warm-up
  ['warmup_check_contexte', 'date',
   'not exists (select 1 from public.hub_posteurs h where h.profile_id = pr.id)'],
  -- liste du check warm-up
  ['warmup_check_liste', 'date',
   'not exists (select 1 from public.hub_posteurs h where h.profile_id = pr.id)'],
  -- warm-up pas fini avant le lundi de cohorte
  ['warmup_pas_avant_cohorte', '',
   'exists (select 1 from public.hub_posteurs h where h.profile_id = new.poster_id)']
  ];
  f record;
  r record;
  d text;
  apres text;
begin
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'hub_posteurs' and column_name = 'exclu_suivi') then
    raise exception '0575 : hub_posteurs.exclu_suivi absente, appliquer 0574 d''abord';
  end if;
  for f in
    select distinct p[i][1] as fn, p[i][2] as sig from generate_subscripts(p, 1) as i order by 1
  loop
    d := pg_get_functiondef(format('public.%s(%s)', f.fn, f.sig)::regprocedure);
    if position('0575' in d) > 0 then
      raise notice '0575 : % déjà patchée, rien à faire', f.fn;
      continue;
    end if;
    for r in
      select p[i][3] as avant from generate_subscripts(p, 1) as i where p[i][1] = f.fn order by i
    loop
      apres := regexp_replace(r.avant, '(hub_posteurs h where h\.profile_id ?= ?[a-z_.]+)\)',
                              '\1 and h.exclu_suivi /* 0575 */)');
      if position(r.avant in d) = 0 or apres = r.avant then
        raise exception '0575 : % ne correspond pas', f.fn;
      end if;
      d := replace(d, r.avant, apres);
    end loop;
    execute d;
  end loop;
end
$p$;
