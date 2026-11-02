-- 0467 — Paie : « To fund by hand ».
--
-- Test du 30/10 (contrats 44801168 et 44801175) : activateMilestone répond 200,
-- sans erreur, avec state = NotFunded ; Upwork montre « Needs funds ». La doc du
-- schéma : « if the client is an enterprise, the milestone will be activated
-- immediately. If not, the unified checkout will be created, and the activation
-- will be done asynchronously provided that the checkout is fulfilled ». Le compte
-- VIk Studios n'est pas enterprise : le financement attend une confirmation sur Upwork.
--
-- - paie_a_financer : chaque milestone que la paie n'a pas pu financer (semaine
--   payée, la suivante à financer à la main), une fois par milestone.
-- - paie_a_financer_liste() : la liste ouverte (Payroll).
-- - needs_you : une carte « a_financer_main » par milestone ouverte.
-- - cron a-financer-relire (toutes les heures, :50) : la fonction upwork relit ces
--   milestones (lecture seule) ; financée → sortie de la liste.
-- - Les deux milestones du test (Week 45 sur A et B) y sont ajoutées.
--
-- Additive : 1 table, 1 fonction, needs_you modifiée, 1 cron (commande reprise du
-- cron « arrets », seule l'action change). Aucune donnée existante modifiée.

create table if not exists public.paie_a_financer (
  id uuid primary key default gen_random_uuid(),
  paie_semaine_id text,
  poster_id uuid references public.profiles(id) on delete set null,
  contrat_id text not null,
  jalon_id text not null,
  nom text,
  montant numeric,
  semaine date,
  raison text,
  etat_lu text,
  cree_at timestamptz not null default now(),
  relu_at timestamptz,
  finance_at timestamptz,
  unique (contrat_id, jalon_id)
);
alter table public.paie_a_financer enable row level security;
create policy "paie_a_financer lecture" on public.paie_a_financer for select using ((select public.is_admin()));

create or replace function public.paie_a_financer_liste()
returns table (id uuid, poster_id uuid, poster_nom text, contrat_id text, jalon_id text, nom text, montant numeric,
               semaine date, raison text, etat_lu text, relu_at timestamptz, cree_at timestamptz, lien text)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return query
  select f.id, f.poster_id, nullif(btrim(concat_ws(' ', p.prenom, p.nom)), ''), f.contrat_id, f.jalon_id, f.nom, f.montant,
         f.semaine, f.raison, f.etat_lu, f.relu_at, f.cree_at,
         'https://www.upwork.com/nx/wm/workroom/' || f.contrat_id || '/overview'
    from public.paie_a_financer f
    left join public.profiles p on p.id = f.poster_id
   where f.finance_at is null
   order by f.cree_at, 3;
end;
$$;
revoke all on function public.paie_a_financer_liste() from public, anon;
grant execute on function public.paie_a_financer_liste() to authenticated;

do $p$
declare
  v_def text := pg_get_functiondef('public.needs_you()'::regprocedure);
  v_ancre text := $a$    union all
    select 'samedi:' || cp.id$a$;
  v_ajout text := $a$    union all
    select 'a_financer:' || f.id, 'a_la_main', 'a_financer_main', f.poster_id, null,
           format('%s · %s $ to fund on Upwork (contract %s)', coalesce(f.nom, 'milestone'), coalesce(f.montant::text, '?'), f.contrat_id),
           'The week is paid; Upwork needs you to confirm funding this milestone (non-enterprise account). Fund it on Upwork: the OS re-reads it every hour.',
           null, 'paie', f.cree_at, array['ouvrir', 'ignorer'], f.id::text,
           'https://www.upwork.com/nx/wm/workroom/' || f.contrat_id || '/overview', null, 1
      from public.paie_a_financer f
     where f.finance_at is null
$a$;
begin
  if position(v_ancre in v_def) = 0 then
    raise exception '0467 : needs_you : l''ancre samedi est introuvable';
  end if;
  if (length(v_def) - length(replace(v_def, v_ancre, ''))) / length(v_ancre) <> 1 then
    raise exception '0467 : needs_you : l''ancre samedi apparaît plusieurs fois';
  end if;
  execute replace(v_def, v_ancre, v_ajout || v_ancre);
end;
$p$;

-- Les deux milestones du test du 30/10 (Week 45 sur A et B), restées « Needs funds ».
insert into public.paie_a_financer (poster_id, contrat_id, jalon_id, nom, montant, raison, etat_lu)
select t.poster_id, x.contrat, x.jalon, 'Week 45', 5, 'test 30/10 : activateMilestone → NotFunded', 'NotFunded'
  from (values ('44801168', '52781767'), ('44801175', '52782119')) x(contrat, jalon)
  left join public.contrats_test t on t.contrat_id = x.contrat and t.retire_at is null
on conflict (contrat_id, jalon_id) do nothing;

do $c$
declare
  v text;
begin
  select regexp_replace(j.command, '"action"\s*:\s*"arrets"', '"action":"a_financer_relire"') into v
    from cron.job j where j.jobname = 'arrets';
  if v is null or v !~ '"action":"a_financer_relire"' then
    raise exception '0467 : commande du cron arrets introuvable';
  end if;
  if not exists (select 1 from cron.job where jobname = 'a-financer-relire') then
    perform cron.schedule('a-financer-relire', '50 * * * *', v);
  end if;
end;
$c$;

notify pgrst, 'reload schema';
