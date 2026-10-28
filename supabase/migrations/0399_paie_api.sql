-- 0399 — Prompt 14, point 3 : payer depuis la liste de paie, par l'API Upwork.
--
-- Les appels Upwork partent de la fonction `upwork` (actions « paie_apercu »
-- et « paie_payer »). Ici : les réglages, le verrou et le journal des
-- paiements, et ce que la liste de paie en lit.
--
-- 1. Réglages (éditables dans Payroll → Réglages, admin seulement) :
--    - paie_api = { mode: off | test | on, contrats_test: [ids], test_des,
--      tous_des } : off par défaut. « test » : seulement les contrats listés,
--      pas avant test_des (2 nov.). « on » : tout le monde, pas avant tous_des
--      (9 nov.).
--    - paie_plafond_ligne = 30 ($) ; paie_plafond_jour = 5000 ($).
-- 2. Table `paie_paiements_api` : une ligne par ligne de paie payée par
--    l'API. Le verrou : un index unique sur la ligne de paie tant que la
--    ligne n'est pas « libérée » à la main. Jamais de nouvel essai
--    automatique : une ligne en erreur reste « a_verifier ».
-- 3. `paie_api_reserver(...)` : pose le verrou et vérifie le plafond du jour,
--    dans la même transaction (service_role seulement).
-- 4. `paie_api_etat(p_lundi)` : l'état des paiements API de la semaine
--    (admin et Head of Ops).
-- 5. `paie_api_liberer(p_id, p_raison)` : après vérification à la main sur
--    Upwork, libère une ligne « a_verifier » (admin seulement).
--
-- Additive : aucune donnée existante modifiée.
-- Retour arrière : drop des fonctions, de la table, des 3 réglages et des
-- politiques reglages_paie_api_admin_*.

insert into public.reglages (cle, valeur) values
  ('paie_api', jsonb_build_object('mode', 'off', 'contrats_test', '[]'::jsonb,
                                  'test_des', '2026-11-02', 'tous_des', '2026-11-09')),
  ('paie_plafond_ligne', to_jsonb(30)),
  ('paie_plafond_jour', to_jsonb(5000))
on conflict (cle) do nothing;

create table if not exists public.paie_paiements_api (
  id               uuid primary key default gen_random_uuid(),
  paie_semaine_id  uuid not null references public.paie_semaines (id),
  poster_id        uuid not null references public.profiles (id),
  semaine          date not null,
  contrat_id       text not null,
  -- en_cours → paye | a_verifier | deja_payee ; libere : débloquée à la main.
  statut           text not null check (statut in ('en_cours', 'paye', 'a_verifier', 'deja_payee', 'libere')),
  -- Le montant réservé sur le plafond du jour (approbation + financement).
  montant_reserve  numeric not null default 0,
  jalon_approuve   text,
  montant_approuve numeric,
  jalon_finance    text,
  montant_finance  numeric,
  -- finance | en_attente (checkout Upwork) | non (rien à financer) | erreur
  financement      text,
  erreur           text,
  etapes           jsonb not null default '[]'::jsonb,
  par              uuid references auth.users (id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  libere_par       uuid references auth.users (id) on delete set null,
  libere_raison    text
);

-- Le verrou : jamais deux paiements pour la même ligne de paie.
create unique index if not exists paie_paiements_api_verrou
  on public.paie_paiements_api (paie_semaine_id) where statut <> 'libere';
create index if not exists paie_paiements_api_jour on public.paie_paiements_api (created_at);

comment on table public.paie_paiements_api is
  'Paiements par l''API Upwork depuis la liste de paie (prompt 14, point 3). Verrou par ligne, jamais de nouvel essai automatique. Voir 0399.';

alter table public.paie_paiements_api enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'paie_paiements_api'
                  and policyname = 'paie_paiements_api lecture admin') then
    create policy "paie_paiements_api lecture admin" on public.paie_paiements_api
      for select to authenticated using ((select public.is_admin()));
  end if;
end $$;
revoke all on public.paie_paiements_api from public, anon, authenticated;
grant select on public.paie_paiements_api to authenticated;
grant all on public.paie_paiements_api to service_role;

-- Pose le verrou d'une ligne et vérifie le plafond du jour (heure de Paris).
-- Lève une erreur lisible si la ligne est déjà traitée ou si le plafond
-- serait dépassé. Rend l'id du paiement.
create or replace function public.paie_api_reserver(
  p_paie_semaine_id uuid,
  p_poster uuid,
  p_semaine date,
  p_contrat text,
  p_montant numeric,
  p_par uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plafond numeric;
  v_jour    numeric;
  v_debut   timestamptz;
  v_id      uuid;
begin
  -- Un seul calcul du plafond à la fois.
  perform pg_advisory_xact_lock(hashtext('paie_api_plafond_jour'));
  select case when jsonb_typeof(valeur) = 'number' then (valeur #>> '{}')::numeric end
    into v_plafond from public.reglages where cle = 'paie_plafond_jour';
  v_plafond := coalesce(v_plafond, 5000);
  v_debut := (now() at time zone 'Europe/Paris')::date::timestamp at time zone 'Europe/Paris';
  select coalesce(sum(montant_reserve), 0) into v_jour
    from public.paie_paiements_api
   where created_at >= v_debut and statut in ('en_cours', 'paye', 'a_verifier');
  if v_jour + p_montant > v_plafond then
    raise exception 'plafond du jour : % $ déjà engagés, % $ de plus dépasseraient % $', v_jour, p_montant, v_plafond;
  end if;
  begin
    insert into public.paie_paiements_api (paie_semaine_id, poster_id, semaine, contrat_id, statut, montant_reserve, par)
    values (p_paie_semaine_id, p_poster, p_semaine, p_contrat, 'en_cours', p_montant, p_par)
    returning id into v_id;
  exception when unique_violation then
    raise exception 'ligne déjà traitée par l''API (jamais deux paiements pour la même ligne)';
  end;
  return v_id;
end;
$$;

create or replace function public.paie_api_etat(p_lundi date)
returns table (
  id               uuid,
  paie_semaine_id  uuid,
  poster_id        uuid,
  statut           text,
  jalon_approuve   text,
  montant_approuve numeric,
  jalon_finance    text,
  montant_finance  numeric,
  financement      text,
  erreur           text,
  par_nom          text,
  created_at       timestamptz,
  updated_at       timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.paie_semaine_id, p.poster_id, p.statut, p.jalon_approuve, p.montant_approuve,
         p.jalon_finance, p.montant_finance, p.financement, p.erreur,
         coalesce(nullif(btrim(concat_ws(' ', pr.prenom, pr.nom)), ''), pr.email),
         p.created_at, p.updated_at
    from public.paie_paiements_api p
    left join public.profiles pr on pr.id = p.par
   where p.semaine = p_lundi and p.statut <> 'libere'
     and (coalesce(auth.role(), '') not in ('anon', 'authenticated') or public.is_admin());
$$;

create or replace function public.paie_api_liberer(p_id uuid, p_raison text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin_strict() then
    raise exception 'paie_api_liberer : réservé à l''admin';
  end if;
  if nullif(btrim(coalesce(p_raison, '')), '') is null then
    raise exception 'paie_api_liberer : raison obligatoire (ce que tu as vérifié sur Upwork)';
  end if;
  update public.paie_paiements_api
     set statut = 'libere', libere_par = auth.uid(), libere_raison = btrim(p_raison), updated_at = now()
   where id = p_id and statut in ('a_verifier', 'en_cours');
  if not found then
    raise exception 'paie_api_liberer : seule une ligne « à vérifier » peut être libérée';
  end if;
end;
$$;

-- Les réglages du paiement par l'API : modifiables par l'admin seulement
-- (comme les réglages de paie, 0390), jamais par le Head of Ops.
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'reglages'
                  and policyname = 'reglages_paie_api_admin_ins') then
    create policy reglages_paie_api_admin_ins on public.reglages as restrictive for insert to authenticated
      with check (cle not in ('paie_api', 'paie_plafond_ligne', 'paie_plafond_jour', 'bonus_plafond_ligne')
                  or public.is_admin_strict());
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'reglages'
                  and policyname = 'reglages_paie_api_admin_upd') then
    create policy reglages_paie_api_admin_upd on public.reglages as restrictive for update to authenticated
      using (cle not in ('paie_api', 'paie_plafond_ligne', 'paie_plafond_jour', 'bonus_plafond_ligne')
             or public.is_admin_strict())
      with check (cle not in ('paie_api', 'paie_plafond_ligne', 'paie_plafond_jour', 'bonus_plafond_ligne')
                  or public.is_admin_strict());
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'reglages'
                  and policyname = 'reglages_paie_api_admin_del') then
    create policy reglages_paie_api_admin_del on public.reglages as restrictive for delete to authenticated
      using (cle not in ('paie_api', 'paie_plafond_ligne', 'paie_plafond_jour', 'bonus_plafond_ligne')
             or public.is_admin_strict());
  end if;
end
$$;

revoke execute on function public.paie_api_reserver(uuid, uuid, date, text, numeric, uuid) from public, anon, authenticated;
grant execute on function public.paie_api_reserver(uuid, uuid, date, text, numeric, uuid) to service_role;
revoke execute on function public.paie_api_etat(date) from public, anon;
grant execute on function public.paie_api_etat(date) to authenticated, service_role;
revoke execute on function public.paie_api_liberer(uuid, text) from public, anon;
grant execute on function public.paie_api_liberer(uuid, text) to authenticated;

notify pgrst, 'reload schema';
