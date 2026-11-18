-- 0757 : kills, parties 2 (checklist) et 3 (rapport et contrôles) (Max, 18/11). Lecture seule : rien n'est corrigé ici,
-- tout est constaté depuis les vraies données, avec un statut par étape (fait / echec / a_faire / main / sans_objet).
-- 1. kill_checklist(poster) : les 8 étapes d'un kill complet (a à h) ; kill_partiel_checklist(compte) : un compte sur 2.
-- 2. kills_controle() : les incohérences dans TOUTE la base (pas seulement les kills du jour).
-- 3. samedi_rapport(samedi) : les kills du jour (complets et partiels) par HM et par pays, chaque étape OK / en échec
--    avec les noms, les milestones à corriger (passage à 1 compte), et le contrôle de la base.
-- 4. samedi_rapports : le rapport gardé (page de l'OS) et son envoi dans #a-os-tickets.
-- Additif : une table, des fonctions.

create table if not exists public.samedi_rapports (
  samedi date primary key,
  contenu jsonb not null,
  cree_at timestamptz not null default now(),
  slack_at timestamptz,
  slack_erreur text
);
alter table public.samedi_rapports enable row level security;
do $p$
begin
  if not exists (select 1 from pg_policies where tablename = 'samedi_rapports' and policyname = 'samedi_rapports_admin') then
    create policy samedi_rapports_admin on public.samedi_rapports for select to authenticated using (public.is_admin());
  end if;
end
$p$;

-- La date du kill d'un posteur (dernier arrêt, sinon dernier compte arrêté).
create or replace function public.kill_date(p_poster uuid)
returns timestamptz
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select a.created_at from public.arrets a where a.poster_id = p_poster and a.annule_at is null order by a.created_at desc limit 1),
    (select max(coalesce(c.non_renouveler_at, k.fait_at)) from public.comptes c
       left join public.ckd_arrets k on k.compte_id = c.id and k.annule_at is null
      where c.poster_id = p_poster and not c.is_active));
$$;

create or replace function public.kill_checklist(p_poster uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with pr as (
    select p.*, public.kill_date(p.id) as le,
           ((public.kill_date(p.id) at time zone 'Europe/Paris')::date
             + (8 - extract(isodow from (public.kill_date(p.id) at time zone 'Europe/Paris')::date))::int) as lundi_suivant
      from public.profiles p where p.id = p_poster
  ),
  ar as (select a.* from public.arrets a where a.poster_id = p_poster and a.annule_at is null order by a.created_at desc limit 1),
  ct as (select u.* from public.upwork_contrats u join pr on u.contrat_id = pr.upwork_contract_id limit 1),
  sm as (select m.* from public.slack_membres m join pr on m.slack_user_id = pr.slack_user_id limit 1),
  sr as (select r.* from public.slack_retraits r where r.poster_id = p_poster order by r.maj_at desc nulls last limit 1),
  tx as (select t.* from public.posteur_textes t where t.poster_id = p_poster and t.cle = 'fin')
  select jsonb_build_array(
    -- a) Comptes désactivés, raison et date.
    jsonb_build_object('etape', 'a', 'libelle', 'Comptes désactivés (raison + date)',
      'statut', case when exists (select 1 from public.comptes c where c.poster_id = p_poster and c.is_active) then 'echec'
                     when (select le from pr) is null then 'echec' else 'fait' end,
      'at', (select le from pr),
      'detail', coalesce((select nullif(motif, '') from ar),
                         (select string_agg(distinct c.non_renouveler_raison, ', ') from public.comptes c where c.poster_id = p_poster and c.non_renouveler))),
    -- b) Plus aucun post planifié à partir du lundi suivant.
    jsonb_build_object('etape', 'b', 'libelle', 'Plus de posts planifiés après le lundi',
      'statut', case when exists (select 1 from public.passages p join public.comptes c on c.id = p.compte_id cross join pr
                                   where c.poster_id = p_poster and p.date_publication_prevue >= pr.lundi_suivant
                                     and p.publie_url is null) then 'echec' else 'fait' end,
      'detail', (select count(*)::text || ' post(s) encore planifié(s)' from public.passages p join public.comptes c on c.id = p.compte_id cross join pr
                  where c.poster_id = p_poster and p.date_publication_prevue >= pr.lundi_suivant and p.publie_url is null)),
    -- c) Dernière semaine due dans le circuit normal.
    jsonb_build_object('etape', 'c', 'libelle', 'Dernière semaine due : dans la paie',
      'statut', case
        when (select canal_paie from pr) = 'ruul' then
          case when exists (select 1 from public.ruul_paiements rp cross join pr
                             where rp.poster_id = p_poster and rp.semaine >= pr.lundi_suivant - 14) then 'fait' else 'a_faire' end
        else coalesce((select e->>'statut' from ar, jsonb_array_elements(coalesce(ar.etapes, '[]'::jsonb)) e where e->>'action' = 'paie' limit 1), 'a_faire')
      end,
      'detail', case when (select canal_paie from pr) = 'ruul' then 'Ruul' else 'Upwork' end),
    -- d) Contrat Upwork fermé (ou « contrats à fermer »).
    jsonb_build_object('etape', 'd', 'libelle', 'Contrat Upwork fermé',
      'statut', case when (select canal_paie from pr) = 'ruul' then 'sans_objet'
                     when not exists (select 1 from ct) then 'sans_objet'
                     when (select actif from ct) then 'main' else 'fait' end,
      'detail', (select coalesce(contrat_id, '') || ' ' || coalesce(etat, '') from ct)),
    -- e) Ruul : plus de paie récurrente après la fin.
    jsonb_build_object('etape', 'e', 'libelle', 'Retiré de la paie Ruul',
      'statut', case when (select canal_paie from pr) <> 'ruul' then 'sans_objet'
                     when exists (select 1 from public.ruul_paiements rp cross join pr
                                   where rp.poster_id = p_poster and rp.semaine >= pr.lundi_suivant and rp.statut in ('a_payer', 'reporte')) then 'echec'
                     else 'fait' end),
    -- f) Slack désactivé (ou « Slack à désactiver à la main »).
    jsonb_build_object('etape', 'f', 'libelle', 'Désactivé du Slack',
      'statut', case when (select slack_user_id from pr) is null then 'sans_objet'
                     when coalesce((select supprime from sm), false) or (select desactive_at from sr) is not null then 'fait'
                     when (select canaux_retires_at from sr) is not null then 'main'
                     else 'a_faire' end,
      'at', coalesce((select desactive_at from sr), (select canaux_retires_at from sr))),
    -- g) Plus de relances ni de messages automatiques.
    jsonb_build_object('etape', 'g', 'libelle', 'Retiré des relances et messages',
      'statut', case when exists (select 1 from public.relances_prevues r where r.poster_id = p_poster and r.statut = 'prevu') then 'echec'
                     else 'fait' end),
    -- h) Message de fin, une seule fois (arrêts à partir du 19/11).
    jsonb_build_object('etape', 'h', 'libelle', 'Message de fin envoyé (une fois)',
      'statut', case when (select envoye_at from tx) is not null then 'fait'
                     when (select le from pr) < '2026-11-19'::timestamptz then 'sans_objet'
                     when (select envoi_erreur from tx) is not null then 'echec'
                     else 'a_faire' end,
      'at', (select envoye_at from tx), 'detail', (select envoi_erreur from tx))
  );
$$;

-- Un compte killé sur deux : compte désactivé, ses posts futurs, le milestone à 1 compte, le bandeau.
create or replace function public.kill_partiel_checklist(p_compte uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with c as (select c.*, pr.canal_paie, pr.upwork_contract_id, pr.tarif_hebdo from public.comptes c join public.profiles pr on pr.id = c.poster_id where c.id = p_compte),
  j as (select u.montant, u.nom, u.etat from public.upwork_jalons u join c on u.contrat_id = c.upwork_contract_id order by u.lu_at desc nulls last limit 1)
  select jsonb_build_array(
    jsonb_build_object('etape', 'a', 'libelle', 'Compte désactivé (raison + date)',
      'statut', case when (select is_active from c) then 'echec' else 'fait' end,
      'at', (select non_renouveler_at from c), 'detail', (select non_renouveler_raison from c)),
    jsonb_build_object('etape', 'b', 'libelle', 'Posts futurs du compte retirés',
      'statut', case when exists (select 1 from public.passages p where p.compte_id = p_compte
                                   and p.date_publication_prevue > (now() at time zone 'Europe/Paris')::date and p.publie_url is null)
                     then 'echec' else 'fait' end),
    jsonb_build_object('etape', 'c', 'libelle', 'Milestone au tarif 1 compte',
      'statut', case when (select canal_paie from c) = 'ruul' then 'fait'
                     when not exists (select 1 from j) then 'a_faire'
                     when (select montant from j) > coalesce((select tarif_hebdo from c), 0) then 'main' else 'fait' end,
      'detail', (select coalesce(nom, '') || ' : ' || coalesce(montant::text, '?') || ' $ (attendu ' || coalesce((select tarif_hebdo from c)::text, '?') || ' $)' from j)),
    jsonb_build_object('etape', 'd', 'libelle', 'Bandeau affiché au posteur',
      'statut', case when exists (select 1 from public.posteur_textes t where t.poster_id = (select poster_id from c) and t.cle = 'compte_arrete:' || p_compte)
                     then 'fait' else 'a_faire' end)
  );
$$;

-- Les incohérences dans toute la base.
create or replace function public.kills_controle()
returns table (type text, libelle text, poster_id uuid, nom text, detail text)
language sql
stable
security definer
set search_path = public
as $$
  with fins as (
    select pr.id, pr.canal_paie, pr.upwork_contract_id, pr.slack_user_id, pr.tarif_hebdo,
           coalesce(nullif(btrim(concat_ws(' ', pr.prenom, pr.nom)), ''), pr.email) as nom,
           public.fin_collaboration_cas(pr.id) as f
      from public.profiles pr
     where not pr.is_active or not exists (select 1 from public.comptes c where c.poster_id = pr.id and c.is_active)
  ),
  tues as (select * from fins where f is not null),
  nom as (select pr.id, coalesce(nullif(btrim(concat_ws(' ', pr.prenom, pr.nom)), ''), pr.email) as nom from public.profiles pr)
  -- Compte désactivé mais contrat Upwork encore actif.
  select 'contrat_actif', 'Désactivé mais contrat Upwork encore actif', t.id, t.nom, u.contrat_id || ' (' || coalesce(u.etat, '?') || ', lu ' || to_char(u.lu_at, 'DD/MM') || ')'
    from tues t join public.upwork_contrats u on u.contrat_id = t.upwork_contract_id
   where t.canal_paie <> 'ruul' and u.actif
  union all
  -- Entièrement killé mais encore dans Slack.
  select 'slack', 'Killé mais encore dans Slack', t.id, t.nom, t.slack_user_id
    from tues t join public.slack_membres m on m.slack_user_id = t.slack_user_id
   where not coalesce(m.supprime, false)
     and not exists (select 1 from public.slack_retraits r where r.poster_id = t.id and r.desactive_at is not null)
  union all
  -- Entièrement killé mais encore dans la paie Ruul.
  select 'ruul', 'Killé mais encore dans la paie Ruul', t.id, t.nom, string_agg(rp.semaine::text, ', ')
    from tues t join public.ruul_paiements rp on rp.poster_id = t.id
   where t.canal_paie = 'ruul' and rp.statut in ('a_payer', 'reporte')
     and rp.semaine > ((t.f->>'le')::timestamptz at time zone 'Europe/Paris')::date
   group by t.id, t.nom
  union all
  -- Compte désactivé mais posts encore planifiés.
  select 'posts', 'Compte désactivé mais posts planifiés', c.poster_id, n.nom, '@' || coalesce(c.handle_tiktok, '?') || ' : ' || count(*) || ' post(s)'
    from public.comptes c join public.passages p on p.compte_id = c.id join nom n on n.id = c.poster_id
   where not c.is_active and p.date_publication_prevue > (now() at time zone 'Europe/Paris')::date and p.publie_url is null
   group by c.poster_id, n.nom, c.handle_tiktok
  union all
  -- Passé à 1 compte mais milestone encore au montant 2 comptes.
  select 'milestone', 'Passé à 1 compte, milestone à 2 comptes', pr.id, n.nom,
         coalesce(j.nom, '?') || ' : ' || j.montant || ' $ (attendu ' || pr.tarif_hebdo || ' $)'
    from public.profiles pr join nom n on n.id = pr.id
    join lateral (select u.nom, u.montant from public.upwork_jalons u where u.contrat_id = pr.upwork_contract_id
                   order by u.lu_at desc nulls last limit 1) j on true
   where pr.is_active and pr.canal_paie <> 'ruul' and pr.tarif_hebdo > 0
     and (select count(*) from public.comptes c where c.poster_id = pr.id and c.is_active and coalesce(c.type_compte, 'perso') = 'perso') = 1
     and exists (select 1 from public.comptes c where c.poster_id = pr.id and not c.is_active and c.non_renouveler
                   and c.non_renouveler_at > now() - interval '28 days')
     and j.montant >= 2 * pr.tarif_hebdo
  union all
  -- Compte actif mais le bot a annoncé « c'est fini ».
  select 'bot_arret', 'Actif, mais le bot a dit « arrêté »', d.poster_id, n.nom, left(d.bot_reponse, 120)
    from public.support_demandes d join nom n on n.id = d.poster_id
   where d.cree_at > now() - interval '30 days'
     and d.bot_reponse ~* '(account|contract|collaboration) (was|has been|is) (stopped|ended|terminated|no longer active)|collaboration with vik studios ended'
     and exists (select 1 from public.comptes c where c.poster_id = d.poster_id and c.is_active)
     and exists (select 1 from public.profiles p where p.id = d.poster_id and p.is_active)
  union all
  -- Demande d'arrêt reçue mais pas exécutée (avant le dernier samedi passé).
  select 'demande', 'Demande d''arrêt pas exécutée', d.poster_id, n.nom, 'demandée le ' || to_char(d.demande_at, 'DD/MM') || ' (' || coalesce(d.source, '?') || ')'
    from public.demandes_arret d join nom n on n.id = d.poster_id
   where d.decision is null
     and d.demande_at < (date_trunc('week', now() at time zone 'Europe/Paris') - interval '2 days')
     and exists (select 1 from public.comptes c where c.poster_id = d.poster_id and c.is_active);
$$;

-- Le rapport d'un samedi (kills validés ce jour-là, heure de Paris).
create or replace function public.samedi_rapport(p_samedi date)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with k as (
    select c.id as compte_id, c.poster_id, c.handle_tiktok, c.pays, pr.manager_id,
           coalesce(nullif(btrim(concat_ws(' ', pr.prenom, pr.nom)), ''), pr.email) as nom,
           (select coalesce(nullif(btrim(concat_ws(' ', h.prenom, h.nom)), ''), h.email) from public.profiles h where h.id = pr.manager_id) as hm,
           not exists (select 1 from public.comptes o where o.poster_id = c.poster_id and o.is_active) as complet
      from public.ckd_arrets a
      join public.comptes c on c.id = a.compte_id
      join public.profiles pr on pr.id = c.poster_id
     where a.annule_at is null and a.raison = 'ne_pas_renouveler'
       -- Les kills validés le samedi, exécutés au plus tard le lundi.
       and (a.fait_at at time zone 'Europe/Paris')::date between p_samedi and p_samedi + 2
  ),
  complets as (select distinct on (poster_id) poster_id, nom, hm, pays from k where complet order by poster_id),
  partiels as (select * from k where not complet),
  etapes_c as (
    select c.poster_id, c.nom, e->>'etape' as etape, e->>'libelle' as libelle, e->>'statut' as statut, e->>'detail' as detail
      from complets c cross join lateral jsonb_array_elements(public.kill_checklist(c.poster_id)) e
  ),
  etapes_p as (
    select p.poster_id, p.nom || ' (@' || coalesce(p.handle_tiktok, '?') || ')' as nom, e->>'etape' as etape, e->>'libelle' as libelle,
           e->>'statut' as statut, e->>'detail' as detail
      from partiels p cross join lateral jsonb_array_elements(public.kill_partiel_checklist(p.compte_id)) e
  ),
  controle as (select * from public.kills_controle())
  select jsonb_build_object(
    'samedi', p_samedi,
    'complets', (select count(*) from complets),
    'comptes_partiels', (select count(*) from partiels),
    'par_hm', coalesce((select jsonb_agg(jsonb_build_object('hm', coalesce(hm, '—'), 'complets', nc, 'partiels', np) order by nc + np desc)
                         from (select coalesce(hm, '—') as hm, count(distinct poster_id) filter (where complet) as nc,
                                      count(*) filter (where not complet) as np from k group by coalesce(hm, '—')) x), '[]'),
    'par_pays', coalesce((select jsonb_agg(jsonb_build_object('pays', coalesce(pays, '?'), 'complets', nc, 'partiels', np) order by nc + np desc)
                           from (select coalesce(pays, '?') as pays, count(distinct poster_id) filter (where complet) as nc,
                                        count(*) filter (where not complet) as np from k group by coalesce(pays, '?')) x), '[]'),
    'etapes_complets', coalesce((select jsonb_agg(jsonb_build_object('etape', etape, 'libelle', libelle,
                                   'ok', count(*) filter (where statut in ('fait', 'sans_objet')),
                                   'echec', count(*) filter (where statut = 'echec'),
                                   'a_faire', count(*) filter (where statut in ('a_faire', 'main')),
                                   'noms', coalesce(jsonb_agg(jsonb_build_object('nom', nom, 'statut', statut, 'detail', detail))
                                                     filter (where statut not in ('fait', 'sans_objet')), '[]'))
                                   order by etape) from etapes_c group by etape, libelle), '[]'),
    'etapes_partiels', coalesce((select jsonb_agg(jsonb_build_object('etape', etape, 'libelle', libelle,
                                   'ok', count(*) filter (where statut in ('fait', 'sans_objet')),
                                   'echec', count(*) filter (where statut = 'echec'),
                                   'a_faire', count(*) filter (where statut in ('a_faire', 'main')),
                                   'noms', coalesce(jsonb_agg(jsonb_build_object('nom', nom, 'statut', statut, 'detail', detail))
                                                     filter (where statut not in ('fait', 'sans_objet')), '[]'))
                                   order by etape) from etapes_p group by etape, libelle), '[]'),
    'milestones_a_corriger', coalesce((select jsonb_agg(jsonb_build_object('nom', nom, 'detail', detail)) from controle where type = 'milestone'), '[]'),
    'controle', coalesce((select jsonb_agg(jsonb_build_object('type', type, 'libelle', libelle, 'nb', n, 'lignes', l) order by type)
                           from (select type, libelle, count(*) as n,
                                        jsonb_agg(jsonb_build_object('poster_id', poster_id, 'nom', nom, 'detail', detail) order by nom) as l
                                   from controle group by type, libelle) x), '[]')
  );
$$;

create or replace function public.samedi_rapport_ecrire(p_samedi date, p_contenu jsonb)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.samedi_rapports (samedi, contenu, cree_at) values (p_samedi, p_contenu, now())
  on conflict (samedi) do update set contenu = excluded.contenu, cree_at = now();
$$;

create or replace function public.samedi_rapport_slack(p_samedi date, p_erreur text)
returns void
language sql
security definer
set search_path = public
as $$
  update public.samedi_rapports set slack_at = case when p_erreur is null then now() else slack_at end, slack_erreur = p_erreur
   where samedi = p_samedi;
$$;

-- Pour la page de l'OS : le dernier rapport, ou celui d'un samedi.
create or replace function public.samedi_rapport_lire(p_samedi date default null)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select case when public.is_admin() then
    (select jsonb_build_object('samedi', r.samedi, 'contenu', r.contenu, 'cree_at', r.cree_at, 'slack_at', r.slack_at)
       from public.samedi_rapports r where p_samedi is null or r.samedi = p_samedi order by r.samedi desc limit 1) end;
$$;

revoke all on function public.kill_date(uuid) from public, anon, authenticated;
revoke all on function public.kill_checklist(uuid) from public, anon;
revoke all on function public.kill_partiel_checklist(uuid) from public, anon;
revoke all on function public.kills_controle() from public, anon, authenticated;
revoke all on function public.samedi_rapport(date) from public, anon, authenticated;
revoke all on function public.samedi_rapport_ecrire(date, jsonb) from public, anon, authenticated;
revoke all on function public.samedi_rapport_slack(date, text) from public, anon, authenticated;
revoke all on function public.samedi_rapport_lire(date) from public, anon;
grant execute on function public.kill_date(uuid) to service_role;
grant execute on function public.kill_checklist(uuid) to service_role;
grant execute on function public.kill_partiel_checklist(uuid) to service_role;
grant execute on function public.kills_controle() to service_role;
grant execute on function public.samedi_rapport(date) to service_role;
grant execute on function public.samedi_rapport_ecrire(date, jsonb) to service_role;
grant execute on function public.samedi_rapport_slack(date, text) to service_role;
grant execute on function public.samedi_rapport_lire(date) to authenticated, service_role;

-- Le samedi soir (21 h 13 Paris), le rapport part dans l'OS et dans #a-os-tickets.
do $p$
begin
  if not exists (select 1 from cron.job where jobname = 'rapport-kills-samedi') then
    perform cron.schedule('rapport-kills-samedi', '13 20 * * 6', $c$
      select net.http_post(url := 'https://mbikecieskoobeizixig.supabase.co/functions/v1/support',
        headers := jsonb_build_object('content-type', 'application/json', 'x-cron-secret', public.cron_secret_lire()),
        body := '{"action":"rapport_samedi"}'::jsonb, timeout_milliseconds := 150000)
    $c$);
  end if;
end
$p$;
