-- 0800 : le bot Ruul et le passage sur Upwork (Max, 21/11). Additif.
-- 1. support_ruul_tentatives : combien de fois le bot a répondu au même problème Ruul (upwork_demande, code, nom…),
--    pour la 2e demande Upwork (exception sans discuter) et l'escalade au 3e message sur le même problème.
-- 2. Le passage sur Upwork : quand la HM marque l'offre acceptée (upwork_a_ajouter → contrat_signe), la plateforme du
--    posteur passe à UPWORK. Ses semaines dues pas encore payées par Ruul (reportées, ou à payer sans paiement créé chez
--    Ruul) sont annulées côté Ruul et deviennent des bonus Upwork « à valider » (payés une seule fois, au clic de Max).
--    Tout est noté dans plateforme_bascules.

-- 1.
create table if not exists public.support_ruul_tentatives (
  poster_id uuid not null references public.profiles(id) on delete cascade,
  cle text not null,
  n integer not null default 0,
  premier_at timestamptz not null default now(),
  dernier_at timestamptz not null default now(),
  primary key (poster_id, cle)
);
alter table public.support_ruul_tentatives enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'support_ruul_tentatives' and policyname = 'support_ruul_tentatives_admin') then
    create policy support_ruul_tentatives_admin on public.support_ruul_tentatives for select to authenticated using (public.is_admin());
  end if;
end $$;

create or replace function public.support_ruul_tentative_noter(p_poster uuid, p_cle text)
returns integer language sql security definer set search_path = public as $$
  insert into public.support_ruul_tentatives (poster_id, cle, n) values (p_poster, p_cle, 1)
  on conflict (poster_id, cle) do update set n = public.support_ruul_tentatives.n + 1, dernier_at = now()
  returning n;
$$;
revoke execute on function public.support_ruul_tentative_noter(uuid, text) from public, anon, authenticated;
grant execute on function public.support_ruul_tentative_noter(uuid, text) to service_role;

-- 2.
create table if not exists public.plateforme_bascules (
  id uuid primary key default gen_random_uuid(),
  poster_id uuid not null references public.profiles(id) on delete cascade,
  de text not null,
  vers text not null,
  raison text,
  semaines jsonb not null default '[]'::jsonb,
  cree_at timestamptz not null default now()
);
alter table public.plateforme_bascules enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'plateforme_bascules' and policyname = 'plateforme_bascules_admin') then
    create policy plateforme_bascules_admin on public.plateforme_bascules for select to authenticated using (public.is_admin());
  end if;
end $$;

create or replace function public.plateforme_vers_upwork(p_poster uuid, p_raison text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_canal text;
  r record;
  v_semaines jsonb := '[]'::jsonb;
  v_lundi date := (date_trunc('week', (now() at time zone 'Europe/Paris')) + interval '7 days')::date;
begin
  select canal_paie into v_canal from public.profiles where id = p_poster for update;
  if v_canal is distinct from 'ruul' then return jsonb_build_object('ok', false, 'raison', 'pas un posteur Ruul'); end if;
  -- Ses semaines dues pas encore payées par Ruul : une seule fois, sur Upwork.
  for r in
    select x.id, x.semaine, coalesce(x.montant, 0) + coalesce(x.bonus, 0) as total
      from public.ruul_paiements x
     where x.poster_id = p_poster
       and (x.statut = 'reporte' or (x.statut = 'a_payer' and x.ruul_transaction_id is null))
       and coalesce(x.montant, 0) + coalesce(x.bonus, 0) > 0
  loop
    insert into public.bonus (poster_id, type, lundi_bonus, periode_debut, periode_fin, detail, quantite, montant, statut, canal_paie, raison)
    values (p_poster, 'manuel', v_lundi, r.semaine, r.semaine + 6,
            format('Semaine du %s (passage de Ruul à Upwork)', to_char(r.semaine, 'DD/MM')), 1, r.total, 'a_valider', 'upwork',
            'passage Ruul → Upwork : semaine due, jamais payée par Ruul');
    update public.ruul_paiements set statut = 'annule', raison_report = 'passé sur Upwork : payée en bonus Upwork', maj_at = now() where id = r.id;
    v_semaines := v_semaines || jsonb_build_object('semaine', r.semaine, 'montant', r.total);
  end loop;
  update public.profiles set canal_paie = 'upwork' where id = p_poster;
  insert into public.plateforme_bascules (poster_id, de, vers, raison, semaines) values (p_poster, 'ruul', 'upwork', p_raison, v_semaines);
  return jsonb_build_object('ok', true, 'semaines', v_semaines);
end;
$$;
revoke execute on function public.plateforme_vers_upwork(uuid, text) from public, anon, authenticated;
grant execute on function public.plateforme_vers_upwork(uuid, text) to service_role;

create or replace function public.upwork_a_ajouter_signe_tg()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.statut = 'contrat_signe' and old.statut is distinct from 'contrat_signe' and new.poster_id is not null then
    perform public.plateforme_vers_upwork(new.poster_id, 'offre Upwork acceptée (' || coalesce(new.source, '?') || ')');
  end if;
  return null;
end;
$$;
do $$ begin
  if not exists (select 1 from pg_trigger where tgname = 'upwork_a_ajouter_signe' and tgrelid = 'public.upwork_a_ajouter'::regclass) then
    create trigger upwork_a_ajouter_signe after update of statut on public.upwork_a_ajouter
      for each row execute function public.upwork_a_ajouter_signe_tg();
  end if;
end $$;
