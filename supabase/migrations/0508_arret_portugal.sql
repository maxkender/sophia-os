-- 0508 — Arrêt Portugal (02/11) : de quoi retirer des posteurs de la paie, de
-- « Who to fund » et un pays des zones, sans supprimer une seule ligne.
--
-- 1. paie_hors (poster, depuis, raison) : paie_generer ne crée plus de ligne
--    pour ce posteur à partir de la semaine `depuis` (ni Kill & pay, ni rien).
-- 2. paie_a_financer.retire_at / retire_raison : la ligne sort de « Who to fund ».
-- 3. zones_paie_pays.retire_at / retire_raison : le pays n'est plus éligible
--    (plus de tarif de zone, « pays à vérifier » à l'onboarding, hors de la page
--    Payroll Zones). La ligne reste, pour l'historique.
--
-- Additif : une table, quatre colonnes, quatre fonctions modifiées par
-- remplacement d'un morceau (la migration échoue s'il n'est pas trouvé).

create table if not exists public.paie_hors (
  poster_id  uuid primary key references public.profiles(id) on delete cascade,
  depuis     date not null,
  raison     text not null,
  cree_at    timestamptz not null default now(),
  cree_par   uuid,
  annule_at  timestamptz
);
alter table public.paie_hors enable row level security;
do $p$
begin
  if not exists (select 1 from pg_policies where tablename = 'paie_hors' and policyname = 'paie_hors_admin') then
    create policy paie_hors_admin on public.paie_hors for select to authenticated using (public.is_admin());
  end if;
end
$p$;

alter table public.paie_a_financer add column if not exists retire_at timestamptz;
alter table public.paie_a_financer add column if not exists retire_raison text;
alter table public.zones_paie_pays add column if not exists retire_at timestamptz;
alter table public.zones_paie_pays add column if not exists retire_raison text;

do $m$
declare
  v_def text;
  a text;
  b text;
begin
  -- 1. paie_generer : rien pour les posteurs hors paie.
  v_def := pg_get_functiondef('public.paie_generer(date)'::regprocedure);
  a := E'    from public.paie_calculer_v3(p_lundi) c\n  on conflict';
  b := E'    from public.paie_calculer_v3(p_lundi) c\n'
    || E'   where not exists (select 1 from public.paie_hors h\n'
    || E'                      where h.poster_id = c.poster_id and h.annule_at is null and p_lundi >= h.depuis)\n'
    || E'  on conflict';
  if position(a in v_def) = 0 then raise exception '0508 : paie_generer, morceau introuvable'; end if;
  execute replace(v_def, a, b);

  -- 2. « Who to fund » : sans les lignes retirées.
  v_def := pg_get_functiondef('public.paie_a_financer_liste()'::regprocedure);
  a := E'   where f.finance_at is null\n';
  b := E'   where f.finance_at is null\n     and f.retire_at is null\n';
  if position(a in v_def) = 0 then raise exception '0508 : paie_a_financer_liste, morceau introuvable'; end if;
  execute replace(v_def, a, b);

  -- 3. Zones : un pays retiré n'a plus de tarif de zone ni de zone à l'onboarding.
  v_def := pg_get_functiondef('public.paie_tarif_zone'::regproc);
  a := 'where zp.pays = public.paie_pays_posteur(p_poster);';
  b := 'where zp.pays = public.paie_pays_posteur(p_poster) and zp.retire_at is null;';
  if position(a in v_def) = 0 then raise exception '0508 : paie_tarif_zone, morceau introuvable'; end if;
  execute replace(v_def, a, b);

  v_def := pg_get_functiondef('public.onboarding_pays'::regproc);
  a := 'left join zones_paie_pays zpp on zpp.pays = r.pays_hm';
  b := 'left join zones_paie_pays zpp on zpp.pays = r.pays_hm and zpp.retire_at is null';
  if position(a in v_def) = 0 then raise exception '0508 : onboarding_pays, morceau introuvable'; end if;
  execute replace(v_def, a, b);
end;
$m$;

notify pgrst, 'reload schema';
