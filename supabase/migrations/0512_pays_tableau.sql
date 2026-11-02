-- 0512 — Page « Pays » (2/11), partie 2 : la lecture du tableau de décision.
--
-- pays_reglages : le seuil de vues par compte et par semaine, le taux USD → EUR
-- (la paie est en $, RevenueCat en €) et la semaine de début.
--
-- pays_tableau() (admin, lecture seule) rend un seul JSON :
--   semaines : par pays et par semaine (lundi, depuis le 3 août) :
--     vues gagnées (comptes perso, relevés quotidiens compte_metrics, hausses
--     seulement, compte par compte : un compte supprimé ou des vues qui baissent
--     ne faussent rien), comptes suivis, comptes sous le seuil, proceeds,
--     proceeds_new, transactions (RevenueCat), coût réel (paie_semaines payée
--     ou « payée hors OS ») et coût estimé (comptes qui ont publié × tarif de la zone).
--   pays : zone et tarif, objectif (pays_objectifs), 1er post publié, posteurs
--     actifs, comptes actifs, cohorte du lundi en cours, cohorte suivante
--     (warm-up), Start Tuesday, Postpone.
--   offres : les offres Upwork en attente (VIk Studios), avec leur titre.
--   hms : les HM et leur zone de recrutement (pour préparer les objectifs).
--   reglages, lecture (la dernière lecture RevenueCat).
-- pays_comptes(pays) : les comptes d'un pays et leurs vues des 8 dernières semaines.
--
-- Additif : une table, deux fonctions. Aucune autre table modifiée.

create table if not exists public.pays_reglages (
  cle    text primary key,
  valeur numeric not null,
  maj_at timestamptz not null default now()
);
alter table public.pays_reglages enable row level security;
do $p$
begin
  if not exists (select 1 from pg_policies where tablename = 'pays_reglages' and policyname = 'pays_reglages_admin') then
    create policy pays_reglages_admin on public.pays_reglages for all to authenticated using (public.is_admin()) with check (public.is_admin());
  end if;
end
$p$;
insert into public.pays_reglages (cle, valeur) values
  ('seuil_vues_semaine', 1000),
  ('taux_usd_eur', 0.86)
on conflict (cle) do nothing;

create or replace function public.pays_tableau()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_auj    date := (now() at time zone 'Europe/Paris')::date;
  v_lundi  date := date_trunc('week', (now() at time zone 'Europe/Paris'))::date;
  v_debut  constant date := '2026-08-03';
  v_seuil  numeric := coalesce((select valeur from public.pays_reglages where cle = 'seuil_vues_semaine'), 1000);
  v_vik    constant text := '2074065383597823773';
  v        jsonb;
begin
  if not public.is_admin() then
    raise exception 'pays_tableau : réservé à l''admin' using errcode = '42501';
  end if;

  with
  m as (
    select cm.compte_id, (cm.collecte_at at time zone 'Europe/Paris')::date as jour, max(cm.vues) as vues
      from public.compte_metrics cm
     group by 1, 2
  ),
  d as (
    select m.compte_id, m.jour, m.vues - lag(m.vues) over (partition by m.compte_id order by m.jour) as gain
      from m
  ),
  wc as (
    select d.compte_id, date_trunc('week', d.jour)::date as semaine, sum(greatest(coalesce(d.gain, 0), 0)) as vues
      from d
     where d.jour >= v_debut - 1
     group by 1, 2
  ),
  vues as (
    select upper(c.pays) as pays, wc.semaine, sum(wc.vues)::bigint as vues, count(*)::int as comptes,
           count(*) filter (where wc.vues < v_seuil)::int as sous_seuil
      from wc
      join public.comptes c on c.id = wc.compte_id and c.type_compte = 'perso' and c.pays is not null
     where wc.semaine >= v_debut
     group by 1, 2
  ),
  rc as (
    select r.pays, r.semaine, sum(r.proceeds) as proceeds, sum(r.proceeds_new) as proceeds_new,
           sum(r.transactions)::int as transactions, bool_or(r.incomplet) as incomplet
      from public.rc_proceeds_pays_semaine r
     where r.pays is not null and r.semaine >= v_debut
     group by 1, 2
  ),
  reel as (
    select public.paie_pays_posteur(ps.poster_id) as pays, ps.semaine,
           sum(coalesce(ps.montant_corrige, ps.montant)) as cout
      from public.paie_semaines ps
     where ps.paye_at is not null or ps.exclu_raison ilike 'Payée hors OS%'
     group by 1, 2
  ),
  publies as (
    select upper(c.pays) as pays, date_trunc('week', pa.date_publication_prevue)::date as semaine, count(distinct c.id)::int as comptes
      from public.passages pa
      join public.comptes c on c.id = pa.compte_id and c.type_compte = 'perso' and c.pays is not null
     where pa.publie_url is not null and pa.date_publication_prevue >= v_debut and pa.date_publication_prevue < v_lundi + 7
     group by 1, 2
  ),
  estime as (
    select p.pays, p.semaine, p.comptes, p.comptes * z.tarif as cout
      from publies p
      left join public.zones_paie_pays zp on zp.pays = p.pays
      left join public.zones_paie z on z.zone = zp.zone
  ),
  cles as (
    select pays, semaine from vues union select pays, semaine from rc union
    select pays, semaine from reel where pays is not null union select pays, semaine from estime
  )
  select jsonb_agg(jsonb_build_object(
           'pays', k.pays, 'semaine', k.semaine,
           'vues', coalesce(v.vues, 0), 'comptes', coalesce(v.comptes, 0), 'sous_seuil', coalesce(v.sous_seuil, 0),
           'proceeds', coalesce(rc.proceeds, 0), 'proceeds_new', rc.proceeds_new, 'transactions', coalesce(rc.transactions, 0),
           'incomplet', coalesce(rc.incomplet, false),
           'cout_reel', re.cout, 'cout_estime', e.cout, 'comptes_publies', coalesce(e.comptes, 0))
         order by k.pays, k.semaine)
    into v
    from cles k
    left join vues v on v.pays = k.pays and v.semaine = k.semaine
    left join rc on rc.pays = k.pays and rc.semaine = k.semaine
    left join reel re on re.pays = k.pays and re.semaine = k.semaine
    left join estime e on e.pays = k.pays and e.semaine = k.semaine
   where k.semaine >= v_debut and k.semaine <= v_lundi;

  return jsonb_build_object(
    'aujourdhui', v_auj,
    'lundi', v_lundi,
    'semaines', coalesce(v, '[]'::jsonb),
    'pays', (
      with po as (
        select pr.id, pr.cohorte_lundi, pr.is_active,
               coalesce(public.paie_pays_posteur(pr.id),
                        (select upper(a.pays) from public.accueils a where a.poster_id = pr.id and a.pays is not null order by a.created_at desc limit 1)) as pays,
               (select dc.choix from public.debut_choix dc where dc.poster_id = pr.id order by dc.lundi desc limit 1) as choix
          from public.profiles pr
         where pr.is_active
           and exists (select 1 from public.user_roles r where r.user_id = pr.id and r.role = 'poster')
           and not exists (select 1 from public.hub_posteurs h where h.profile_id = pr.id)
           and not exists (select 1 from public.contrats_test t where t.poster_id = pr.id and t.retire_at is null)
           and coalesce((select uc.organisation_id from public.upwork_contrats uc where uc.contrat_id = pr.upwork_contract_id), v_vik) = v_vik
      ),
      liste as (
        select upper(c.pays) as pays from public.comptes c where c.type_compte = 'perso' and c.pays is not null
        union select pays from po where pays is not null
        union select pays from public.rc_proceeds_pays_semaine where pays is not null
        union select pays from public.pays_objectifs
      )
      select jsonb_agg(jsonb_build_object(
               'pays', l.pays,
               'zone', zp.zone, 'zone_retiree', zp.retire_at is not null, 'tarif', z.tarif,
               'objectif', o.objectif, 'note', o.note,
               'premier_post', (select min(pa.date_publication_prevue) from public.passages pa
                                  join public.comptes c on c.id = pa.compte_id
                                 where upper(c.pays) = l.pays and c.type_compte = 'perso' and pa.publie_url is not null),
               'posteurs_actifs', (select count(*) from po where po.pays = l.pays and (po.cohorte_lundi is null or po.cohorte_lundi < v_lundi)),
               'comptes_actifs', (select count(*) from public.comptes c join public.profiles p on p.id = c.poster_id and p.is_active
                                   where upper(c.pays) = l.pays and c.type_compte = 'perso' and c.is_active
                                     and (p.cohorte_lundi is null or p.cohorte_lundi < v_lundi)),
               'cohorte_en_cours', (select count(*) from po where po.pays = l.pays and po.cohorte_lundi = v_lundi),
               'cohorte_suivante', (select count(*) from po where po.pays = l.pays and po.cohorte_lundi > v_lundi and coalesce(po.choix, '') <> 'reporter'),
               'start_tuesday', (select count(*) from po where po.pays = l.pays and po.cohorte_lundi = v_lundi and po.choix = 'mardi'),
               'postpone', (select count(*) from po where po.pays = l.pays and po.cohorte_lundi > v_lundi and po.choix = 'reporter'))
             order by l.pays)
        from liste l
        left join public.zones_paie_pays zp on zp.pays = l.pays
        left join public.zones_paie z on z.zone = zp.zone
        left join public.pays_objectifs o on o.pays = l.pays
    ),
    'offres', (
      select coalesce(jsonb_agg(jsonb_build_object('titre', o.titre, 'freelancer', o.freelancer_nom, 'debut_at', o.debut_at) order by o.debut_at desc), '[]'::jsonb)
        from public.upwork_offres o
       where o.organisation_id = v_vik and o.etat = 'Pending'
    ),
    'hms', (
      select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'nom', nullif(btrim(concat_ws(' ', p.prenom, p.nom)), ''),
                                                   'zone', p.zone_recrutement) order by p.prenom), '[]'::jsonb)
        from public.profiles p
       where p.is_active and p.zone_recrutement is not null
    ),
    'reglages', (select coalesce(jsonb_object_agg(r.cle, r.valeur), '{}'::jsonb) from public.pays_reglages r),
    'devise', (select r.devise from public.rc_proceeds_pays_semaine r order by r.lu_at desc limit 1),
    'lecture', (select jsonb_build_object('at', l.at, 'ok', l.ok, 'detail', l.detail) from public.rc_pays_lectures l order by l.id desc limit 1)
  );
end;
$$;
revoke all on function public.pays_tableau() from public, anon;
grant execute on function public.pays_tableau() to authenticated;

create or replace function public.pays_comptes(p_pays text)
returns table (compte_id uuid, handle text, poster_id uuid, poster_nom text, actif boolean, cree_le date, semaines jsonb)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_lundi date := date_trunc('week', (now() at time zone 'Europe/Paris'))::date;
begin
  if not public.is_admin() then
    raise exception 'pays_comptes : réservé à l''admin' using errcode = '42501';
  end if;
  return query
  with m as (
    select cm.compte_id, (cm.collecte_at at time zone 'Europe/Paris')::date as jour, max(cm.vues) as vues
      from public.compte_metrics cm
      join public.comptes c on c.id = cm.compte_id and upper(c.pays) = upper(p_pays) and c.type_compte = 'perso'
     group by 1, 2
  ),
  d as (select m.compte_id, m.jour, m.vues - lag(m.vues) over (partition by m.compte_id order by m.jour) as gain from m),
  w as (
    select d.compte_id, date_trunc('week', d.jour)::date as semaine, sum(greatest(coalesce(d.gain, 0), 0))::bigint as vues
      from d where d.jour >= v_lundi - 57 group by 1, 2
  )
  select c.id, c.handle_tiktok, c.poster_id, nullif(btrim(concat_ws(' ', p.prenom, p.nom)), ''), c.is_active, c.created_at::date,
         coalesce((select jsonb_agg(jsonb_build_object('semaine', w.semaine, 'vues', w.vues) order by w.semaine)
                     from w where w.compte_id = c.id and w.semaine >= v_lundi - 56), '[]'::jsonb)
    from public.comptes c
    left join public.profiles p on p.id = c.poster_id
   where upper(c.pays) = upper(p_pays) and c.type_compte = 'perso'
     and (c.is_active or exists (select 1 from w where w.compte_id = c.id))
   order by c.is_active desc, c.handle_tiktok;
end;
$$;
revoke all on function public.pays_comptes(text) from public, anon;
grant execute on function public.pays_comptes(text) to authenticated;

notify pgrst, 'reload schema';
