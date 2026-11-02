-- 0398 — Chantier du 28 oct., partie F point 1 : approuver la bonne milestone.
--
-- La consigne de la liste de paie (et plus tard le paiement par l'API)
-- approuve la PREMIÈRE milestone financée et pas encore payée du contrat,
-- quel que soit son nom. Une recrue reportée a une milestone « Week 45 » pour
-- une semaine postée en 46 : c'est normal, la consigne le note.
--
-- 1. Table `upwork_jalons` : pour chaque contrat relié, cette milestone-là
--    (nom, montant, état), relue chez Upwork par la fonction `upwork`
--    (action « jalons », lecture seule). Une ligne par contrat ; `jalon_id`
--    vide quand aucune milestone n'est financée et non payée.
-- 2. `paie_jalons(p_posters)` : la milestone de chaque posteur de la liste
--    (admin et Head of Ops).
--
-- Additive : aucune donnée existante modifiée.
-- Retour arrière : drop de la fonction et de la table.

create table if not exists public.upwork_jalons (
  contrat_id      text primary key,
  organisation_id text,
  jalon_id        text,
  nom             text,
  montant         numeric,
  etat            text,
  sequence        integer,
  -- Combien de milestones financées et non payées (plus d'une : à vérifier).
  nb_finances     integer not null default 0,
  erreur          text,
  lu_at           timestamptz not null default now()
);

comment on table public.upwork_jalons is
  'La 1re milestone financée et non payée de chaque contrat relié, relue chez Upwork (action « jalons »). Voir 0398.';

alter table public.upwork_jalons enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'upwork_jalons'
                  and policyname = 'upwork_jalons lecture admin') then
    create policy "upwork_jalons lecture admin" on public.upwork_jalons
      for select to authenticated using ((select public.is_admin()));
  end if;
end $$;
revoke all on public.upwork_jalons from public, anon, authenticated;
grant select on public.upwork_jalons to authenticated;
grant all on public.upwork_jalons to service_role;

create or replace function public.paie_jalons(p_posters uuid[])
returns table (
  poster_id   uuid,
  contrat_id  text,
  jalon_id    text,
  nom         text,
  montant     numeric,
  etat        text,
  nb_finances integer,
  erreur      text,
  lu_at       timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, j.contrat_id, j.jalon_id, j.nom, j.montant, j.etat, j.nb_finances, j.erreur, j.lu_at
    from public.profiles p
    join public.upwork_jalons j on j.contrat_id = p.upwork_contract_id
   where p.id = any (p_posters)
     and (coalesce(auth.role(), '') not in ('anon', 'authenticated') or public.is_admin());
$$;

revoke execute on function public.paie_jalons(uuid[]) from public, anon;
grant execute on function public.paie_jalons(uuid[]) to authenticated, service_role;

notify pgrst, 'reload schema';
