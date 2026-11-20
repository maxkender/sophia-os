-- 0799 : le bloc « Get paid » du dashboard des posteurs RUUL (Max, 21/11). Additif.
-- 1. profiles.ruul_ready_at : le moment où Ruul l'a dit prêt (READY), pour montrer « ✅ You're all set » 3 jours.
-- 2. ruul_mon_setup() : pour le posteur connecté, ses 3 étapes (synchro horaire de l'API Ruul), son email de candidature,
--    le lien d'onboarding automatique (si actif) et sa date « prêt ». Un posteur Upwork : { ruul: false } (jamais de bloc).

-- 1.
alter table public.profiles add column if not exists ruul_ready_at timestamptz;

create or replace function public.ruul_ready_at_tg()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.ruul_onboarding = 'READY' and old.ruul_onboarding is distinct from 'READY' then
    new.ruul_ready_at := now();
  elsif new.ruul_onboarding is distinct from 'READY' and old.ruul_onboarding = 'READY' then
    new.ruul_ready_at := null;
  end if;
  return new;
end;
$$;
do $$ begin
  if not exists (select 1 from pg_trigger where tgname = 'ruul_ready_at' and tgrelid = 'public.profiles'::regclass) then
    create trigger ruul_ready_at before update of ruul_onboarding on public.profiles
      for each row execute function public.ruul_ready_at_tg();
  end if;
end $$;

-- 2.
create or replace function public.ruul_mon_setup()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'ruul', coalesce(pr.canal_paie = 'ruul', false),
    'etapes', case when pr.canal_paie = 'ruul' then public.ruul_etapes(pr.id) end,
    'email', case when pr.canal_paie = 'ruul' then coalesce(nullif(btrim(h.email_perso), ''), nullif(btrim(pr.ruul_email), ''), nullif(btrim(pr.email_perso), '')) end,
    'ready_at', pr.ruul_ready_at,
    'lien_auto', coalesce((select (valeur->>'connect_actif')::boolean from public.reglages where cle = 'ruul_api'), false))
    from public.profiles pr
    left join public.hub_posteurs h on h.profile_id = pr.id
   where pr.id = auth.uid();
$$;
revoke execute on function public.ruul_mon_setup() from public, anon;
grant execute on function public.ruul_mon_setup() to authenticated;
