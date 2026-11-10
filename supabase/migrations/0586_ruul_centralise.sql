-- 0586 : Ruul dans l'OS, tout centralisé (demande de Max, 10/11). L'OS est la
-- seule source de vérité d'un posteur Ruul, de la signature à la paie ; le
-- site ne fait plus que candidature + contrat.
--
-- 1. Profil : zone, tarif de la semaine (USD) et application du site, reçus de
--    creer_posteur ; l'email Ruul peut arriver plus tard (maj_ruul, bandeau).
-- 2. Email Ruul manquant : le posteur l'ajoute lui-même (ruul_mon_email_*),
--    relances J+1, J+3 puis le vendredi avant sa 1re paie (email + #ruul-posters),
--    derrière l'interrupteur ruul_email_relances (éteint).
-- 3. Ajout dans Ruul (manuel) : ruul_ajoute_at ; la liste du dimanche 18 h
--    (ruul_a_ajouter_liste) ; « Marquer ajouté dans Ruul » (ruul_marquer_ajoutes).
-- 4. Paie Ruul du lundi (ruul_lot_preparer remplacée) : semaine lundi → dimanche,
--    tarif de la semaine (profil, sinon zone) par compte qui a posté, aucune
--    retenue ; 0 post sur la semaine = 0 $, signalé ; les bonus de parrainage
--    « à payer via Ruul » ajoutés à la ligne du parrain. « Marquer payé » sans
--    numéro de facture obligatoire ; l'annonce « Payment sent… » dans
--    #ruul-posters. Une seule paie par posteur et par semaine, toutes plateformes.
-- 5. La paie Upwork (paie_generer) ne prend plus les posteurs Ruul.
-- 6. ruul_suivi() : la page admin « Ruul ».
-- Additif : colonnes, tables, fonctions remplacées ou patchées en place, un
-- déclencheur de garde, une tâche. Aucune ligne supprimée.

alter table public.profiles add column if not exists ruul_zone text;
alter table public.profiles add column if not exists ruul_tarif_semaine numeric;
alter table public.profiles add column if not exists site_application_id text;

alter table public.ruul_paiements add column if not exists bonus numeric not null default 0;
alter table public.ruul_paiements add column if not exists bonus_ids uuid[] not null default '{}';
alter table public.ruul_lots add column if not exists annonce_at timestamptz;
alter table public.ruul_lots add column if not exists notifie_at timestamptz;

insert into public.reglages (cle, valeur) values
  ('ruul_slack_canal', '"C0CA5SH59N0"'::jsonb),
  ('ruul_email_relances', 'false'::jsonb)
on conflict (cle) do nothing;

/* Le tarif d'une semaine Ruul : celui du site (profil), sinon celui de la zone du pays. */
create or replace function public.ruul_tarif(p_poster uuid)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select pr.ruul_tarif_semaine from public.profiles pr where pr.id = p_poster and pr.ruul_tarif_semaine > 0),
    (select zp.tarif from public.zones_paie_pays z join public.zones_paie zp on zp.zone = z.zone
      where upper(z.pays) = upper(public.paie_pays_posteur(p_poster)) and z.retire_at is null limit 1));
$$;

-- 2. L'email Ruul ---------------------------------------------------------------

create or replace function public.ruul_mon_email()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object('ruul', coalesce(pr.canal_paie = 'ruul', false), 'email', nullif(btrim(coalesce(pr.ruul_email, '')), ''))
    from public.profiles pr where pr.id = auth.uid();
$$;

create or replace function public.ruul_mon_email_enregistrer(p_email text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
begin
  if auth.uid() is null then raise exception 'not signed in' using errcode = '42501'; end if;
  if v_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]{2,}$' then return jsonb_build_object('ok', false, 'erreur', 'Please enter a valid email address.'); end if;
  update public.profiles set ruul_email = v_email where id = auth.uid() and canal_paie = 'ruul';
  if not found then return jsonb_build_object('ok', false, 'erreur', 'Not a Ruul account.'); end if;
  return jsonb_build_object('ok', true);
end;
$$;

revoke execute on function public.ruul_mon_email() from public, anon;
revoke execute on function public.ruul_mon_email_enregistrer(text) from public, anon;
grant execute on function public.ruul_mon_email() to authenticated;
grant execute on function public.ruul_mon_email_enregistrer(text) to authenticated;

/* hub-posteurs « maj_ruul » : le site signale un nouvel email Ruul. */
create or replace function public.ruul_maj_email(p_profile uuid, p_hub uuid, p_email text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid := coalesce(p_profile, (select h.profile_id from public.hub_posteurs h where h.hub_id = p_hub));
  v_email text := nullif(lower(btrim(coalesce(p_email, ''))), '');
begin
  if v_id is null then return jsonb_build_object('ok', false, 'error', 'posteur introuvable'); end if;
  if v_email is not null and v_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]{2,}$' then return jsonb_build_object('ok', false, 'error', 'email invalide'); end if;
  update public.profiles set ruul_email = v_email where id = v_id and canal_paie = 'ruul';
  if not found then return jsonb_build_object('ok', false, 'error', 'pas un posteur Ruul'); end if;
  return jsonb_build_object('ok', true, 'profile_id', v_id);
end;
$$;

revoke execute on function public.ruul_maj_email(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.ruul_maj_email(uuid, uuid, text) to service_role;

create table if not exists public.ruul_email_relances (
  poster_id  uuid not null references public.profiles(id),
  etape      text not null check (etape in ('j1', 'j3', 'vendredi')),
  canaux     text[] not null default '{}',
  erreur     text,
  envoye_at  timestamptz not null default now(),
  primary key (poster_id, etape)
);
alter table public.ruul_email_relances enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'ruul_email_relances' and policyname = 'ruul_email_relances_admin') then
    create policy ruul_email_relances_admin on public.ruul_email_relances for select to authenticated using (public.is_admin());
  end if;
end $$;

/* Les relances dues (la plus récente seulement) : J+1, J+3 après la création du compte, le vendredi avant la 1re paie. */
create or replace function public.ruul_email_relances_dues()
returns table (poster_id uuid, prenom text, email text, slack_user_id text, etape text)
language sql
stable
security definer
set search_path = public
as $$
  with p as (
    select pr.id, pr.prenom, pr.slack_user_id,
           coalesce(nullif(btrim(h.email_perso), ''), nullif(btrim(pr.email_perso), '')) as email,
           coalesce(h.cree_at, pr.created_at) as cree,
           coalesce(h.debut_le, pr.cohorte_lundi) + 7 as premiere_paie
      from public.profiles pr
      left join public.hub_posteurs h on h.profile_id = pr.id
     where pr.canal_paie = 'ruul' and pr.is_active and pr.relances_stop_at is null
       and nullif(btrim(coalesce(pr.ruul_email, '')), '') is null
       and not coalesce(h.exclu_suivi, false)
  ), d as (
    select p.*, (now() at time zone 'Europe/Paris')::date as auj,
           (select array_agg(r.etape) from public.ruul_email_relances r where r.poster_id = p.id) as faites
      from p
  )
  select d.id, d.prenom, d.email, d.slack_user_id,
         case
           when d.premiere_paie is not null and d.auj >= d.premiere_paie - 3 and d.auj < d.premiere_paie
                and not ('vendredi' = any(coalesce(d.faites, '{}'))) then 'vendredi'
           when d.cree <= now() - interval '3 days' and not ('j3' = any(coalesce(d.faites, '{}')))
                and not ('vendredi' = any(coalesce(d.faites, '{}'))) then 'j3'
           when d.cree <= now() - interval '1 day' and coalesce(d.faites, '{}') = '{}' then 'j1'
         end
    from d
   where case
           when d.premiere_paie is not null and d.auj >= d.premiere_paie - 3 and d.auj < d.premiere_paie
                and not ('vendredi' = any(coalesce(d.faites, '{}'))) then true
           when d.cree <= now() - interval '3 days' and not ('j3' = any(coalesce(d.faites, '{}')))
                and not ('vendredi' = any(coalesce(d.faites, '{}'))) then true
           when d.cree <= now() - interval '1 day' and coalesce(d.faites, '{}') = '{}' then true
           else false
         end;
$$;

revoke execute on function public.ruul_email_relances_dues() from public, anon, authenticated;
grant execute on function public.ruul_email_relances_dues() to service_role;

-- 3. L'ajout dans Ruul ------------------------------------------------------------

create or replace function public.ruul_a_ajouter_liste()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'poster_id', pr.id, 'nom', coalesce(nullif(btrim(concat_ws(' ', pr.prenom, pr.nom)), ''), pr.email),
           'ruul_email', pr.ruul_email, 'pays', public.paie_pays_posteur(pr.id),
           'zone', coalesce(pr.ruul_zone, (select z.zone from public.zones_paie_pays z
                                            where upper(z.pays) = upper(public.paie_pays_posteur(pr.id)) and z.retire_at is null limit 1)),
           'tarif', public.ruul_tarif(pr.id)) order by pr.prenom), '[]'::jsonb)
    from public.profiles pr
    left join public.hub_posteurs h on h.profile_id = pr.id
   where pr.canal_paie = 'ruul' and pr.is_active and pr.ruul_ajoute_at is null
     and nullif(btrim(coalesce(pr.ruul_email, '')), '') is not null
     and not coalesce(h.exclu_suivi, false);
$$;

revoke execute on function public.ruul_a_ajouter_liste() from public, anon;
grant execute on function public.ruul_a_ajouter_liste() to service_role, authenticated;

create or replace function public.ruul_marquer_ajoutes(p_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer;
begin
  if not public.is_admin() then raise exception 'réservé à l''admin et au Head of Ops'; end if;
  update public.profiles
     set ruul_ajoute_at = coalesce(ruul_ajoute_at, now()),
         ruul_statut = case when ruul_statut in ('pret', 'paye_1x') then ruul_statut else 'invite' end
   where id = any(p_ids) and canal_paie = 'ruul' and ruul_ajoute_at is null
     and nullif(btrim(coalesce(ruul_email, '')), '') is not null;
  get diagnostics n = row_count;
  return n;
end;
$$;

revoke execute on function public.ruul_marquer_ajoutes(uuid[]) from public, anon;
grant execute on function public.ruul_marquer_ajoutes(uuid[]) to authenticated;

-- 6. La page « Ruul » --------------------------------------------------------------

create or replace function public.ruul_suivi()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v jsonb;
begin
  if not public.is_admin() then raise exception 'réservé à l''admin et au Head of Ops'; end if;
  with b as (
    select pr.id, pr.prenom, pr.nom, pr.email, pr.is_active, pr.ruul_email, pr.ruul_ajoute_at, pr.cohorte_lundi,
           pr.premiere_connexion_at, pr.created_at,
           public.paie_pays_posteur(pr.id) as pays,
           coalesce(pr.ruul_zone, (select z.zone from public.zones_paie_pays z
                                    where upper(z.pays) = upper(public.paie_pays_posteur(pr.id)) and z.retire_at is null limit 1)) as zone,
           public.ruul_tarif(pr.id) as tarif,
           (select min(rc.signe_at) from public.ruul_candidatures rc
             where rc.signe_at is not null and lower(rc.email) in (lower(h.email_perso), lower(pr.email_perso))) as signe_at,
           coalesce(h.cree_at, pr.created_at) as compte_os_at,
           (select min(coalesce(ps.publie_at, ps.created_at)) from public.passages ps join public.comptes c on c.id = ps.compte_id
             where c.poster_id = pr.id and ps.publie_url is not null) as premier_post_at,
           (select max(rp.semaine) from public.ruul_paiements rp where rp.poster_id = pr.id and rp.statut = 'paye') as derniere_paie_semaine,
           (select max(rp.paye_at) from public.ruul_paiements rp where rp.poster_id = pr.id and rp.statut = 'paye') as derniere_paie_at
      from public.profiles pr
      left join public.hub_posteurs h on h.profile_id = pr.id
     where pr.canal_paie = 'ruul' and not coalesce(h.exclu_suivi, false)
  ), e as (
    select b.*,
           case
             when b.premiere_connexion_at is null and b.compte_os_at < now() - interval '2 days' then '1re connexion'
             when nullif(btrim(coalesce(b.ruul_email, '')), '') is null and b.compte_os_at < now() - interval '2 days' then 'email Ruul'
             when b.ruul_ajoute_at is null and b.compte_os_at < now() - interval '2 days' then 'ajout dans Ruul'
             when b.premier_post_at is null and greatest(b.compte_os_at, coalesce(b.cohorte_lundi::timestamptz, b.compte_os_at)) < now() - interval '2 days' then '1er post'
           end as bloque_etape,
           case
             when b.premier_post_at is null and b.ruul_ajoute_at is not null then greatest(b.compte_os_at, coalesce(b.cohorte_lundi::timestamptz, b.compte_os_at))
             else b.compte_os_at
           end as bloque_depuis
      from b
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'poster_id', e.id, 'nom', coalesce(nullif(btrim(concat_ws(' ', e.prenom, e.nom)), ''), e.email),
           'pays', e.pays, 'zone', e.zone, 'tarif', e.tarif, 'actif', e.is_active,
           'signe_at', e.signe_at, 'compte_os_at', e.compte_os_at, 'premiere_connexion_at', e.premiere_connexion_at,
           'ruul_email', nullif(btrim(coalesce(e.ruul_email, '')), ''), 'ruul_ajoute_at', e.ruul_ajoute_at,
           'premier_post_at', e.premier_post_at, 'derniere_paie_semaine', e.derniere_paie_semaine,
           'derniere_paie_at', e.derniere_paie_at,
           'bloque', e.is_active and e.bloque_etape is not null, 'bloque_etape', e.bloque_etape,
           'bloque_depuis', case when e.bloque_etape is not null then e.bloque_depuis end)
         order by e.is_active desc, e.compte_os_at desc), '[]'::jsonb)
    into v from e;
  return v;
end;
$$;

revoke execute on function public.ruul_suivi() from public, anon;
grant execute on function public.ruul_suivi() to authenticated;

-- 4. La paie Ruul du lundi ------------------------------------------------------------

create or replace function public.ruul_lot_preparer(p_semaine date default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_semaine date := coalesce(p_semaine, public.ruul_semaine_a_payer());
  v_lot public.ruul_lots;
begin
  if coalesce(auth.role(), '') in ('anon', 'authenticated') and not public.is_admin() then
    raise exception 'réservé à l''admin et au Head of Ops';
  end if;
  if extract(isodow from v_semaine) <> 1 then raise exception 'la semaine doit commencer un lundi'; end if;
  insert into public.ruul_lots (semaine) values (v_semaine) on conflict (semaine) do nothing;
  select * into v_lot from public.ruul_lots where semaine = v_semaine;
  if v_lot.statut <> 'prepare' then
    return jsonb_build_object('ok', false, 'erreur', 'lot ' || v_lot.statut || ' : verrouillé');
  end if;

  -- Les lignes à payer de ce lot repartent de zéro (recalculées ci-dessous).
  update public.ruul_paiements set statut = 'reporte', lot_id = null, maj_at = now()
   where lot_id = v_lot.id and statut = 'a_payer';

  -- La semaine : par compte, les posts avec lien du lundi au dimanche ; tarif par compte qui a posté, sans retenue.
  insert into public.ruul_paiements as rp (poster_id, semaine, statut, montant, tarif, nb_comptes, faits, prevus, rattrapage, raison_report, bonus, bonus_ids)
  select x.poster_id, v_semaine, 'reporte', coalesce(x.tarif, 0) * x.comptes_postes, x.tarif, x.nb_comptes, x.faits, x.nb_comptes * 14, false, null, 0, '{}'
    from (
      select pr.id as poster_id, public.ruul_tarif(pr.id) as tarif,
             count(*) as nb_comptes,
             count(*) filter (where k.n > 0) as comptes_postes,
             coalesce(sum(k.n), 0)::int as faits
        from public.profiles pr
        left join public.hub_posteurs h on h.profile_id = pr.id
        join public.comptes c on c.poster_id = pr.id and c.type_compte = 'perso'
        cross join lateral (
          select count(*) as n from public.passages ps
           where ps.compte_id = c.id and ps.publie_url is not null
             and coalesce(ps.date_publication_prevue, (coalesce(ps.publie_at, ps.created_at) at time zone 'Europe/Paris')::date)
                 between v_semaine and v_semaine + 6) k
       where pr.canal_paie = 'ruul' and not coalesce(h.exclu_suivi, false)
         and coalesce(h.debut_le, pr.cohorte_lundi, v_semaine) <= v_semaine
         and (c.is_active or k.n > 0)
       group by pr.id
      having bool_or(pr.is_active) or coalesce(sum(k.n), 0) > 0
    ) x
  on conflict (poster_id, semaine) do update
     set montant = excluded.montant, tarif = excluded.tarif, nb_comptes = excluded.nb_comptes,
         faits = excluded.faits, prevus = excluded.prevus, maj_at = now()
   where rp.statut in ('a_payer', 'reporte', 'annule') and (rp.lot_id is null or rp.lot_id = v_lot.id);

  -- Les bonus de parrainage « à payer via Ruul » sur la ligne de la semaine du parrain.
  insert into public.ruul_paiements as rp (poster_id, semaine, statut, montant, bonus, bonus_ids)
  select b.poster_id, v_semaine, 'reporte', 0, sum(b.montant), array_agg(b.id)
    from public.bonus b
   where b.canal_paie = 'ruul' and b.statut in ('a_valider', 'a_payer') and b.montant > 0
   group by b.poster_id
  on conflict (poster_id, semaine) do update
     set bonus = excluded.bonus, bonus_ids = excluded.bonus_ids, maj_at = now()
   where rp.statut in ('a_payer', 'reporte', 'annule') and (rp.lot_id is null or rp.lot_id = v_lot.id);

  -- Le statut : déjà payé ailleurs (Upwork) → annulé ; 0 post et pas de bonus → 0 $ (annulé, signalé) ;
  -- prêt (email Ruul + ajouté dans Ruul) → dans le lot ; sinon reporté au lot suivant.
  update public.ruul_paiements rp
     set statut = case
                    when exists (select 1 from public.paie_semaines ps where ps.poster_id = rp.poster_id and ps.semaine = rp.semaine and ps.paye_at is not null) then 'annule'
                    when rp.montant + rp.bonus <= 0 then 'annule'
                    when nullif(btrim(coalesce(pr.ruul_email, '')), '') is not null and pr.ruul_ajoute_at is not null then 'a_payer'
                    else 'reporte' end,
         lot_id = case
                    when rp.montant + rp.bonus > 0 and nullif(btrim(coalesce(pr.ruul_email, '')), '') is not null and pr.ruul_ajoute_at is not null
                         and not exists (select 1 from public.paie_semaines ps where ps.poster_id = rp.poster_id and ps.semaine = rp.semaine and ps.paye_at is not null)
                    then v_lot.id end,
         raison_report = case
                    when exists (select 1 from public.paie_semaines ps where ps.poster_id = rp.poster_id and ps.semaine = rp.semaine and ps.paye_at is not null) then 'déjà payé sur Upwork cette semaine'
                    when rp.montant + rp.bonus <= 0 then '0 post cette semaine : 0 $'
                    when nullif(btrim(coalesce(pr.ruul_email, '')), '') is null then 'email Ruul manquant (reporté)'
                    when pr.ruul_ajoute_at is null then 'pas encore ajouté dans Ruul (reporté)'
                  end,
         maj_at = now()
    from public.profiles pr
   where pr.id = rp.poster_id and rp.semaine = v_semaine
     and rp.statut in ('a_payer', 'reporte', 'annule') and (rp.lot_id is null or rp.lot_id = v_lot.id);

  -- Les semaines reportées d'avant (posteur pas encore prêt) entrent dans le lot dès qu'il est prêt.
  update public.ruul_paiements rp
     set statut = 'a_payer', lot_id = v_lot.id, rattrapage = true, raison_report = null, maj_at = now()
    from public.profiles pr
   where pr.id = rp.poster_id and rp.statut = 'reporte' and rp.semaine < v_semaine and rp.lot_id is null
     and rp.montant + rp.bonus > 0
     and nullif(btrim(coalesce(pr.ruul_email, '')), '') is not null and pr.ruul_ajoute_at is not null
     and not exists (select 1 from public.paie_semaines ps where ps.poster_id = rp.poster_id and ps.semaine = rp.semaine and ps.paye_at is not null);

  update public.ruul_lots l
     set total = coalesce((select sum(montant + bonus) from public.ruul_paiements where lot_id = l.id and statut = 'a_payer'), 0),
         nb = (select count(distinct poster_id) from public.ruul_paiements where lot_id = l.id and statut = 'a_payer'),
         prepare_at = now()
   where l.id = v_lot.id;
  return jsonb_build_object('ok', true, 'semaine', v_semaine,
    'nb', (select nb from public.ruul_lots where id = v_lot.id),
    'total', (select total from public.ruul_lots where id = v_lot.id),
    'sans_post', (select count(*) from public.ruul_paiements where semaine = v_semaine and statut = 'annule' and raison_report like '0 post%'),
    'reportes', (select count(*) from public.ruul_paiements where statut = 'reporte'));
end;
$$;

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
                                                   'paye_at', rp.paye_at, 'ecart', rp.ecart, 'bonus', rp.bonus) order by rp.semaine),
          'bonus', sum(rp.bonus),
          'total', sum(rp.montant + rp.bonus),
          'alertes', array_remove(array[
             case when nullif(btrim(coalesce(pr.ruul_email, '')), '') is null then 'email Ruul manquant' end,
             case when pr.ruul_premier_paiement_at is null then '1er paiement' end,
             case when bool_or(rp.rattrapage) then 'rattrapage' end,
             case when sum(rp.bonus) > 0 then 'bonus de parrainage inclus' end,
             case when sum(rp.montant) > v_plafond then 'au-dessus du plafond par ligne (' || v_plafond || ' $)' end], null)) x
          from public.ruul_paiements rp
          join public.profiles pr on pr.id = rp.poster_id
         where rp.lot_id = v_lot.id and rp.statut in ('a_payer', 'paye')
         group by pr.id) t), '[]'::jsonb),
    'reportes', coalesce((
      select jsonb_agg(jsonb_build_object(
               'poster_id', pr.id, 'nom', coalesce(nullif(btrim(concat_ws(' ', pr.prenom, pr.nom)), ''), pr.email),
               'ruul_statut', pr.ruul_statut, 'semaine', rp.semaine, 'montant', rp.montant + rp.bonus, 'raison', rp.raison_report)
             order by pr.prenom, rp.semaine)
        from public.ruul_paiements rp join public.profiles pr on pr.id = rp.poster_id
       where rp.statut = 'reporte'
          or (rp.statut = 'annule' and rp.semaine = v_semaine)), '[]'::jsonb));
end;
$$;

/* « Marquer payé » (Max a payé sur Ruul) : sans numéro de facture obligatoire ; une seule paie par semaine. */
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
  if v_lot.statut not in ('prepare', 'saisi') then return jsonb_build_object('ok', false, 'erreur', 'lot déjà ' || v_lot.statut); end if;
  -- Garde : jamais deux paies pour la même semaine (Upwork ou Ruul).
  update public.ruul_paiements rp set statut = 'annule', lot_id = null, raison_report = 'déjà payé sur Upwork cette semaine', maj_at = now()
   where rp.lot_id = v_lot.id and rp.statut = 'a_payer'
     and exists (select 1 from public.paie_semaines ps where ps.poster_id = rp.poster_id and ps.semaine = rp.semaine and ps.paye_at is not null);
  update public.ruul_paiements
     set statut = 'paye', paye_at = now(), paye_par = auth.uid(), message_statut = 'a_envoyer', maj_at = now()
   where lot_id = v_lot.id and statut = 'a_payer';
  get diagnostics n = row_count;
  update public.bonus b set statut = 'paye', paye_at = now(), paye_par = auth.uid(), raison = 'payé via Ruul'
   where b.canal_paie = 'ruul' and b.statut in ('a_valider', 'a_payer')
     and b.id in (select unnest(rp.bonus_ids) from public.ruul_paiements rp where rp.lot_id = v_lot.id and rp.statut = 'paye');
  update public.profiles pr
     set ruul_premier_paiement_at = coalesce(pr.ruul_premier_paiement_at, now()),
         ruul_pret_at = coalesce(pr.ruul_pret_at, now()),
         ruul_statut = 'paye_1x'
   where pr.id in (select poster_id from public.ruul_paiements where lot_id = v_lot.id and statut = 'paye' and montant > 0);
  update public.ruul_lots set statut = 'paye', paye_at = now(), paye_par = auth.uid(),
         total = coalesce((select sum(montant + bonus) from public.ruul_paiements where lot_id = v_lot.id and statut = 'paye'), 0)
   where id = v_lot.id;
  return jsonb_build_object('ok', true, 'payes', n);
end;
$$;

/* Garde : une semaine payée sur Ruul ne se paie pas sur Upwork. */
create or replace function public.paie_semaines_une_paie()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.paye_at is not null and old.paye_at is null
     and exists (select 1 from public.ruul_paiements rp where rp.poster_id = new.poster_id and rp.semaine = new.semaine and rp.statut = 'paye') then
    raise exception 'semaine déjà payée via Ruul pour ce posteur (une seule paie par semaine)';
  end if;
  return new;
end;
$$;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'paie_semaines_une_paie' and tgrelid = 'public.paie_semaines'::regclass) then
    create trigger paie_semaines_une_paie before update of paye_at on public.paie_semaines
      for each row execute function public.paie_semaines_une_paie();
  end if;
end $$;

-- 5. La paie Upwork ne prend plus les posteurs Ruul (paie_generer, patch en place).
do $p$
declare
  d text := pg_get_functiondef('public.paie_generer(date)'::regprocedure);
  avant text := $a$    from public.paie_calculer_v3(p_lundi) c
   where not exists (select 1 from public.paie_hors h$a$;
  apres text := $a$    from public.paie_calculer_v3(p_lundi) c
   where not exists (select 1 from public.profiles x where x.id = c.poster_id and x.canal_paie = 'ruul' /* 0586 */)
     and not exists (select 1 from public.paie_hors h$a$;
begin
  if position('0586' in d) > 0 then return; end if;
  if position(avant in d) = 0 then raise exception '0586 : paie_generer ne correspond pas'; end if;
  execute replace(d, avant, apres);
end
$p$;

-- La liste du dimanche 18 h (Paris) à Max : la fonction ruul vérifie l'heure de Paris.
do $c$
begin
  if not exists (select 1 from cron.job where jobname = 'ruul-dimanche') then
    perform cron.schedule('ruul-dimanche', '0 16,17 * * 0', $cmd$
      select net.http_post(
        url := 'https://mbikecieskoobeizixig.supabase.co/functions/v1/ruul',
        headers := jsonb_build_object('content-type', 'application/json', 'x-cron-secret', public.cron_secret_lire()),
        body := '{"action":"dimanche"}'::jsonb,
        timeout_milliseconds := 120000)
    $cmd$);
  end if;
end
$c$;
