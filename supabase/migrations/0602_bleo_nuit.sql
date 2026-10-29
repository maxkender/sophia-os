-- 0602 : BLEO, les calculs de la nuit (docs/bleo.md, A1 à A5 ; lot L2).
--
-- AJOUT SEULEMENT : n'écrit que les colonnes et tables neuves de 0600
-- (`passages.r`, `passages.r_calcule_le`, `contenus.*` BLEO, `bleo_*`). Les
-- triggers de `passages` ne portent que sur statut, publie_url, publie_at et
-- application_id : écrire r ne déclenche rien.
--
-- Écart assumé avec la spec : `bleo-nuit` est une fonction SQL appelée par
-- pg_cron, pas une fonction Edge. Tout est ensembliste (des milliers de lignes),
-- une transaction, et aucun bundle Edge à déployer.
--
-- Pas encore ici : fermetures et boîte (A9), jauge (A10), commandes de langue
-- (P4), `bleo_mix`, valeurs par défaut mesurées (`bleo_classes`, lundi). Elles
-- ne servent pas au tirage à blanc.
--
--   bleo_rattacher_nouveaux()  A2 pour les contenus validés depuis 0601
--   bleo_nuit(p_forcer)        A2, A1, A3, A4, A5, journal dans bleo_nuits
--   bleo_nuit_cron()           garde de l'heure de Paris, attente du relevé de nuit

set lock_timeout = '5s';

create table if not exists public.bleo_nuits (
  jour date primary key,
  demarre_le timestamptz not null default now(),
  fini_le timestamptz,
  resume jsonb,
  erreur text
);
comment on table public.bleo_nuits is 'BLEO : une ligne par passage de bleo_nuit() (A1 à A5), avec son résumé.';
alter table public.bleo_nuits enable row level security;
create policy bleo_nuits_admin on public.bleo_nuits for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
grant select, insert, update, delete on public.bleo_nuits to authenticated;
grant all on public.bleo_nuits to service_role;

-- ---------------------------------------------------------------------------
-- A2 · rattacher à leur famille les contenus validés qui n'en ont pas encore
-- ---------------------------------------------------------------------------
-- Même règle que 0601, avec les types de BLEO :
--   * déclinaison déclarée au dépôt (`pod_livraisons.parent_contenu_id`) :
--     famille du parent, génération + 1, jugée d'office si la famille l'est ;
--   * accroche déjà connue dans le label : `reprise` (ou `remake` pour un
--     livré), jugée d'office si la famille a un verdict, sinon en attente sans
--     test (on ne teste pas deux fois la même accroche) ;
--   * sinon une famille neuve : `import`, `full_test` (original de podz) ou
--     `remake` (livré), à juger.
create or replace function public.bleo_rattacher_nouveaux()
returns integer
language plpgsql
set search_path to 'public'
as $$
declare
  n integer := 0;
  k integer;
begin
  -- a. Déclinaisons déclarées au dépôt.
  update contenus c
     set famille_id = p.famille_id,
         generation = least(coalesce(p.generation, 0) + 1, 2),
         parent_bleo_id = p.id,
         type_bleo = 'declinaison',
         classe_defaut = 'accroche_gagnante',
         etat_bleo = case when f.verdict <> 'en_attente' then 'juge' else 'a_juger' end,
         juge_le = case when f.verdict <> 'en_attente' then now() end,
         verdict = 'en_attente'
    from pod_livraisons pl
    join contenus p on p.id = pl.parent_contenu_id
    join bleo_familles f on f.id = p.famille_id
   where pl.contenu_id = c.id and c.statut = 'valide' and c.famille_id is null;
  get diagnostics k = row_count; n := n + k;

  -- b. Accroche déjà portée par un contenu du même label.
  with a as (
    select c.id, cl.label_id, c.accroche_norm,
           c.livre and coalesce(c.tier_rapport->>'origine', '') <> 'pod_original' as est_livre
      from contenus c
      join lateral (select l.label_id from contenu_labels l where l.contenu_id = c.id
                     order by l.label_id limit 1) cl on true
     where c.statut = 'valide' and c.famille_id is null and c.accroche_norm is not null
  ),
  m as (
    select distinct on (a.id) a.id, a.est_livre, c2.famille_id
      from a
      join contenus c2 on c2.accroche_norm = a.accroche_norm and c2.famille_id is not null and c2.id <> a.id
      join contenu_labels l2 on l2.contenu_id = c2.id and l2.label_id = a.label_id
     order by a.id, c2.created_at
  )
  update contenus c
     set famille_id = m.famille_id,
         generation = 0,
         type_bleo = case when m.est_livre then 'remake' else 'reprise' end,
         classe_defaut = case when m.est_livre then 'livre'
                              when f.verdict = 'gagnante' then 'accroche_gagnante'
                              when f.verdict = 'non_gagnante' then 'accroche_non_gagnante'
                              else 'import' end,
         etat_bleo = case when not m.est_livre and f.verdict <> 'en_attente' then 'juge' else 'a_juger' end,
         juge_le = case when not m.est_livre and f.verdict <> 'en_attente' then now() end,
         verdict = 'en_attente'
    from m
    join bleo_familles f on f.id = m.famille_id
   where c.id = m.id;
  get diagnostics k = row_count; n := n + k;

  -- c. Familles neuves : une par (label, accroche), la racine est la plus ancienne ;
  --    un contenu sans accroche est sa propre famille.
  with a as (
    select c.id, cl.label_id, c.accroche_norm, c.created_at
      from contenus c
      join lateral (select l.label_id from contenu_labels l where l.contenu_id = c.id
                     order by l.label_id limit 1) cl on true
     where c.statut = 'valide' and c.famille_id is null
  )
  insert into bleo_familles (label_id, accroche_norm, racine_contenu_id)
  select distinct on (label_id, accroche_norm) label_id, accroche_norm, id
    from a
   where accroche_norm is not null
   order by label_id, accroche_norm, created_at, id
  on conflict (label_id, accroche_norm) where accroche_norm is not null do nothing;

  with a as (
    select c.id, cl.label_id
      from contenus c
      join lateral (select l.label_id from contenu_labels l where l.contenu_id = c.id
                     order by l.label_id limit 1) cl on true
     where c.statut = 'valide' and c.famille_id is null and c.accroche_norm is null
  )
  insert into bleo_familles (label_id, accroche_norm, racine_contenu_id)
  select label_id, null, id from a;

  with a as (
    select c.id, cl.label_id, c.accroche_norm
      from contenus c
      join lateral (select l.label_id from contenu_labels l where l.contenu_id = c.id
                     order by l.label_id limit 1) cl on true
     where c.statut = 'valide' and c.famille_id is null
  ),
  f as (
    select a.id, coalesce(fr.id, fa.id) as famille_id, coalesce(fr.racine_contenu_id, fa.racine_contenu_id) as racine
      from a
      left join bleo_familles fr on fr.racine_contenu_id = a.id
      left join bleo_familles fa on fa.label_id = a.label_id and fa.accroche_norm = a.accroche_norm
  )
  update contenus c
     set famille_id = f.famille_id,
         generation = 0,
         type_bleo = case when f.racine <> c.id then 'reprise'
                          when c.livre and coalesce(c.tier_rapport->>'origine', '') <> 'pod_original' then 'remake'
                          when c.pod is not null then 'full_test'
                          else 'import' end,
         classe_defaut = case when f.racine <> c.id then 'import'
                              when c.livre and coalesce(c.tier_rapport->>'origine', '') <> 'pod_original' then 'livre'
                              when c.pod is not null then 'podz'
                              else 'import' end,
         etat_bleo = 'a_juger',
         verdict = 'en_attente'
    from f
   where c.id = f.id and f.famille_id is not null;
  get diagnostics k = row_count; n := n + k;

  return n;
end;
$$;

-- ---------------------------------------------------------------------------
-- La nuit : A2, A1, A3, A4, A5. Une transaction ; un résumé dans bleo_nuits.
-- ---------------------------------------------------------------------------
create or replace function public.bleo_nuit(p_forcer boolean default false)
returns jsonb
language plpgsql
set search_path to 'public'
as $$
declare
  reg jsonb;
  v_jour date := (now() at time zone 'Europe/Paris')::date;
  v_debut timestamptz := clock_timestamp();
  v_maturite interval;
  v_fenetre interval;
  v_plafond numeric;
  v_seuil_vues numeric;
  v_seuil_r numeric;
  v_min_non_gagnant integer;
  v_k numeric;
  v_fatigue_post numeric;
  v_fatigue_accroche numeric;
  v_age interval;
  v_age_facteur numeric;
  v_sortie_vues numeric;
  v_attente_un interval;
  v_rattaches integer;
  v_r integer;
  v_familles integer;
  v_contenus integer;
  v_juges integer := 0;
  v_valeurs integer;
  k integer;
  v_resume jsonb;
begin
  select valeur into reg from reglages where cle = 'bleo';
  if reg is null then
    raise exception 'reglages.bleo absent';
  end if;
  if not p_forcer and exists (select 1 from bleo_nuits where jour = v_jour and fini_le is not null) then
    return jsonb_build_object('jour', v_jour, 'deja', true);
  end if;

  v_maturite := make_interval(hours => (reg->'mesure'->>'maturite_heures')::int);
  v_fenetre := make_interval(days => (reg->'mesure'->>'fenetre_initiale_jours')::int);
  v_plafond := (reg->'mesure'->>'r_plafond')::numeric;
  v_seuil_vues := (reg->'verdict'->>'vues')::numeric;
  v_seuil_r := (reg->'verdict'->>'r')::numeric;
  v_min_non_gagnant := (reg->'verdict'->>'passages_min_non_gagnant')::int;
  v_k := (reg->'forme'->>'k')::numeric;
  v_fatigue_post := (reg->'valeur'->>'fatigue_post')::numeric;
  v_fatigue_accroche := (reg->'valeur'->>'fatigue_accroche')::numeric;
  v_age := make_interval(days => (reg->'valeur'->>'age_jours')::int);
  v_age_facteur := (reg->'valeur'->>'age_facteur')::numeric;
  v_sortie_vues := (reg->'file_juger'->>'sortie_j2_vues')::numeric;
  v_attente_un := make_interval(days => (reg->'file_juger'->>'attente_un_passage_jours')::int);

  insert into bleo_nuits (jour, demarre_le) values (v_jour, v_debut)
  on conflict (jour) do update set demarre_le = excluded.demarre_le, fini_le = null, resume = null, erreur = null;

  -- A2 · familles des contenus validés depuis le dernier passage.
  v_rattaches := bleo_rattacher_nouveaux();

  -- A1 · r des passages mûrs dont les vues ont changé, médiane du compte du jour.
  update passages p
     set r = p.vues::numeric / m.mediane,
         r_calcule_le = now()
    from bleo_mediane_compte m
   where m.compte_id = p.compte_id and m.mediane > 0
     and p.statut = 'publie' and not coalesce(p.est_rappel, false) and p.vues is not null
     and p.publie_at <= now() - v_maturite and p.publie_at >= now() - v_fenetre
     and (p.r_calcule_le is null or p.stats_maj_at > p.r_calcule_le);
  get diagnostics v_r = row_count;

  -- A3 · verdict d'accroche (famille) ; « gagnante » est définitif.
  with mes as (
    select c.famille_id, p.vues, p.r
      from passages p
      join contenus c on c.id = p.contenu_id
     where c.famille_id is not null
       and p.statut = 'publie' and not coalesce(p.est_rappel, false) and p.vues is not null
       and p.publie_at <= now() - v_maturite
  ),
  v as (
    select famille_id,
           bool_or(vues >= v_seuil_vues or coalesce(r, 0) >= v_seuil_r) as gagne,
           count(r) as n_r
      from mes group by famille_id
  )
  update bleo_familles f
     set verdict = case when v.gagne then 'gagnante'
                        when v.n_r >= v_min_non_gagnant then 'non_gagnante'
                        else 'en_attente' end,
         verdict_le = case when v.gagne then now() else f.verdict_le end
    from v
   where v.famille_id = f.id and f.verdict <> 'gagnante'
     and f.verdict <> case when v.gagne then 'gagnante'
                           when v.n_r >= v_min_non_gagnant then 'non_gagnante'
                           else 'en_attente' end;
  get diagnostics v_familles = row_count;

  -- A3 · le même test au niveau du contenu (sert à la génération 2).
  with mes as (
    select p.contenu_id,
           bool_or(p.vues >= v_seuil_vues or coalesce(p.r, 0) >= v_seuil_r) as gagne,
           count(p.r) as n_r
      from passages p
     where p.statut = 'publie' and not coalesce(p.est_rappel, false) and p.vues is not null
       and p.publie_at <= now() - v_maturite
     group by p.contenu_id
  )
  update contenus c
     set verdict = case when mes.gagne then 'gagnant'
                        when mes.n_r >= v_min_non_gagnant then 'non_gagnant'
                        else 'en_attente' end
    from mes
   where mes.contenu_id = c.id and c.famille_id is not null
     and coalesce(c.verdict, 'en_attente') <> 'gagnant'
     and coalesce(c.verdict, 'en_attente') <> case when mes.gagne then 'gagnant'
                                                   when mes.n_r >= v_min_non_gagnant then 'non_gagnant'
                                                   else 'en_attente' end;
  get diagnostics v_contenus = row_count;

  -- A4 · sorties de « à juger » et « en test » (règle générale : 2 passages mûrs avec un r).
  update contenus c
     set etat_bleo = 'juge', juge_le = now()
    from (select p.contenu_id
            from passages p
           where p.statut = 'publie' and not coalesce(p.est_rappel, false)
             and p.r is not null and p.publie_at <= now() - v_maturite
           group by p.contenu_id
          having count(*) >= 2) x
   where x.contenu_id = c.id and c.etat_bleo in ('a_juger', 'en_test');
  get diagnostics k = row_count; v_juges := v_juges + k;

  -- Un passage à 10 000 vues ou plus suffit à juger (sortie de J+2).
  update contenus c
     set etat_bleo = 'juge', juge_le = now()
    from (select distinct p.contenu_id
            from passages p
           where p.statut = 'publie' and not coalesce(p.est_rappel, false)
             and p.vues >= v_sortie_vues) x
   where x.contenu_id = c.id and c.etat_bleo in ('a_juger', 'en_test');
  get diagnostics k = row_count; v_juges := v_juges + k;

  -- Reprise ou déclinaison d'une famille qui a reçu son verdict : jugée d'office.
  update contenus c
     set etat_bleo = 'juge', juge_le = now()
    from bleo_familles f
   where f.id = c.famille_id and f.verdict <> 'en_attente'
     and f.racine_contenu_id is distinct from c.id
     and c.etat_bleo = 'a_juger' and c.statut = 'valide';
  get diagnostics k = row_count; v_juges := v_juges + k;

  -- En test avec un seul passage depuis 7 jours.
  update contenus c
     set etat_bleo = 'juge', juge_le = now()
    from (select p.contenu_id
            from passages p
           where p.statut in ('assigne', 'valide_par_poster', 'publie')
           group by p.contenu_id
          having count(*) = 1 and min(p.date_publication_prevue) <= (now() - v_attente_un)::date) x
   where x.contenu_id = c.id and c.etat_bleo = 'en_test';
  get diagnostics k = row_count; v_juges := v_juges + k;

  -- A5 · forme et valeur attendue par contenu × langue des comptes actifs de ses labels.
  delete from bleo_valeurs where calcule_le < v_debut;

  with langues as (
    select distinct cl.label_id, co.langue
      from compte_labels cl
      join comptes co on co.id = cl.compte_id
     where co.is_active and co.langue is not null
  ),
  cand as (
    select c.id as contenu_id, l.langue, c.created_at, c.famille_id,
           coalesce((reg->'classes'->'depart'->>c.classe_defaut)::numeric,
                    (reg->'classes'->'depart'->>'import')::numeric) as defaut
      from contenus c
      join contenu_labels lab on lab.contenu_id = c.id
      join langues l on l.label_id = lab.label_id
     where c.statut = 'valide' and c.famille_id is not null
  ),
  rs as (
    select p.contenu_id, count(*) as n_r, sum(least(p.r, v_plafond)) as somme
      from passages p
     where p.statut = 'publie' and not coalesce(p.est_rappel, false)
       and p.r is not null and p.publie_at <= now() - v_maturite
     group by p.contenu_id
  ),
  exp as (
    select p.contenu_id, p.langue, count(*) as n
      from passages p
     where p.statut in ('assigne', 'valide_par_poster', 'publie')
     group by p.contenu_id, p.langue
  ),
  fam as (
    select c.famille_id, e.langue, sum(e.n) as n
      from exp e join contenus c on c.id = e.contenu_id
     where c.famille_id is not null
     group by c.famille_id, e.langue
  ),
  calc as (
    select cand.contenu_id, cand.langue, cand.defaut,
           coalesce(rs.n_r, 0) as n_r,
           (v_k * cand.defaut + coalesce(rs.somme, 0)) / (v_k + coalesce(rs.n_r, 0)) as forme,
           coalesce(e.n, 0) as n_post,
           coalesce(fam.n, 0) - coalesce(e.n, 0) as n_accroche,
           case when cand.created_at < now() - v_age then v_age_facteur else 1 end as facteur_age
      from cand
      left join rs on rs.contenu_id = cand.contenu_id
      left join exp e on e.contenu_id = cand.contenu_id and e.langue = cand.langue
      left join fam on fam.famille_id = cand.famille_id and fam.langue = cand.langue
  )
  insert into bleo_valeurs (contenu_id, langue, forme, defaut, n_r, n_post, n_accroche, facteur_age, valeur, calcule_le)
  select contenu_id, langue, forme, defaut, n_r, n_post, n_accroche, facteur_age,
         forme * power(v_fatigue_post, n_post) * power(v_fatigue_accroche, n_accroche) * facteur_age,
         v_debut
    from calc
  on conflict (contenu_id, langue) do update
     set forme = excluded.forme, defaut = excluded.defaut, n_r = excluded.n_r, n_post = excluded.n_post,
         n_accroche = excluded.n_accroche, facteur_age = excluded.facteur_age, valeur = excluded.valeur,
         calcule_le = excluded.calcule_le;
  get diagnostics v_valeurs = row_count;

  v_resume := jsonb_build_object(
    'jour', v_jour,
    'rattaches', v_rattaches,
    'r_calcules', v_r,
    'familles_changees', v_familles,
    'contenus_verdict_change', v_contenus,
    'juges', v_juges,
    'valeurs', v_valeurs,
    'etats', (select jsonb_object_agg(e, n) from (select etat_bleo e, count(*) n from contenus
                                                   where statut = 'valide' and etat_bleo is not null group by 1) z),
    'verdicts_familles', (select jsonb_object_agg(verdict, n) from (select verdict, count(*) n from bleo_familles group by 1) z),
    'duree_s', round(extract(epoch from clock_timestamp() - v_debut)::numeric, 1)
  );
  update bleo_nuits set fini_le = clock_timestamp(), resume = v_resume where jour = v_jour;
  return v_resume;
end;
$$;

revoke execute on function public.bleo_nuit(boolean) from public, anon, authenticated;
revoke execute on function public.bleo_rattacher_nouveaux() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Le cron : 05 h 15 heure de Paris, réessai toutes les 10 min tant que le relevé
-- de nuit (`reglages.elo_dernier_run`) n'est pas fini, et calcul quand même à
-- 05 h 45 (signalé dans le résumé). Rien si `bleo.mode = off`.
-- ---------------------------------------------------------------------------
create or replace function public.bleo_nuit_cron()
returns jsonb
language plpgsql
set search_path to 'public'
as $$
declare
  v_paris timestamp := now() at time zone 'Europe/Paris';
  v_jour date := (now() at time zone 'Europe/Paris')::date;
  v_mode text;
  elo jsonb;
  v_releve_fini boolean;
begin
  select valeur->>'mode' into v_mode from reglages where cle = 'bleo';
  if coalesce(v_mode, 'off') = 'off' then
    return jsonb_build_object('ignore', 'mode off');
  end if;
  if extract(hour from v_paris) <> 5 then
    return jsonb_build_object('ignore', 'hors heure');
  end if;
  if exists (select 1 from bleo_nuits where jour = v_jour and fini_le is not null) then
    return jsonb_build_object('jour', v_jour, 'deja', true);
  end if;
  select valeur into elo from reglages where cle = 'elo_dernier_run';
  v_releve_fini := coalesce((elo->>'done')::boolean, false) and elo->'snapshot'->>'jour' = v_jour::text;
  if not v_releve_fini and extract(minute from v_paris) < 45 then
    return jsonb_build_object('attente', 'relevé de nuit pas fini');
  end if;
  return public.bleo_nuit(false) || jsonb_build_object('releve_fini', v_releve_fini);
end;
$$;

revoke execute on function public.bleo_nuit_cron() from public, anon, authenticated;

-- Deux horaires UTC couvrent l'heure d'été et l'heure d'hiver ; la garde est
-- dans la fonction (heure de Paris = 5).
select cron.schedule('bleo-nuit', '15,25,35,45 3,4 * * *', 'select public.bleo_nuit_cron()');
