-- 0810 : Ruul de A à Z (Max, 21/11), point 7 (mécanismes pour le bot du support) et FAQ des frais Ruul. Additif.
-- 1. ruul_passer_upwork : le posteur veut être payé sur Upwork (bouton « I want to be paid on Upwork » ou message) →
--    ligne « To add on Upwork » (lien de profil connu : « à inviter », sinon « lien attendu ») et retiré de Ruul
--    (profiles.ruul_retire_at : plus de relances Ruul, plus d'invitation Ruul). Serveur seulement.
-- 2. ruul_identite_situation : identité refusée ou déjà un compte Ruul : venu d'Upwork ? (lien de profil), nombre de
--    refus (au 2e : Slack à Max, fait par la fonction ruul), le jeton du bouton Upwork.
-- 3. ruul_kyc_relances_dues : plus de relance KYC pour un posteur retiré de Ruul.
-- 4. FAQ : les frais Ruul sont payés par Vik Studios ; délai 1 à 2 jours ouvrés.

alter table public.profiles add column if not exists ruul_retire_at timestamptz;
alter table public.profiles add column if not exists ruul_retire_raison text;

-- 1.
create or replace function public.ruul_passer_upwork(p_poster uuid, p_source text, p_url text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pr public.profiles;
  v_url text;
  v_dem jsonb;
  v_lien jsonb;
begin
  if coalesce(auth.role(), '') <> 'service_role' and session_user not in ('postgres', 'supabase_admin') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select * into v_pr from public.profiles where id = p_poster;
  if v_pr.id is null or v_pr.canal_paie is distinct from 'ruul' then return jsonb_build_object('ok', false, 'erreur', 'pas un posteur Ruul'); end if;
  v_url := coalesce(nullif(btrim(p_url), ''), nullif(btrim(v_pr.upwork_url), ''),
                    (select u.profil_url from public.upwork_a_ajouter u where u.poster_id = p_poster and u.profil_url is not null order by u.maj_at desc nulls last limit 1));
  v_dem := public.upwork_exception_demander(p_poster, case when p_source in ('help', 'slack', 'email', 'upwork') then p_source else 'help' end, null);
  if v_url is not null then
    v_lien := public.upwork_exception_lien(p_poster, v_url, p_source);
  end if;
  update public.profiles
     set ruul_retire_at = coalesce(ruul_retire_at, now()),
         ruul_retire_raison = coalesce(ruul_retire_raison, 'veut être payé sur Upwork (' || coalesce(p_source, '?') || ')')
   where id = p_poster;
  return jsonb_build_object('ok', true, 'upwork_url', v_url, 'lien_attendu', v_url is null or coalesce((v_lien->>'ok')::boolean, false) = false,
                            'ligne', v_dem, 'lien', v_lien);
end;
$$;
revoke all on function public.ruul_passer_upwork(uuid, text, text) from public, anon, authenticated;
grant execute on function public.ruul_passer_upwork(uuid, text, text) to service_role;

-- 2.
create or replace function public.ruul_identite_situation(p_poster uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'poster_id', pr.id,
    'prenom', pr.prenom,
    'refus', greatest(coalesce(pr.ruul_identite_refus, 0), case when w.kyc = 'DECLINED' then 1 else 0 end),
    'identite_refusee', w.kyc = 'DECLINED' or pr.ruul_identite = 'declined',
    'upwork_url', coalesce(nullif(btrim(pr.upwork_url), ''),
                           (select u.profil_url from public.upwork_a_ajouter u where u.poster_id = pr.id and u.profil_url is not null order by u.maj_at desc nulls last limit 1)),
    'venu_upwork', nullif(btrim(pr.upwork_url), '') is not null or pr.upwork_contract_id is not null or nullif(btrim(pr.equipe_upwork), '') is not null
                   or exists (select 1 from public.upwork_a_ajouter u where u.poster_id = pr.id and u.profil_url is not null),
    'retire_de_ruul', pr.ruul_retire_at is not null,
    'jeton', pr.ruul_jeton,
    'onboarding', pr.ruul_onboarding)
    from public.profiles pr
    left join public.ruul_workmates w on w.poster_id = pr.id and w.env = 'prod'
   where pr.id = p_poster;
$$;
revoke all on function public.ruul_identite_situation(uuid) from public, anon, authenticated;
grant execute on function public.ruul_identite_situation(uuid) to service_role;

-- 3.
do $p$
declare
  d text := pg_get_functiondef('public.ruul_kyc_relances_dues(date,boolean)'::regprocedure);
  avant text := 'and pr.relances_stop_at is null';
begin
  if position('0810' in d) > 0 then return; end if;
  if position(avant in d) = 0 then raise exception '0810 : ruul_kyc_relances_dues a changé'; end if;
  execute replace(d, avant, avant || ' and pr.ruul_retire_at is null /* 0810 */');
end
$p$;

-- 4.
insert into public.support_infos (cle, titre, valeur, ordre)
select 'ruul_frais', 'Frais Ruul',
       'Ruul fees are paid by Vik Studios: the poster receives the full amount (10 $ sent = 10 $ received). Payment is sent on Monday and usually reaches the bank 1 to 2 business days later (Tuesday or Wednesday).', 17
 where not exists (select 1 from public.support_infos s where s.cle = 'ruul_frais');

-- 5. Les messages Slack à Max (identité refusée 2 fois) : un par posteur et par jour.
create table if not exists public.ruul_alertes_max (
  poster_id uuid not null references public.profiles(id),
  cle text not null,
  at timestamptz not null default now(),
  primary key (poster_id, cle)
);
alter table public.ruul_alertes_max enable row level security;

-- 6. Point 9 B : la relance de signature « en plus », une seule fois (fonction ruul, action relance_signature_unique).
alter table public.ruul_candidatures add column if not exists relance_extra_at timestamptz;

-- 7. Point 9 A : posteurs Ruul actifs avec posts prévus du lundi au vendredi d'une semaine et 0 post avec lien ou moins
--    de la moitié ; jours d'absence / pause / panne exclus, posts du vendredi créés après 06:00 UTC (panne du 20/11)
--    exclus, déjà killés ou STOP exclus. Lu par la fonction ruul (action relance_posts_unique, liste d'abord).
create or replace function public.ruul_relance_posts_liste(p_lundi date)
returns table (poster_id uuid, prenom text, liens integer, prevus integer, jamais_poste boolean)
language sql
stable
security definer
set search_path = public
as $$
  with p as (
    select c.poster_id, pa.publie_url, pa.credite_raison
      from public.passages pa
      join public.comptes c on c.id = pa.compte_id
      join public.profiles pr on pr.id = c.poster_id
     where pr.canal_paie = 'ruul' and pr.is_active and pr.relances_stop_at is null and pr.ruul_retire_at is null
       and c.is_active and c.type_compte = 'perso'
       and pa.date_publication_prevue between p_lundi and p_lundi + 4
       and pa.statut::text <> 'brouillon' and not coalesce(pa.est_rappel, false)
       and not (pa.date_publication_prevue = p_lundi + 4 and pa.created_at > ((p_lundi + 4)::timestamp + interval '6 hours') at time zone 'UTC')
       and public.posteur_jour_excuse(c.poster_id, pa.date_publication_prevue) is null
  ),
  t as (
    select p.poster_id, count(*)::int as prevus, (count(*) filter (where p.publie_url is not null or p.credite_raison is not null))::int as liens
      from p group by 1
  )
  select t.poster_id, pr.prenom, t.liens, t.prevus,
         not exists (select 1 from public.passages x join public.comptes c on c.id = x.compte_id where c.poster_id = t.poster_id and x.publie_url is not null)
    from t join public.profiles pr on pr.id = t.poster_id
   where (t.liens = 0 or t.liens * 2 < t.prevus)
     and not exists (select 1 from public.paie_kills_sans_paie k where k.poster_id = t.poster_id and k.annule_at is null)
     and not exists (select 1 from public.ckd_arrets a join public.comptes c on c.id = a.compte_id
                      where c.poster_id = t.poster_id and a.annule_at is null and a.raison = 'ne_pas_renouveler')
     and not exists (select 1 from public.ckd_propositions cp where cp.poster_id = t.poster_id and cp.jour >= p_lundi and cp.decision = 'ne_pas_renouveler')
   order by t.liens, pr.prenom;
$$;
revoke all on function public.ruul_relance_posts_liste(date) from public, anon, authenticated;
grant execute on function public.ruul_relance_posts_liste(date) to service_role;
