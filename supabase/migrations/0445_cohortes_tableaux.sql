-- 0445 — Recruitment Automation → Cohorts : les tableaux de bord des cohortes
-- (lecture seule, admin et Head of Ops). Rien n'est écrit par ces fonctions.
--
-- - cohortes_postes(p_lundi) : une ligne par posteur d'une cohorte (toutes si
--   null), dans la cohorte où il commence vraiment (profiles.cohorte_lundi),
--   avec « reporté de » ; les étapes datées de l'accueil, les relances reçues
--   (Slack / Upwork), envoyées à la main par la HM, en file ; la dernière
--   réaction ; Kill, arrêt et Double avec leur date et leur raison ; les posts
--   par semaine de cohorte (S1 = la semaine du lundi de départ).
-- - cohortes_vues(p_lundi) : la médiane des vues par post, par cohorte et
--   semaine, et par HM.
-- - Un journal des changements de cohorte (recrue_evenements « cohorte_changee »)
--   pour que « reporté de » ne dépende plus seulement de la bienvenue.
--
-- Exclus : la cohorte RUUL (hub_posteurs), les contrats de test.
-- Additive : 3 fonctions, 1 déclencheur. Aucune donnée existante modifiée.

create or replace function public.profiles_cohorte_journal()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.cohorte_lundi is not null and new.cohorte_lundi is distinct from old.cohorte_lundi then
    insert into public.recrue_evenements (poster_id, type, at, detail, cle)
    values (new.id, 'cohorte_changee', now(),
            'Cohorte ' || old.cohorte_lundi::text || ' → ' || coalesce(new.cohorte_lundi::text, '—'),
            old.cohorte_lundi::text || '>' || coalesce(new.cohorte_lundi::text, ''))
    on conflict (poster_id, type, cle) do nothing;
  end if;
  return new;
end;
$$;
drop trigger if exists profiles_cohorte_journal on public.profiles;
create trigger profiles_cohorte_journal after update of cohorte_lundi on public.profiles
  for each row execute function public.profiles_cohorte_journal();

create or replace function public.cohortes_postes(p_lundi date default null)
returns table (
  poster_id         uuid,
  nom               text,
  hm_id             uuid,
  hm_nom            text,
  pays              text,
  cohorte_lundi     date,
  reporte_de        date,
  actif             boolean,
  offre_at          timestamptz,
  bienvenue_at      timestamptz,
  connexion_at      timestamptz,
  slack_at          timestamptz,
  sur_slack         boolean,
  tiktok_at         timestamptz,
  warmup_at         timestamptz,
  pret              boolean,
  relances_slack    integer,
  relances_upwork   integer,
  main_hm           integer,
  en_file           integer,
  derniere_reaction timestamptz,
  kill_at           timestamptz,
  kill_raison       text,
  arret_at          timestamptz,
  arret_raison      text,
  double_at         timestamptz,
  premier_post      date,
  semaines          jsonb
)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_auj date := (now() at time zone 'Europe/Paris')::date;
begin
  if not public.is_admin() then
    raise exception 'cohortes_postes : réservé à l''admin et au Head of Ops' using errcode = '42501';
  end if;
  return query
  with p as (
    select pr.*
      from public.profiles pr
     where pr.cohorte_lundi is not null
       and (p_lundi is null or pr.cohorte_lundi = p_lundi)
       and exists (select 1 from public.user_roles ur where ur.user_id = pr.id and ur.role = 'poster')
       and not exists (select 1 from public.hub_posteurs h where h.profile_id = pr.id)
       and not exists (select 1 from public.contrats_test t where t.contrat_id = pr.upwork_contract_id and t.retire_at is null)
  ),
  co as (
    select c.id, c.poster_id, c.type_compte, c.warmup_started_at, c.created_at
      from public.comptes c where c.poster_id in (select p.id from p)
  ),
  principal as (
    select distinct on (co.poster_id) co.* from co where co.type_compte = 'perso' order by co.poster_id, co.created_at
  ),
  sem as (
    select co.poster_id, ((pa.date_publication_prevue - p.cohorte_lundi) / 7 + 1) as k, pa.compte_id,
           count(*)::int as prevus, count(pa.publie_url)::int as liens
      from public.passages pa
      join co on co.id = pa.compte_id
      join p on p.id = co.poster_id
     where pa.date_publication_prevue >= p.cohorte_lundi and pa.date_publication_prevue <= v_auj
       and pa.statut::text <> 'brouillon' and not coalesce(pa.est_rappel, false)
     group by 1, 2, 3
  ),
  semp as (
    select s.poster_id,
           jsonb_agg(jsonb_build_object('k', s.k, 'comptes', s.comptes, 'prevus', s.prevus, 'liens', s.liens, 'comptes6', s.comptes6) order by s.k) as j
      from (select sem.poster_id, sem.k, count(*)::int as comptes, sum(sem.prevus)::int as prevus, sum(sem.liens)::int as liens,
                   (count(*) filter (where sem.liens >= 6))::int as comptes6
              from sem group by 1, 2) s
     group by 1
  )
  select p.id,
         nullif(btrim(concat_ws(' ', p.prenom, p.nom)), ''),
         p.manager_id,
         nullif(btrim(concat_ws(' ', hm.prenom, hm.nom)), ''),
         coalesce((select a.pays from public.accueils a where a.poster_id = p.id order by a.created_at desc limit 1),
                  (select c.pays from public.comptes c where c.poster_id = p.id and c.pays is not null order by c.created_at limit 1)),
         p.cohorte_lundi,
         greatest(
           (select max(rr.periode) from public.recrues_rouges rr
             where rr.poster_id = p.id and rr.decision = 'reporter' and rr.periode < p.cohorte_lundi),
           (select max(a.cohorte_lundi) from public.accueils a where a.poster_id = p.id and a.cohorte_lundi < p.cohorte_lundi),
           (select max(split_part(e.cle, '>', 1)::date) from public.recrue_evenements e
             where e.poster_id = p.id and e.type = 'cohorte_changee' and split_part(e.cle, '>', 1) ~ '^\d{4}-\d{2}-\d{2}$'
               and split_part(e.cle, '>', 1)::date < p.cohorte_lundi)),
         p.is_active,
         p.offre_acceptee_le,
         coalesce((select a.message_at from public.accueils a where a.poster_id = p.id and a.message_at is not null order by a.message_at limit 1),
                  (select min(n.envoye_at) from public.nudges n where n.poster_id = p.id and n.type = 'accueil'
                     and (n.slack_erreur is null or coalesce(array_length(n.canaux, 1), 0) > 0))),
         p.premiere_connexion_at,
         p.slack_lie_at,
         p.slack_user_id is not null,
         coalesce((select min(x.releve_at) from public.ckd_warmup_releves x where x.compte_id = pc.id and x.existe),
                  (select min(pa.date_publication_prevue)::timestamptz from public.passages pa where pa.compte_id = pc.id and pa.publie_url is not null)),
         pc.warmup_started_at,
         case when p.cohorte_lundi > v_auj and pc.id is not null then public.compte_pret(pc.id) end,
         coalesce(r.s, 0), coalesce(r.u, 0), coalesce(r.m, 0),
         (select count(*)::int from public.relances_prevues rp where rp.poster_id = p.id and rp.statut = 'prevu' and rp.valide_at is not null),
         greatest((select max(rep.recu_at) from public.posteur_reponses rep where rep.poster_id = p.id),
                  (select max(re.slack_at) from public.posteur_reactions re where re.poster_id = p.id)),
         k.at, k.raison,
         case when k.at is null and (s.at is not null or not p.is_active) then s.at end,
         case when k.at is null and (s.at is not null or not p.is_active) then coalesce(s.raison, 'desactive') end,
         (select min(x.at) from (
            select cp.decision_at as at from public.ckd_propositions cp where cp.poster_id = p.id and cp.decision = 'doubler'
            union all
            select e.at from public.recrue_evenements e where e.poster_id = p.id and e.type = 'deuxieme_compte') x),
         (select min(pa.date_publication_prevue) from public.passages pa join co on co.id = pa.compte_id
           where co.poster_id = p.id and pa.publie_url is not null),
         coalesce(semp.j, '[]'::jsonb)
    from p
    left join public.profiles hm on hm.id = p.manager_id
    left join principal pc on pc.poster_id = p.id
    left join semp on semp.poster_id = p.id
    left join lateral (
      select count(*) filter (where 'slack' = any (coalesce(n.canaux, array[n.canal])) and coalesce(n.cible, '') <> 'hm')::int as s,
             count(*) filter (where 'upwork' = any (coalesce(n.canaux, array[n.canal])) and coalesce(n.cible, '') <> 'hm')::int as u,
             count(*) filter (where n.cible = 'hm')::int as m
        from public.nudges n
       where n.poster_id = p.id
         and n.type in ('relance', 'connexion', 'tiktok', 'warmup_lance', 'warmup_bien_fait', 'jeudi_recrue', 'handle', 'handle_upwork', 'accueil')
         and (n.type <> 'accueil' or n.cible = 'hm')
         and (n.slack_erreur is null or coalesce(array_length(n.canaux, 1), 0) > 0)
    ) r on true
    left join lateral (
      select min(x.at) as at, (array_agg(x.raison order by x.at))[1] as raison
        from (select cp.decision_at as at, cp.regle as raison from public.ckd_propositions cp
               where cp.poster_id = p.id and cp.decision = 'ne_pas_renouveler'
              union all
              select a.created_at, coalesce(a.motif, a.source) from public.arrets a
               where a.poster_id = p.id and a.source in ('kill_samedi', 'kill_48h') and a.annule_at is null) x
       having min(x.at) is not null
    ) k on true
    left join lateral (
      select min(x.at) as at, (array_agg(x.raison order by x.at))[1] as raison
        from (select a.created_at as at, coalesce(a.motif, a.source) as raison from public.arrets a
               where a.poster_id = p.id and a.source not in ('kill_samedi', 'kill_48h') and a.annule_at is null
              union all
              select e.at, e.type from public.recrue_evenements e
               where e.poster_id = p.id and e.type in ('contrat_termine_freelance', 'contrat_termine')) x
       having min(x.at) is not null
    ) s on true;
end;
$$;
revoke all on function public.cohortes_postes(date) from public, anon;
grant execute on function public.cohortes_postes(date) to authenticated;

create or replace function public.cohortes_vues(p_lundi date default null)
returns table (cohorte_lundi date, niveau text, hm_id uuid, k integer, posts integer, mediane numeric)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_auj date := (now() at time zone 'Europe/Paris')::date;
begin
  if not public.is_admin() then
    raise exception 'cohortes_vues : réservé à l''admin et au Head of Ops' using errcode = '42501';
  end if;
  return query
  with v as (
    select pr.cohorte_lundi as c, pr.manager_id as hm,
           ((pa.date_publication_prevue - pr.cohorte_lundi) / 7 + 1)::int as k, pa.vues::numeric as vues
      from public.passages pa
      join public.comptes co on co.id = pa.compte_id
      join public.profiles pr on pr.id = co.poster_id
     where pr.cohorte_lundi is not null
       and (p_lundi is null or pr.cohorte_lundi = p_lundi)
       and pa.publie_url is not null and pa.vues is not null
       and pa.date_publication_prevue >= pr.cohorte_lundi and pa.date_publication_prevue <= v_auj
       and not exists (select 1 from public.hub_posteurs h where h.profile_id = pr.id)
       and not exists (select 1 from public.contrats_test t where t.contrat_id = pr.upwork_contract_id and t.retire_at is null)
  )
  select v.c,
         case grouping(v.hm, v.k) when 3 then 'cohorte' when 2 then 'semaine' when 1 then 'hm' else 'hm_semaine' end,
         v.hm, v.k, count(*)::int,
         round(percentile_cont(0.5) within group (order by v.vues)::numeric, 0)
    from v
   group by grouping sets ((v.c), (v.c, v.k), (v.c, v.hm), (v.c, v.hm, v.k));
end;
$$;
revoke all on function public.cohortes_vues(date) from public, anon;
grant execute on function public.cohortes_vues(date) to authenticated;

notify pgrst, 'reload schema';
