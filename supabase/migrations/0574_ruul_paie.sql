-- 0574 : les posteurs Ruul (venus du site sophia-culture.com), canal de paie et
-- paie hebdomadaire par lot Ruul (9/11).
--
-- 1. Canal de paie : profiles.canal_paie = 'upwork' | 'ruul'. Tous les
--    posteurs du site (hub_posteurs) passent en 'ruul'.
-- 2. Statut Ruul sur le profil : a_ajouter → invite → pret → paye_1x, avec
--    ruul_email, ruul_ajoute_at, ruul_pret_at, ruul_premier_paiement_at. Mode
--    réglage ruul_mode = 'manuel' (plus tard 'api' : ajout, invitation et
--    identité lus chez Ruul).
-- 3. La paie : le MÊME calcul qu'Upwork (paie_calculer_v3 : tarif de la zone,
--    warm-up non payé, doubles à partir de leur 1re semaine de posts,
--    retenues, corrections de Payroll). La cohorte du site n'y est plus
--    exclue ; la paie Upwork l'ignore (pas de contrat Upwork, canal ruul).
-- 4. Un lot Ruul par semaine payée : préparé → saisi (n° de facture Ruul) →
--    payé (clic de Max) → rapproché (export Ruul importé). Un paiement par
--    posteur et par semaine (contrainte unique), une ligne dans un seul lot,
--    lot saisi ou payé verrouillé. Seuls les posteurs « pret » ou « paye_1x »
--    entrent dans le lot ; les autres sont reportés au lot suivant, jamais
--    perdus (rattrapage). Plafond par ligne = alerte, jamais un blocage.
--    L'OS ne paie jamais : Max paie sur Ruul.
-- 5. STOP : profiles.relances_stop_at (plus aucune relance).
-- Additif : colonnes, deux tables, des fonctions, un réglage ; paie_calculer_v3
-- patchée en place. Aucune ligne supprimée.

-- ---------------------------------------------------------------------------
-- 1-2. Le profil
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column if not exists canal_paie text not null default 'upwork',
  add column if not exists ruul_email text,
  add column if not exists ruul_statut text,
  add column if not exists ruul_ajoute_at timestamptz,
  add column if not exists ruul_pret_at timestamptz,
  add column if not exists ruul_premier_paiement_at timestamptz,
  add column if not exists ruul_relances int not null default 0,
  add column if not exists ruul_relance_at timestamptz,
  add column if not exists ruul_jeton uuid,
  add column if not exists relances_stop_at timestamptz;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_canal_paie_check') then
    alter table public.profiles add constraint profiles_canal_paie_check check (canal_paie in ('upwork', 'ruul'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'profiles_ruul_statut_check') then
    alter table public.profiles add constraint profiles_ruul_statut_check
      check (ruul_statut is null or ruul_statut in ('a_ajouter', 'invite', 'pret', 'paye_1x'));
  end if;
end $$;

create unique index if not exists profiles_ruul_jeton_key on public.profiles (ruul_jeton) where ruul_jeton is not null;

-- Les 4 comptes de test de l'équipe inscrits par le site restent hors de tout suivi.
alter table public.hub_posteurs add column if not exists exclu_suivi boolean not null default false;
update public.hub_posteurs set exclu_suivi = true
 where profile_id in ('2b6a59a0-7c9c-41b9-a8a6-ef1bd4aab1a1', '2bb339dc-39e2-4db0-864d-25bf6f612f56',
                      'dda87411-300d-443b-8174-69fcec299d85', '266743e9-1218-44ba-ab93-3ad012e231f8')
   and not exclu_suivi;

-- Les posteurs du site : canal Ruul, à ajouter sur Ruul (aucun n'a encore été ajouté ni payé).
update public.profiles p
   set canal_paie = 'ruul',
       ruul_email = coalesce(p.ruul_email, nullif(btrim(h.email_perso), ''), nullif(btrim(p.email_perso), ''), p.email),
       ruul_statut = coalesce(p.ruul_statut, 'a_ajouter'),
       ruul_jeton = coalesce(p.ruul_jeton, gen_random_uuid())
  from public.hub_posteurs h
 where h.profile_id = p.id and not h.exclu_suivi and p.canal_paie <> 'ruul';

insert into public.reglages (cle, valeur) values
  ('ruul_mode', to_jsonb('manuel'::text)),
  ('ruul_textes', jsonb_build_object(
     'invite_objet', 'Your Ruul invitation: this is how you get paid every week',
     'invite_texte', 'Hi {prenom},' || chr(10) || chr(10) ||
       'You just received an invitation from Ruul at {email}. Ruul is where you will be paid every week for your posts.' || chr(10) || chr(10) ||
       '1. Open the Ruul email and create your free account with this email address.' || chr(10) ||
       '2. Verify your identity in Ruul (it takes a few minutes).' || chr(10) || chr(10) ||
       'When it''s done, click the button below so we know you''re ready to be paid.',
     'invite_bouton', 'It''s done',
     'relance_objet', 'Reminder: finish your Ruul account to get paid',
     'relance_texte', 'Hi {prenom},' || chr(10) || chr(10) ||
       'Your Ruul account is not ready yet, so we can''t pay you. Please open the Ruul invitation sent to {email}, create your free account and verify your identity. Then click the button below.',
     'paye_texte', 'Hi {prenom}, you received ${montant} for the week of {semaine}. You can withdraw it on Ruul.',
     'paye_objet', 'You received ${montant} on Ruul'))
on conflict (cle) do nothing;

-- ---------------------------------------------------------------------------
-- 4. Lots et paiements Ruul
-- ---------------------------------------------------------------------------
create table if not exists public.ruul_lots (
  id            uuid primary key default gen_random_uuid(),
  semaine       date not null unique,
  statut        text not null default 'prepare' check (statut in ('prepare', 'saisi', 'paye', 'rapproche')),
  facture       text,
  total         numeric not null default 0,
  nb            int not null default 0,
  prepare_at    timestamptz not null default now(),
  saisi_at      timestamptz,
  saisi_par     uuid,
  paye_at       timestamptz,
  paye_par      uuid,
  rapproche_at  timestamptz,
  rapproche_par uuid,
  rapprochement jsonb
);

create table if not exists public.ruul_paiements (
  id             uuid primary key default gen_random_uuid(),
  poster_id      uuid not null references public.profiles(id),
  semaine        date not null,
  lot_id         uuid references public.ruul_lots(id),
  statut         text not null default 'a_payer' check (statut in ('a_payer', 'reporte', 'paye', 'annule')),
  montant        numeric not null default 0,
  tarif          numeric,
  nb_comptes     int,
  faits          int,
  prevus         int,
  rattrapage     boolean not null default false,
  raison_report  text,
  paye_at        timestamptz,
  paye_par       uuid,
  message_statut text check (message_statut is null or message_statut in ('a_envoyer', 'envoye', 'erreur', 'stop')),
  message_at     timestamptz,
  ecart          text,
  created_at     timestamptz not null default now(),
  maj_at         timestamptz not null default now(),
  unique (poster_id, semaine)
);
create index if not exists ruul_paiements_lot on public.ruul_paiements (lot_id);

alter table public.ruul_lots enable row level security;
alter table public.ruul_paiements enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'ruul_lots' and policyname = 'ruul_lots_admin') then
    create policy ruul_lots_admin on public.ruul_lots for select to authenticated using (public.is_admin());
  end if;
  if not exists (select 1 from pg_policies where tablename = 'ruul_paiements' and policyname = 'ruul_paiements_admin') then
    create policy ruul_paiements_admin on public.ruul_paiements for select to authenticated using (public.is_admin());
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 3. Le calcul de paie : la cohorte du site n'en est plus exclue.
-- ---------------------------------------------------------------------------
do $p$
declare
  d text := pg_get_functiondef('public.paie_calculer_v3(date)'::regprocedure);
  avant text := $a$       and not exists (select 1 from public.hub_posteurs h where h.profile_id = pr.id)$a$;
begin
  if position('0574' in d) > 0 then return; end if;
  if position(avant in d) = 0 then
    raise exception '0574 : paie_calculer_v3 ne correspond pas';
  end if;
  -- Seuls les comptes de test de l'équipe restent exclus.
  execute replace(d, avant, $a$       and not exists (select 1 from public.hub_posteurs h where h.profile_id = pr.id and h.exclu_suivi) /* 0574 : les posteurs Ruul sont calculés comme les autres (payés par le lot Ruul) */$a$);
end
$p$;

-- ---------------------------------------------------------------------------
-- Fonctions
-- ---------------------------------------------------------------------------

/** Le lundi de la semaine qui vient de finir (heure de Paris) : la semaine que paie le lot du jour. */
create or replace function public.ruul_semaine_a_payer()
returns date
language sql
stable
as $$
  select ((now() at time zone 'Europe/Paris')::date
          - (extract(isodow from (now() at time zone 'Europe/Paris')::date)::int - 1) - 7);
$$;

/**
 * Prépare (ou recalcule) le lot Ruul d'une semaine. Pour chaque posteur Ruul,
 * toutes ses semaines dues et jamais payées depuis son début (rattrapage
 * compris) : le calcul de paie, la correction de Payroll si elle existe.
 * Posteur « pret » ou « paye_1x » : dans le lot ; sinon reporté.
 * Un lot saisi, payé ou rapproché n'est jamais recalculé.
 */
create or replace function public.ruul_lot_preparer(p_semaine date default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_semaine date := coalesce(p_semaine, public.ruul_semaine_a_payer());
  v_lot public.ruul_lots;
  v_debut date := date '2026-10-26';
  s date;
begin
  if coalesce(auth.role(), '') in ('anon', 'authenticated') and not public.is_admin() then
    raise exception 'réservé à l''admin et au Head of Ops';
  end if;
  if extract(isodow from v_semaine) <> 1 then
    raise exception 'la semaine doit commencer un lundi';
  end if;
  insert into public.ruul_lots (semaine) values (v_semaine) on conflict (semaine) do nothing;
  select * into v_lot from public.ruul_lots where semaine = v_semaine;
  if v_lot.statut <> 'prepare' then
    return jsonb_build_object('ok', false, 'erreur', 'lot ' || v_lot.statut || ' : verrouillé');
  end if;

  -- Les lignes à payer de ce lot repartent de zéro (recalculées ci-dessous).
  update public.ruul_paiements set statut = 'reporte', lot_id = null, maj_at = now()
   where lot_id = v_lot.id and statut = 'a_payer';

  s := v_debut;
  while s <= v_semaine loop
    insert into public.ruul_paiements as rp (poster_id, semaine, lot_id, statut, montant, tarif, nb_comptes, faits, prevus, rattrapage, raison_report)
    select c.poster_id, s,
           case when pr.ruul_statut in ('pret', 'paye_1x') then v_lot.id end,
           case when pr.ruul_statut in ('pret', 'paye_1x') then 'a_payer' else 'reporte' end,
           coalesce(ps.montant_corrige, c.montant), c.tarif, c.nb_comptes, c.faits, c.prevus,
           s < v_semaine,
           case when pr.ruul_statut in ('pret', 'paye_1x') then null
                else 'Ruul : ' || coalesce(pr.ruul_statut, 'pas de statut') || ' (reporté au lot suivant)' end
      from public.paie_calculer_v3(s) c
      join public.profiles pr on pr.id = c.poster_id and pr.canal_paie = 'ruul'
      left join public.paie_semaines ps on ps.poster_id = c.poster_id and ps.semaine = s
     where c.action in ('payer', 'modifier', 'kill', 'a_verifier')
       and coalesce(ps.montant_corrige, c.montant) > 0
       and not coalesce(ps.exclu, false)
       and ps.paye_at is null
    on conflict (poster_id, semaine) do update
       set lot_id = excluded.lot_id, statut = excluded.statut, montant = excluded.montant, tarif = excluded.tarif,
           nb_comptes = excluded.nb_comptes, faits = excluded.faits, prevus = excluded.prevus,
           rattrapage = excluded.rattrapage, raison_report = excluded.raison_report, maj_at = now()
     where rp.statut in ('a_payer', 'reporte')
       and (rp.lot_id is null or rp.lot_id = v_lot.id);
    s := s + 7;
  end loop;

  update public.ruul_lots l
     set total = coalesce((select sum(montant) from public.ruul_paiements where lot_id = l.id and statut = 'a_payer'), 0),
         nb = (select count(*) from public.ruul_paiements where lot_id = l.id and statut = 'a_payer'),
         prepare_at = now()
   where l.id = v_lot.id;
  return jsonb_build_object('ok', true, 'semaine', v_semaine,
    'nb', (select nb from public.ruul_lots where id = v_lot.id),
    'total', (select total from public.ruul_lots where id = v_lot.id),
    'reportes', (select count(*) from public.ruul_paiements where statut = 'reporte'));
end;
$$;

/** Le lot d'une semaine pour la carte « À payer sur Ruul » : lignes, reportés, alertes. */
create or replace function public.ruul_lot(p_semaine date default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_semaine date := coalesce(p_semaine, public.ruul_semaine_a_payer());
  v_lot public.ruul_lots;
  v_plafond numeric := coalesce((select (valeur #>> '{}')::numeric from public.reglages where cle = 'paie_plafond_ligne'), 30);
begin
  if not public.is_admin() then
    raise exception 'réservé à l''admin et au Head of Ops';
  end if;
  select * into v_lot from public.ruul_lots where semaine = v_semaine;
  return jsonb_build_object(
    'semaine', v_semaine,
    'lot', case when v_lot.id is null then null else to_jsonb(v_lot) - 'rapprochement' end,
    'rapprochement', v_lot.rapprochement,
    'lignes', coalesce((
      select jsonb_agg(x order by x->>'nom') from (
        select jsonb_build_object(
          'poster_id', pr.id,
          'nom', coalesce(nullif(btrim(concat_ws(' ', pr.prenom, pr.nom)), ''), pr.email),
          'ruul_email', pr.ruul_email,
          'pays', public.paie_pays_posteur(pr.id),
          'semaines', jsonb_agg(jsonb_build_object('id', rp.id, 'semaine', rp.semaine, 'montant', rp.montant, 'rattrapage', rp.rattrapage,
                                                   'statut', rp.statut, 'nb_comptes', rp.nb_comptes, 'faits', rp.faits, 'prevus', rp.prevus,
                                                   'paye_at', rp.paye_at, 'ecart', rp.ecart) order by rp.semaine),
          'total', sum(rp.montant),
          'alertes', array_remove(array[
             case when nullif(btrim(coalesce(pr.ruul_email, '')), '') is null then 'email Ruul manquant' end,
             case when pr.ruul_premier_paiement_at is null then '1er paiement' end,
             case when bool_or(rp.rattrapage) then 'rattrapage' end,
             case when sum(rp.montant) > v_plafond then 'au-dessus du plafond par ligne (' || v_plafond || ' $)' end,
             case when sum(rp.montant) > coalesce((select max(h.montant) from public.ruul_paiements h
                                                    where h.poster_id = pr.id and h.statut = 'paye'), sum(rp.montant))
                  then 'plus élevé que d''habitude' end], null)) x
          from public.ruul_paiements rp
          join public.profiles pr on pr.id = rp.poster_id
         where rp.lot_id = v_lot.id and rp.statut in ('a_payer', 'paye')
         group by pr.id) t), '[]'::jsonb),
    'reportes', coalesce((
      select jsonb_agg(jsonb_build_object(
               'poster_id', pr.id, 'nom', coalesce(nullif(btrim(concat_ws(' ', pr.prenom, pr.nom)), ''), pr.email),
               'ruul_statut', pr.ruul_statut, 'semaine', rp.semaine, 'montant', rp.montant, 'raison', rp.raison_report)
             order by pr.prenom, rp.semaine)
        from public.ruul_paiements rp join public.profiles pr on pr.id = rp.poster_id
       where rp.statut = 'reporte'), '[]'::jsonb));
end;
$$;

/** « Saisi » : Max colle le numéro de facture Ruul ; le lot est verrouillé. */
create or replace function public.ruul_lot_saisir(p_semaine date, p_facture text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lot public.ruul_lots;
begin
  if not public.is_admin() then raise exception 'réservé à l''admin et au Head of Ops'; end if;
  select * into v_lot from public.ruul_lots where semaine = p_semaine for update;
  if v_lot.id is null then return jsonb_build_object('ok', false, 'erreur', 'lot introuvable'); end if;
  if v_lot.statut not in ('prepare', 'saisi') then return jsonb_build_object('ok', false, 'erreur', 'lot déjà ' || v_lot.statut); end if;
  if nullif(btrim(coalesce(p_facture, '')), '') is null then return jsonb_build_object('ok', false, 'erreur', 'numéro de facture requis'); end if;
  if v_lot.nb = 0 then return jsonb_build_object('ok', false, 'erreur', 'lot vide'); end if;
  update public.ruul_lots set statut = 'saisi', facture = left(btrim(p_facture), 120), saisi_at = now(), saisi_par = auth.uid()
   where id = v_lot.id;
  return jsonb_build_object('ok', true);
end;
$$;

/**
 * « Payé sur Ruul » (clic de Max, après avoir payé sur Ruul) : les lignes du
 * lot passent en payé (date + qui), la ligne de Payroll aussi, le 1er
 * paiement est noté, et le message au posteur part (fonction ruul).
 */
create or replace function public.ruul_lot_payer(p_semaine date)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lot public.ruul_lots;
  n int;
begin
  if not public.is_admin() then raise exception 'réservé à l''admin et au Head of Ops'; end if;
  select * into v_lot from public.ruul_lots where semaine = p_semaine for update;
  if v_lot.id is null then return jsonb_build_object('ok', false, 'erreur', 'lot introuvable'); end if;
  if v_lot.statut <> 'saisi' then
    return jsonb_build_object('ok', false, 'erreur', case when v_lot.statut = 'prepare' then 'colle d''abord le numéro de facture Ruul' else 'lot déjà ' || v_lot.statut end);
  end if;
  update public.ruul_paiements
     set statut = 'paye', paye_at = now(), paye_par = auth.uid(), message_statut = 'a_envoyer', maj_at = now()
   where lot_id = v_lot.id and statut = 'a_payer';
  get diagnostics n = row_count;
  update public.paie_semaines ps
     set paye_at = now(), paye_par = auth.uid()
    from public.ruul_paiements rp
   where rp.lot_id = v_lot.id and rp.statut = 'paye' and ps.poster_id = rp.poster_id and ps.semaine = rp.semaine and ps.paye_at is null;
  update public.profiles pr
     set ruul_premier_paiement_at = coalesce(pr.ruul_premier_paiement_at, now()),
         ruul_pret_at = coalesce(pr.ruul_pret_at, now()),
         ruul_statut = 'paye_1x'
   where pr.id in (select poster_id from public.ruul_paiements where lot_id = v_lot.id and statut = 'paye');
  update public.ruul_lots set statut = 'paye', paye_at = now(), paye_par = auth.uid() where id = v_lot.id;
  return jsonb_build_object('ok', true, 'payes', n);
end;
$$;

/**
 * Rapprochement : les lignes de l'export Ruul ([{email, montant}]) comparées
 * au lot, posteur par posteur. Les écarts vont dans Problems.
 */
create or replace function public.ruul_lot_rapprocher(p_semaine date, p_lignes jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lot public.ruul_lots;
  v_res jsonb;
  r record;
begin
  if not public.is_admin() then raise exception 'réservé à l''admin et au Head of Ops'; end if;
  select * into v_lot from public.ruul_lots where semaine = p_semaine for update;
  if v_lot.id is null or v_lot.statut not in ('paye', 'rapproche') then
    return jsonb_build_object('ok', false, 'erreur', 'le lot doit être payé avant le rapprochement');
  end if;
  with export as (
    select lower(btrim(e->>'email')) as email, sum(nullif(regexp_replace(coalesce(e->>'montant', ''), '[^0-9.,-]', '', 'g'), '')::numeric) as montant
      from jsonb_array_elements(coalesce(p_lignes, '[]'::jsonb)) e
     where nullif(btrim(coalesce(e->>'email', '')), '') is not null
     group by 1
  ),
  lot as (
    select lower(btrim(pr.ruul_email)) as email, pr.id as poster_id,
           coalesce(nullif(btrim(concat_ws(' ', pr.prenom, pr.nom)), ''), pr.email) as nom, sum(rp.montant) as montant
      from public.ruul_paiements rp join public.profiles pr on pr.id = rp.poster_id
     where rp.lot_id = v_lot.id and rp.statut = 'paye'
     group by 1, 2, 3
  )
  select jsonb_agg(jsonb_build_object('email', coalesce(l.email, e.email), 'nom', l.nom, 'poster_id', l.poster_id,
                                      'attendu', l.montant, 'ruul', e.montant,
                                      'resultat', case when l.email is null then 'absent du lot'
                                                       when e.email is null then 'absent de l''export Ruul'
                                                       when abs(l.montant - e.montant) > 0.009 then 'montant différent'
                                                       else 'ok' end) order by l.nom)
    into v_res
    from lot l full join export e on e.email = l.email;

  for r in select * from jsonb_array_elements(coalesce(v_res, '[]'::jsonb)) x(v) where x.v->>'resultat' <> 'ok' loop
    update public.ruul_paiements set ecart = r.v->>'resultat', maj_at = now()
     where lot_id = v_lot.id and poster_id = nullif(r.v->>'poster_id', '')::uuid;
    perform public.probleme_ajouter('ruul_rapprochement', v_lot.semaine::text || ':' || coalesce(r.v->>'email', '?'),
      nullif(r.v->>'poster_id', '')::uuid, null, 'paie',
      'Ruul : ' || (r.v->>'resultat'),
      format('Lot Ruul du %s : %s (%s) — attendu %s $, Ruul %s $.', v_lot.semaine, coalesce(r.v->>'nom', '?'),
             coalesce(r.v->>'email', '?'), coalesce(r.v->>'attendu', '0'), coalesce(r.v->>'ruul', '0')),
      now(), null, 'os', null);
  end loop;

  update public.ruul_lots set statut = 'rapproche', rapproche_at = now(), rapproche_par = auth.uid(), rapprochement = v_res
   where id = v_lot.id;
  return jsonb_build_object('ok', true, 'lignes', v_res,
    'ecarts', (select count(*) from jsonb_array_elements(coalesce(v_res, '[]'::jsonb)) x(v) where x.v->>'resultat' <> 'ok'));
end;
$$;

/** La carte « À ajouter sur Ruul » et le suivi des statuts Ruul. */
create or replace function public.ruul_posteurs()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'réservé à l''admin et au Head of Ops'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'poster_id', pr.id, 'nom', coalesce(nullif(btrim(concat_ws(' ', pr.prenom, pr.nom)), ''), pr.email),
             'prenom_legal', h.prenom_legal, 'nom_legal', h.nom_legal,
             'ruul_email', pr.ruul_email, 'ruul_statut', pr.ruul_statut, 'pays', public.paie_pays_posteur(pr.id),
             'cohorte', coalesce(pr.cohorte_lundi, h.debut_le), 'actif', pr.is_active,
             'ajoute_at', pr.ruul_ajoute_at, 'pret_at', pr.ruul_pret_at, 'premier_paiement_at', pr.ruul_premier_paiement_at,
             'relances', pr.ruul_relances, 'relance_at', pr.ruul_relance_at, 'stop_at', pr.relances_stop_at,
             'du', (select coalesce(sum(rp.montant), 0) from public.ruul_paiements rp where rp.poster_id = pr.id and rp.statut in ('a_payer', 'reporte')))
           order by pr.ruul_statut, pr.prenom)
      from public.profiles pr
      left join public.hub_posteurs h on h.profile_id = pr.id
     where pr.canal_paie = 'ruul'), '[]'::jsonb);
end;
$$;

/** « Ajouté sur Ruul » (a_ajouter → invite), « Prêt » à la main, l'email Ruul corrigé. */
create or replace function public.ruul_statut_changer(p_poster uuid, p_statut text, p_email text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.profiles;
begin
  if coalesce(auth.role(), '') in ('anon', 'authenticated') and not public.is_admin() then
    raise exception 'réservé à l''admin et au Head of Ops';
  end if;
  select * into v from public.profiles where id = p_poster and canal_paie = 'ruul' for update;
  if v.id is null then return jsonb_build_object('ok', false, 'erreur', 'posteur Ruul introuvable'); end if;
  if p_email is not null then
    if p_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]{2,}$' then return jsonb_build_object('ok', false, 'erreur', 'email invalide'); end if;
    update public.profiles set ruul_email = lower(btrim(p_email)) where id = p_poster;
  end if;
  if p_statut is null then return jsonb_build_object('ok', true); end if;
  if p_statut = 'invite' then
    if nullif(btrim(coalesce(coalesce(p_email, v.ruul_email), '')), '') is null then
      return jsonb_build_object('ok', false, 'erreur', 'email Ruul manquant');
    end if;
    update public.profiles
       set ruul_statut = case when ruul_statut in ('pret', 'paye_1x') then ruul_statut else 'invite' end,
           ruul_ajoute_at = coalesce(ruul_ajoute_at, now()), ruul_relances = 0, ruul_relance_at = null,
           ruul_jeton = coalesce(ruul_jeton, gen_random_uuid())
     where id = p_poster;
  elsif p_statut = 'pret' then
    update public.profiles
       set ruul_statut = case when ruul_statut = 'paye_1x' then ruul_statut else 'pret' end,
           ruul_pret_at = coalesce(ruul_pret_at, now())
     where id = p_poster;
  elsif p_statut = 'a_ajouter' then
    update public.profiles set ruul_statut = 'a_ajouter', ruul_ajoute_at = null where id = p_poster and ruul_statut is distinct from 'paye_1x';
  else
    return jsonb_build_object('ok', false, 'erreur', 'statut inconnu');
  end if;
  return jsonb_build_object('ok', true, 'statut', (select ruul_statut from public.profiles where id = p_poster));
end;
$$;

/** Le bouton « It's done » de l'email (jeton du posteur) : prêt à être payé. */
create or replace function public.ruul_pret_jeton(p_jeton uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  update public.profiles
     set ruul_statut = case when ruul_statut = 'paye_1x' then ruul_statut else 'pret' end,
         ruul_pret_at = coalesce(ruul_pret_at, now())
   where ruul_jeton = p_jeton and canal_paie = 'ruul'
  returning id into v_id;
  return case when v_id is null then null else coalesce((select prenom from public.profiles where id = v_id), '') end;
end;
$$;

/** Le tableau de bord Ruul (page Paie). */
create or replace function public.ruul_tableau()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_semaine date := public.ruul_semaine_a_payer();
begin
  if not public.is_admin() then raise exception 'réservé à l''admin et au Head of Ops'; end if;
  return jsonb_build_object(
    'mode', coalesce((select valeur #>> '{}' from public.reglages where cle = 'ruul_mode'), 'manuel'),
    'statuts', coalesce((select jsonb_object_agg(coalesce(ruul_statut, 'aucun'), n) from (
        select ruul_statut, count(*) n from public.profiles where canal_paie = 'ruul' and is_active group by 1) s), '{}'::jsonb),
    'semaine', v_semaine,
    'lot', (select jsonb_build_object('statut', statut, 'total', total, 'nb', nb, 'facture', facture) from public.ruul_lots where semaine = v_semaine),
    'rattrapages', jsonb_build_object(
       'nb', (select count(*) from public.ruul_paiements where rattrapage and statut in ('a_payer', 'reporte')),
       'total', (select coalesce(sum(montant), 0) from public.ruul_paiements where rattrapage and statut in ('a_payer', 'reporte'))),
    'reportes', (select count(*) from public.ruul_paiements where statut = 'reporte'));
end;
$$;

revoke execute on function public.ruul_lot_preparer(date) from public, anon;
revoke execute on function public.ruul_lot(date) from public, anon;
revoke execute on function public.ruul_lot_saisir(date, text) from public, anon;
revoke execute on function public.ruul_lot_payer(date) from public, anon;
revoke execute on function public.ruul_lot_rapprocher(date, jsonb) from public, anon;
revoke execute on function public.ruul_posteurs() from public, anon;
revoke execute on function public.ruul_statut_changer(uuid, text, text) from public, anon;
revoke execute on function public.ruul_tableau() from public, anon;
revoke execute on function public.ruul_pret_jeton(uuid) from public, anon, authenticated;
grant execute on function public.ruul_lot_preparer(date) to authenticated, service_role;
grant execute on function public.ruul_lot(date) to authenticated;
grant execute on function public.ruul_lot_saisir(date, text) to authenticated;
grant execute on function public.ruul_lot_payer(date) to authenticated;
grant execute on function public.ruul_lot_rapprocher(date, jsonb) to authenticated;
grant execute on function public.ruul_posteurs() to authenticated;
grant execute on function public.ruul_statut_changer(uuid, text, text) to authenticated, service_role;
grant execute on function public.ruul_tableau() to authenticated;
grant execute on function public.ruul_pret_jeton(uuid) to service_role;
