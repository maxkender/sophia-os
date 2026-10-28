-- 0397 — Chantier du 28 oct., partie F point 3 : « Contracts to end ».
--
-- Dans Payroll, un bloc liste les contrats Upwork à terminer pour la semaine
-- payée : chaque Kill du dimanche (ckd_arrets « ne_pas_renouveler », 0328) et
-- chaque Stop de la page Cohorts (recrues_rouges « arreter », 0392), sur la
-- même fenêtre que la liste de paie (du lundi de la semaine au lundi suivant
-- 10 h, heure de Paris). Avec le lien du contrat (collé, sinon le workroom de
-- son id) et un bouton « Ended » qui garde qui et quand.
--
-- 1. Table `contrats_fins` : une ligne par posteur et par semaine marquée
--    « Ended » (qui, quand). Décocher la supprime.
-- 2. `contrats_a_terminer(p_lundi)` : la liste (admin et Head of Ops).
-- 3. `contrat_marquer_termine(p_poster, p_lundi, p_termine)`.
--
-- Additive : aucune donnée existante modifiée.
-- Retour arrière : drop des 2 fonctions et de la table contrats_fins.

create table if not exists public.contrats_fins (
  poster_id   uuid not null references public.profiles (id) on delete cascade,
  -- Le lundi de la semaine payée (celui de la liste de paie).
  semaine     date not null,
  termine_at  timestamptz not null default now(),
  termine_par uuid references auth.users (id) on delete set null,
  primary key (poster_id, semaine)
);

comment on table public.contrats_fins is
  'Contrats Upwork marqués « Ended » dans Payroll (Contracts to end), par semaine payée. Voir 0397.';

alter table public.contrats_fins enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'contrats_fins'
                  and policyname = 'contrats_fins lecture admin') then
    create policy "contrats_fins lecture admin" on public.contrats_fins
      for select to authenticated using ((select public.is_admin()));
  end if;
end $$;
revoke all on public.contrats_fins from public, anon, authenticated;
grant select on public.contrats_fins to authenticated;
grant all on public.contrats_fins to service_role;

create or replace function public.contrats_a_terminer(p_lundi date)
returns table (
  poster_id     uuid,
  poster_nom    text,
  hm_prenom     text,
  contrat_url   text,
  contrat_id    text,
  -- 'kill' (Kill du dimanche) ou 'stop' (page Cohorts).
  source        text,
  decide_at     timestamptz,
  -- Les comptes tués (Kill), vide pour un Stop.
  handles       text[],
  -- Comptes perso encore actifs, hors comptes tués.
  autres_actifs integer,
  termine_at    timestamptz,
  termine_par   text
)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_debut   timestamptz;
  v_coupure timestamptz;
begin
  if coalesce(auth.role(), '') in ('anon', 'authenticated') and not public.is_admin() then
    raise exception 'contrats_a_terminer : réservé à l''admin et au Head of Ops';
  end if;
  if extract(isodow from p_lundi) <> 1 then
    raise exception 'contrats_a_terminer : % n''est pas un lundi', p_lundi;
  end if;
  v_debut := p_lundi::timestamp at time zone 'Europe/Paris';
  v_coupure := ((p_lundi + 7)::timestamp + interval '10 hours') at time zone 'Europe/Paris';

  return query
  with kills as (
    select c.poster_id,
           max(coalesce(ar.fait_at, ar.prevu_at)) as decide_at,
           array_agg(c.handle_tiktok order by c.handle_tiktok) filter (where c.handle_tiktok is not null) as handles,
           array_agg(c.id) as comptes
      from public.ckd_arrets ar
      join public.comptes c on c.id = ar.compte_id
     where ar.raison = 'ne_pas_renouveler'
       and ar.annule_at is null
       and coalesce(ar.fait_at, ar.prevu_at) >= v_debut
       and coalesce(ar.fait_at, ar.prevu_at) < v_coupure
     group by c.poster_id
  ),
  stops as (
    select x.poster_id, max(x.decision_at) as decide_at
      from public.recrues_rouges x
     where x.decision = 'arreter'
       and x.decision_at >= v_debut
       and x.decision_at < v_coupure
     group by x.poster_id
  ),
  tous as (
    -- Un posteur arrêté depuis Cohorts ET tué le dimanche n'apparaît qu'une fois (Stop).
    select s.poster_id, 'stop'::text as source, s.decide_at, '{}'::text[] as handles, '{}'::uuid[] as comptes
      from stops s
    union all
    select k.poster_id, 'kill', k.decide_at, coalesce(k.handles, '{}'), k.comptes
      from kills k
     where k.poster_id not in (select s.poster_id from stops s)
  )
  select t.poster_id,
         coalesce(nullif(btrim(concat_ws(' ', pr.prenom, pr.nom)), ''), pr.email),
         hm.prenom,
         -- Le lien collé, sinon celui du workroom, depuis l'id relié (0394).
         coalesce(nullif(btrim(coalesce(pr.upwork_contrat_url, '')), ''),
                  'https://www.upwork.com/nx/wm/workroom/' || nullif(btrim(pr.upwork_contract_id), '') || '/overview'),
         pr.upwork_contract_id,
         t.source,
         t.decide_at,
         t.handles,
         (select count(*) from public.comptes c
           where c.poster_id = t.poster_id and c.type_compte = 'perso' and c.is_active
             and c.id <> all (t.comptes))::int,
         f.termine_at,
         coalesce(nullif(btrim(concat_ws(' ', qui.prenom, qui.nom)), ''), qui.email)
    from tous t
    join public.profiles pr on pr.id = t.poster_id
    left join public.profiles hm on hm.id = pr.manager_id
    left join public.contrats_fins f on f.poster_id = t.poster_id and f.semaine = p_lundi
    left join public.profiles qui on qui.id = f.termine_par
   order by f.termine_at is not null, t.decide_at;
end;
$$;

create or replace function public.contrat_marquer_termine(p_poster uuid, p_lundi date, p_termine boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'contrat_marquer_termine : réservé à l''admin et au Head of Ops';
  end if;
  if extract(isodow from p_lundi) <> 1 then
    raise exception 'contrat_marquer_termine : % n''est pas un lundi', p_lundi;
  end if;
  if p_termine then
    insert into public.contrats_fins (poster_id, semaine, termine_par)
    values (p_poster, p_lundi, auth.uid())
    on conflict (poster_id, semaine) do nothing;
  else
    delete from public.contrats_fins where poster_id = p_poster and semaine = p_lundi;
  end if;
end;
$$;

revoke execute on function public.contrats_a_terminer(date) from public, anon;
revoke execute on function public.contrat_marquer_termine(uuid, date, boolean) from public, anon;
grant execute on function public.contrats_a_terminer(date) to authenticated, service_role;
grant execute on function public.contrat_marquer_termine(uuid, date, boolean) to authenticated;

notify pgrst, 'reload schema';
