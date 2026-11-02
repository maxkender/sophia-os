-- 0495 — Recrues passées en Postpone : aucune approbation de la semaine prévue, milestones décalées.
--
-- 1. paie_decalages : une ligne par recrue reportée (cohorte prévue → nouvelle
--    cohorte), son contrat, le plan des milestones (« Week 45 » → « Week 46 »,
--    échéance le dimanche de la nouvelle semaine ; 46→47, 47→48…) et le statut :
--    prevu (à renommer par l'API), renomme, a_decaler (rien fait sur Upwork : la
--    première semaine payée = sa première semaine de posts), erreur.
--    Start Tuesday : rien (la semaine reste la sienne).
-- 2. decalages_noter() : trouve les recrues reportées (Postpone manuel, auto du
--    dimanche ou du lundi) qui n'ont jamais posté, écrit leur plan depuis les
--    milestones lues (upwork_jalons). Ne touche pas à Upwork.
-- 3. Trigger paie_semaines_decalage : une ligne de paie d'une semaine reportée
--    (entre la semaine prévue et la nouvelle cohorte) est exclue d'office
--    (exclu, avec la raison) : la paie ne l'approuve jamais et ne la renomme pas.
-- 4. Crons : decalages_noter() lundi 00:35 et mardi 00:35 (Paris, après les
--    reports de dimanche et de lundi 23:59) et lundi 08:30 (avant la paie de 9:00).
--
-- Additive : 1 table, 2 fonctions, 1 trigger, 2 crons. Aucune ligne supprimée ;
-- seule l'exclusion des lignes de paie des semaines reportées est posée.

create table if not exists public.paie_decalages (
  poster_id uuid not null references public.profiles(id),
  semaine_prevue date not null,
  premiere_semaine date not null,
  contrat_id text,
  ecart_semaines integer not null,
  plan jsonb not null default '[]'::jsonb,
  statut text not null default 'prevu' check (statut in ('prevu', 'renomme', 'a_decaler', 'erreur')),
  detail text,
  cree_at timestamptz not null default now(),
  maj_at timestamptz not null default now(),
  primary key (poster_id, semaine_prevue)
);
alter table public.paie_decalages enable row level security;

create or replace function public.decalages_noter()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_ecart int;
  v_sem int;
  v_plan jsonb;
  v_n int := 0;
begin
  if coalesce(auth.role(), '') in ('anon', 'authenticated') and not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  for r in
    with reports as (
      select d.poster_id, d.lundi from public.debut_choix d where d.choix = 'reporter'
      union
      select e.poster_id, nullif(substring(e.cle from 'reporte:(\d{4}-\d{2}-\d{2})'), '')::date
        from public.recrue_evenements e where e.type = 'reporte'
      union
      select x.poster_id, x.periode from public.recrues_rouges x where x.decision = 'reporter'
    )
    select pr.id, pr.cohorte_lundi, pr.upwork_contract_id, min(rp.lundi) as prevue
      from public.profiles pr
      join reports rp on rp.poster_id = pr.id and rp.lundi is not null and rp.lundi < pr.cohorte_lundi
     where pr.is_active
       -- Jamais posté : la semaine prévue n'a pas eu lieu.
       and not exists (select 1 from public.passages p join public.comptes c on c.id = p.compte_id
                        where c.poster_id = pr.id
                          and (p.publie_url is not null or p.publie_at is not null or p.statut::text = 'publie'))
     group by pr.id, pr.cohorte_lundi, pr.upwork_contract_id
  loop
    v_ecart := (r.cohorte_lundi - r.prevue) / 7;
    if v_ecart <= 0 then
      continue;
    end if;
    v_sem := extract(week from r.prevue)::int;
    select coalesce(jsonb_agg(jsonb_build_object(
             'id', m ->> 'id', 'de', m ->> 'nom', 'etat', m ->> 'etat',
             'vers', regexp_replace(m ->> 'nom', '(week\s*)(\d{1,2})', '\1' || ((regexp_match(m ->> 'nom', 'week\s*(\d{1,2})', 'i'))[1]::int + v_ecart)::text, 'i'),
             'echeance', (r.prevue + (((regexp_match(m ->> 'nom', 'week\s*(\d{1,2})', 'i'))[1]::int + v_ecart - v_sem) * 7) + 6)::text)
             order by (regexp_match(m ->> 'nom', 'week\s*(\d{1,2})', 'i'))[1]::int desc), '[]'::jsonb)
      into v_plan
      from public.upwork_jalons j,
           jsonb_array_elements(case when jsonb_typeof(j.jalons) = 'array' then j.jalons else '[]'::jsonb end) m
     where j.contrat_id = r.upwork_contract_id
       and (regexp_match(m ->> 'nom', 'week\s*(\d{1,2})', 'i'))[1]::int >= v_sem
       and coalesce(m ->> 'etat', '') not in ('Paid', 'Approved', 'Released');
    insert into public.paie_decalages (poster_id, semaine_prevue, premiere_semaine, contrat_id, ecart_semaines, plan, statut, detail)
    values (r.id, r.prevue, r.cohorte_lundi, r.upwork_contract_id, v_ecart, v_plan,
            case when r.upwork_contract_id is null or jsonb_array_length(v_plan) = 0 then 'a_decaler' else 'prevu' end,
            case when r.upwork_contract_id is null then 'pas de contrat relié'
                 when jsonb_array_length(v_plan) = 0 then 'aucune milestone « Week NN » à renommer : première semaine payée = sa première semaine de posts' end)
    on conflict (poster_id, semaine_prevue) do update
      set premiere_semaine = excluded.premiere_semaine, ecart_semaines = excluded.ecart_semaines, contrat_id = excluded.contrat_id,
          plan = case when paie_decalages.statut = 'prevu' then excluded.plan else paie_decalages.plan end,
          statut = case when paie_decalages.statut = 'prevu' then excluded.statut else paie_decalages.statut end,
          detail = case when paie_decalages.statut = 'prevu' then excluded.detail else paie_decalages.detail end,
          maj_at = now();
    -- Les lignes de paie déjà écrites des semaines reportées : exclues (le trigger pose la raison).
    update public.paie_semaines ps set exclu = ps.exclu
     where ps.poster_id = r.id and ps.semaine >= r.prevue and ps.semaine < r.cohorte_lundi and ps.paye_at is null and not ps.exclu;
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$$;
revoke all on function public.decalages_noter() from public, anon;
grant execute on function public.decalages_noter() to authenticated, service_role;

create or replace function public.paie_semaines_decalage()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  d record;
begin
  if new.paye_at is not null or new.exclu then
    return new;
  end if;
  select pd.* into d from public.paie_decalages pd
   where pd.poster_id = new.poster_id and new.semaine >= pd.semaine_prevue and new.semaine < pd.premiere_semaine
   limit 1;
  if found then
    new.exclu := true;
    new.exclu_raison := 'Postpone : cohorte déplacée au ' || to_char(d.premiere_semaine, 'DD/MM')
                        || ', aucune approbation pour la semaine ' || extract(week from new.semaine)::int;
  end if;
  return new;
exception when others then
  return new;
end;
$$;

do $t$
begin
  if not exists (select 1 from pg_trigger where tgname = 'paie_semaines_decalage' and tgrelid = 'public.paie_semaines'::regclass) then
    create trigger paie_semaines_decalage
      before insert or update on public.paie_semaines
      for each row execute function public.paie_semaines_decalage();
  end if;
end;
$t$;

-- Paris = UTC+1 en novembre : lundi et mardi 00:35 (Paris) = 23:35 UTC dimanche et lundi ; lundi 08:30 = 07:30 UTC.
do $cron$
begin
  if exists (select 1 from cron.job where jobname = 'decalages-noter-nuit') then
    perform cron.unschedule('decalages-noter-nuit');
  end if;
  if exists (select 1 from cron.job where jobname = 'decalages-noter-avant-paie') then
    perform cron.unschedule('decalages-noter-avant-paie');
  end if;
  perform cron.schedule('decalages-noter-nuit', '35 23 * * 0,1', 'select public.decalages_noter()');
  perform cron.schedule('decalages-noter-avant-paie', '30 7 * * 1', 'select public.decalages_noter()');
end
$cron$;

notify pgrst, 'reload schema';
