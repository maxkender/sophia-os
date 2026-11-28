-- 0867 : États-Unis à 30 $/semaine pour les NOUVELLES recrues (26/11, décision de Max). Les posteurs US déjà là
-- gardent leur tarif d'aujourd'hui (14 $), sur Ruul comme sur Upwork. Même principe que 0486 (Israël en zone A,
-- tarifs existants figés). Les autres pays de la zone A restent à 14 $.
--
-- 1. Une zone de paie propre aux États-Unis : zones_paie « US » à 30 $ (le CHECK A/B/C est élargi à « US »).
--    La page Zones de l'admin, Join (paysEtPaie), le pont hub-posteurs et toute la paie lisent zones_paie : rien
--    d'autre à brancher. Bonus comment master : la zone US garde le barème de la zone A (rien ne change pour eux).
-- 2. Le tarif d'un posteur, une seule règle (posteur_tarif_semaine) : contrat Upwork (figé ou lu), sinon tarif
--    posé à la main (tarif_hebdo), sinon, pour un posteur Ruul, le tarif signé (ruul_tarif_semaine, noté à la
--    création par Join / hub-posteurs), sinon la zone de son pays. paie_calculer_v3 (paie Upwork ET lot Ruul du
--    lundi), mon_tarif_semaine (dashboard), l'offre Double, le suivi des doubles, le bilan du samedi, les faits du
--    bot FAQ, la fiche support, les coûts du QG et le remboursement de la page Paie lisent cette règle au lieu de la
--    zone seule (avant : un posteur Ruul figé serait passé au tarif de sa zone). Le contrôle des offres Upwork et
--    le contrôle de cohérence comparent au tarif figé du contrat quand il y en a un.
--    Vérifié avant d'écrire : pour tous les posteurs actifs, cette règle donne aujourd'hui exactement ce qu'ils
--    touchent (aucun montant ne change ; le contrôle en fin de migration l'assure).
-- 3. AVANT la bascule, le tarif d'aujourd'hui de chaque posteur US est figé :
--    - Ruul : ruul_tarif_semaine (s'il est vide), comme pour une signature sur Join ;
--    - Upwork actif : contrats_tarifs.force_tarif (s'il est vide), comme 0486 ;
--    - tout autre posteur US dont le tarif viendrait encore de la zone (inactif sans contrat) : tarif_hebdo.
--    Même valeur qu'aujourd'hui (14 $) : aucune paie ne change pour eux.
-- 4. Les États-Unis passent dans la zone « US » (zones_paie_pays). L'ancienne valeur (A) reste dans le journal des
--    réglages (trigger reglages_journal_zones_pays, comme tout changement de zone).
-- 5. join_signatures garde la zone et le tarif affichés au moment de la signature (colonnes ajoutées) : Join les
--    transmet à l'OS à la création de la fiche, au lieu de relire la zone plus tard.
-- 6. Le document du bot support (« Comment fonctionne Vik Studios ») dit la règle US.
--
-- Contrôles en fin de migration (sinon tout est annulé) : pour chaque posteur, le tarif de la règle 2 est celui
-- qu'il touchait avant ; ruul_tarif inchangé ; paie_calculer_v3 identique (tarif et montant) pour la semaine à
-- payer et la semaine en cours ; chaque posteur US actif reste à 14 $ ; aucun posteur US ne dépend de la zone.
-- Aucune ligne supprimée. Aucun jalon créé, financé ou libéré. Aucun message.
--
-- Retour arrière : update zones_paie_pays set zone = 'A' where pays = 'US' ; les fonctions de leurs migrations
-- d'origine (le texte d'avant est dans pg_get_functiondef de la prod du 26/11) ; les tarifs figés peuvent rester
-- (ils valent ce que les posteurs touchaient déjà).

begin;

-- 0. Ce que chaque posteur touche aujourd'hui (la règle de paie_calculer_v3 d'avant), pour le contrôle final.
create temp table t0867_avant on commit drop as
select pr.id, pr.canal_paie, pr.is_active, public.paie_pays_posteur(pr.id) as pays,
       coalesce(public.paie_tarif_contrat(pr.id), pr.tarif_hebdo, public.paie_tarif_zone(pr.id)) as paye,
       public.ruul_tarif(pr.id) as ruul
  from public.profiles pr
 where exists (select 1 from public.user_roles r where r.user_id = pr.id and r.role = 'poster');

create temp table t0867_paie_avant on commit drop as
select s.semaine, v.poster_id, v.tarif, v.montant
  from (select public.ruul_semaine_a_payer() as semaine
        union select date_trunc('week', now() at time zone 'Europe/Paris')::date) s,
       lateral public.paie_calculer_v3(s.semaine) v;

-- 1. La zone US.
alter table public.zones_paie drop constraint if exists zones_paie_zone_check;
alter table public.zones_paie add constraint zones_paie_zone_check check (zone in ('A', 'B', 'C', 'US'));
insert into public.zones_paie (zone, tarif) values ('US', 30) on conflict (zone) do nothing;

-- 2. Une seule règle pour le tarif d'un posteur.
create or replace function public.posteur_tarif_semaine(p_poster uuid)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  -- 0867 : contrat (figé ou lu), sinon tarif posé à la main, sinon tarif signé (Ruul), sinon zone du pays.
  select coalesce(public.paie_tarif_contrat(p_poster), pr.tarif_hebdo,
                  case when pr.canal_paie = 'ruul' and pr.ruul_tarif_semaine > 0 then pr.ruul_tarif_semaine end,
                  public.paie_tarif_zone(p_poster))
    from public.profiles pr where pr.id = p_poster;
$$;

create or replace function public.mon_tarif_semaine()
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  -- 0867 : la même règle que la paie (un posteur Ruul figé n'est pas montré au tarif de sa zone).
  select public.posteur_tarif_semaine(auth.uid());
$$;

-- Les fonctions qui lisaient la zone seule : un remplacement exact, une fois, contrôlé.
create function pg_temp.patcher_0867(p_fn regprocedure, p_avant text, p_apres text)
returns void
language plpgsql
as $p$
declare
  d text := pg_get_functiondef(p_fn);
  n int;
begin
  if position('0867' in d) > 0 then return; end if;
  n := (length(d) - length(replace(d, p_avant, ''))) / greatest(length(p_avant), 1);
  if n <> 1 then
    raise exception '0867 : % a changé (% occurrence(s) de « % »)', p_fn, n, p_avant;
  end if;
  execute replace(d, p_avant, p_apres);
end;
$p$;

select pg_temp.patcher_0867('public.paie_calculer_v3(date)',
  $a$coalesce(public.paie_tarif_contrat(po.id), po.tarif_hebdo, public.paie_tarif_zone(po.id)) as tarif$a$,
  $a$public.posteur_tarif_semaine(po.id) /* 0867 */ as tarif$a$);

select pg_temp.patcher_0867('public.double_offrir(uuid)',
  $a$v_tarif := coalesce(public.paie_tarif_contrat(p.poster_id), public.paie_tarif_zone(p.poster_id));$a$,
  $a$v_tarif := public.posteur_tarif_semaine(p.poster_id); /* 0867 */$a$);

select pg_temp.patcher_0867('public.doubles_suivi(date)',
  $a$'tarif', coalesce(public.paie_tarif_contrat(m.poster_id), public.paie_tarif_zone(m.poster_id)),$a$,
  $a$'tarif', public.posteur_tarif_semaine(m.poster_id) /* 0867 */,$a$);

select pg_temp.patcher_0867('public.samedi_bilan_calc(date)',
  $a$coalesce(public.paie_tarif_contrat(o.poster_id), public.paie_tarif_zone(o.poster_id)) as tarif$a$,
  $a$public.posteur_tarif_semaine(o.poster_id) /* 0867 */ as tarif$a$);

select pg_temp.patcher_0867('public.faq_faits_posteur(uuid)',
  $a$'tarif', coalesce(public.paie_tarif_contrat(pr.id), pr.tarif_hebdo, public.paie_tarif_zone(pr.id)),$a$,
  $a$'tarif', public.posteur_tarif_semaine(pr.id) /* 0867 */,$a$);

select pg_temp.patcher_0867('public.paie_liste_v2(date,boolean)',
  $a$coalesce(public.paie_tarif_contrat(pr.id), pr.tarif_hebdo, public.paie_tarif_zone(pr.id)) + v_bonus as montant$a$,
  $a$public.posteur_tarif_semaine(pr.id) /* 0867 */ + v_bonus as montant$a$);

select pg_temp.patcher_0867('public.qg_apps(date,date)',
  $a$else coalesce(public.paie_tarif_zone(pr.id), pr.tarif_hebdo) end as tarif$a$,
  $a$else public.posteur_tarif_semaine(pr.id) /* 0867 */ end as tarif$a$);

-- La fiche support : le tarif de la règle 2, pour Ruul comme pour Upwork (avant : la zone d'abord pour un Upwork
-- sans tarif_hebdo, qui aurait dit 30 $ à un posteur US payé 14 $ par son contrat).
select pg_temp.patcher_0867('public.support_fiche(uuid)',
  $a$v_tarif := coalesce(nullif(pr.tarif_hebdo, 0), (select zp.tarif from public.zones_paie zp where zp.zone = v_zone));$a$,
  $a$v_tarif := public.posteur_tarif_semaine(p_poster); /* 0867 */$a$);
-- (la branche Ruul garde ruul_tarif : tarif signé, sinon zone ; la même valeur que la règle 2 pour un posteur Ruul.)

-- Le contrôle de cohérence (n° 7) : le tarif attendu d'un contrat figé est son tarif figé.
select pg_temp.patcher_0867('public.coherence_violations()',
  $a$public.paie_tarif_zone(pr.id) tz,$a$,
  $a$coalesce(ct.force_tarif, public.paie_tarif_zone(pr.id)) /* 0867 */ tz,$a$);

-- Le contrôle des offres Upwork : le montant attendu est le tarif figé du contrat, sinon celui de la zone.
select pg_temp.patcher_0867('public.offres_ecarts(date)',
  $a$upper(a.pays) as pays, a.organisation_id, zp.tarif,$a$,
  $a$upper(a.pays) as pays, a.organisation_id,
           coalesce((select ct.force_tarif from public.contrats_tarifs ct where ct.contrat_id = a.contrat_id), zp.tarif) /* 0867 */ as tarif,$a$);

-- Bonus comment master : la zone US garde le barème de la zone A.
select pg_temp.patcher_0867('public.bonus_cm_tarif(uuid)',
  $a$case z.zone when 'A' then (r->>'comment_master_tarif_a')::numeric$a$,
  $a$case z.zone when 'A' then (r->>'comment_master_tarif_a')::numeric
                     when 'US' then (r->>'comment_master_tarif_a')::numeric /* 0867 */$a$);

-- 3. Les posteurs US d'aujourd'hui, figés à ce qu'ils touchent (AVANT la bascule).
-- Ruul : le tarif signé, s'il manque.
update public.profiles pr
   set ruul_tarif_semaine = a.paye
  from t0867_avant a
 where a.id = pr.id and a.pays = 'US' and pr.canal_paie = 'ruul'
   and not coalesce(pr.ruul_tarif_semaine > 0, false) and a.paye > 0;

-- Upwork actif : le tarif du contrat figé (0486).
insert into public.contrats_tarifs as ct (contrat_id, rythme, raison, force_tarif, force_at)
select pr.upwork_contract_id, 'a_verifier', 'figé avant États-Unis 30 $ (26/11)', a.paye, now()
  from public.profiles pr
  join t0867_avant a on a.id = pr.id
 where a.pays = 'US' and pr.is_active and pr.upwork_contract_id is not null and a.paye > 0
on conflict (contrat_id) do update
  set force_tarif = excluded.force_tarif, force_at = now(),
      raison = coalesce(ct.raison || ' · ', '') || 'figé avant États-Unis 30 $ (26/11)'
  where ct.force_tarif is null;

-- Tout autre posteur US dont le tarif viendrait encore de la zone (inactif sans contrat lu) : tarif_hebdo.
update public.profiles pr
   set tarif_hebdo = a.paye
  from t0867_avant a
 where a.id = pr.id and a.pays = 'US' and a.paye > 0
   and pr.tarif_hebdo is null and public.paie_tarif_contrat(pr.id) is null
   and not (pr.canal_paie = 'ruul' and coalesce(pr.ruul_tarif_semaine > 0, false));

-- 4. La bascule : les États-Unis dans la zone US.
update public.zones_paie_pays set zone = 'US' where pays = 'US' and zone <> 'US';
insert into public.zones_paie_pays (pays, zone) select 'US', 'US'
 where not exists (select 1 from public.zones_paie_pays where pays = 'US');

-- 5. Join : la zone et le tarif montrés à la signature.
alter table public.join_signatures add column if not exists zone text;
alter table public.join_signatures add column if not exists tarif_semaine numeric;
comment on column public.join_signatures.tarif_semaine is
  '0867 : tarif de la semaine (USD) du pays du candidat affiché sur Join au moment de la signature ; transmis à l''OS (ruul_tarif_semaine).';
comment on column public.join_signatures.zone is '0867 : zone de paie du pays au moment de la signature.';

-- 6. Le document du bot support.
update public.support_documents
   set contenu = replace(contenu, '- Tarif fixe par semaine selon la zone : A 14 $ / B 10 $ / C 7 $.',
$t$- Tarif fixe par semaine selon la zone : A 14 $ / B 10 $ / C 7 $. États-Unis : 30 $ pour les recrues à partir du 26/11 ; les posteurs US arrivés avant gardent 14 $.
- Le tarif d'un posteur est TOUJOURS celui de sa fiche (signé à son arrivée), jamais recalculé d'après sa zone.$t$),
       maj_at = now()
 where titre = 'Comment fonctionne Vik Studios'
   and position('- Tarif fixe par semaine selon la zone : A 14 $ / B 10 $ / C 7 $.' in contenu) > 0
   and position('États-Unis : 30 $' in contenu) = 0;

-- Contrôles : rien ne bouge pour qui que ce soit d'existant.
do $v$
declare
  n int;
  x text;
begin
  select count(*), string_agg(a.id::text, ', ') into n, x
    from t0867_avant a
   where public.posteur_tarif_semaine(a.id) is distinct from a.paye;
  if n > 0 then raise exception '0867 : % posteur(s) changeraient de tarif (%)', n, left(x, 400); end if;

  select count(*), string_agg(a.id::text, ', ') into n, x
    from t0867_avant a
   where a.canal_paie = 'ruul' and public.ruul_tarif(a.id) is distinct from a.ruul;
  if n > 0 then raise exception '0867 : ruul_tarif changerait pour % posteur(s) Ruul (%)', n, left(x, 400); end if;

  select count(*) into n
    from (select s.semaine, v.poster_id, v.tarif, v.montant
            from (select distinct semaine from t0867_paie_avant) s, lateral public.paie_calculer_v3(s.semaine) v
          except select semaine, poster_id, tarif, montant from t0867_paie_avant) d;
  if n > 0 then raise exception '0867 : paie_calculer_v3 changerait pour % ligne(s)', n; end if;
  select count(*) into n
    from (select semaine, poster_id, tarif, montant from t0867_paie_avant
          except select s.semaine, v.poster_id, v.tarif, v.montant
            from (select distinct semaine from t0867_paie_avant) s, lateral public.paie_calculer_v3(s.semaine) v) d;
  if n > 0 then raise exception '0867 : paie_calculer_v3 perdrait % ligne(s)', n; end if;

  select count(*) into n
    from public.profiles pr
   where pr.is_active and public.paie_pays_posteur(pr.id) = 'US'
     and exists (select 1 from public.user_roles r where r.user_id = pr.id and r.role = 'poster')
     and public.posteur_tarif_semaine(pr.id) is distinct from 14;
  if n > 0 then raise exception '0867 : % posteur(s) US actif(s) ne sont pas à 14 $', n; end if;

  select count(*) into n
    from t0867_avant a join public.profiles pr on pr.id = a.id
   where a.pays = 'US' and public.paie_tarif_contrat(pr.id) is null and pr.tarif_hebdo is null
     and not (pr.canal_paie = 'ruul' and coalesce(pr.ruul_tarif_semaine > 0, false));
  if n > 0 then raise exception '0867 : % posteur(s) US dépendent encore de la zone', n; end if;

  if (select tarif from public.zones_paie zp join public.zones_paie_pays z on z.zone = zp.zone where z.pays = 'US') <> 30 then
    raise exception '0867 : la zone des États-Unis n''est pas à 30 $';
  end if;
end;
$v$;

commit;

notify pgrst, 'reload schema';
