-- 0412 — Prompt 22, partie 2 : le grand interrupteur
-- « Deactivate automatic actions with API ».
--
-- 1. `automation_pause` (oui / non), admin seulement ; qui et quand : la ligne
--    de reglages (updated_by, updated_at) et reglages_journal (0411).
--    `automation_en_pause()` : le contrôle unique côté base ;
--    `automation_pause_etat()` : pour la bande rouge des pages admin.
-- 2. `actions_bloquees` : chaque action bloquée par la pause (motif « paused »),
--    une fois par jour, action et posteur ; lue par Logs & to do.
-- 3. Le Kill du samedi (`ckd_arreter_comptes`) ne part pas pendant la pause :
--    les comptes restent « à arrêter » (rien n'est perdu).
-- 4. Admin seulement, vérifié en base (politiques RESTRICTIVE, comme 0390 et
--    0411) : le grand interrupteur, les 7 interrupteurs, la date de reprise des
--    relances et tous les textes (clés « …texte… »). Le Head of Ops les lit.
--
-- Additive : un réglage (non), une table, des fonctions, des politiques.
-- Retour arrière : supprimer les politiques reglages_auto_admin_*, la table
-- actions_bloquees, les fonctions automation_* et noter_action_bloquee ;
-- réappliquer ckd_arreter_comptes de 0405.

insert into public.reglages (cle, valeur) values ('automation_pause', 'false'::jsonb)
on conflict (cle) do nothing;

create or replace function public.automation_en_pause()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select r.valeur = 'true'::jsonb from public.reglages r where r.cle = 'automation_pause'), false);
$$;

grant execute on function public.automation_en_pause() to authenticated, service_role;

-- La bande rouge : depuis quand, par qui.
create or replace function public.automation_pause_etat()
returns table (actif boolean, depuis timestamptz, par_nom text)
language sql
stable
security definer
set search_path = public
as $$
  select r.valeur = 'true'::jsonb, r.updated_at,
         coalesce(nullif(btrim(concat_ws(' ', pr.prenom, pr.nom)), ''), u.email)
    from public.reglages r
    left join public.profiles pr on pr.id = r.updated_by
    left join auth.users u on u.id = r.updated_by
   where r.cle = 'automation_pause';
$$;

revoke execute on function public.automation_pause_etat() from public, anon;
grant execute on function public.automation_pause_etat() to authenticated;

-- ---------------------------------------------------------------------------
-- Les actions bloquées
-- ---------------------------------------------------------------------------
create table if not exists public.actions_bloquees (
  id         bigserial primary key,
  at         timestamptz not null default now(),
  fonction   text not null,
  action     text not null,
  poster_id  uuid references public.profiles (id) on delete set null,
  cible      text,
  motif      text not null default 'paused',
  detail     jsonb,
  -- Une ligne par jour, action, posteur et cible : un passage horaire ne la répète pas.
  cle        text not null unique
);

create index if not exists actions_bloquees_at on public.actions_bloquees (at desc);

comment on table public.actions_bloquees is
  'Prompt 22 (0412) : les actions vers l''extérieur bloquées par le grand interrupteur (motif paused).';

alter table public.actions_bloquees enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'actions_bloquees'
                  and policyname = 'actions_bloquees lecture') then
    create policy "actions_bloquees lecture" on public.actions_bloquees
      for select to authenticated using ((select public.is_admin()));
  end if;
end $$;
revoke all on public.actions_bloquees from public, anon, authenticated;
grant select on public.actions_bloquees to authenticated;
grant all on public.actions_bloquees to service_role;
grant usage, select on sequence public.actions_bloquees_id_seq to service_role;

create or replace function public.noter_action_bloquee(
  p_fonction text, p_action text, p_poster uuid default null, p_cible text default null, p_detail jsonb default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.actions_bloquees (fonction, action, poster_id, cible, detail, cle)
  values (p_fonction, p_action, p_poster, p_cible, p_detail,
          concat_ws('|', (now() at time zone 'Europe/Paris')::date, p_fonction, p_action, p_poster, p_cible))
  on conflict (cle) do nothing;
exception when others then
  raise warning 'noter_action_bloquee : %', sqlerrm;
end;
$$;

revoke execute on function public.noter_action_bloquee(text, text, uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.noter_action_bloquee(text, text, uuid, text, jsonb) to service_role;

-- ---------------------------------------------------------------------------
-- Le Kill du samedi : pas pendant la pause (corps de 0405, plus le contrôle)
-- ---------------------------------------------------------------------------
create or replace function public.ckd_arreter_comptes()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_n integer := 0;
begin
  if public.automation_en_pause() then
    for r in
      select a.compte_id, c.poster_id from public.ckd_arrets a join public.comptes c on c.id = a.compte_id
       where a.fait_at is null and a.annule_at is null and a.prevu_at <= now()
    loop
      perform public.noter_action_bloquee('ckd', 'kill_samedi', r.poster_id, r.compte_id::text, null);
    end loop;
    return 0;
  end if;
  for r in
    select a.compte_id, c.poster_id, a.raison
      from public.ckd_arrets a
      join public.comptes c on c.id = a.compte_id
     where a.fait_at is null and a.annule_at is null and a.prevu_at <= now()
     for update of a skip locked
  loop
    update public.comptes set is_active = false where id = r.compte_id;
    update public.ckd_arrets set fait_at = now() where compte_id = r.compte_id;
    if not exists (select 1 from public.comptes c where c.poster_id = r.poster_id and c.is_active) then
      update public.profiles set is_active = false where id = r.poster_id and is_active;
      if r.raison = 'ne_pas_renouveler'
         and not exists (select 1 from public.arrets x where x.poster_id = r.poster_id and x.statut in ('a_faire', 'en_cours')) then
        insert into public.arrets (poster_id, source) values (r.poster_id, 'kill_samedi');
      end if;
    end if;
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$$;

-- ---------------------------------------------------------------------------
-- Admin seulement : interrupteurs, grand interrupteur, textes
-- ---------------------------------------------------------------------------
create or replace function public.reglage_admin_seulement(p_cle text)
returns boolean
language sql
immutable
as $$
  select p_cle = any (array['automation_pause', 'accueil_auto', 'relances_auto', 'lundi_message_auto', 'lundi_soir_auto',
                            'kill_auto', 'arret_auto', 'reponses_auto', 'rappels_reprise_le', 'faq_automatique',
                            'kill_message_auto', 'paie_api'])
      or p_cle like '%texte%';
$$;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'reglages'
                  and policyname = 'reglages_auto_admin_upd') then
    create policy reglages_auto_admin_upd on public.reglages as restrictive for update to authenticated
      using (not public.reglage_admin_seulement(cle) or public.is_admin_strict())
      with check (not public.reglage_admin_seulement(cle) or public.is_admin_strict());
    create policy reglages_auto_admin_ins on public.reglages as restrictive for insert to authenticated
      with check (not public.reglage_admin_seulement(cle) or public.is_admin_strict());
    create policy reglages_auto_admin_del on public.reglages as restrictive for delete to authenticated
      using (not public.reglage_admin_seulement(cle) or public.is_admin_strict());
  end if;
end $$;

notify pgrst, 'reload schema';
