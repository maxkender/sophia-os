-- Needs you, carte « No channel to reach them », au format fiche (prompt 25
-- mise à jour, section 10), en anglais.
--
-- 1. upwork_offres : toutes les offres envoyées (tous états), lues en
--    lecture seule par la fonction upwork (action offres, cron chaque jour et
--    bouton de la carte).
-- 2. nom_normalise / noms_proches : « Serena G. » ou « Serena Gugliotta »
--    face au prénom et au nom du profil.
-- 3. sans_canal_fiche(posteur) : ce qu'on sait (créé par, le, connexion,
--    cohorte, reporté), l'offre ou le contrat à son nom (état, lien), le
--    contrat qui attend dans « Contracts to link », les contrats pas reliés.
-- 4. sans_canal_relier(posteur, contrat, pays) : relie le contrat au profil
--    (le welcome part ensuite comme d'habitude, selon accueil_auto) ; avec un
--    pays, l'annonce du contrat le garde pour les suivants.
-- 5. needs_you : la phrase en anglais, « Contract found: … » s'il attend,
--    pas de carte pour un profil test (TEST dans le nom), « Blocks Monday »
--    seulement si la cohorte n'est pas passée et la personne pas reportée.
--    La carte se ferme seule (contrat relié ou Slack rejoint) comme avant.

create table if not exists public.upwork_offres (
  offre_id text primary key,
  organisation_id text,
  titre text,
  etat text,
  debut_at timestamptz,
  freelancer_nom text,
  contrat_id text,
  contrat_statut text,
  lu_at timestamptz not null default now()
);
alter table public.upwork_offres enable row level security;
create policy "upwork_offres lecture" on public.upwork_offres for select using ((select public.is_admin()));

create or replace function public.nom_normalise(t text)
returns text
language sql
immutable
as $$
  select btrim(regexp_replace(regexp_replace(lower(translate(coalesce(t, ''),
    'ÀÁÂÃÄÅàáâãäåÇçÈÉÊËèéêëÌÍÎÏìíîïÑñÒÓÔÕÖØòóôõöøÙÚÛÜùúûüÝýÿŠšŽžČčĆćĐđŁłŃńŚśŹźŻżĞğİıŞşŘřŤťĚěŮů',
    'AAAAAAaaaaaaCcEEEEeeeeIIIIiiiiNnOOOOOOooooooUUUUuuuuYyySsZzCcCcDdLlNnSsZzZzGgIiSsRrTtEeUu')), '[^a-z ]', ' ', 'g'), '\s+', ' ', 'g'));
$$;

-- Même prénom, et même nom ou même initiale (Upwork : « Serena G. »).
create or replace function public.noms_proches(p_prenom text, p_nom text, p_complet text)
returns boolean
language sql
immutable
as $$
  with a as (
    select split_part(public.nom_normalise(p_prenom), ' ', 1) as pr,
           public.nom_normalise(p_nom) as nm,
           public.nom_normalise(p_complet) as c
  )
  select a.pr <> '' and split_part(a.c, ' ', 1) = a.pr
     and (a.nm = '' or split_part(a.c, ' ', 2) = '' or left(split_part(a.c, ' ', 2), 1) = left(a.nm, 1))
    from a;
$$;

create or replace function public.sans_canal_fiche(p_poster uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v jsonb;
begin
  if not (public.is_admin() or public.paie_droit_posteur(p_poster)) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select jsonb_build_object(
    'prenom', pr.prenom, 'nom', pr.nom,
    'hm', (select h.prenom from public.profiles h where h.id = pr.manager_id),
    'cree_le', pr.created_at,
    'connexion', greatest(u.last_sign_in_at, (select max(coalesce(s.refreshed_at, s.updated_at)) from auth.sessions s where s.user_id = pr.id)),
    'cohorte', pr.cohorte_lundi,
    'reporte', exists (select 1 from public.recrue_evenements e where e.poster_id = pr.id and e.type = 'reporte'),
    'pays', (select c.pays from public.comptes c where c.poster_id = pr.id and c.pays is not null order by c.created_at limit 1),
    'en_attente', coalesce((select jsonb_agg(jsonb_build_object('contrat_id', a.contrat_id, 'statut', a.statut, 'raison', a.raison,
                                                              'job_titre', a.job_titre, 'nom', concat_ws(' ', a.prenom, a.nom), 'debut_at', a.debut_at)
                                             order by a.debut_at desc)
                              from public.accueils a
                             where a.statut in ('a_relier', 'simule') and a.poster_id is null
                               and public.noms_proches(pr.prenom, pr.nom, concat_ws(' ', a.prenom, a.nom))), '[]'::jsonb),
    'offres', coalesce((select jsonb_agg(jsonb_build_object('offre_id', o.offre_id, 'etat', o.etat, 'titre', o.titre, 'nom', o.freelancer_nom,
                                                          'debut_at', o.debut_at, 'contrat_id', o.contrat_id,
                                                          'relie', exists (select 1 from public.profiles z where z.upwork_contract_id = o.contrat_id and z.is_active))
                                         order by o.debut_at desc nulls last)
                          from public.upwork_offres o where public.noms_proches(pr.prenom, pr.nom, o.freelancer_nom)), '[]'::jsonb),
    'offres_lues_at', (select max(o.lu_at) from public.upwork_offres o),
    'libres', coalesce((select jsonb_agg(jsonb_build_object('contrat_id', uc.contrat_id, 'nom', uc.freelancer_nom, 'titre', uc.titre,
                                                          'debut_at', uc.debut_at, 'proche', public.noms_proches(pr.prenom, pr.nom, uc.freelancer_nom))
                                         order by public.noms_proches(pr.prenom, pr.nom, uc.freelancer_nom) desc, uc.debut_at desc)
                          from public.upwork_contrats uc
                         where uc.actif and uc.contrat_id is not null and uc.debut_at > now() - interval '90 days'
                           and not exists (select 1 from public.profiles z where z.upwork_contract_id = uc.contrat_id and z.is_active)), '[]'::jsonb)
  ) into v
  from public.profiles pr
  left join auth.users u on u.id = pr.id
  where pr.id = p_poster;
  return v;
end;
$$;
revoke all on function public.sans_canal_fiche(uuid) from public, anon;
grant execute on function public.sans_canal_fiche(uuid) to authenticated;

create or replace function public.sans_canal_relier(p_poster uuid, p_contrat text, p_pays text default null)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pays text := nullif(upper(btrim(coalesce(p_pays, ''))), '');
  v_job text;
  v_titre text;
  v_langue text;
begin
  if not (public.is_admin() or public.paie_droit_posteur(p_poster)) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_contrat is null or p_contrat !~ '^[0-9]{6,}$' then
    raise exception 'Contract id expected (e.g. 44792521)';
  end if;
  if exists (select 1 from public.profiles z where z.upwork_contract_id = p_contrat and z.is_active and z.id <> p_poster) then
    raise exception 'This contract is already linked to another active poster';
  end if;
  update public.profiles
     set upwork_contract_id = p_contrat,
         upwork_contrat_url = coalesce(nullif(btrim(upwork_contrat_url), ''), 'https://www.upwork.com/nx/wm/workroom/' || p_contrat || '/overview')
   where id = p_poster and is_active and upwork_contract_id is null;
  if not found then
    raise exception 'Poster inactive or already linked to a contract';
  end if;
  if v_pays is not null then
    select a.job_id, a.job_titre into v_job, v_titre from public.accueils a where a.contrat_id = p_contrat;
    select c.langue into v_langue from public.comptes c where c.poster_id = p_poster and c.langue is not null order by c.created_at limit 1;
    update public.accueils set pays = v_pays, langue = coalesce(langue, v_langue), relie_par = auth.uid(), relie_at = now(), updated_at = now()
     where contrat_id = p_contrat and statut in ('a_relier', 'simule');
    if v_job is not null then
      insert into public.annonces_pays (job_id, titre, pays, langue, generique, maj_at, maj_par)
      values (v_job, v_titre, v_pays, v_langue, false, now(), auth.uid())
      on conflict (job_id) do update set pays = excluded.pays, langue = coalesce(annonces_pays.langue, excluded.langue),
                                         generique = false, maj_at = now(), maj_par = auth.uid();
    end if;
  end if;
  perform public.recrue_evenement_noter(p_poster, null, 'contrat_relie', now(), null, 'contrat_relie:' || p_contrat);
  return p_contrat;
end;
$$;
revoke all on function public.sans_canal_relier(uuid, text, text) from public, anon;
grant execute on function public.sans_canal_relier(uuid, text, text) to authenticated;

-- La carte de needs_you, réécrite (le reste de la fonction ne change pas).
do $p$
declare
  v_def text := pg_get_functiondef('public.needs_you()'::regprocedure);
  v_avant text := $a$    select 'sans_canal:' || p.id, 'bloque', 'sans_canal', p.id, null,
           'Ni contrat Upwork relié, ni Slack', 'L''OS ne peut rien lui envoyer', null,
           'lundi', p.created_at, array['ouvrir', 'ignorer'], p.id::text, '/admin/auto/recruits', null, 1
      from public.profiles p
     where p.is_active and p.cohorte_lundi >= v_lundi
       and p.slack_user_id is null and p.upwork_contract_id is null
       and exists (select 1 from public.user_roles ur where ur.user_id = p.id and ur.role = 'poster')$a$;
  v_apres text := $a$    select 'sans_canal:' || p.id, 'bloque', 'sans_canal', p.id, null,
           format('%s has a login but no Upwork contract and isn''t on Slack. The OS can''t send them anything.', coalesce(nullif(btrim(p.prenom), ''), 'This poster')),
           coalesce((select format('Contract found: %s, waiting for the job post''s country', a.contrat_id)
                       from public.accueils a
                      where a.statut in ('a_relier', 'simule') and a.poster_id is null
                        and public.noms_proches(p.prenom, p.nom, concat_ws(' ', a.prenom, a.nom))
                      order by a.debut_at desc limit 1),
                    'Link a contract, or deactivate if they never joined'), null,
           case when p.cohorte_lundi > v_lundi
                     and not exists (select 1 from public.recrue_evenements e where e.poster_id = p.id and e.type = 'reporte')
                then 'lundi' else 'rien' end,
           p.created_at, array['ouvrir', 'ignorer'], p.id::text, '/admin/auto/recruits', null, 1
      from public.profiles p
     where p.is_active and p.cohorte_lundi >= v_lundi
       and p.slack_user_id is null and p.upwork_contract_id is null
       and concat_ws(' ', p.prenom, p.nom) !~* 'test'
       and exists (select 1 from public.user_roles ur where ur.user_id = p.id and ur.role = 'poster')$a$;
begin
  if position(v_avant in v_def) = 0 then
    raise exception 'needs_you : la carte sans_canal attendue est introuvable';
  end if;
  execute replace(v_def, v_avant, v_apres);
end;
$p$;

-- Le cron : les offres, chaque jour à 4 h 50 (lecture seule), avec la commande de jalons-lundi (seule l'action change).
do $c$
declare
  v text;
begin
  select regexp_replace(j.command, '"action"\s*:\s*"jalons"', '"action":"offres"') into v
    from cron.job j where j.jobname = 'jalons-lundi';
  if v is not null and v ~ '"action":"offres"' and not exists (select 1 from cron.job where jobname = 'upwork-offres') then
    perform cron.schedule('upwork-offres', '50 4 * * *', v);
  end if;
end;
$c$;

notify pgrst, 'reload schema';
