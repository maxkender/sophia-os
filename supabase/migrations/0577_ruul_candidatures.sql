-- 0577 : les candidatures du site (slideshow_applications) dans l'OS, de la
-- candidature à la signature, et le bonus du parrain (9/11).
--
-- 1. ruul_candidatures : la copie des candidatures du site (fonction ruul,
--    action « candidatures », toutes les 15 min), avec la décision de l'OS.
-- 2. Acceptation automatique si : majeur, pays ouvert (zone de paie active,
--    recrutement pas fermé), 2 téléphones, réponses complètes. Sinon la
--    candidature va au HM du pays (« Candidatures à traiter »). Les referrals
--    passent en premier. Une décision (auto ou HM) part vers le site, qui
--    envoie le lien de signature avec le lundi de cohorte = lundi suivant.
-- 3. Signature : relances J+1, J+3, J+6 ; rien à J+7 → expirée et HM
--    prévenu. Cohorte ratée → décalée au lundi suivant, jamais perdue.
-- 4. Bonus parrain : 10 $ (réglage bonus.parrainage_montant) dès que le
--    filleul payé par Ruul a sa 1re semaine payée ; il part dans « Bonus de
--    lundi » (à valider, payé seulement au clic de Max).
-- 5. Cohortes Ruul : une ligne par posteur et toutes ses étapes.
-- Additif : une table, des fonctions, ruul_lot_payer patchée en place.

create table if not exists public.ruul_candidatures (
  site_id          uuid primary key,
  nom              text,
  email            text,
  pays             text,
  pays_brut        text,
  adulte           boolean,
  deux_telephones  boolean,
  a_telephone      boolean,
  reponses         jsonb not null default '{}'::jsonb,
  referral         boolean not null default false,
  parrain_nom      text,
  ref              text,
  langue           text,
  statut_site      text,
  cree_at          timestamptz,
  accepte_at       timestamptz,
  signe_at         timestamptz,
  os_cree_at       timestamptz,
  os_profile_id    uuid,
  start_monday     date,
  expire_at        timestamptz,
  ruul_email       text,
  desinscrit_at    timestamptz,
  decision         text check (decision is null or decision in ('auto', 'acceptee', 'refusee', 'a_traiter')),
  decision_raison  text,
  manques          text[],
  hm_id            uuid references public.profiles(id),
  decide_at        timestamptz,
  decide_par       uuid,
  envoi            text check (envoi is null or envoi in ('a_envoyer', 'envoye', 'erreur')),
  envoi_erreur     text,
  relances_signature int not null default 0,
  relance_signature_at timestamptz,
  hm_prevenu_at    timestamptz,
  sync_at          timestamptz not null default now()
);
create index if not exists ruul_candidatures_hm on public.ruul_candidatures (hm_id) where decision = 'a_traiter';

alter table public.ruul_candidatures enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'ruul_candidatures' and policyname = 'ruul_candidatures_lecture') then
    create policy ruul_candidatures_lecture on public.ruul_candidatures for select to authenticated
      using (public.is_admin() or hm_id = auth.uid());
  end if;
end $$;

/** Le site → l'OS : les candidatures, sans toucher aux décisions de l'OS. */
create or replace function public.ruul_candidatures_enregistrer(p_lignes jsonb)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  n int;
begin
  if coalesce(auth.role(), '') in ('anon', 'authenticated') then raise exception 'réservé à la fonction ruul'; end if;
  insert into public.ruul_candidatures as c (site_id, nom, email, pays, pays_brut, adulte, deux_telephones, a_telephone, reponses,
         referral, parrain_nom, ref, langue, statut_site, cree_at, accepte_at, signe_at, os_cree_at, os_profile_id,
         start_monday, expire_at, ruul_email, desinscrit_at, sync_at)
  select (e->>'id')::uuid, e->>'full_name', lower(btrim(e->>'email')), nullif(e->>'pays', ''), e->>'country',
         (e->>'is_adult')::boolean, (e->>'deux_telephones')::boolean, coalesce((e->>'has_phone')::boolean, false),
         jsonb_strip_nulls(jsonb_build_object('pays_actuel', e->>'q_country_now', 'heures', e->>'q_hours_per_day',
                                              'tiktok', e->>'q_tiktok_daily', 'contenu', e->>'q_previous_content')),
         coalesce((e->>'referred')::boolean, false) or nullif(e->>'ref', '') is not null, e->>'referral_name', nullif(e->>'ref', ''),
         e->>'langue', e->>'status', (e->>'created_at')::timestamptz, (e->>'accepted_at')::timestamptz,
         (e->>'contract_signed_at')::timestamptz, (e->>'os_created_at')::timestamptz,
         case when (e->>'os_profile_id') ~ '^[0-9a-f-]{36}$' then (e->>'os_profile_id')::uuid end,
         (e->>'start_monday')::date, (e->>'expired_at')::timestamptz, nullif(lower(btrim(e->>'ruul_email')), ''),
         (e->>'unsubscribed_at')::timestamptz, now()
    from jsonb_array_elements(coalesce(p_lignes, '[]'::jsonb)) e
   where (e->>'id') ~ '^[0-9a-f-]{36}$'
  on conflict (site_id) do update
     set nom = excluded.nom, email = excluded.email, pays = coalesce(excluded.pays, c.pays), pays_brut = excluded.pays_brut,
         adulte = excluded.adulte, deux_telephones = excluded.deux_telephones, a_telephone = excluded.a_telephone,
         reponses = excluded.reponses, referral = excluded.referral, parrain_nom = excluded.parrain_nom, ref = excluded.ref,
         langue = excluded.langue, statut_site = excluded.statut_site, cree_at = excluded.cree_at, accepte_at = excluded.accepte_at,
         signe_at = excluded.signe_at, os_cree_at = excluded.os_cree_at, os_profile_id = excluded.os_profile_id,
         start_monday = excluded.start_monday, expire_at = excluded.expire_at, ruul_email = excluded.ruul_email,
         desinscrit_at = excluded.desinscrit_at, sync_at = now();
  get diagnostics n = row_count;
  return n;
end;
$$;

/** La décision d'un HM (ou de l'admin) : acceptée ou refusée ; elle part vers le site au prochain passage. */
create or replace function public.ruul_candidature_decider(p_site_id uuid, p_decision text, p_raison text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  c public.ruul_candidatures;
begin
  select * into c from public.ruul_candidatures where site_id = p_site_id for update;
  if c.site_id is null then return jsonb_build_object('ok', false, 'erreur', 'candidature introuvable'); end if;
  if coalesce(auth.role(), '') in ('anon', 'authenticated') and not (public.is_admin() or c.hm_id = auth.uid()) then
    raise exception 'réservé au HM de la candidature et à l''admin';
  end if;
  if p_decision not in ('acceptee', 'refusee', 'auto', 'a_traiter') then
    return jsonb_build_object('ok', false, 'erreur', 'décision inconnue');
  end if;
  if c.statut_site not in ('pending') and p_decision in ('acceptee', 'refusee', 'auto') and c.decision in ('acceptee', 'refusee', 'auto') then
    return jsonb_build_object('ok', false, 'erreur', 'déjà décidée');
  end if;
  update public.ruul_candidatures
     set decision = p_decision, decision_raison = left(nullif(btrim(coalesce(p_raison, '')), ''), 300),
         decide_at = now(), decide_par = auth.uid(),
         envoi = case when p_decision in ('acceptee', 'refusee', 'auto') then 'a_envoyer' else envoi end, envoi_erreur = null
   where site_id = p_site_id;
  return jsonb_build_object('ok', true);
end;
$$;

/** La page « Candidats Ruul » : les candidatures, referrals d'abord. Un HM ne voit que les siennes. */
create or replace function public.ruul_candidatures_liste()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not (public.is_admin() or public.has_role(auth.uid(), 'hiring_manager')) then
    raise exception 'réservé à l''admin, au Head of Ops et aux HM';
  end if;
  return coalesce((
    select jsonb_agg(to_jsonb(c) - 'reponses' || jsonb_build_object(
             'reponses', c.reponses,
             'hm_nom', (select concat_ws(' ', h.prenom, h.nom) from public.profiles h where h.id = c.hm_id))
           order by c.referral desc, c.cree_at)
      from public.ruul_candidatures c
     where public.is_admin() or c.hm_id = auth.uid()), '[]'::jsonb);
end;
$$;

/**
 * Cohortes Ruul : par lundi de cohorte, une ligne par posteur du site et ses
 * étapes (candidature, acceptée, signée, ajouté Ruul, prêt, Slack, OS,
 * warm-up, 1er post, 1re paie). « bloque » : étape suivante attendue depuis
 * plus de 48 h.
 */
create or replace function public.ruul_cohortes()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'réservé à l''admin et au Head of Ops'; end if;
  return coalesce((
    select jsonb_agg(x order by x->>'cohorte' desc, x->>'nom')
      from (
        select jsonb_build_object(
          'site_id', c.site_id, 'nom', c.nom, 'pays', c.pays, 'referral', c.referral,
          'cohorte', coalesce(c.start_monday, pr.cohorte_lundi, h.debut_le),
          'poster_id', pr.id, 'stop', pr.relances_stop_at is not null or c.desinscrit_at is not null,
          'etapes', jsonb_build_object(
            'candidature', c.cree_at,
            'acceptee', c.accepte_at,
            'signee', c.signe_at,
            'ajoute_ruul', pr.ruul_ajoute_at,
            'pret', pr.ruul_pret_at,
            'slack', coalesce(h.slack_ajoute_le, case when pr.slack_user_id is not null then c.os_cree_at end),
            'os', (select min(e.at) from public.recrue_evenements e where e.poster_id = pr.id and e.type = 'connexion'),
            'warmup', (select min(co.warmup_started_at) from public.comptes co where co.poster_id = pr.id),
            'premier_post', (select min(ps.date_publication_prevue)::timestamptz from public.passages ps join public.comptes co on co.id = ps.compte_id
                              where co.poster_id = pr.id and ps.publie_url is not null),
            'premiere_paie', pr.ruul_premier_paiement_at)) x
          from public.ruul_candidatures c
          left join public.profiles pr on pr.id = c.os_profile_id
          left join public.hub_posteurs h on h.profile_id = pr.id
         where c.accepte_at is not null or c.decision in ('auto', 'acceptee')
      ) t), '[]'::jsonb);
end;
$$;

revoke execute on function public.ruul_candidatures_enregistrer(jsonb) from public, anon, authenticated;
grant execute on function public.ruul_candidatures_enregistrer(jsonb) to service_role;
revoke execute on function public.ruul_candidature_decider(uuid, text, text) from public, anon;
grant execute on function public.ruul_candidature_decider(uuid, text, text) to authenticated, service_role;
revoke execute on function public.ruul_candidatures_liste() from public, anon;
grant execute on function public.ruul_candidatures_liste() to authenticated;
revoke execute on function public.ruul_cohortes() from public, anon;
grant execute on function public.ruul_cohortes() to authenticated;

-- 4. Le bonus du parrain à la 1re semaine payée du filleul (lot Ruul payé).
do $p$
declare
  d text := pg_get_functiondef('public.ruul_lot_payer(date)'::regprocedure);
  avant text := $a$  update public.ruul_lots set statut = 'paye', paye_at = now(), paye_par = auth.uid() where id = v_lot.id;$a$;
  apres text := $a$  update public.ruul_lots set statut = 'paye', paye_at = now(), paye_par = auth.uid() where id = v_lot.id;
  -- 0577 : 10 $ au parrain dès la 1re semaine payée du filleul (Bonus de lundi, à valider).
  insert into public.bonus (poster_id, type, referral_id, recrue_id, lundi_bonus, periode_debut, periode_fin, detail, quantite, montant, statut)
  select f.referrer_id, 'parrainage', f.id, f.recrue_id, public.bonus_lundi_carte(), f.created_at::date, current_date,
         format('parrainage de %s, 1re semaine payée', coalesce(nullif(btrim(concat_ws(' ', rp.prenom, rp.nom)), ''), 'filleul')),
         1, coalesce((public.bonus_reglages()->>'parrainage_montant')::numeric, 10), 'a_valider'
    from public.creator_referrals f
    join public.profiles rp on rp.id = f.recrue_id
   where f.recrue_id in (select poster_id from public.ruul_paiements where lot_id = v_lot.id and statut = 'paye')
     and not exists (select 1 from public.bonus b where b.referral_id = f.id)
  on conflict (referral_id) do nothing;$a$;
begin
  if position('0577' in d) > 0 then return; end if;
  if position(avant in d) = 0 then raise exception '0577 : ruul_lot_payer ne correspond pas'; end if;
  execute replace(d, avant, apres);
end
$p$;
