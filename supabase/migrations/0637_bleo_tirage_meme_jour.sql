-- 0637 : BLEO, le dernier repli du tirage ne met jamais deux fois le même contenu
-- sur un compte le même jour (D47).
--
-- Au niveau 4 (« tout »), le tirage levait toute la règle « même contenu »
-- (v_j_contenu jours), y compris le jour même : sur les petits labels 100 %
-- podz (Fathomly, mentalmaxxing), un compte à court de contenus neufs pouvait
-- recevoir le même contenu sur ses 2 créneaux (1 compte par jour au plus depuis
-- le 31/10). Le niveau 4 ne garde plus que la règle du jour même.
--
-- Fonction recréée depuis sa définition en prod (patchée en place par 0614),
-- un seul bloc changé. Retour arrière : remettre `(niveau >= 4 or not exists (…
-- < v_j_contenu))`.

set lock_timeout = '5s';

CREATE OR REPLACE FUNCTION public.bleo_tirage(p_jour date DEFAULT NULL::date, p_mode text DEFAULT 'ombre'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  reg jsonb;
  v_jour date := coalesce(p_jour, (now() at time zone 'Europe/Paris')::date + 1);
  v_debut_jour timestamptz;
  v_debut timestamptz := clock_timestamp();
  v_run uuid;
  v_part_max numeric;
  v_passages_test integer;
  v_age_prio interval;
  v_exposant numeric;
  v_fatigue_post numeric;
  v_fatigue_accroche numeric;
  v_budget numeric;
  v_plancher numeric;
  v_budget_jours integer;
  v_j_contenu integer;
  v_j_famille integer;
  v_j_couverture integer;
  v_freq numeric;
  rk record;
  rs record;
  rt record;
  rp record;
  v_eligibles text[];
  v_parts jsonb;
  v_fenetre text[];
  v_slug text;
  v_libres integer;
  v_choix uuid;
  v_famille uuid;
  v_label uuid;
  v_r double precision;
  v_niveau integer;
  v_resume jsonb;
  v_tests integer := 0;
  v_vides integer := 0;
begin
  if auth.uid() is not null and not public.is_admin() then
    raise exception 'bleo : réservé aux admins' using errcode = '42501';
  end if;
  if p_mode not in ('ombre', 'actif') then
    raise exception 'bleo_tirage : modes ombre et actif seulement (demandé : %)', p_mode;
  end if;
  select valeur into reg from reglages where cle = 'bleo';
  if reg is null then raise exception 'reglages.bleo absent'; end if;

  v_debut_jour := v_jour::timestamp at time zone 'Europe/Paris';
  v_part_max := (reg->'file_juger'->>'part_max')::numeric;
  v_passages_test := (reg->'file_juger'->>'passages_test')::int;
  v_age_prio := make_interval(days => (reg->'file_juger'->>'age_prioritaire_jours')::int);
  v_exposant := (reg->'valeur'->>'exposant')::numeric;
  v_fatigue_post := (reg->'valeur'->>'fatigue_post')::numeric;
  v_fatigue_accroche := (reg->'valeur'->>'fatigue_accroche')::numeric;
  v_budget := (reg->'garde_fous'->>'budget_famille')::numeric;
  v_plancher := (reg->'garde_fous'->>'budget_plancher')::numeric;
  v_budget_jours := (reg->'garde_fous'->>'budget_jours')::int;
  v_j_contenu := (reg->'garde_fous'->>'meme_contenu_jours')::int;
  v_j_famille := (reg->'garde_fous'->>'meme_famille_jours')::int;
  v_j_couverture := (reg->'garde_fous'->>'meme_couverture_jours')::int;
  select coalesce((valeur->>'posts_par_jour')::numeric, 1) into v_freq from reglages where cle = 'frequence';

  insert into bleo_runs (jour_vise, mode, demarre_le) values (v_jour, p_mode, v_debut) returning id into v_run;

  create temp table bt_comptes on commit drop as
  select co.id as compte_id, co.langue,
         (coalesce(co.ugc_ai, false) and not coalesce(co.ugc_ai_video, false)) as ugc,
         least(3, greatest(1, round(coalesce(co.posts_par_jour::numeric, v_freq, 1))))::int as quota,
         co.parts_applications as parts,
         md5(v_jour::text || co.id::text) as ordre
    from comptes co
   where co.is_active
     and coalesce(co.type_compte, '') <> 'cm'
     and not coalesce(co.ugc_ai_video, false)
     and not coalesce(co.videos_uniquement, false)
     and co.warmup_ends_at is not null and co.warmup_ends_at <= v_debut_jour
     and co.langue is not null
     and not exists (select 1 from recrues_rouges rr
                      where rr.poster_id = co.poster_id and rr.decision is null
                        and rr.etape in ('acces', 'tiktok', 'warmup'))
     and exists (select 1 from compte_labels cl where cl.compte_id = co.id);
  alter table bt_comptes add primary key (compte_id);

  create temp table bt_labels on commit drop as
  select cl.compte_id, cl.label_id,
         1.0 / count(*) over (partition by cl.compte_id) as poids
    from compte_labels cl join bt_comptes kk on kk.compte_id = cl.compte_id;

  create temp table bt_creneaux (
    compte_id uuid not null,
    creneau integer not null,
    application_id uuid,
    slug text,
    file text,
    contenu_id uuid,
    label_id uuid,
    valeur numeric,
    categorie text,
    relache text,
    primary key (compte_id, creneau)
  ) on commit drop;

  for rk in select * from bt_comptes order by ordre loop
    v_eligibles := array(
      select distinct a.slug
        from compte_labels cl
        join labels l on l.id = cl.label_id
        join label_applications la on la.label_id = cl.label_id
        join applications a on a.id = la.application_id
       where cl.compte_id = rk.compte_id
         and coalesce(l.slug, '') not in ('hook', 'ugc-ai-video')
         and a.actif and (a.langues is null or rk.langue = any(a.langues)));
    if cardinality(v_eligibles) = 0 then
      v_eligibles := array(select slug from applications
                            where slug = 'sophia' and actif and (langues is null or rk.langue = any(langues)));
    end if;
    if rk.ugc then
      v_eligibles := array(select e from unnest(v_eligibles) e where e = 'sophia');
    end if;
    v_parts := bleo_parts_effectives(rk.parts, v_eligibles);
    if v_parts = '{}'::jsonb then
      continue;
    end if;

    v_fenetre := array(
      select z.slug from (
        select a.slug, p.date_publication_prevue, p.created_at
          from passages p
          join posts po on po.id = p.post_id and not coalesce(po.est_test, false)
          left join applications a on a.id = p.application_id
         where p.compte_id = rk.compte_id and p.date_publication_prevue <= v_jour
         order by p.date_publication_prevue desc, p.created_at desc
         limit 10) z
       order by z.date_publication_prevue, z.created_at);

    insert into bt_creneaux (compte_id, creneau, application_id, slug, file, contenu_id, label_id, categorie)
    select rk.compte_id, row_number() over (order by p.created_at, p.id), p.application_id, a.slug,
           'rappel', p.contenu_id,
           (select min(cl.label_id::text)::uuid from contenu_labels cl where cl.contenu_id = p.contenu_id),
           'rappel'
      from passages p
      left join applications a on a.id = p.application_id
     where p.compte_id = rk.compte_id and p.date_publication_prevue = v_jour and coalesce(p.est_rappel, false);

    v_libres := rk.quota - (select count(*) from bt_creneaux where compte_id = rk.compte_id);
    for i in 1..greatest(v_libres, 0) loop
      v_slug := bleo_choisir_app(v_parts, v_fenetre);
      exit when v_slug is null;
      v_fenetre := v_fenetre || v_slug;
      insert into bt_creneaux (compte_id, creneau, application_id, slug)
      select rk.compte_id, (select coalesce(max(creneau), 0) + 1 from bt_creneaux where compte_id = rk.compte_id),
             a.id, a.slug
        from applications a where a.slug = v_slug;
    end loop;
  end loop;

  create temp table bt_pool on commit drop as
  select distinct sq.compte_id, sq.application_id, c.id as contenu_id
    from (select distinct compte_id, application_id, slug from bt_creneaux where file is null) sq
    join bt_comptes kk on kk.compte_id = sq.compte_id
    join bt_labels bl on bl.compte_id = sq.compte_id
    join contenu_labels cl on cl.label_id = bl.label_id
    join contenus c on c.id = cl.contenu_id
   where c.statut = 'valide' and c.import_statut = 'done' and c.ugc_compatible = kk.ugc
     and (
       (sq.slug = 'sophia'
        and not exists (select 1 from contenu_pertinences cp
                         where cp.contenu_id = c.id and cp.application_id = sq.application_id and cp.eligible = false))
       or
       (sq.slug <> 'sophia' and not kk.ugc and c.ugc_compatible = false
        and exists (select 1 from contenu_pertinences cp
                     where cp.contenu_id = c.id and cp.application_id = sq.application_id and cp.eligible)
        and not exists (select 1 from contenu_langue_decks d
                         where d.contenu_id = c.id and d.application_id = sq.application_id
                           and d.langue = kk.langue and d.variante = sq.slug
                           and (d.statut = 'ineligible'
                                or (d.statut = 'echec' and d.updated_at > now() - interval '24 hours'))))
     )
     and (not coalesce(c.livre, false)
          or (sq.slug = 'sophia' and exists (
                select 1 from contenu_langues l
                 where l.contenu_id = c.id and l.langue = any(bleo_langues_livre(kk.langue))
                   and bleo_deck_livre_pret(l.slides)))
          or (sq.slug <> 'sophia' and exists (
                select 1 from contenu_langue_decks d
                 where d.contenu_id = c.id and d.variante = sq.slug
                   and d.langue = any(bleo_langues_livre(kk.langue))
                   and d.statut = 'pret' and bleo_deck_livre_pret(d.slides))))
     and not exists (select 1 from passages p
                      where p.compte_id = sq.compte_id and p.contenu_id = c.id
                        and p.application_id <> sq.application_id
                        and abs(p.date_publication_prevue - v_jour) < 7);
  create index on bt_pool (compte_id, application_id);
  create index on bt_pool (contenu_id);

  create temp table bt_val on commit drop as
  select v.contenu_id, v.langue, v.valeur, v.n_post, c.famille_id, c.etat_bleo as etat,
         case when coalesce(c.verdict, 'en_attente') = 'en_attente' and f.verdict = 'gagnante' then 'gagnant'
              else coalesce(c.verdict, 'en_attente') end as verdict,
         c.couverture_empreinte as couverture,
         (select min(cl.label_id::text)::uuid from contenu_labels cl where cl.contenu_id = c.id) as label_id
    from bleo_valeurs v
    join contenus c on c.id = v.contenu_id
    left join bleo_familles f on f.id = c.famille_id
   where c.statut = 'valide' and v.langue in (select distinct langue from bt_comptes);
  alter table bt_val add primary key (contenu_id, langue);
  create index on bt_val (famille_id, langue);

  create temp table bt_hist on commit drop as
  select p.compte_id, p.contenu_id, c.famille_id, c.couverture_empreinte as couverture,
         p.date_publication_prevue as jour
    from passages p
    join contenus c on c.id = p.contenu_id
    join bt_comptes kk on kk.compte_id = p.compte_id
   where abs(p.date_publication_prevue - v_jour) < greatest(v_j_contenu, v_j_famille, v_j_couverture);
  create index on bt_hist (compte_id);

  create temp table bt_bud_fam on commit drop as
  select c.famille_id, count(*)::numeric as n
    from passages p join contenus c on c.id = p.contenu_id
   where p.date_publication_prevue between v_jour - (v_budget_jours - 1) and v_jour
     and not coalesce(p.est_rappel, false) and c.famille_id is not null
   group by c.famille_id;
  alter table bt_bud_fam add primary key (famille_id);

  create temp table bt_bud_lab on commit drop as
  select cl.label_id, count(*)::numeric as n
    from passages p join contenu_labels cl on cl.contenu_id = p.contenu_id
   where p.date_publication_prevue between v_jour - (v_budget_jours - 1) and v_jour
     and not coalesce(p.est_rappel, false)
   group by cl.label_id;
  alter table bt_bud_lab add primary key (label_id);

  create temp table bt_med on commit drop as select compte_id from bleo_mediane_compte;
  alter table bt_med add primary key (compte_id);

  create temp table bt_cap on commit drop as
  with libres as (select compte_id, count(*) as n from bt_creneaux where file is null group by compte_id)
  select bl.label_id,
         floor(v_part_max * sum(bl.poids * coalesce(lb.n, 0)))::int as capacite,
         0 as utilise,
         bool_or(m.compte_id is not null) as a_mediane
    from bt_labels bl
    left join libres lb on lb.compte_id = bl.compte_id
    left join bt_med m on m.compte_id = bl.compte_id
   group by bl.label_id;
  alter table bt_cap add primary key (label_id);

  create temp table bt_tests on commit drop as
  select c.id as contenu_id, c.famille_id, c.created_at,
         (select min(cl.label_id::text)::uuid from contenu_labels cl where cl.contenu_id = c.id) as label_id,
         v_passages_test - (select count(*) from passages p
                             where p.contenu_id = c.id and not coalesce(p.est_rappel, false)
                               and p.statut in ('assigne', 'valide_par_poster', 'publie')) as besoin
    from contenus c
    join bleo_familles f on f.id = c.famille_id
   where c.statut = 'valide' and c.import_statut = 'done' and c.etat_bleo = 'a_juger'
     and (f.racine_contenu_id = c.id or c.accroche_norm is distinct from f.accroche_norm);

  for rt in select * from bt_tests where besoin > 0
            order by (created_at >= now() - v_age_prio) desc, created_at desc, contenu_id loop
    for i in 1..rt.besoin loop
      exit when (select utilise >= capacite from bt_cap where label_id = rt.label_id) is not false;
      select sc.compte_id, sc.creneau, kk.langue into rp
        from bt_creneaux sc
        join bt_comptes kk on kk.compte_id = sc.compte_id
        join bt_labels bl on bl.compte_id = sc.compte_id and bl.label_id = rt.label_id
        join bt_pool p on p.compte_id = sc.compte_id and p.application_id = sc.application_id
                      and p.contenu_id = rt.contenu_id
        left join bt_val v on v.contenu_id = rt.contenu_id and v.langue = kk.langue
       where sc.file is null
         and ((select not a_mediane from bt_cap where label_id = rt.label_id)
              or exists (select 1 from bt_med m where m.compte_id = sc.compte_id))
         and not exists (select 1 from bt_creneaux s2 join bt_comptes k2 on k2.compte_id = s2.compte_id
                          where s2.contenu_id = rt.contenu_id and s2.file = 'juger' and k2.langue = kk.langue)
         and not exists (select 1 from bt_hist h
                          where h.compte_id = sc.compte_id and h.contenu_id = rt.contenu_id
                            and abs(h.jour - v_jour) < v_j_contenu)
       order by (coalesce(v.n_post, 0) > 0 or exists (
                   select 1 from bt_val v2 where v2.famille_id = rt.famille_id and v2.langue = kk.langue
                                            and v2.n_post > 0)),
                md5(v_jour::text || sc.compte_id::text || rt.contenu_id::text)
       limit 1;
      exit when not found;
      update bt_creneaux
         set file = 'juger', contenu_id = rt.contenu_id, label_id = rt.label_id, categorie = 'juger',
             valeur = (select valeur from bt_val where contenu_id = rt.contenu_id and langue = rp.langue)
       where compte_id = rp.compte_id and creneau = rp.creneau;
      update bt_cap set utilise = utilise + 1 where label_id = rt.label_id;
      insert into bt_hist (compte_id, contenu_id, famille_id, couverture, jour)
      select rp.compte_id, rt.contenu_id, rt.famille_id, c.couverture_empreinte, v_jour from contenus c where c.id = rt.contenu_id;
      v_tests := v_tests + 1;
    end loop;
  end loop;

  for rk in select * from bt_comptes order by ordre loop
    perform setseed((('x' || substr(rk.ordre, 1, 8))::bit(32)::int)::double precision / 2147483648.0);
    for rs in select * from bt_creneaux where compte_id = rk.compte_id and file is null order by creneau loop
      v_choix := null;
      for niveau in 0..5 loop
        v_r := random();
        with cands as (
          select v.contenu_id, power(v.valeur, v_exposant) as w
            from bt_pool p
            join bt_val v on v.contenu_id = p.contenu_id and v.langue = rk.langue
           where p.compte_id = rk.compte_id and p.application_id = rs.application_id
             and (v.etat = 'juge' or (niveau >= 5 and v.etat = 'a_juger')) and v.valeur > 0
             -- D47 (0637) : au dernier repli, un contenu peut revenir sur le compte avant
             -- v_j_contenu jours, mais jamais le même jour (bt_hist porte les choix du jour).
             and not exists (
                   select 1 from bt_hist h where h.compte_id = rk.compte_id and h.contenu_id = v.contenu_id
                                             and abs(h.jour - v_jour) < case when niveau >= 4 then 1 else v_j_contenu end)
             and (niveau >= 3 or not exists (
                   select 1 from bt_hist h where h.compte_id = rk.compte_id and h.famille_id = v.famille_id
                                             and abs(h.jour - v_jour) < v_j_famille))
             and (niveau >= 2 or v.couverture is null or not exists (
                   select 1 from bt_hist h
                    where h.compte_id = rk.compte_id and h.couverture is not null
                      and abs(h.jour - v_jour) < v_j_couverture
                      and length(h.couverture) = 16 and length(v.couverture) = 16
                      and bit_count(('x' || h.couverture)::bit(64) # ('x' || v.couverture)::bit(64)) <= 8))
             and (niveau >= 1 or v.famille_id is null or
                  coalesce((select n from bt_bud_fam where famille_id = v.famille_id), 0) + 1
                  <= greatest(v_plancher, v_budget * (coalesce((select n from bt_bud_lab where label_id = v.label_id), 0) + 1)))
        ),
        cumul as (
          select contenu_id, sum(w) over (order by contenu_id) as cum, sum(w) over () as tot from cands
        )
        select contenu_id into v_choix from cumul where cum >= v_r * tot order by cum, contenu_id limit 1;
        if v_choix is not null then
          v_niveau := niveau;
          exit;
        end if;
      end loop;

      if v_choix is null then
        v_vides := v_vides + 1;
        continue;
      end if;

      select famille_id, label_id into v_famille, v_label from bt_val where contenu_id = v_choix and langue = rk.langue;
      update bt_creneaux c
         set file = case when v_niveau >= 5 then 'juger' else 'valeur' end,
             contenu_id = v_choix, label_id = v_label,
             valeur = v.valeur,
             categorie = case when v_niveau >= 5 then 'juger'
                              when v.verdict = 'gagnant' and v.n_post = 0 then 'recolte'
                              when v.verdict = 'gagnant' then 'gagnant_servi'
                              when v.n_post = 0 then 'non_gagnant_neuve'
                              else 'non_gagnant_servie' end,
             relache = case v_niveau when 0 then null when 1 then 'budget' when 2 then 'budget+couverture'
                                     when 3 then 'budget+couverture+famille' when 4 then 'tout'
                                     else 'hors_file' end
        from bt_val v
       where c.compte_id = rk.compte_id and c.creneau = rs.creneau
         and v.contenu_id = v_choix and v.langue = rk.langue;

      update bt_val set valeur = valeur * v_fatigue_post, n_post = n_post + 1
       where contenu_id = v_choix and langue = rk.langue;
      if v_famille is not null then
        update bt_val set valeur = valeur * v_fatigue_accroche
         where famille_id = v_famille and langue = rk.langue and contenu_id <> v_choix;
        insert into bt_bud_fam (famille_id, n) values (v_famille, 1)
        on conflict (famille_id) do update set n = bt_bud_fam.n + 1;
      end if;
      if v_label is not null then
        insert into bt_bud_lab (label_id, n) values (v_label, 1)
        on conflict (label_id) do update set n = bt_bud_lab.n + 1;
      end if;
      insert into bt_hist (compte_id, contenu_id, famille_id, couverture, jour)
      select rk.compte_id, v_choix, v_famille, c.couverture_empreinte, v_jour from contenus c where c.id = v_choix;
    end loop;
  end loop;

  insert into bleo_ombre_passages (run_id, compte_id, contenu_id, langue, application_id, label_id,
                                   file_bleo, categorie, valeur_tirage, creneau, relache)
  select v_run, sc.compte_id, sc.contenu_id, kk.langue, sc.application_id, sc.label_id,
         sc.file, sc.categorie, sc.valeur, sc.creneau, sc.relache
    from bt_creneaux sc join bt_comptes kk on kk.compte_id = sc.compte_id
   where sc.contenu_id is not null;

  v_resume := jsonb_build_object(
    'jour_vise', v_jour,
    'mode', p_mode,
    'comptes', (select count(distinct compte_id) from bt_creneaux),
    'comptes_complets', (select count(*) from (select compte_id from bt_creneaux group by compte_id
                                                having bool_and(contenu_id is not null)) z),
    'creneaux', (select count(*) from bt_creneaux),
    'creneaux_vides', v_vides,
    'par_file', (select jsonb_object_agg(f, n) from (select coalesce(file, 'vide') f, count(*) n from bt_creneaux group by 1) z),
    'par_categorie', (select jsonb_object_agg(cat, n) from (select categorie cat, count(*) n from bt_creneaux
                                                              where categorie is not null group by 1) z),
    'relaches', (select coalesce(jsonb_object_agg(r, n), '{}'::jsonb) from (select relache r, count(*) n from bt_creneaux
                                                                             where relache is not null group by 1) z),
    'par_appli', (select jsonb_object_agg(sl, n) from (select coalesce(slug, '?') sl, count(*) n from bt_creneaux group by 1) z),
    'tests_places', v_tests,
    'tests_a_placer', (select coalesce(sum(greatest(besoin, 0)), 0) from bt_tests),
    'testables_recents', (select count(*) from bt_tests where besoin > 0 and created_at >= now() - interval '3 days'),
    'testables_recents_complets', (select count(*) from bt_tests tt
                                    where tt.besoin > 0 and tt.created_at >= now() - interval '3 days'
                                      and (select count(*) from bt_creneaux sc where sc.contenu_id = tt.contenu_id
                                                                                and sc.file = 'juger') >= tt.besoin),
    'labels_file_juger', (select jsonb_object_agg(l.nom, jsonb_build_object('capacite', c.capacite, 'utilise', c.utilise))
                            from bt_cap c join labels l on l.id = c.label_id),
    'duree_s', round(extract(epoch from clock_timestamp() - v_debut)::numeric, 1)
  );
  update bleo_runs set fini_le = clock_timestamp(), resume = v_resume where id = v_run;
  return v_resume || jsonb_build_object('run_id', v_run);
end;
$function$;
