-- 0808 : Ruul de A à Z (Max, 21/11), points 1, 2 et 8. Additif (fonctions redéfinies avec la même signature).
-- 1. ruul_adresse_joignable : l'ordre des adresses d'un posteur Ruul : email Ruul, puis email de candidature (site, Hub),
--    puis email Upwork (email perso), puis le reste. Jamais @sophia.com, jamais une adresse revenue (inchangé).
--    email_adresse_interdite : la garde de tous les envois (fonction emails, envoyerSuivi).
-- 2. Jours excusés (absence déclarée, pause, jour crédité : panne de notre côté) : posteur_jour_excuse,
--    absences_periodes (cartes Décisions « Away du X au Y (raison) »).
--    Nudge du jeudi Ruul : les deux textes de Max (pas commencé / posts manqués), sans les jours excusés ; « envoyé »
--    seulement si l'email (ou un DM Slack) est parti, jamais pour le seul bandeau.
-- 3. Page Ruul : ruul_suivi (une ligne par posteur Ruul actif, alertes en haut). ruul_paiements.pourquoi (le
--    « pourquoi ce montant » du lot, rempli par 0809).

-- 1.
create or replace function public.ruul_adresse_joignable(p_poster uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  -- 0808 : Ruul → candidature → Upwork → login (s'il est une vraie boîte).
  select x.a
    from (
      select lower(btrim(t.a)) as a, t.ord
        from public.profiles pr
        left join public.hub_posteurs h on h.profile_id = pr.id
        cross join lateral unnest(array[
          pr.ruul_email,
          (select rc.email from public.ruul_candidatures rc where rc.os_profile_id = pr.id order by rc.cree_at desc nulls last limit 1),
          h.email_perso,
          pr.email_perso,
          pr.email]) with ordinality as t(a, ord)
       where pr.id = p_poster
    ) x
   where x.a ~ '^[^\s@]+@[^\s@]+\.[^\s@]+$'
     and x.a !~ '@sophia\.com$'
     and not public.ruul_adresse_morte(x.a)
   order by x.ord
   limit 1;
$$;

create or replace function public.email_adresse_interdite(p_adresse text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
    when lower(btrim(coalesce(p_adresse, ''))) ~ '@sophia\.com$' then 'adresse de connexion @sophia.com (pas une vraie boîte)'
    when public.ruul_adresse_morte(p_adresse) then 'adresse revenue (hard bounce, bloquée ou plainte)'
  end;
$$;
revoke all on function public.email_adresse_interdite(text) from public, anon, authenticated;
grant execute on function public.email_adresse_interdite(text) to service_role;

-- 2.
create or replace function public.posteur_jour_excuse(p_poster uuid, p_jour date)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select 'Absence déclarée' || coalesce(' (' || nullif(btrim(a.raison), '') || ')', '')
       from public.absences_declarees a
      where a.poster_id = p_poster
        and p_jour >= a.debut
        and p_jour <= least(coalesce(a.fin, a.debut + greatest(coalesce(a.jours, 1), 1) - 1), coalesce(a.retour_le - 1, 'infinity'::date))
      order by a.declare_at desc limit 1),
    (select 'Pause' || coalesce(' (' || nullif(btrim(pp.raison), '') || ')', '')
       from public.posteur_pauses pp
      where pp.poster_id = p_poster
        and p_jour between (pp.debut at time zone 'Europe/Paris')::date and (pp.jusqu_au at time zone 'Europe/Paris')::date
      order by pp.created_at desc limit 1),
    (select coalesce(jc.raison, 'Panne de notre côté') from public.jours_credites jc
      where jc.poster_id = p_poster and jc.jour = p_jour limit 1));
$$;
revoke all on function public.posteur_jour_excuse(uuid, date) from public, anon, authenticated;
grant execute on function public.posteur_jour_excuse(uuid, date) to service_role;

create or replace function public.absences_periodes(p_posteurs uuid[], p_de date, p_a date)
returns table (poster_id uuid, debut date, fin date, raison text, source text)
language sql
stable
security definer
set search_path = public
as $$
  select z.poster_id, z.debut, z.fin, z.raison, z.source
    from (
      select a.poster_id, a.debut,
             least(coalesce(a.fin, a.debut + greatest(coalesce(a.jours, 1), 1) - 1), coalesce(a.retour_le - 1, 'infinity'::date)) as fin,
             nullif(btrim(a.raison), '') as raison, 'absence' as source
        from public.absences_declarees a where a.poster_id = any(p_posteurs)
      union all
      select pp.poster_id, (pp.debut at time zone 'Europe/Paris')::date, (pp.jusqu_au at time zone 'Europe/Paris')::date,
             nullif(btrim(pp.raison), ''), 'pause'
        from public.posteur_pauses pp where pp.poster_id = any(p_posteurs)
      union all
      select jc.poster_id, jc.jour, jc.jour, jc.raison, 'panne'
        from public.jours_credites jc where jc.poster_id = any(p_posteurs)
    ) z
   where z.fin >= p_de and z.debut <= p_a and z.fin >= z.debut
     and (public.is_admin() or coalesce(auth.role(), '') = 'service_role')
   order by z.poster_id, z.debut;
$$;
revoke all on function public.absences_periodes(uuid[], date, date) from public, anon;
grant execute on function public.absences_periodes(uuid[], date, date) to authenticated, service_role;

-- Le nudge du jeudi Ruul : un texte par posteur (son compte le plus en retard), jours excusés retirés.
create or replace function public.jeudi_nudges_ruul(p_lundi date, p_comptes uuid[])
returns table (poster_id uuid, compte_id uuid, prenom text, faits integer, attendus integer, texte_en text, deja boolean)
language plpgsql
stable
security definer
set search_path = public
as $function$
declare
  v_auj date := (now() at time zone 'Europe/Paris')::date;
  v_jusqu date := least((now() at time zone 'Europe/Paris')::date, p_lundi + 6);
begin
  if not public.is_admin() and coalesce(auth.jwt()->>'role', '') <> 'service_role' and session_user not in ('postgres', 'supabase_admin') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  -- 0808 (Max, 21/11) : les deux textes Ruul ; un jour d'absence déclarée ou de panne ne compte ni en prévu ni en manqué.
  return query
  with cibles as (
    select distinct c.poster_id from public.comptes c
      join public.profiles pr on pr.id = c.poster_id and pr.canal_paie = 'ruul'
     where c.id = any(p_comptes)
       and pr.relances_stop_at is null
  ),
  jours as (
    select p.compte_id, c.poster_id, p.date_publication_prevue as jour,
           count(*) filter (where p.date_publication_prevue < v_auj)::int as prevus,
           count(*) filter (where p.publie_url is not null or p.credite_raison is not null)::int as liens
      from public.passages p
      join public.comptes c on c.id = p.compte_id and c.is_active and c.type_compte = 'perso'
      join cibles ci on ci.poster_id = c.poster_id
     where p.date_publication_prevue between p_lundi and v_jusqu
       and p.statut::text <> 'brouillon'
       and not coalesce(p.est_rappel, false)
     group by 1, 2, 3
  ),
  comptes_j as (
    select j.poster_id, j.compte_id,
           coalesce(sum(j.liens), 0)::int as faits,
           coalesce(sum(greatest(j.prevus, case when j.jour = v_auj then j.liens else 0 end)), 0)::int as attendus
      from jours j
     where public.posteur_jour_excuse(j.poster_id, j.jour) is null
     group by 1, 2
  ),
  tot as (
    select cj.poster_id, sum(cj.faits)::int as t_faits, sum(cj.attendus)::int as t_attendus from comptes_j cj group by 1
  ),
  une as (
    select distinct on (cj.poster_id) cj.* from comptes_j cj
     where cj.compte_id = any(p_comptes)
     order by cj.poster_id, (cj.attendus - cj.faits) desc, cj.faits
  )
  select u.poster_id, u.compte_id, pr.prenom, t.t_faits, t.t_attendus,
         'Hi ' || coalesce(nullif(btrim(pr.prenom), ''), 'there') || ', ' ||
         case
           when t.t_faits = 0 and not exists (
             select 1 from public.passages p2 join public.comptes c2 on c2.id = p2.compte_id
              where c2.poster_id = u.poster_id and p2.publie_url is not null)
             then 'you haven''t started posting yet. Your posts are on your dashboard: https://sophia-marketing-orga.vercel.app. If you don''t want to continue, just reply STOP.'
           else 'you''ve posted ' || t.t_faits || ' of ' || t.t_attendus || ' this week. Please post twice a day and paste each link the same day. If you don''t want to continue, just reply STOP.'
         end,
         exists (select 1 from public.nudges n where n.poster_id = u.poster_id and n.type = 'jeudi' and n.periode = p_lundi)
    from une u
    join tot t on t.poster_id = u.poster_id
    join public.profiles pr on pr.id = u.poster_id
   where t.t_attendus > 0 and t.t_faits < t.t_attendus;
end;
$function$;

-- « Envoyé » seulement si l'email ou un DM Slack est parti (le bandeau seul ne suffit pas) : la ligne de nudges
-- (« déjà nudgé ») n'est écrite qu'alors ; chaque essai, réussi ou non, est gardé dans ruul_nudges (page Ruul).
create table if not exists public.ruul_nudges (
  poster_id uuid not null references public.profiles(id),
  lundi date not null,
  canaux text[] not null default '{}',
  erreur text,
  texte text,
  maj_at timestamptz not null default now(),
  primary key (poster_id, lundi)
);
alter table public.ruul_nudges enable row level security;
do $p$ begin
  if not exists (select 1 from pg_policies where tablename = 'ruul_nudges' and policyname = 'ruul_nudges_admin') then
    create policy ruul_nudges_admin on public.ruul_nudges for select to authenticated using (public.is_admin());
  end if;
end $p$;

create or replace function public.jeudi_nudge_ruul_noter(p_poster uuid, p_compte uuid, p_lundi date, p_texte text, p_canaux text[], p_erreur text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_parti boolean := coalesce(p_canaux, '{}') && array['email', 'slack'];
begin
  insert into public.ruul_nudges as n (poster_id, lundi, canaux, erreur, texte, maj_at)
  values (p_poster, p_lundi, coalesce(p_canaux, '{}'),
          case when v_parti then p_erreur else coalesce(p_erreur, 'aucun canal (ni email ni Slack)') end, p_texte, now())
  on conflict (poster_id, lundi) do update
     set canaux = excluded.canaux, erreur = excluded.erreur, texte = excluded.texte, maj_at = now();
  if not v_parti then return; end if; -- 0808 : jamais « envoyé » sans email ni Slack
  insert into public.nudges (poster_id, compte_id, type, cible, canal, texte, envoye_at, periode, canaux, erreur_canal, raison)
  values (p_poster, p_compte, 'jeudi', 'posteur', 'os', p_texte, now(), p_lundi, coalesce(p_canaux, '{}'), p_erreur, 'jeudi_ruul')
  on conflict (poster_id, type, periode) where periode is not null do nothing;
end;
$$;

-- 3.
alter table public.ruul_paiements add column if not exists pourquoi text;
comment on column public.ruul_paiements.pourquoi is '0809 : pourquoi ce montant (récap avant l''envoi du lot).';

create or replace function public.ruul_suivi()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with p as (
    select pr.id, pr.prenom, pr.nom, pr.email, pr.ruul_onboarding, pr.ruul_kyc, pr.ruul_banque, pr.ruul_statut_api, pr.relances_stop_at,
           pr.slack_user_id, pr.manager_id,
           public.ruul_adresse_joignable(pr.id) as adresse,
           array_remove(array[lower(btrim(h.email_perso)), lower(btrim(pr.email_perso)), lower(btrim(pr.ruul_email)), lower(btrim(pr.email)),
                              lower(btrim((select rc.email from public.ruul_candidatures rc where rc.os_profile_id = pr.id order by rc.cree_at desc nulls last limit 1)))], null) as adresses
      from public.profiles pr
      left join public.hub_posteurs h on h.profile_id = pr.id
     where pr.canal_paie = 'ruul' and pr.is_active
       and exists (select 1 from public.comptes c where c.poster_id = pr.id and c.is_active)
  ),
  lignes as (
    select p.id as poster_id,
           coalesce(nullif(btrim(concat_ws(' ', p.prenom, p.nom)), ''), p.email) as nom,
           (select c.handle_tiktok from public.comptes c where c.poster_id = p.id and c.is_active order by c.created_at limit 1) as handle,
           case
             when p.ruul_onboarding = 'READY' then 'ready'
             when p.ruul_onboarding = 'PENDING_COLLECTION_ACCOUNT' or p.ruul_onboarding = 'PENDING_AGREEMENTS' then 'banque'
             when p.ruul_onboarding = 'PENDING_KYC' or coalesce(p.ruul_statut_api, '') not in ('', 'NOT_REGISTERED') then 'identite'
             else 'inscription'
           end as etape,
           p.ruul_kyc = 'DECLINED' as identite_refusee,
           p.adresse,
           (select jsonb_build_object('objet', e.objet, 'at', e.cree_at, 'destinataire', e.destinataire, 'statut', coalesce(e.dernier_evenement, e.statut),
                                      'livre', coalesce(e.dernier_evenement, e.statut) ~* '^(delivered|opened|clicks|loadedbyproxy)')
              from public.emails_envois e where lower(e.destinataire) = any(p.adresses) or lower(e.destinataire) = lower(p.email)
             order by e.cree_at desc limit 1) as dernier_email,
           coalesce(
             (select jsonb_build_object('at', n.maj_at, 'envoye', n.canaux && array['email', 'slack'], 'canaux', n.canaux, 'erreur', n.erreur)
                from public.ruul_nudges n where n.poster_id = p.id order by n.lundi desc limit 1),
             (select jsonb_build_object('at', n.envoye_at, 'envoye', coalesce(n.canaux, '{}') && array['email', 'slack'], 'canaux', n.canaux, 'erreur', coalesce(n.erreur_canal, n.slack_erreur))
                from public.nudges n where n.poster_id = p.id and n.type = 'jeudi' order by n.envoye_at desc limit 1)) as dernier_nudge,
           p.relances_stop_at as stop_at,
           (select jsonb_build_object('semaine', rp.semaine, 'montant', rp.montant + rp.bonus, 'statut', rp.statut,
                                      'pourquoi', coalesce(rp.pourquoi, rp.raison_report, rp.raison_calcul))
              from public.ruul_paiements rp where rp.poster_id = p.id and rp.statut in ('a_payer', 'reporte', 'annule')
             order by rp.semaine desc limit 1) as paie,
           exists (select 1 from public.comptes c where c.poster_id = p.id and c.is_active and c.type_compte = 'perso'
                      and exists (select 1 from public.passages x where x.compte_id = c.id and x.date_publication_prevue < (now() at time zone 'Europe/Paris')::date
                                     and x.statut::text <> 'brouillon')
                      and not exists (select 1 from public.passages x where x.compte_id = c.id and (x.vues is not null or x.tiktok_publie_at is not null))) as jamais_trouve,
           p.slack_user_id is not null and coalesce((select r.valeur #>> '{}' from public.reglages r where r.cle = 'slack_dm_posteurs'), 'off') = 'on' as slack_ok
      from p
  )
  select case when not public.is_admin() then null else jsonb_build_object(
    'posteurs', coalesce((select jsonb_agg(to_jsonb(l) order by l.etape <> 'ready', l.nom) from lignes l), '[]'::jsonb),
    'alertes', jsonb_build_object(
      'emails_refuses', (select count(*) from lignes l where (l.dernier_email->>'statut') ~* '^(hardbounces|softbounces|blocked|invalid|spam|complaint|refuse)'),
      'emails_refuses_7j', (select count(*) from public.emails_envois e where e.cree_at > now() - interval '7 days' and 'ruul' = any(e.tags)
                               and coalesce(e.dernier_evenement, e.statut) ~* '^(hardbounces|blocked|invalid|spam|complaint|refuse)'),
      'sans_email', (select count(*) from lignes l where l.adresse is null),
      'aucun_canal', (select count(*) from lignes l where l.adresse is null and not l.slack_ok),
      'jamais_trouves', (select count(*) from lignes l where l.jamais_trouve)
    )) end;
$$;
revoke all on function public.ruul_suivi() from public, anon;
grant execute on function public.ruul_suivi() to authenticated, service_role;

-- 4. Point 1, « maintenant » : les posteurs Ruul pas prêts dont la dernière relance KYC est revenue (login @sophia.com,
--    14 derniers jours) et qui n'en ont reçu aucune à une vraie adresse depuis : la même relance, à la bonne adresse.
--    Lu par la fonction ruul (action kyc_renvoi) : la liste d'abord, l'envoi seulement avec confirmer: true.
create or replace function public.ruul_kyc_renvoi_liste()
returns table(poster_id uuid, prenom text, email text, ruul_email text, langue text, slack_user_id text, manque text, etape text)
language sql
stable
security definer
set search_path = public
as $$
  with b as materialized (
    select distinct on (pr.id) pr.id, e.cree_at
      from public.profiles pr
      join public.emails_envois e on lower(e.destinataire) = lower(pr.email)
     where pr.canal_paie = 'ruul' and pr.is_active and pr.relances_stop_at is null
       and coalesce(pr.ruul_onboarding, '') <> 'READY'
       and pr.email ~* '@sophia\.com\s*$'
       and 'kyc_relance' = any(e.tags)
       and e.cree_at > now() - interval '14 days'
       and coalesce(e.dernier_evenement, e.statut) ~* '^(hardbounces|blocked|invalid|refuse)'
     order by pr.id, e.cree_at desc
  ),
  c as materialized (select b.id, b.cree_at, public.ruul_adresse_joignable(b.id) as adresse from b)
  select pr.id, pr.prenom, c.adresse,
         coalesce(nullif(btrim(pr.ruul_email), ''), c.adresse),
         public.parrainage_langue_pays((select co.pays from public.comptes co where co.poster_id = pr.id and co.is_active order by co.created_at limit 1)),
         pr.slack_user_id,
         case
           when w.kyc = 'DECLINED' then 'identite_refusee'
           when pr.ruul_onboarding is null or pr.ruul_onboarding = 'NOT_REGISTERED' then 'inscription'
           when pr.ruul_onboarding = 'PENDING_COLLECTION_ACCOUNT' then 'banque'
           else 'identite'
         end,
         'kyc_' || to_char((now() at time zone 'Europe/Paris')::date, 'YYYY-MM-DD')
    from c
    join public.profiles pr on pr.id = c.id
    left join public.ruul_workmates w on w.poster_id = pr.id and w.env = 'prod'
   where c.adresse is not null
     and exists (select 1 from public.comptes co where co.poster_id = pr.id and co.is_active)
     and not exists (select 1 from public.emails_envois e2 where lower(e2.destinataire) = c.adresse and 'kyc_relance' = any(e2.tags) and e2.cree_at > c.cree_at)
   order by pr.id;
$$;
revoke all on function public.ruul_kyc_renvoi_liste() from public, anon, authenticated;
grant execute on function public.ruul_kyc_renvoi_liste() to service_role;
