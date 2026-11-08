-- 0564 : les bonus du lundi 9/11 (Comment Masters, parrainage, bonus en une phrase).
--
-- 1. Comment Masters : un tarif par commentaire validé selon la zone du pays du
--    Comment Master (A 0,50 $, B 0,35 $, C 0,25 $). Validé = demande faite
--    (fait_at, comptée au mandat) ET retrouvée publiée ; les faits non retrouvés
--    sont « à vérifier », à part. Premier lundi : 9/11, qui couvre tout ce qui
--    n'a jamais été payé jusqu'au dimanche 8/11 ; ensuite toutes les 4 semaines.
--    Le délai alerte Slack → commentaire (médiane, part en moins de 2 h) est
--    gardé sur chaque ligne.
-- 2. Parrainage : bonus_parrainage_actif = on ; les lignes de 10 $ sont « à
--    valider » et ne partent plus seules le lundi (le cron ne fait plus que les
--    calculer).
-- 3. Bonus en une phrase : bonus_donner (une ligne « manuel » à valider).
-- 4. La carte « Bonus de lundi » (Weekly decisions) : bonus_carte,
--    bonus_retirer. Rien ne part sans le clic de Max (« Tout envoyer » →
--    fonction upwork, action bonus_envoyer).
-- 5. Serbie et Slovénie : régions coupées (plus d'alertes) jusqu'à de
--    nouveaux Comment Masters.
--
-- Additif : colonnes, fonctions, réglages ; les contraintes de type et de
-- statut acceptent les nouvelles valeurs. Aucune ligne supprimée.

-- ---------------------------------------------------------------------------
-- Table bonus : nouvelles valeurs et colonnes
-- ---------------------------------------------------------------------------
do $$
declare c record;
begin
  for c in select conname from pg_constraint
            where conrelid = 'public.bonus'::regclass and contype = 'c'
              and (pg_get_constraintdef(oid) ilike '%type%' or pg_get_constraintdef(oid) ilike '%statut%')
  loop
    execute format('alter table public.bonus drop constraint %I', c.conname);
  end loop;
end $$;

alter table public.bonus
  add constraint bonus_type_check check (type in ('parrainage', 'comment_master', 'manuel')),
  add constraint bonus_statut_check check (statut in ('a_valider', 'a_payer', 'paye', 'retire'));

alter table public.bonus
  add column if not exists tarif            numeric,
  add column if not exists zone             text,
  add column if not exists a_verifier       integer,
  add column if not exists delai_median_min integer,
  add column if not exists part_moins_2h    numeric,
  add column if not exists raison           text,
  add column if not exists cree_par         uuid,
  add column if not exists valide_par       uuid,
  add column if not exists valide_at        timestamptz,
  add column if not exists retire_par       uuid,
  add column if not exists retire_at        timestamptz;

-- ---------------------------------------------------------------------------
-- Réglages
-- ---------------------------------------------------------------------------
update public.reglages
   set valeur = coalesce(valeur, '{}'::jsonb) || jsonb_build_object(
         'premier_lundi', '2026-11-09',
         'comment_master_par_commentaire', 0,
         'comment_master_tarif_a', 0.5,
         'comment_master_tarif_b', 0.35,
         'comment_master_tarif_c', 0.25),
       updated_at = now()
 where cle = 'bonus';

insert into public.reglages (cle, valeur) values
  ('bonus_slack_autorises', '["U0BL5FRLBEU", "U0BMTK7BLCW"]'::jsonb)
on conflict (cle) do nothing;

create or replace function public.bonus_reglages()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'parrainage_montant', coalesce((v->>'parrainage_montant')::numeric, 0),
    'parrainage_semaines_min', coalesce((v->>'parrainage_semaines_min')::int, 2),
    'parrainage_posts_min_semaine', coalesce((v->>'parrainage_posts_min_semaine')::int, 12),
    'comment_master_par_commentaire', coalesce((v->>'comment_master_par_commentaire')::numeric, 0),
    'comment_master_tarif_a', coalesce((v->>'comment_master_tarif_a')::numeric, 0.5),
    'comment_master_tarif_b', coalesce((v->>'comment_master_tarif_b')::numeric, 0.35),
    'comment_master_tarif_c', coalesce((v->>'comment_master_tarif_c')::numeric, 0.25),
    'premier_lundi', coalesce(v->>'premier_lundi', '2026-11-09'))
  from (select coalesce((select valeur from public.reglages where cle = 'bonus'), '{}'::jsonb) as v) r;
$$;

/** La zone (A, B, C) du pays d'un posteur et le tarif d'un commentaire validé. */
create or replace function public.bonus_cm_tarif(p_profile uuid)
returns table (zone text, tarif numeric)
language sql
stable
security definer
set search_path = public
as $$
  select z.zone,
         case z.zone when 'A' then (r->>'comment_master_tarif_a')::numeric
                     when 'B' then (r->>'comment_master_tarif_b')::numeric
                     when 'C' then (r->>'comment_master_tarif_c')::numeric end
    from (select public.bonus_reglages() r) x
    left join lateral (
      select zp.zone from public.zones_paie_pays zp
       where zp.pays = public.paie_pays_posteur(p_profile) and zp.retire_at is null limit 1
    ) z on true;
$$;

/** Le prochain lundi (aujourd'hui si on est lundi), heure de Paris. */
create or replace function public.bonus_lundi_carte()
returns date
language sql
stable
as $$
  select d + ((8 - extract(isodow from d)::int) % 7)
    from (select (now() at time zone 'Europe/Paris')::date d) x;
$$;

-- ---------------------------------------------------------------------------
-- Comment Masters : le calcul d'un lundi bonus
-- ---------------------------------------------------------------------------
create or replace function public.bonus_cm_calculer(p_lundi date)
returns table (
  poster_id uuid, periode_debut date, periode_fin date, detail text, quantite integer,
  a_verifier integer, tarif numeric, zone text, montant numeric, delai_median_min integer, part_moins_2h numeric
)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_premier date := (public.bonus_reglages()->>'premier_lundi')::date;
  -- Le premier lundi couvre tout ce qui n'a jamais été payé.
  v_debut date := case when p_lundi <= v_premier then date '2026-01-01' else p_lundi - 28 end;
  v_fin date := p_lundi - 1;
begin
  return query
  select d.cm_profile_id, v_debut, v_fin,
         format('%s commentaires validés jusqu''au %s', count(*) filter (where d.verifie), public.bonus_date_courte(v_fin))
           || case when count(*) filter (where not d.verifie) > 0
                   then format(' · %s à vérifier (non retrouvés)', count(*) filter (where not d.verifie)) else '' end,
         (count(*) filter (where d.verifie))::int,
         (count(*) filter (where not d.verifie))::int,
         t.tarif, t.zone,
         round((count(*) filter (where d.verifie)) * coalesce(t.tarif, 0), 2),
         (percentile_cont(0.5) within group (order by extract(epoch from d.fait_at - d.envoye_at) / 60))::int,
         round(avg(case when d.fait_at - d.envoye_at <= interval '2 hours' then 1 else 0 end), 3)
    from public.cm_demandes_toutes(v_debut, v_fin) d
    cross join lateral public.bonus_cm_tarif(d.cm_profile_id) t
   where d.compte and d.cm_profile_id is not null
   group by d.cm_profile_id, t.tarif, t.zone;
end;
$$;

revoke execute on function public.bonus_cm_calculer(date) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Génération (idempotente ; ne touche jamais une ligne envoyée, payée ou retirée)
-- ---------------------------------------------------------------------------
create or replace function public.bonus_generer(p_lundi date)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer;
begin
  if coalesce(auth.role(), '') in ('anon', 'authenticated') and not public.is_admin() then
    raise exception 'bonus_generer : réservé à l''admin et au Head of Ops';
  end if;
  if p_lundi <> public.bonus_prochain_lundi(p_lundi) then
    raise exception 'bonus_generer : % n''est pas un lundi bonus', p_lundi;
  end if;

  with c as (select * from public.bonus_cm_calculer(p_lundi) where quantite > 0 or a_verifier > 0),
  cm as (
    insert into public.bonus as b (poster_id, type, lundi_bonus, periode_debut, periode_fin, detail, quantite, verifies,
                                   a_verifier, tarif, zone, montant, delai_median_min, part_moins_2h, statut)
    select c.poster_id, 'comment_master', p_lundi, c.periode_debut, c.periode_fin, c.detail, c.quantite, c.quantite,
           c.a_verifier, c.tarif, c.zone, c.montant, c.delai_median_min, c.part_moins_2h, 'a_valider'
      from c
    on conflict (poster_id, lundi_bonus) where type = 'comment_master' do update
       set periode_debut = excluded.periode_debut, periode_fin = excluded.periode_fin, detail = excluded.detail,
           quantite = excluded.quantite, verifies = excluded.verifies, a_verifier = excluded.a_verifier,
           tarif = excluded.tarif, zone = excluded.zone, montant = excluded.montant,
           delai_median_min = excluded.delai_median_min, part_moins_2h = excluded.part_moins_2h, calcule_at = now()
     where b.statut in ('a_valider', 'a_payer') and b.envoi_at is null
    returning 1
  )
  select count(*) into n from cm;
  return n + public.parrainage_bonus_lundi(p_lundi);
end;
$$;

revoke execute on function public.bonus_generer(date) from public, anon;
grant execute on function public.bonus_generer(date) to authenticated, service_role;

-- Parrainage : 10 $ au parrain dont le filleul a fait 2 semaines actives ; à valider par Max.
create or replace function public.parrainage_bonus_lundi(p_lundi date default null)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lundi date := coalesce(p_lundi, public.bonus_lundi_carte());
  r jsonb := public.bonus_reglages();
  n integer;
begin
  if not public.bonus_parrainage_actif() or coalesce((r->>'parrainage_montant')::numeric, 0) <= 0 then return 0; end if;
  insert into public.bonus (poster_id, type, referral_id, recrue_id, lundi_bonus, periode_debut, periode_fin, detail, quantite, montant, statut)
  select f.referrer_id, 'parrainage', f.id, f.recrue_id, v_lundi, f.created_at::date, v_lundi - 1,
         format('parrainage de %s, %s semaines actives', coalesce(nullif(btrim(concat_ws(' ', rp.prenom, rp.nom)), ''), 'filleul'), s.n),
         s.n, (r->>'parrainage_montant')::numeric, 'a_valider'
    from public.creator_referrals f
    join public.profiles rp on rp.id = f.recrue_id
    cross join lateral (select public.bonus_semaines_completes(f.recrue_id, v_lundi - 1, coalesce((r->>'parrainage_posts_min_semaine')::int, 12)) as n) s
   where f.statut = 'accepte' and f.recrue_id is not null
     and s.n >= coalesce((r->>'parrainage_semaines_min')::int, 2)
     and not exists (select 1 from public.bonus b where b.referral_id = f.id)
  on conflict (referral_id) do nothing;
  get diagnostics n = row_count;
  return n;
end;
$$;

revoke execute on function public.parrainage_bonus_lundi(date) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Bonus en une phrase : une ligne « manuel » à valider
-- ---------------------------------------------------------------------------
create or replace function public.bonus_donner(p_nom text, p_montant numeric, p_lundi date, p_raison text, p_par uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cle text := public.nom_cle(p_nom);
  v_ids uuid[];
  v_lundi date := coalesce(p_lundi, public.bonus_lundi_carte());
  v_id uuid;
  v_nom text;
begin
  if coalesce(auth.role(), '') in ('anon', 'authenticated') and not public.is_admin() then
    raise exception 'réservé à l''admin et au Head of Ops';
  end if;
  if p_montant is null or p_montant <= 0 or p_montant > 100 then
    return jsonb_build_object('ok', false, 'erreur', 'montant entre 0 et 100 $');
  end if;
  if extract(isodow from v_lundi) <> 1 or v_lundi < public.bonus_lundi_carte() then
    return jsonb_build_object('ok', false, 'erreur', 'la date doit être un lundi à venir');
  end if;
  if length(v_cle) < 3 then
    return jsonb_build_object('ok', false, 'erreur', 'nom manquant');
  end if;
  select array_agg(distinct p.id) into v_ids
    from public.profiles p
    left join public.hub_posteurs h on h.profile_id = p.id
   where public.nom_cle(concat(p.prenom, p.nom)) = v_cle
      or public.nom_cle(concat(h.prenom_legal, h.nom_legal)) = v_cle
      or public.nom_cle(concat(p.nom, p.prenom)) = v_cle;
  if coalesce(array_length(v_ids, 1), 0) = 0 then
    return jsonb_build_object('ok', false, 'erreur', format('personne ne s''appelle « %s »', p_nom));
  end if;
  if array_length(v_ids, 1) > 1 then
    return jsonb_build_object('ok', false, 'erreur', format('%s personnes s''appellent « %s » : préciser', array_length(v_ids, 1), p_nom));
  end if;
  select concat_ws(' ', prenom, nom) into v_nom from public.profiles where id = v_ids[1];
  insert into public.bonus (poster_id, type, lundi_bonus, periode_debut, periode_fin, detail, quantite, montant, statut, raison, cree_par)
  values (v_ids[1], 'manuel', v_lundi, v_lundi, v_lundi, coalesce(nullif(btrim(p_raison), ''), 'bonus'), 1, round(p_montant, 2), 'a_valider',
          coalesce(nullif(btrim(p_raison), ''), 'bonus'), coalesce(p_par, auth.uid()))
  returning id into v_id;
  return jsonb_build_object('ok', true, 'id', v_id, 'nom', v_nom, 'montant', round(p_montant, 2), 'lundi', v_lundi);
end;
$$;

revoke execute on function public.bonus_donner(text, numeric, date, text, uuid) from public, anon;
grant execute on function public.bonus_donner(text, numeric, date, text, uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- La carte « Bonus de lundi » et « Retirer une ligne »
-- ---------------------------------------------------------------------------
create or replace function public.bonus_carte(p_lundi date default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_lundi date := coalesce(p_lundi, public.bonus_lundi_carte());
  v jsonb;
begin
  if not public.is_admin() then
    raise exception 'réservé à l''admin et au Head of Ops';
  end if;
  with l as (
    select b.*, coalesce(nullif(btrim(concat_ws(' ', p.prenom, p.nom)), ''), p.email) as nom,
           p.upwork_contract_id is not null and uc.organisation_id = '2074065383597823773' as contrat_ok
      from public.bonus b
      join public.profiles p on p.id = b.poster_id
      left join public.upwork_contrats uc on uc.contrat_id = p.upwork_contract_id
     where b.lundi_bonus = v_lundi
  )
  select jsonb_build_object(
    'lundi', v_lundi,
    'lignes', coalesce((select jsonb_agg(jsonb_build_object(
        'id', l.id, 'type', l.type, 'nom', l.nom, 'detail', l.detail, 'quantite', l.quantite, 'a_verifier', l.a_verifier,
        'tarif', l.tarif, 'zone', l.zone, 'montant', l.montant, 'statut', l.statut, 'erreur', l.erreur, 'raison', l.raison,
        'periode_debut', l.periode_debut, 'periode_fin', l.periode_fin, 'delai_median_min', l.delai_median_min,
        'part_moins_2h', l.part_moins_2h, 'contrat_ok', l.contrat_ok, 'envoi_at', l.envoi_at, 'paye_at', l.paye_at)
        order by case l.type when 'comment_master' then 0 when 'parrainage' then 1 else 2 end, l.montant desc) from l), '[]'::jsonb),
    'total', coalesce((select sum(montant) from l where statut in ('a_valider', 'a_payer')), 0),
    'paye', coalesce((select sum(montant) from l where statut = 'paye'), 0),
    'parrainages_a_confirmer', (select count(*) from public.parrainages_detections where statut = 'a_confirmer'),
    'test_valide', exists (select 1 from public.upwork_bonus_tests where statut = 'envoye' and valide_at is not null)
  ) into v;
  return v;
end;
$$;

revoke execute on function public.bonus_carte(date) from public, anon;
grant execute on function public.bonus_carte(date) to authenticated;

create or replace function public.bonus_retirer(p_id uuid, p_retirer boolean default true)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'réservé à l''admin et au Head of Ops';
  end if;
  update public.bonus
     set statut = case when p_retirer then 'retire' else 'a_valider' end,
         retire_par = case when p_retirer then auth.uid() end,
         retire_at = case when p_retirer then now() end
   where id = p_id
     and envoi_at is null
     and statut in ('a_valider', 'a_payer', 'retire');
  if not found then
    raise exception 'ligne introuvable ou déjà envoyée';
  end if;
end;
$$;

revoke execute on function public.bonus_retirer(uuid, boolean) from public, anon;
grant execute on function public.bonus_retirer(uuid, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- Parrainage : allumé ; le lundi, le cron calcule seulement (plus de paiement seul)
-- ---------------------------------------------------------------------------
update public.reglages set valeur = 'true'::jsonb, updated_at = now() where cle = 'bonus_parrainage_actif';

do $$
begin
  if exists (select 1 from cron.job where jobname = 'parrainage-bonus-lundi') then
    perform cron.unschedule('parrainage-bonus-lundi');
  end if;
end $$;
select cron.schedule('parrainage-bonus-lundi', '15 7 * * 1', $c$select public.parrainage_bonus_lundi()$c$);

-- ---------------------------------------------------------------------------
-- Serbie et Slovénie : plus d'alertes jusqu'à de nouveaux Comment Masters
-- ---------------------------------------------------------------------------
update public.comment_master_regions set actif = false, maj_at = now() where langue in ('sr', 'sl') and actif;

-- ---------------------------------------------------------------------------
-- Le calcul du lundi 9/11, tout de suite
-- ---------------------------------------------------------------------------
select public.bonus_generer('2026-11-09');
