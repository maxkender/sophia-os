-- 0832 : un problème Ruul qu'on n'arrive pas à régler (21/11, Max) : le posteur est renvoyé au support Ruul, avec une
-- échéance de 7 jours. Chaque jour, ruul_support_echeances() : réglé (Ruul READY) → noté réglé ; échéance passée et
-- toujours pas réglé → arrêt de la collaboration (arrets, motif clair ; le message de fin part par textes_fin).
create table if not exists public.ruul_support_renvois (
  poster_id uuid primary key references public.profiles(id),
  cle text,
  echeance date not null,
  demande_id uuid,
  renvoye_at timestamptz not null default now(),
  resolu_at timestamptz,
  arret_at timestamptz
);
alter table public.ruul_support_renvois enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'ruul_support_renvois' and policyname = 'ruul_support_renvois_admin') then
    create policy ruul_support_renvois_admin on public.ruul_support_renvois for select to authenticated using (public.is_admin());
  end if;
end $$;

create or replace function public.ruul_support_echeances()
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_regles int; v_arrets int := 0; r record;
begin
  update public.ruul_support_renvois s set resolu_at = now()
    from public.profiles p
   where p.id = s.poster_id and s.resolu_at is null and s.arret_at is null
     and (coalesce(p.ruul_onboarding, '') = 'READY' or coalesce(p.canal_paie, 'ruul') <> 'ruul' or not p.is_active);
  get diagnostics v_regles = row_count;
  for r in
    select s.poster_id from public.ruul_support_renvois s join public.profiles p on p.id = s.poster_id
     where s.resolu_at is null and s.arret_at is null and s.echeance < (now() at time zone 'Europe/Paris')::date and p.is_active
  loop
    if not exists (select 1 from public.arrets a where a.poster_id = r.poster_id and a.annule_at is null and a.statut in ('a_faire', 'fait')) then
      insert into public.arrets (poster_id, source, motif)
      values (r.poster_id, 'manuel', 'Problème Ruul non réglé avec le support Ruul à l''échéance');
      v_arrets := v_arrets + 1;
    end if;
    update public.ruul_support_renvois set arret_at = now() where poster_id = r.poster_id;
  end loop;
  return jsonb_build_object('regles', v_regles, 'arrets', v_arrets);
end;
$$;
revoke execute on function public.ruul_support_echeances() from public, anon, authenticated;
grant execute on function public.ruul_support_echeances() to service_role;

do $$ begin
  if not exists (select 1 from cron.job where jobname = 'ruul-support-echeances') then
    perform cron.schedule('ruul-support-echeances', '23 9 * * *', 'select public.ruul_support_echeances()');
  end if;
end $$;
