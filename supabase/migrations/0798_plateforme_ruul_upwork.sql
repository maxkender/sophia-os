-- 0798 : UNE PLATEFORME PAR POSTEUR (Max, 21/11). Additif.
-- La plateforme d'un posteur est profiles.canal_paie : 'ruul' ou 'upwork' (un seul champ, lu partout).
-- 1. ruul_pays : les pays de Ruul (GET /api/countries, relu chaque jour par ruul-api « pays ») : un pays où un talent
--    ne peut pas s'inscrire ou ajouter sa banque n'est pas accepté → le posteur passe sur Upwork.
-- 2. posteur_pays_residence / ruul_pays_refuse : son pays (celui donné à Ruul, sinon celui de sa candidature).
-- 3. ruul_etapes : les 3 étapes du set-up Ruul (inscrit sur app.ruul.io, identité vérifiée, banque ajoutée), lues de
--    la synchro horaire de l'API Ruul ; prêt = READY chez Ruul (payable).
-- 4. plateforme_incoherences (montrées à Max, rien n'est corrigé seul) et plateforme_chiffres.

-- 1.
create table if not exists public.ruul_pays (
  code text primary key,
  nom text,
  inscription boolean not null default true,
  banque boolean not null default true,
  maj_at timestamptz not null default now()
);
alter table public.ruul_pays enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'ruul_pays' and policyname = 'ruul_pays_lecture') then
    create policy ruul_pays_lecture on public.ruul_pays for select to authenticated using (true);
  end if;
end $$;

-- 2.
create or replace function public.posteur_pays_residence(p_poster uuid)
returns text language sql stable security definer set search_path = public as $$
  select coalesce(
    (select rp.code from public.ruul_workmates w join public.ruul_pays rp on lower(rp.nom) = lower(w.pays)
      where w.poster_id = p_poster and w.pays is not null order by w.lu_at desc nulls last limit 1),
    (select upper(h.pays_code) from public.hub_posteurs h where h.profile_id = p_poster and h.pays_code is not null limit 1),
    -- Un posteur Upwork : le pays de son profil freelance.
    (select rp.code from public.profiles pr join public.upwork_contrats c on c.contrat_id = pr.upwork_contract_id
       join public.ruul_pays rp on lower(rp.nom) = lower(c.freelancer_pays) or rp.code = upper(c.freelancer_pays)
      where pr.id = p_poster limit 1));
$$;

create or replace function public.ruul_pays_refuse(p_poster uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.ruul_pays rp
                  where rp.code = public.posteur_pays_residence(p_poster) and not (rp.inscription and rp.banque));
$$;
revoke execute on function public.posteur_pays_residence(uuid) from public, anon;
revoke execute on function public.ruul_pays_refuse(uuid) from public, anon;
grant execute on function public.posteur_pays_residence(uuid) to authenticated, service_role;
grant execute on function public.ruul_pays_refuse(uuid) to authenticated, service_role;

-- 3.
create or replace function public.ruul_etapes(p_poster uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  -- La synchro horaire de l'API Ruul (0720) : statut du talent, KYC, banque, et READY (payable).
  select jsonb_build_object(
    'inscrit', coalesce(upper(p.ruul_statut_api), 'NOT_REGISTERED') <> 'NOT_REGISTERED',
    'identite', coalesce(upper(p.ruul_kyc) = 'APPROVED', false),
    'banque', coalesce(p.ruul_banque, false),
    'pret', coalesce(p.ruul_onboarding = 'READY', false),
    'kyc', p.ruul_kyc,
    'onboarding', p.ruul_onboarding,
    'refus_identite', coalesce(p.ruul_identite_refus, 0))
    from public.profiles p where p.id = p_poster;
$$;
revoke execute on function public.ruul_etapes(uuid) from public, anon;
grant execute on function public.ruul_etapes(uuid) to authenticated, service_role;

-- 4. Les incohérences : montrées à Max, jamais corrigées seules.
create or replace function public.plateforme_incoherences()
returns table (type text, libelle text, poster_id uuid, nom text, detail text)
language sql stable security definer set search_path = public as $$
  with p as (
    select pr.* from public.profiles pr join public.user_roles ur on ur.user_id = pr.id and ur.role = 'poster'
     where pr.is_active and (public.is_admin() or coalesce(auth.role(), '') = 'service_role'))
  select 'ruul_contrat_upwork_actif', 'Posteur Ruul avec un contrat Upwork actif', p.id, concat_ws(' ', p.prenom, p.nom), p.upwork_contract_id
    from p join public.upwork_contrats c on c.contrat_id = p.upwork_contract_id and c.actif where p.canal_paie = 'ruul'
  union all
  select 'ruul_contrat_upwork_relie', 'Posteur Ruul relié à un contrat Upwork (fermé)', p.id, concat_ws(' ', p.prenom, p.nom), p.upwork_contract_id
    from p where p.canal_paie = 'ruul' and p.upwork_contract_id is not null
     and not exists (select 1 from public.upwork_contrats c where c.contrat_id = p.upwork_contract_id and c.actif)
  union all
  select 'upwork_dans_ruul', 'Posteur Upwork présent dans Ruul', p.id, concat_ws(' ', p.prenom, p.nom), w.statut
    from p join public.ruul_workmates w on w.poster_id = p.id where coalesce(p.canal_paie, 'upwork') = 'upwork'
  union all
  select 'upwork_infos_ruul', 'Posteur Upwork avec un statut Ruul', p.id, concat_ws(' ', p.prenom, p.nom), coalesce(p.ruul_statut, p.ruul_compte)
    from p where coalesce(p.canal_paie, 'upwork') = 'upwork' and (p.ruul_statut is not null or p.ruul_compte is not null)
  union all
  select 'upwork_paye_ruul', 'Posteur Upwork dans un paiement Ruul', p.id, concat_ws(' ', p.prenom, p.nom), min(x.semaine)::text
    from p join public.ruul_paiements x on x.poster_id = p.id where coalesce(p.canal_paie, 'upwork') = 'upwork' group by p.id, p.prenom, p.nom
  union all
  select 'ruul_absent_de_ruul', 'Posteur Ruul introuvable dans Ruul', p.id, concat_ws(' ', p.prenom, p.nom), p.ruul_statut
    from p where p.canal_paie = 'ruul' and not exists (select 1 from public.ruul_workmates w where w.poster_id = p.id)
  union all
  select 'ruul_pays_refuse', 'Posteur Ruul dans un pays refusé par Ruul', p.id, concat_ws(' ', p.prenom, p.nom), public.posteur_pays_residence(p.id)
    from p where p.canal_paie = 'ruul' and public.ruul_pays_refuse(p.id)
  union all
  select 'sans_plateforme', 'Posteur sans plateforme', p.id, concat_ws(' ', p.prenom, p.nom), null
    from p where p.canal_paie is null
  union all
  select 'upwork_sans_contrat', 'Posteur Upwork sans contrat relié', p.id, concat_ws(' ', p.prenom, p.nom), null
    from p where p.canal_paie = 'upwork' and coalesce(p.upwork_contract_id, '') = '';
$$;
revoke execute on function public.plateforme_incoherences() from public, anon;
grant execute on function public.plateforme_incoherences() to authenticated, service_role;

create or replace function public.plateforme_chiffres()
returns jsonb language sql stable security definer set search_path = public as $$
  with p as (
    select pr.id, coalesce(pr.canal_paie, 'upwork') as canal, public.ruul_etapes(pr.id) as e
      from public.profiles pr join public.user_roles ur on ur.user_id = pr.id and ur.role = 'poster'
     where pr.is_active and (public.is_admin() or coalesce(auth.role(), '') = 'service_role'))
  select jsonb_build_object(
    'ruul', count(*) filter (where canal = 'ruul'),
    'upwork', count(*) filter (where canal = 'upwork'),
    'ruul_prets', count(*) filter (where canal = 'ruul' and (e->>'pret')::boolean),
    'ruul_pas_inscrits', count(*) filter (where canal = 'ruul' and not (e->>'inscrit')::boolean),
    'ruul_sans_identite', count(*) filter (where canal = 'ruul' and (e->>'inscrit')::boolean and not (e->>'identite')::boolean),
    'ruul_sans_banque', count(*) filter (where canal = 'ruul' and (e->>'inscrit')::boolean and (e->>'identite')::boolean and not (e->>'banque')::boolean),
    'ruul_pas_prets', count(*) filter (where canal = 'ruul' and not (e->>'pret')::boolean),
    'pays_refuses_ruul', count(*) filter (where canal = 'ruul' and public.ruul_pays_refuse(id)),
    'pays_refuses_upwork', count(*) filter (where canal = 'upwork' and public.ruul_pays_refuse(id)))
    from p;
$$;
revoke execute on function public.plateforme_chiffres() from public, anon;
grant execute on function public.plateforme_chiffres() to authenticated, service_role;

-- La liste des pays relue chaque jour (04:23 UTC).
do $$
begin
  perform cron.unschedule(j.jobid) from cron.job j where j.jobname = 'ruul-pays';
  perform cron.schedule('ruul-pays', '23 4 * * *',
    $c$select net.http_post(url := 'https://mbikecieskoobeizixig.supabase.co/functions/v1/ruul-api',
        headers := jsonb_build_object('content-type', 'application/json', 'x-cron-secret', public.cron_secret_lire()),
        body := '{"action":"pays"}'::jsonb, timeout_milliseconds := 60000)$c$);
end $$;
